alter table profiles add column if not exists code_donneur text unique default substr(generer_code(), 1, 9);
update profiles set code_donneur = substr(generer_code(), 1, 9) where role = 'donneur' and code_donneur is null;
alter table alertes add column if not exists honore_le timestamptz;

create or replace function confirmer_don(p_alerte uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_donneur uuid;
begin
  select al.donneur_id into v_donneur from alertes al join besoins b on b.id = al.besoin_id
  where al.id = p_alerte and b.etablissement_id = auth.uid() and al.statut = 'accepte';
  if v_donneur is null then raise exception 'Alerte introuvable'; end if;
  update alertes set statut = 'honore', honore_le = now() where id = p_alerte;
  update profiles set dernier_don = current_date, nb_dons = nb_dons + 1 where id = v_donneur;
end $$;
grant execute on function confirmer_don(uuid) to authenticated;

create or replace function verifier_donneur(p_code text)
returns table (nom text, groupe_sanguin text, ville text, eligible boolean, prochain date, nb_dons int)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from etablissements where profil_id = auth.uid() and actif) then
    raise exception 'Réservé aux établissements';
  end if;
  return query
  select p.nom, p.groupe_sanguin, p.ville,
    (p.dernier_don is null or prochain_don(p.dernier_don, p.sexe) <= current_date),
    prochain_don(p.dernier_don, p.sexe), p.nb_dons
  from profiles p where p.role = 'donneur' and p.code_donneur = upper(trim(p_code));
end $$;
grant execute on function verifier_donneur(text) to authenticated;
