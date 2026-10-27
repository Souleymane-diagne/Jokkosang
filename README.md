# Jokko Sang — Connecter les donneurs. Sauver des vies.

Application web mobile (HTML/CSS/JS + Supabase) pour mettre en relation
des établissements de santé et des donneurs de sang compatibles,
disponibles et proches.

## Version institutionnelle (à faire en premier)

Les établissements ne s'inscrivent plus eux-mêmes : le super admin crée leur compte
et leur remet un code d'activation à usage unique (valable 30 jours).

1. Exécute `supabase/schema.sql`, puis `supabase/fix_recursion.sql`, puis **`supabase/pro_v2.sql`**.
2. Crée un compte donneur avec ton email, puis exécute :
   `update profiles set role = 'admin' where id = (select id from auth.users where email = 'TON_EMAIL');`
3. Ouvre **`/admin.html`** (ex. `https://ton-site.netlify.app/admin.html`) et connecte-toi : tu arrives sur le tableau de bord national. Cette page refuse tout compte non admin.
3b. Exécute `supabase/seed_hopitaux.sql` : 28 hôpitaux créés d'un coup, chacun avec son code.
4. *Établissements > Ajouter* : crée l'hôpital, copie le message (code + lien) et envoie-le par WhatsApp.
5. L'hôpital ouvre le lien, saisit le code, choisit son email et son mot de passe. Le code est alors détruit.

## Mise en route (10 minutes)

1. **Supabase** : crée un projet, puis ouvre *SQL Editor* et exécute
   `supabase/schema.sql` (en une seule fois).
2. *(Optionnel, recommandé pour la démo)* exécute ensuite
   `supabase/seed_demo.sql` : 14 faux donneurs à Dakar, Pikine, Thiès, etc.
3. **Authentication > Providers > Email** : désactive *Confirm email*
   pour que l'inscription connecte directement (indispensable pour la démo).
4. **Clés** : dans *Project Settings > API*, copie *Project URL* et
   *anon public key* dans `js/config.js`.
5. **Netlify** : glisse le dossier (ou le zip) sur app.netlify.com/drop.

## Scénario de démonstration

1. Sur un téléphone : crée un compte **donneur** (ex. O-, Dakar).
2. Sur un autre appareil : crée un compte **établissement** (Dakar),
   puis *Signaler un besoin* : O-, 2 poches, Dakar, urgence.
3. La page du besoin liste les donneurs compatibles, hors repos
   biologique. Les noms sont masqués (Awa N.), pas de téléphone.
4. *Alerter N donneurs* : l'alerte arrive en direct chez le donneur.
5. Le donneur touche *Je peux venir* : l'établissement voit son nom
   et son numéro (Appeler / WhatsApp), en direct.
6. Côté donneur, *J'ai donné mon sang aujourd'hui* : l'anneau passe au
   rouge, le profil sort des recherches jusqu'à la fin du repos.

## Comment ça marche

| Idée du pitch | Où dans le code |
|---|---|
| Groupe sanguin + compatibilité | `groupes_compatibles()` dans schema.sql |
| Localisation | ville + GPS optionnel, distance en km (`rechercher_donneurs`) |
| Disponibilité (semaine / week-end / urgence) | profil donneur, filtrée dans `rechercher_donneurs` |
| Disponibilité intelligente (cooldown) | `prochain_don()` + table `app_settings` (90 j hommes, 120 j femmes, modifiable) |
| Alertes ciblées | `envoyer_alertes()` + Supabase Realtime |
| Vie privée | téléphone visible uniquement après acceptation (`reponses_acceptees`) |

Changer le délai de repos : `update app_settings set valeur='60' where cle='cooldown_homme_jours';`

## Limites actuelles

- Pas de vérification des établissements : n'importe qui peut s'inscrire en tant
  qu'établissement. Prochaine étape : validation manuelle ou par un ministère / CNTS.
- Alertes dans l'application uniquement. Prochaine étape : SMS / WhatsApp
  (Supabase Edge Function + API SMS).
- Les délais de repos sont des valeurs par défaut à valider avec un professionnel
  de santé. L'éligibilité médicale complète (poids, maladies, voyages) n'est pas gérée.

## Structure

```
index.html          page unique
css/style.css       thème nuit et rouge, mobile d'abord
js/config.js        URL et clé Supabase (à remplir)
js/api.js           toutes les requêtes Supabase
js/app.js           vues et routage
supabase/           schema.sql, seed_demo.sql
manifest.json       installable sur l'écran d'accueil
```

## Stock de sang, SOS et carte nationale (pro_v3)

1. Exécute `supabase/pro_v3.sql`.
2. Pour l'escalade automatique toutes les minutes, exécute ensuite `supabase/pro_v3_cron.sql`
   (active l'extension pg_cron). Sans lui, le bouton « Élargir +25 km » marche quand même à la main.
3. **Stock** : chaque hôpital saisit ses poches par groupe (onglet Stock). Niveaux : critique sous 5, faible sous 15
   (modifiables : `update app_settings set valeur='8' where cle='seuil_critique';`).
4. **SOS** : un besoin « urgence vitale » sans acceptation après 10 minutes élargit le rayon de 25 km
   (jusqu'à 3 fois, 100 km maximum) et alerte les nouveaux donneurs.
5. **Carte** (admin) : niveau de stock par ville, plus la liste des hôpitaux à surveiller. Carte schématique, pas une carte officielle.


## Carte de donneur, certificat et éligibilité (pro_v4)

1. Exécute `supabase/pro_v4.sql`, puis redéploie le site.
2. **Carte** : chaque donneur a un code court (ex. ABCD-EFGH) et un QR. L'hôpital le saisit dans *Besoins > Vérifier un donneur* et voit nom, groupe, repos, nombre de dons (jamais le téléphone).
3. **Certificat** : créé quand l'hôpital confirme un don. Le donneur l'ouvre dans *Mes dons* et l'enregistre en PDF avec le bouton Imprimer.
4. **Éligibilité** : questionnaire indicatif, rien n'est enregistré. Les règles sont à faire valider par le CNTS ou un médecin.
