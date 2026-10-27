create table if not exists app_settings (
  cle text primary key,
  valeur text not null
);
insert into app_settings (cle, valeur) values
  ('cooldown_homme_jours', '90'),
  ('cooldown_femme_jours', '120')
on conflict (cle) do nothing;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'donneur' check (role in ('donneur','etablissement')),
  nom text not null default '',
  telephone text,
  ville text,
  groupe_sanguin text check (groupe_sanguin in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  sexe text check (sexe in ('femme','homme')),
  date_naissance date,
  dispo_semaine boolean not null default true,
  dispo_weekend boolean not null default true,
  dispo_urgence boolean not null default true,
  geo_active boolean not null default false,
  lat double precision,
  lng double precision,
  dernier_don date,
  created_at timestamptz not null default now()
);

create table if not exists besoins (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references profiles(id) on delete cascade,
  etablissement_nom text not null,
  groupe_sanguin text not null check (groupe_sanguin in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  quantite int not null default 1 check (quantite > 0),
  ville text not null,
  urgence boolean not null default false,
  lat double precision,
  lng double precision,
  statut text not null default 'ouvert' check (statut in ('ouvert','clos')),
  created_at timestamptz not null default now()
);

create table if not exists alertes (
  id uuid primary key default gen_random_uuid(),
  besoin_id uuid not null references besoins(id) on delete cascade,
  donneur_id uuid not null references profiles(id) on delete cascade,
  statut text not null default 'envoyee' check (statut in ('envoyee','accepte','refuse')),
  created_at timestamptz not null default now(),
  repondu_le timestamptz,
  unique (besoin_id, donneur_id)
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, nom, telephone, ville, groupe_sanguin, sexe)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'donneur'),
    coalesce(new.raw_user_meta_data->>'nom', ''),
    new.raw_user_meta_data->>'telephone',
    new.raw_user_meta_data->>'ville',
    nullif(new.raw_user_meta_data->>'groupe_sanguin', ''),
    nullif(new.raw_user_meta_data->>'sexe', '')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function prochain_don(p_dernier date, p_sexe text) returns date
language sql stable as $$
  select case when p_dernier is null then null
    else p_dernier + (
      select valeur::int from app_settings
      where cle = case when p_sexe = 'femme' then 'cooldown_femme_jours' else 'cooldown_homme_jours' end
    ) end
$$;

create or replace function groupes_compatibles(p_receveur text) returns text[]
language sql immutable as $$
  select case p_receveur
    when 'O-'  then array['O-']
    when 'O+'  then array['O+','O-']
    when 'A-'  then array['A-','O-']
    when 'A+'  then array['A+','A-','O+','O-']
    when 'B-'  then array['B-','O-']
    when 'B+'  then array['B+','B-','O+','O-']
    when 'AB-' then array['AB-','A-','B-','O-']
    when 'AB+' then array['AB+','AB-','A+','A-','B+','B-','O+','O-']
  end
$$;

create or replace function rechercher_donneurs(p_besoin uuid, p_rayon numeric default 25)
returns table (
  donneur_id uuid, nom text, ville text, groupe_sanguin text,
  meme_groupe boolean, distance_km numeric, deja_alerte boolean
)
language plpgsql security definer set search_path = public as $$
declare b besoins%rowtype;
begin
  select * into b from besoins where id = p_besoin and etablissement_id = auth.uid();
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

create or replace function envoyer_alertes(p_besoin uuid, p_rayon numeric default 25)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into alertes (besoin_id, donneur_id)
  select p_besoin, r.donneur_id
  from rechercher_donneurs(p_besoin, p_rayon) r
  where not r.deja_alerte
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function reponses_acceptees(p_besoin uuid)
returns table (nom text, telephone text, ville text, groupe_sanguin text, repondu_le timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from besoins where id = p_besoin and etablissement_id = auth.uid()) then
    raise exception 'Besoin introuvable';
  end if;
  return query
  select p.nom, p.telephone, p.ville, p.groupe_sanguin, a.repondu_le
  from alertes a join profiles p on p.id = a.donneur_id
  where a.besoin_id = p_besoin and a.statut = 'accepte'
  order by a.repondu_le;
end $$;

create or replace function est_mon_besoin(p_besoin uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from besoins where id = p_besoin and etablissement_id = auth.uid())
$$;

create or replace function suis_alerte_pour(p_besoin uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from alertes where besoin_id = p_besoin and donneur_id = auth.uid())
$$;

alter table app_settings enable row level security;
alter table profiles enable row level security;
alter table besoins enable row level security;
alter table alertes enable row level security;

create policy "settings lisibles" on app_settings for select to authenticated using (true);

create policy "profil: lecture du sien" on profiles for select to authenticated using (id = auth.uid());
create policy "profil: modification du sien" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = my_role());

create policy "besoins: lecture" on besoins for select to authenticated using (
  etablissement_id = auth.uid() or suis_alerte_pour(id)
);
create policy "besoins: création" on besoins for insert to authenticated
  with check (etablissement_id = auth.uid() and my_role() = 'etablissement');
create policy "besoins: modification" on besoins for update to authenticated
  using (etablissement_id = auth.uid()) with check (etablissement_id = auth.uid());

create policy "alertes: lecture donneur ou établissement" on alertes for select to authenticated using (
  donneur_id = auth.uid() or est_mon_besoin(besoin_id)
);
create policy "alertes: réponse du donneur" on alertes for update to authenticated
  using (donneur_id = auth.uid()) with check (donneur_id = auth.uid());

grant execute on function rechercher_donneurs(uuid, numeric) to authenticated;
grant execute on function envoyer_alertes(uuid, numeric) to authenticated;
grant execute on function reponses_acceptees(uuid) to authenticated;

alter publication supabase_realtime add table alertes;
