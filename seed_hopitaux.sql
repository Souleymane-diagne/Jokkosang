insert into etablissements (nom, type, ville, code_expire)
select v.nom, v.type, v.ville, now() + interval '90 days'
from (values
  ('Hôpital Principal de Dakar', 'Hôpital national', 'Dakar'),
  ('Hôpital Aristide Le Dantec', 'Hôpital national', 'Dakar'),
  ('CHNU de Fann', 'Hôpital national', 'Dakar'),
  ('Hôpital Général Idrissa Pouye (Grand Yoff)', 'Hôpital national', 'Dakar'),
  ('Hôpital Abass Ndao', 'Hôpital national', 'Dakar'),
  ('Hôpital d''Enfants Albert Royer', 'Hôpital national', 'Dakar'),
  ('Hôpital Militaire de Ouakam', 'Hôpital national', 'Dakar'),
  ('Hôpital Philippe Maguilen Senghor (Yoff)', 'Hôpital national', 'Dakar'),
  ('Centre National de Transfusion Sanguine (CNTS)', 'Centre de transfusion', 'Dakar'),
  ('Hôpital Dalal Jamm', 'Hôpital national', 'Guédiawaye'),
  ('Hôpital Roi Baudouin', 'Hôpital régional', 'Guédiawaye'),
  ('Hôpital de Pikine', 'Hôpital régional', 'Pikine'),
  ('Hôpital Youssou Mbargane Diop', 'Hôpital régional', 'Rufisque'),
  ('Hôpital Régional de Thiès', 'Hôpital régional', 'Thiès'),
  ('Hôpital de Mbour', 'Hôpital régional', 'Mbour'),
  ('Hôpital Régional de Saint-Louis', 'Hôpital régional', 'Saint-Louis'),
  ('Hôpital Amadou Sakhir Mbaye', 'Hôpital régional', 'Louga'),
  ('Hôpital Régional de Matam (Ourossogui)', 'Hôpital régional', 'Matam'),
  ('Hôpital Heinrich Lübke', 'Hôpital régional', 'Diourbel'),
  ('Hôpital Matlaboul Fawzaini', 'Hôpital régional', 'Touba'),
  ('Hôpital Régional El Hadji Ibrahima Niass', 'Hôpital régional', 'Kaolack'),
  ('Hôpital Régional de Kaffrine', 'Hôpital régional', 'Kaffrine'),
  ('Hôpital Régional de Fatick', 'Hôpital régional', 'Fatick'),
  ('Hôpital Régional de Tambacounda', 'Hôpital régional', 'Tambacounda'),
  ('Hôpital Régional de Kédougou', 'Hôpital régional', 'Kédougou'),
  ('Hôpital Régional de Kolda', 'Hôpital régional', 'Kolda'),
  ('Hôpital Régional de Sédhiou', 'Hôpital régional', 'Sédhiou'),
  ('Hôpital Régional de Ziguinchor', 'Hôpital régional', 'Ziguinchor')
) as v(nom, type, ville)
where not exists (select 1 from etablissements e where e.nom = v.nom);
