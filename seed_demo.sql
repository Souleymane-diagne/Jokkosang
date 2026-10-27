alter table profiles drop constraint if exists profiles_id_fkey;

insert into profiles (id, role, nom, telephone, ville, groupe_sanguin, sexe, dispo_semaine, dispo_weekend, dispo_urgence, dernier_don, geo_active, lat, lng) values
  (gen_random_uuid(), 'donneur', 'Awa Ndiaye',      '771234567', 'Dakar',      'O-',  'femme', true,  true,  true,  null,                          true,  14.6937, -17.4441),
  (gen_random_uuid(), 'donneur', 'Moussa Diop',     '772345678', 'Dakar',      'A+',  'homme', true,  false, true,  current_date - 200,            true,  14.7167, -17.4677),
  (gen_random_uuid(), 'donneur', 'Fatou Sow',       '773456789', 'Dakar',      'B+',  'femme', true,  true,  false, current_date - 30,             false, null,    null),
  (gen_random_uuid(), 'donneur', 'Ibrahima Fall',   '774567890', 'Pikine',     'O+',  'homme', true,  true,  true,  current_date - 120,            true,  14.7549, -17.3985),
  (gen_random_uuid(), 'donneur', 'Mariama Ba',      '775678901', 'Guédiawaye', 'A-',  'femme', false, true,  true,  null,                          true,  14.7692, -17.3984),
  (gen_random_uuid(), 'donneur', 'Cheikh Gueye',    '776789012', 'Dakar',      'AB+', 'homme', true,  true,  true,  current_date - 400,            true,  14.6928, -17.4467),
  (gen_random_uuid(), 'donneur', 'Aminata Sarr',    '777890123', 'Rufisque',   'O-',  'femme', true,  true,  true,  current_date - 150,            true,  14.7156, -17.2731),
  (gen_random_uuid(), 'donneur', 'Ousmane Ndoye',   '778901234', 'Thiès',      'O+',  'homme', true,  true,  true,  null,                          true,  14.7910, -16.9359),
  (gen_random_uuid(), 'donneur', 'Khady Mbaye',     '779012345', 'Thiès',      'B-',  'femme', true,  false, true,  current_date - 10,             false, null,    null),
  (gen_random_uuid(), 'donneur', 'Pape Samb',       '770123456', 'Dakar',      'A+',  'homme', true,  true,  true,  null,                          true,  14.7000, -17.4300),
  (gen_random_uuid(), 'donneur', 'Seynabou Faye',   '771122334', 'Mbour',      'O+',  'femme', true,  true,  true,  current_date - 300,            true,  14.4198, -16.9640),
  (gen_random_uuid(), 'donneur', 'Mamadou Kane',    '772233445', 'Saint-Louis','A+',  'homme', true,  true,  true,  null,                          true,  16.0179, -16.4896),
  (gen_random_uuid(), 'donneur', 'Ndeye Diallo',    '773344556', 'Dakar',      'O-',  'femme', true,  true,  true,  current_date - 90,             true,  14.6800, -17.4500),
  (gen_random_uuid(), 'donneur', 'Alioune Thiam',   '774455667', 'Pikine',     'A-',  'homme', true,  true,  true,  null,                          true,  14.7600, -17.3900);

alter table profiles add constraint profiles_id_fkey
  foreign key (id) references auth.users(id) on delete cascade not valid;
