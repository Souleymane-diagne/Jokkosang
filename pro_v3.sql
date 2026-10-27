insert into app_settings (cle, valeur) values ('seuil_critique', '5'), ('seuil_faible', '15')
on conflict (cle) do nothing;

create table if not exists stocks (
  etablissement_id uuid not null references profiles(id) on delete cascade,
  groupe_sanguin text not null check (groupe_sanguin in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  poches int not null default 0 check (poches >= 0),
  maj timestamptz not null default now(),
  primary key (etablissement_id, groupe_sanguin)
);
alter table stocks enable row level security;
drop policy if exists "stocks: propres" on stocks;
create policy "stocks: propres" on stocks for all to authenticated
  using (etablissement_id = auth.uid())
  with check (etablissement_id = auth.uid() and my_role() = 'etablissement');

alter table besoins add column if not exists rayon_km int not null default 25;
alter table besoins add column if not exists escalade int not null default 0;
alter table besoins add column if not exists derniere_alerte timestamptz;

create or replace function _chercher(p_besoin uuid, p_rayon numeric)
returns table (
  donneur_id uuid, nom text, ville text, groupe_sanguin text,
  meme_groupe boolean, distance_km numeric, deja_alerte boolean
)
language plpgsql security definer set search_path = public as $$
declare b besoins%rowtype;
begin
  select * into b from besoins where id = p_besoin;
  if not found then raise exception 'Besoin introuvable'; end if;
  return query
  select s.id, s.nom, s.ville, s.groupe_sanguin, s.meme_groupe, s.distance_km, s.deja_alerte
  from (
    select p.id, p.nom, p.ville, p.groupe_sanguin,
      (p.groupe_sanguin = b.groupe_sanguin) as meme_groupe,
      case when p.geo_active and p.lat is not null and b.lat is not null then
        round((6371 * acos(least(1,
          cos(radians(b.lat)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians(b.lng))
          + sin(radians(b.lat)) * sin(radians(p.lat))
        )))::numeric, 1)
      end as distance_km,
      exists (select 1 from alertes a where a.besoin_id = b.id and a.donneur_id = p.id) as deja_alerte
    from profiles p
    where p.role = 'donneur'
      and p.groupe_sanguin = any (groupes_compatibles(b.groupe_sanguin))
      and (p.dernier_don is null or prochain_don(p.dernier_don, p.sexe) <= current_date)
      and (case when b.urgence then p.dispo_urgence
                else (p.dispo_semaine or p.dispo_weekend or p.dispo_urgence) end)
  ) s
  where s.ville = b.ville or (s.distance_km is not null and s.distance_km <= p_rayon)
  order by s.meme_groupe desc, s.distance_km nulls last, s.nom;
end $$;
revoke execute on function _chercher(uuid, numeric) from public, anon, authenticated;

create or replace function rechercher_donneurs(p_besoin uuid, p_rayon numeric default 25)
returns table (
  donneur_id uuid, nom text, ville text, groupe_sanguin text,
  meme_groupe boolean, distance_km numeric, deja_alerte boolean
)
language plpgsql security definer set search_path = public as $$
declare v_r int;
begin
  select rayon_km into v_r from besoins where id = p_besoin and etablissement_id = auth.uid();
  if v_r is null then raise exception 'Besoin introuvable'; end if;
  return query select * from _chercher(p_besoin, v_r);
end $$;
grant execute on function rechercher_donneurs(uuid, numeric) to authenticated;

create or replace function envoyer_alertes(p_besoin uuid, p_rayon numeric default 25)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_r int;
begin
  if not exists (select 1 from etablissements where profil_id = auth.uid() and actif) then
    raise exception 'Compte suspendu';
  end if;
  select rayon_km into v_r from besoins where id = p_besoin and etablissement_id = auth.uid();
  if v_r is null then raise exception 'Besoin introuvable'; end if;
  insert into alertes (besoin_id, donneur_id)
  select p_besoin, r.donneur_id from _chercher(p_besoin, v_r) r
  where not r.deja_alerte on conflict do nothing;
  get diagnostics n = row_count;
  update besoins set derniere_alerte = now() where id = p_besoin;
  return n;
end $$;
grant execute on function envoyer_alertes(uuid, numeric) to authenticated;

create or replace function _escalader(p_besoin uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int; v_r int;
begin
  update besoins
     set rayon_km = least(rayon_km + 25, 100), escalade = escalade + 1, derniere_alerte = now()
   where id = p_besoin and statut = 'ouvert' and escalade < 3
   returning rayon_km into v_r;
  if v_r is null then return 0; end if;
  insert into alertes (besoin_id, donneur_id)
  select p_besoin, r.donneur_id from _chercher(p_besoin, v_r) r
  where not r.deja_alerte on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function _escalader(uuid) from public, anon, authenticated;

create or replace function escalader_besoin(p_besoin uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from besoins b join etablissements e on e.profil_id = b.etablissement_id
                 where b.id = p_besoin and b.etablissement_id = auth.uid() and e.actif) then
    raise exception 'Besoin introuvable';
  end if;
  return _escalader(p_besoin);
end $$;
grant execute on function escalader_besoin(uuid) to authenticated;

create or replace function escalade_auto() returns int
language plpgsql security definer set search_path = public as $$
declare t uuid; total int := 0;
begin
  for t in
    select b.id from besoins b
    where b.statut = 'ouvert' and b.urgence and b.escalade < 3
      and coalesce(b.derniere_alerte, b.created_at) < now() - interval '10 minutes'
      and not exists (select 1 from alertes a where a.besoin_id = b.id and a.statut in ('accepte','honore'))
  loop
    total := total + _escalader(t);
  end loop;
  return total;
end $$;
revoke execute on function escalade_auto() from public, anon, authenticated;

create or replace function admin_carte()
returns table (nom text, ville text, poches int, critiques int, saisi boolean, besoins_ouverts int)
language plpgsql security definer set search_path = public as $$
declare v_seuil int;
begin
  if my_role() <> 'admin' then raise exception 'Accès réservé'; end if;
  select valeur::int into v_seuil from app_settings where cle = 'seuil_critique';
  return query
  select e.nom, e.ville,
    coalesce((select sum(s.poches)::int from stocks s where s.etablissement_id = e.profil_id), 0),
    8 - coalesce((select count(*)::int from stocks s where s.etablissement_id = e.profil_id and s.poches >= v_seuil), 0),
    exists (select 1 from stocks s where s.etablissement_id = e.profil_id),
    coalesce((select count(*)::int from besoins b where b.etablissement_id = e.profil_id and b.statut = 'ouvert'), 0)
  from etablissements e
  order by e.ville, e.nom;
end $$;
grant execute on function admin_carte() to authenticated;
