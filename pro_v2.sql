alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('donneur','etablissement','admin'));
alter table profiles add column if not exists nb_dons int not null default 0;
alter table alertes drop constraint if exists alertes_statut_check;
alter table alertes add constraint alertes_statut_check check (statut in ('envoyee','accepte','refuse','honore'));

create or replace function generer_code() returns text language sql volatile as $$
  select regexp_replace(
    translate(substr(replace(gen_random_uuid()::text,'-',''),1,12),'0123456789abcdef','ACDEFGHJKLMNPQRT'),
    '(....)(....)(....)', '\1-\2-\3')
$$;

create table if not exists etablissements (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  type text not null default 'Hôpital',
  ville text not null,
  telephone text,
  lat double precision,
  lng double precision,
  code_activation text unique default generer_code(),
  code_expire timestamptz default now() + interval '30 days',
  profil_id uuid unique references profiles(id) on delete set null,
  actif boolean not null default true,
  active_le timestamptz,
  created_at timestamptz not null default now()
);
alter table etablissements enable row level security;
drop policy if exists "etab: admin" on etablissements;
create policy "etab: admin" on etablissements for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');
drop policy if exists "etab: lecture propre" on etablissements;
create policy "etab: lecture propre" on etablissements for select to authenticated using (profil_id = auth.uid());

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare e etablissements%rowtype; v_code text;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data->>'code_activation','')));
  if v_code <> '' then
    select * into e from etablissements
      where code_activation = v_code and profil_id is null and actif
        and (code_expire is null or code_expire > now()) for update;
    if not found then raise exception 'Code d''activation invalide ou expiré'; end if;
    insert into profiles (id, role, nom, telephone, ville, lat, lng, geo_active)
      values (new.id, 'etablissement', e.nom, e.telephone, e.ville, e.lat, e.lng, e.lat is not null);
    update etablissements set profil_id = new.id, code_activation = null, active_le = now() where id = e.id;
  else
    insert into profiles (id, role, nom, telephone, ville, groupe_sanguin, sexe)
    values (new.id, 'donneur', coalesce(new.raw_user_meta_data->>'nom',''), new.raw_user_meta_data->>'telephone',
      new.raw_user_meta_data->>'ville', nullif(new.raw_user_meta_data->>'groupe_sanguin',''), nullif(new.raw_user_meta_data->>'sexe',''));
  end if;
  return new;
end $$;

create or replace function verifier_code(p_code text) returns table(nom text, ville text, type text)
language sql stable security definer set search_path = public as $$
  select e.nom, e.ville, e.type from etablissements e
  where e.code_activation = upper(trim(p_code)) and e.profil_id is null and e.actif
    and (e.code_expire is null or e.code_expire > now())
$$;
grant execute on function verifier_code(text) to anon, authenticated;

create or replace function admin_nouveau_code(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text := generer_code();
begin
  if my_role() <> 'admin' then raise exception 'Accès réservé'; end if;
  update etablissements set code_activation = c, code_expire = now() + interval '30 days'
    where id = p_id and profil_id is null;
  return c;
end $$;

create or replace function admin_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then raise exception 'Accès réservé'; end if;
  return jsonb_build_object(
    'donneurs', (select count(*) from profiles where role = 'donneur'),
    'disponibles', (select count(*) from profiles where role = 'donneur' and groupe_sanguin is not null
                    and (dernier_don is null or prochain_don(dernier_don, sexe) <= current_date)),
    'etab_total', (select count(*) from etablissements),
    'etab_actifs', (select count(*) from etablissements where profil_id is not null and actif),
    'besoins_ouverts', (select count(*) from besoins where statut = 'ouvert'),
    'alertes', (select count(*) from alertes),
    'acceptees', (select count(*) from alertes where statut in ('accepte','honore')),
    'dons', (select count(*) from alertes where statut = 'honore'),
    'par_groupe', (select coalesce(jsonb_object_agg(g, n), '{}'::jsonb) from (
        select groupe_sanguin g, count(*) n from profiles
        where role = 'donneur' and groupe_sanguin is not null
          and (dernier_don is null or prochain_don(dernier_don, sexe) <= current_date)
        group by 1) t));
end $$;

drop policy if exists "besoins: création" on besoins;
create policy "besoins: création" on besoins for insert to authenticated with check (
  etablissement_id = auth.uid()
  and exists (select 1 from etablissements where profil_id = auth.uid() and actif));

create or replace function envoyer_alertes(p_besoin uuid, p_rayon numeric default 25)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from etablissements where profil_id = auth.uid() and actif) then
    raise exception 'Compte suspendu';
  end if;
  insert into alertes (besoin_id, donneur_id)
  select p_besoin, r.donneur_id from rechercher_donneurs(p_besoin, p_rayon) r
  where not r.deja_alerte on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

drop function if exists reponses_acceptees(uuid);
create or replace function reponses_acceptees(p_besoin uuid)
returns table (alerte_id uuid, nom text, telephone text, ville text, groupe_sanguin text, statut text, repondu_le timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from besoins where id = p_besoin and etablissement_id = auth.uid()) then
    raise exception 'Besoin introuvable';
  end if;
  return query
  select a.id, p.nom, p.telephone, p.ville, p.groupe_sanguin, a.statut, a.repondu_le
  from alertes a join profiles p on p.id = a.donneur_id
  where a.besoin_id = p_besoin and a.statut in ('accepte','honore')
  order by a.repondu_le;
end $$;
grant execute on function reponses_acceptees(uuid) to authenticated;

create or replace function confirmer_don(p_alerte uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_donneur uuid;
begin
  select al.donneur_id into v_donneur from alertes al join besoins b on b.id = al.besoin_id
  where al.id = p_alerte and b.etablissement_id = auth.uid() and al.statut = 'accepte';
  if v_donneur is null then raise exception 'Alerte introuvable'; end if;
  update alertes set statut = 'honore' where id = p_alerte;
  update profiles set dernier_don = current_date, nb_dons = nb_dons + 1 where id = v_donneur;
end $$;
grant execute on function admin_stats() to authenticated;
grant execute on function admin_nouveau_code(uuid) to authenticated;
grant execute on function confirmer_don(uuid) to authenticated;
