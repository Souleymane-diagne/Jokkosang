create or replace function est_mon_besoin(p_besoin uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from besoins where id = p_besoin and etablissement_id = auth.uid())
$$;

create or replace function suis_alerte_pour(p_besoin uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from alertes where besoin_id = p_besoin and donneur_id = auth.uid())
$$;

drop policy if exists "besoins: lecture" on besoins;
create policy "besoins: lecture" on besoins for select to authenticated using (
  etablissement_id = auth.uid() or suis_alerte_pour(id)
);

drop policy if exists "alertes: lecture donneur ou établissement" on alertes;
create policy "alertes: lecture donneur ou établissement" on alertes for select to authenticated using (
  donneur_id = auth.uid() or est_mon_besoin(besoin_id)
);
