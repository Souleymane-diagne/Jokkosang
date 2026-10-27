(function () {
  "use strict";

  const app = document.getElementById("app");
  const GROUPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  const VILLES = [
    "Dakar", "Pikine", "Guédiawaye", "Rufisque", "Thiès", "Mbour", "Saint-Louis", "Touba", "Diourbel",
    "Kaolack", "Kaffrine", "Fatick", "Louga", "Matam", "Tambacounda", "Kédougou", "Kolda", "Sédhiou", "Ziguinchor",
  ];
  const state = { profile: null, settings: {}, pending: 0, channel: null };

  const ICONS = {
    drop: '<svg viewBox="0 0 24 24"><path d="M12 2.5c3.3 4.2 6.2 7.4 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 9.9 8.7 6.7 12 2.5z"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    vide: '<svg viewBox="0 0 24 24"><path d="M12 2.5c3.3 4.2 6.2 7.4 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 9.9 8.7 6.7 12 2.5z"/></svg>',
  };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const today = () => new Date().toLocaleDateString("en-CA");
  const fmtDate = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const plural = (n, un, plus) => (n > 1 ? plus : un);

  function ago(iso) {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.round(h / 24)} j`;
  }

  function maskName(nom) {
    const parts = String(nom || "").trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0] || "Donneur";
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("La géolocalisation n'est pas disponible sur cet appareil."));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => reject(new Error("Position refusée. Autorisez la localisation dans le navigateur, puis réessayez.")),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  function cooldownInfo(p) {
    const total = state.settings[p.sexe === "femme" ? "cooldown_femme_jours" : "cooldown_homme_jours"] || 90;
    if (!p.dernier_don) return { eligible: true, total, remaining: 0, pct: 1, next: null };
    const next = new Date(p.dernier_don + "T00:00:00");
    next.setDate(next.getDate() + total);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const remaining = Math.max(0, Math.ceil((next - now) / 86400000));
    return { eligible: remaining === 0, total, remaining, pct: Math.min(1, (total - remaining) / total), next };
  }

  const villeOptions = (selected) =>
    `<option value="">Choisir une ville</option>` +
    VILLES.map((v) => `<option ${v === selected ? "selected" : ""}>${esc(v)}</option>`).join("");

  function groupPicker(name, value) {
    return `<div class="groupes" role="group" aria-label="Groupe sanguin">
      ${GROUPES.map((g) => `<button type="button" class="gbtn" data-g="${g}" aria-pressed="${g === value}">${g}</button>`).join("")}
    </div><input type="hidden" name="${name}" value="${esc(value || "")}">`;
  }

  function bindGroupPicker(root) {
    $$(".gbtn", root).forEach((b) =>
      b.addEventListener("click", () => {
        $$(".gbtn", root).forEach((x) => x.setAttribute("aria-pressed", x === b));
        $('input[type=hidden]', b.closest(".champ") || root).value = b.dataset.g;
      })
    );
  }

  function shell(role, active, inner) {
    const tabs =
      role === "donneur"
        ? [["donneur", "Accueil", ICONS.home], ["donneur/alertes", "Alertes", ICONS.bell, state.pending], ["donneur/conseils", "Conseils", ICONS.info], ["donneur/profil", "Profil", ICONS.user]]
        : role === "admin"
        ? [["admin", "Tableau", ICONS.home], ["admin/etabs", "Établissements", ICONS.list], ["admin/carte", "Carte", ICONS.pin], ["admin/compte", "Compte", ICONS.user]]
        : [["etab", "Besoins", ICONS.list], ["etab/stock", "Stock", ICONS.drop], ["etab/nouveau", "Nouveau", ICONS.plus], ["etab/compte", "Compte", ICONS.user]];
    app.innerHTML = `
      <header class="top"><a class="brand" href="#/${role}"><span class="logo">${ICONS.drop}</span><span>Jokko Sang<small>Don de sang · Sénégal</small></span></a></header>
      <main class="screen">${inner}</main>
      <nav class="tabs" aria-label="Navigation principale">
        ${tabs.map(([r, label, icon, n]) => `
          <a href="#/${r}" class="${r === active ? "on" : ""}" ${r === active ? 'aria-current="page"' : ""}>
            ${icon}<span>${label}</span>${n ? `<span class="badge" aria-label="${n} en attente">${n}</span>` : ""}
          </a>`).join("")}
      </nav>`;
    app.classList.add("wide");
    window.scrollTo(0, 0);
  }

  function emptyState(text) {
    return `<div class="vide">${ICONS.vide}<p>${text}</p></div>`;
  }

  function viewWelcome() {
    app.classList.add("landing");
    app.innerHTML = `
      <section class="accueil">
        <div class="panneau">
          <svg class="motif" aria-hidden="true"><defs><pattern id="losanges" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M15 0L30 15L15 30L0 15Z" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="1.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#losanges)"/></svg>
          <div class="brand"><span class="logo">${ICONS.drop}</span><span>Jokko Sang</span></div>
          <svg class="goutte" viewBox="0 0 240 280" role="img" aria-label="Goutte de sang avec un battement de cœur"><path d="M120 12C170 82 214 132 214 188a94 94 0 0 1-188 0C26 132 70 82 120 12z" fill="#fff"/><path d="M40 176H78L96 176 110 124 132 230 150 152 164 176H200" fill="none" stroke="#C8102E" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <h1>Connecter les donneurs.<br>Sauver des vies.</h1>
        </div>
        <div class="bas">
          <p>Jokko veut dire « mise en relation » en wolof. Trouvez un donneur compatible, disponible et proche.</p>
          <div class="actions">
            <a class="btn" href="#/inscription/donneur">Je veux donner mon sang</a>
            <a class="btn contour" href="#/activation">Espace établissement</a>
            <a class="lien" href="#/connexion" style="text-align:center">J'ai déjà un compte</a>
          </div>
          <div class="drapeau" aria-hidden="true"><i style="background:#00853F"></i><i style="background:#F6B93B"></i><i style="background:#E31B23"></i></div>
        </div>
      </section>`;
  }

  function viewLogin() {
    app.innerHTML = `
      <header class="top"><a class="brand" href="#/"><span class="logo">${ICONS.drop}</span><span>Jokko Sang<small>Don de sang · Sénégal</small></span></a></header>
      <main class="screen">
        <a class="retour" href="#/">Retour</a>
        <h2>Se connecter</h2>
        <form class="form" id="f" novalidate>
          <div class="champ"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
          <div class="champ"><label for="pw">Mot de passe</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div>
          <div id="err"></div>
          <button class="btn plein" type="submit">Se connecter</button>
        </form>
        <p class="doux petit mt" style="text-align:center">Pas encore de compte ? <a href="#/inscription/donneur">Devenir donneur</a></p>
      </main>`;
    $("#f").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = $("button[type=submit]");
      btn.disabled = true;
      try {
        await API.signIn(f.get("email").trim(), f.get("password"));
        await afterAuth();
      } catch (err) {
        $("#err").innerHTML = `<div class="erreur" role="alert">${esc(err.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : err.message)}</div>`;
        btn.disabled = false;
      }
    });
  }

  function viewSignup(role) {
    const donor = role === "donneur";
    app.innerHTML = `
      <header class="top"><a class="brand" href="#/"><span class="logo">${ICONS.drop}</span><span>Jokko Sang<small>Don de sang · Sénégal</small></span></a></header>
      <main class="screen">
        <a class="retour" href="#/">Retour</a>
        <h2>${donor ? "Créer mon profil donneur" : "Inscrire mon établissement"}</h2>
        <p class="doux petit">${donor ? "Trois minutes. Vous ne serez sollicité que lorsque vous êtes réellement éligible." : "Hôpital, clinique, centre de transfusion ou poste de santé."}</p>
        <form class="form" id="f" novalidate>
          <div class="champ"><label for="nom">${donor ? "Nom complet" : "Nom de l'établissement"}</label><input id="nom" name="nom" type="text" autocomplete="${donor ? "name" : "organization"}" required></div>
          <div class="champ"><label for="tel">Téléphone</label><input id="tel" name="telephone" type="tel" autocomplete="tel" placeholder="77 123 45 67" required></div>
          <div class="champ"><label for="ville">Ville</label><select id="ville" name="ville" required>${villeOptions("")}</select></div>
          ${donor ? `
            <div class="champ"><span class="lbl">Groupe sanguin</span>${groupPicker("groupe_sanguin", "")}</div>
            <div class="champ"><span class="lbl">Sexe</span>
              <div class="choix">
                <label><input type="radio" name="sexe" value="femme"><span>Femme</span></label>
                <label><input type="radio" name="sexe" value="homme"><span>Homme</span></label>
              </div>
              <span class="doux petit">Sert à calculer le délai de repos entre deux dons.</span>
            </div>` : ""}
          <div class="champ"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
          <div class="champ"><label for="pw">Mot de passe (6 caractères minimum)</label><input id="pw" name="password" type="password" autocomplete="new-password" minlength="6" required></div>
          <div id="err"></div>
          <button class="btn plein" type="submit">Créer mon compte</button>
        </form>
      </main>`;
    bindGroupPicker(app);
    $("#f").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const manque = [];
      if (!f.nom?.trim()) manque.push("le nom");
      if (!f.telephone?.trim()) manque.push("le téléphone");
      if (!f.ville) manque.push("la ville");
      if (donor && !f.groupe_sanguin) manque.push("le groupe sanguin");
      if (donor && !f.sexe) manque.push("le sexe");
      if (!f.email?.trim()) manque.push("l'email");
      if (!f.password || f.password.length < 6) manque.push("un mot de passe de 6 caractères minimum");
      const err = $("#err");
      if (manque.length) {
        err.innerHTML = `<div class="erreur" role="alert">À compléter : ${manque.join(", ")}.</div>`;
        return;
      }
      const btn = $("button[type=submit]");
      btn.disabled = true;
      try {
        const res = await API.signUp({ ...f, email: f.email.trim(), nom: f.nom.trim(), telephone: f.telephone.trim(), role });
        if (!res.session) {
          app.innerHTML = `<main class="screen" style="padding-top:60px">
            <h2>Vérifiez votre email</h2>
            <p class="doux mt-s">Un lien de confirmation a été envoyé à ${esc(f.email)}. Ouvrez-le, puis connectez-vous.</p>
            <a class="btn plein mt" href="#/connexion">Aller à la connexion</a></main>`;
          return;
        }
        await afterAuth(true);
      } catch (e2) {
        err.innerHTML = `<div class="erreur" role="alert">${esc(e2.message)}</div>`;
        btn.disabled = false;
      }
    });
  }

  function ringHtml(info, animate) {
    const R = 88, C = 2 * Math.PI * R;
    const filled = info.eligible ? C : C * info.pct;
    const centre = info.eligible
      ? `<div class="gros">Disponible</div><div class="sous">Vous pouvez être alerté en cas de besoin.</div>`
      : `<div class="gros">${info.remaining} j</div><div class="sous">Repos biologique. Don possible le ${fmtDate(info.next)}.</div>`;
    return `<div class="anneau ${info.eligible ? "libre" : ""}" role="img" aria-label="${info.eligible ? "Disponible pour donner" : `Indisponible encore ${info.remaining} jours`}">
      <svg viewBox="0 0 200 200"><circle class="piste" cx="100" cy="100" r="${R}"/>
        <circle class="arc" id="arc" cx="100" cy="100" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${animate ? C : C - filled}" data-final="${C - filled}"/></svg>
      <div class="centre">${centre}</div></div>`;
  }

  async function viewDonorHome() {
    const p = state.profile;
    const info = cooldownInfo(p);
    shell("donneur", "donneur", `
      <h2>Bonjour ${esc(p.nom.split(" ")[0] || "")}</h2>
      <p class="doux petit">Groupe ${esc(p.groupe_sanguin || "non renseigné")} · ${esc(p.ville || "ville non renseignée")}${p.nb_dons ? ` · ${p.nb_dons} ${plural(p.nb_dons, "don confirmé", "dons confirmés")}` : ""}</p>
      ${!p.groupe_sanguin ? `<a class="bandeau" href="#/donneur/profil"><b>Profil incomplet.</b> Renseignez votre groupe sanguin pour être alerté.</a>` : ""}
      ${ringHtml(info, true)}
      ${info.eligible
        ? `<button class="btn plein mt" id="don">J'ai donné mon sang aujourd'hui</button>
           <p class="doux petit" style="text-align:center;margin-top:8px">Votre profil sera mis en pause pendant ${info.total} jours.</p>`
        : `<p class="doux petit" style="text-align:center">Vous ne recevrez pas d'alerte pendant cette période.</p>`}
      <div class="tuiles">
        <a class="tuile t1" href="#/donneur/carte">Ma carte de donneur</a>
        <a class="tuile t2" href="#/donneur/dons">Mes dons et certificats</a>
        <a class="tuile t3" href="#/donneur/eligibilite">Suis-je éligible ?</a>
      </div>
      <h3 class="mt">Mes disponibilités</h3>
      <div class="chips" id="dispos">
        ${[["dispo_semaine", "En semaine"], ["dispo_weekend", "Le week-end"], ["dispo_urgence", "En cas d'urgence"]]
          .map(([k, l]) => `<label class="chip"><input type="checkbox" name="${k}" ${p[k] ? "checked" : ""}><span>${l}</span></label>`).join("")}
      </div>`);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const arc = $("#arc");
      if (arc) arc.setAttribute("stroke-dashoffset", arc.dataset.final);
    }));
    $$("#dispos input").forEach((i) =>
      i.addEventListener("change", async () => {
        try {
          state.profile = await API.updateProfile(p.id, { [i.name]: i.checked });
          toast("Disponibilités enregistrées.");
        } catch (e) { i.checked = !i.checked; toast(e.message); }
      })
    );
    $("#don")?.addEventListener("click", async () => {
      if (!confirm("Confirmer un don aujourd'hui ? Votre profil sera désactivé pendant le repos biologique.")) return;
      try {
        state.profile = await API.updateProfile(p.id, { dernier_don: today() });
        toast("Merci pour votre don. Repos activé.");
        viewDonorHome();
      } catch (e) { toast(e.message); }
    });
  }

  async function viewDonorAlertes() {
    shell("donneur", "donneur/alertes", `<h2>Alertes</h2><p class="doux petit">Les établissements qui ont besoin de vous.</p><div id="liste" class="liste"></div>`);
    const rows = await API.myAlertes(state.profile.id);
    state.pending = rows.filter((r) => r.statut === "envoyee" && r.besoins?.statut === "ouvert").length;
    $(".tabs .badge")?.remove();
    const liste = $("#liste");
    if (!rows.length) {
      liste.innerHTML = emptyState("Aucune alerte pour le moment.<br>Gardez vos disponibilités à jour.");
      return;
    }
    liste.innerHTML = rows.map((r) => {
      const b = r.besoins;
      if (!b) return "";
      const ouvert = r.statut === "envoyee" && b.statut === "ouvert";
      const etat = r.statut === "honore" ? `<span class="tag vert">Don confirmé. Merci !</span>` : r.statut === "accepte" ? `<span class="tag vert">Vous avez accepté</span>`
        : r.statut === "refuse" ? `<span class="tag">Refusé</span>`
        : b.statut === "clos" ? `<span class="tag">Besoin clôturé</span>` : "";
      return `<article class="carte">
        <div class="ligne">
          <div class="ligne" style="justify-content:flex-start"><span class="pastille">${esc(b.groupe_sanguin)}</span>
            <div><b>${esc(b.etablissement_nom)}</b><div class="doux petit">${esc(b.ville)} · ${ago(r.created_at)}</div></div></div>
          ${b.urgence ? `<span class="tag rouge">Urgent</span>` : ""}
        </div>
        <p class="doux petit mt-s">${b.quantite} ${plural(b.quantite, "poche recherchée", "poches recherchées")}</p>
        ${ouvert ? `
          <p class="doux petit mt-s">En acceptant, l'établissement verra votre numéro de téléphone.</p>
          <div class="ligne mt-s" style="gap:8px">
            <button class="btn ok petit-btn" style="flex:1" data-id="${r.id}" data-s="accepte">Je peux venir</button>
            <button class="btn contour petit-btn" style="flex:1" data-id="${r.id}" data-s="refuse">Pas disponible</button>
          </div>` : `<div class="mt-s">${etat}</div>`}
      </article>`;
    }).join("");
    $$("button[data-id]", liste).forEach((btn) =>
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await API.respond(btn.dataset.id, btn.dataset.s);
          toast(btn.dataset.s === "accepte" ? "Merci. L'établissement peut vous joindre." : "Réponse enregistrée.");
          viewDonorAlertes();
        } catch (e) { toast(e.message); btn.disabled = false; }
      })
    );
  }

  const niveauDon = (n) => (n >= 10 ? "Platine" : n >= 5 ? "Or" : n >= 3 ? "Argent" : n >= 1 ? "Bronze" : "Futur donneur");

  function viewCarte() {
    const p = state.profile;
    let qr = "";
    if (window.qrcode && p.code_donneur) {
      const q = window.qrcode(0, "M");
      q.addData("JOKKO:" + p.code_donneur);
      q.make();
      qr = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    }
    shell("donneur", "donneur", `<a class="retour" href="#/donneur">Retour</a>
      <div class="cd">
        <div class="ligne"><div class="brand"><span class="logo">${ICONS.drop}</span><span>Jokko Sang</span></div><span class="tag">Carte de donneur</span></div>
        <div class="cd-nom">${esc(p.nom)}</div>
        <div class="ligne"><div><div class="cd-g">${esc(p.groupe_sanguin || "?")}</div><div class="doux petit">${esc(p.ville || "")}</div></div>
          ${qr ? `<div class="cd-qr" aria-label="QR code de la carte">${qr}</div>` : ""}</div>
        <div class="ligne"><span class="tag jaune">${niveauDon(p.nb_dons || 0)}</span><span class="doux petit">${p.nb_dons || 0} ${plural(p.nb_dons || 0, "don confirmé", "dons confirmés")}</span></div>
        <div class="cd-code code">${esc(p.code_donneur || "")}</div>
      </div>
      <p class="doux petit mt" style="text-align:center">Présentez ce code à l'équipe de l'hôpital. Il ne contient ni votre téléphone ni votre adresse.</p>`);
  }

  async function viewDons() {
    shell("donneur", "donneur", `<a class="retour" href="#/donneur">Retour</a><h2>Mes dons</h2><div id="liste" class="liste"></div>`);
    const rows = await API.mesDons(state.profile.id);
    $("#liste").innerHTML = rows.length ? rows.map((r) => `<article class="carte"><div class="ligne"><div><b>${esc(r.besoins?.etablissement_nom || "Établissement")}</b>
      <div class="doux petit">${fmtDate(new Date(r.honore_le || r.repondu_le))}</div></div>
      <a class="btn contour petit-btn" href="#/donneur/certificat/${r.id}">Certificat</a></div></article>`).join("")
      : emptyState("Aucun don confirmé pour le moment.<br>Votre don apparaît ici quand l'hôpital le confirme.");
  }

  async function viewCertificat(id) {
    shell("donneur", "donneur", `<div class="ligne noprint"><a class="retour" href="#/donneur/dons">Retour</a><button class="btn petit-btn" id="imp" type="button">Imprimer / PDF</button></div><div class="certif" id="c"></div>`);
    const r = (await API.mesDons(state.profile.id)).find((x) => x.id === id);
    if (!r) { $("#c").innerHTML = `<p>Certificat introuvable.</p>`; return; }
    $("#c").innerHTML = `<div class="certif-in"><div class="certif-marque">JOKKO SANG</div><h2>Certificat de don de sang</h2>
      <p>Il est certifié que</p><div class="certif-nom">${esc(state.profile.nom)}</div>
      <p>a effectué un don de sang le <b>${fmtDate(new Date(r.honore_le || r.repondu_le))}</b><br>auprès de <b>${esc(r.besoins?.etablissement_nom || "")}</b>${r.besoins?.ville ? ` (${esc(r.besoins.ville)})` : ""}.</p>
      <p class="certif-merci">Merci pour votre geste de solidarité.</p>
      <div class="certif-pied">N° ${esc(id.slice(0, 8).toUpperCase())} · Don confirmé par l'établissement via Jokko Sang<br>Document généré par l'application. Il ne remplace pas une attestation officielle de l'établissement.</div></div>`;
    $("#imp").addEventListener("click", () => window.print());
  }

  const QUESTIONS = [
    ["Avez-vous 18 ans ou plus ?", "oui", "bloque"],
    ["Pesez-vous au moins 50 kg ?", "oui", "bloque"],
    ["Vous sentez-vous en bonne santé aujourd'hui (ni fièvre, ni grippe) ?", "oui", "bloque"],
    ["Prenez-vous un traitement ou avez-vous une maladie chronique ?", "non", "signale"],
    ["Avez-vous fait un tatouage, un piercing ou une opération ces 4 derniers mois ?", "non", "signale"],
    ["Avez-vous voyagé hors du Sénégal ces 4 dernières semaines ?", "non", "signale"],
    ["Êtes-vous enceinte, ou avez-vous accouché ou allaité récemment ?", "non", "signale"],
  ];

  function viewEligibilite() {
    const qs = QUESTIONS.filter((q, i) => !(i === 6 && state.profile.sexe === "homme"));
    shell("donneur", "donneur", `<a class="retour" href="#/donneur">Retour</a><h2>Suis-je éligible ?</h2>
      <p class="doux petit">Quelques questions pour savoir si vous pouvez probablement donner. Vos réponses ne sont pas enregistrées.</p>
      <form class="form" id="f" novalidate>${qs.map((q, i) => `<div class="champ"><span class="lbl" style="color:var(--texte)">${esc(q[0])}</span>
        <div class="choix"><label><input type="radio" name="q${i}" value="oui"><span>Oui</span></label><label><input type="radio" name="q${i}" value="non"><span>Non</span></label></div></div>`).join("")}
        <div id="res"></div><button class="btn plein" type="submit">Voir le résultat</button></form>`);
    $("#f").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (qs.some((q, i) => !f.get("q" + i))) { $("#res").innerHTML = `<div class="erreur" role="alert">Répondez à toutes les questions.</div>`; return; }
      const ko = qs.filter((q, i) => f.get("q" + i) !== q[1]);
      const bloque = ko.filter((q) => q[2] === "bloque"), signale = ko.filter((q) => q[2] === "signale");
      const [cls, titre, texte] = bloque.length ? ["jaune", "Pas encore éligible", "Les conditions de base ne sont pas toutes réunies. Parlez-en à l'équipe médicale."]
        : signale.length ? ["jaune", "À discuter avec le médecin", "Signalez à l'équipe médicale : " + signale.map((q) => q[0].replace(/ \?$/, "")).join(" ; ") + "."]
        : ["vert", "Vous pouvez probablement donner", "La décision finale revient à l'équipe médicale de l'hôpital."];
      $("#res").innerHTML = `<div class="carte"><span class="tag ${cls}">${titre}</span><p class="mt-s">${esc(texte)}</p>
        <p class="doux petit mt-s">Résultat indicatif. Ces règles doivent être validées par un professionnel de santé ou le centre de transfusion.</p></div>`;
    });
  }

  function viewConseils() {
    const h = state.settings.cooldown_homme_jours || 90, f = state.settings.cooldown_femme_jours || 120;
    const blocs = [
      ["Avant le don", ["Mangez normalement 2 à 3 heures avant, avec un repas léger.", "Buvez de l'eau et dormez suffisamment.", "Évitez l'alcool la veille.", "Apportez une pièce d'identité."]],
      ["Après le don", ["Restez assis 10 à 15 minutes et buvez plus que d'habitude.", "Mangez un repas équilibré.", "Évitez les efforts intenses et le sport pendant 24 heures.", "En cas de vertige, allongez-vous et surélevez les jambes."]],
      ["Bien manger pour reconstituer son fer", ["Foie, viande, poisson, niébé, lentilles et feuilles vertes.", "Ajoutez de la vitamine C : orange, citron, bissap.", "Évitez le thé et le café pendant le repas : ils réduisent l'absorption du fer."]],
      ["Le repos entre deux dons", [`Dans l'application : ${h} jours pour les hommes et ${f} jours pour les femmes (valeurs à confirmer avec le centre de transfusion).`, "Le corps a besoin de ce temps pour reconstituer ses globules rouges.", "Votre profil se réactive tout seul à la fin du repos."]],
      ["Puis-je donner ?", ["La décision revient à l'équipe médicale, après un court entretien.", "Parlez-lui de vos traitements, de vos symptômes et de vos voyages récents."]],
      ["Quand consulter", ["Malaise qui dure, fièvre, saignement, forte douleur ou difficulté à respirer : consultez tout de suite un médecin ou rendez-vous aux urgences.", "SAMU : 1515."]],
    ];
    shell("donneur", "donneur/conseils", `<h2>Conseils</h2>
      <p class="doux petit">Conseils généraux sur le don de sang. Ils ne remplacent pas l'avis d'un médecin.</p>
      <div class="liste">${blocs.map(([t, l], i) => `<details class="carte" ${i === 0 ? "open" : ""}><summary><b>${t}</b></summary>
        <ul class="conseils">${l.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>`).join("")}</div>`);
  }

  function profileForm(p, donor) {
    return `
      <form class="form" id="f" novalidate>
        <div class="champ"><label for="nom">${donor ? "Nom complet" : "Nom de l'établissement"}</label><input id="nom" name="nom" type="text" value="${esc(p.nom)}" ${donor ? "" : "readonly"} required></div>
        <div class="champ"><label for="tel">Téléphone</label><input id="tel" name="telephone" type="tel" value="${esc(p.telephone)}" required></div>
        <div class="champ"><label for="ville">Ville</label><select id="ville" name="ville">${villeOptions(p.ville)}</select></div>
        ${donor ? `
          <div class="champ"><span class="lbl">Groupe sanguin</span>${groupPicker("groupe_sanguin", p.groupe_sanguin)}</div>
          <div class="champ"><span class="lbl">Sexe</span>
            <div class="choix">
              <label><input type="radio" name="sexe" value="femme" ${p.sexe === "femme" ? "checked" : ""}><span>Femme</span></label>
              <label><input type="radio" name="sexe" value="homme" ${p.sexe === "homme" ? "checked" : ""}><span>Homme</span></label>
            </div></div>
          <div class="champ"><label for="naiss">Date de naissance</label><input id="naiss" name="date_naissance" type="date" value="${esc(p.date_naissance || "")}"></div>
          <div class="champ"><label for="dd">Date du dernier don</label><input id="dd" name="dernier_don" type="date" max="${today()}" value="${esc(p.dernier_don || "")}">
            <span class="doux petit">Laissez vide si vous n'avez jamais donné.</span></div>` : ""}
        <div class="interrupteur">
          <div><b>${donor ? "Localisation précise" : "Position de l'établissement"}</b>
            <div class="doux petit">${donor ? "Permet de vous trouver à quelques kilomètres, pas seulement dans votre ville." : "Permet de chercher les donneurs les plus proches."}</div></div>
          <input type="checkbox" id="geo" aria-label="Activer la localisation" ${p.geo_active ? "checked" : ""}>
        </div>
        <div id="err"></div>
        <button class="btn plein" type="submit">Enregistrer</button>
        <button class="btn contour plein" type="button" id="out">Se déconnecter</button>
      </form>`;
  }

  function bindProfileForm(donor) {
    const p = state.profile;
    bindGroupPicker(app);
    let coords = null;
    $("#geo").addEventListener("change", async (e) => {
      if (!e.target.checked) return;
      try {
        coords = await getPosition();
        toast("Position détectée. Pensez à enregistrer.");
      } catch (err) {
        e.target.checked = false;
        $("#err").innerHTML = `<div class="erreur" role="alert">${esc(err.message)}</div>`;
      }
    });
    $("#out").addEventListener("click", logout);
    $("#f").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const geoOn = $("#geo").checked;
      const patch = {
        nom: f.nom.trim(), telephone: f.telephone.trim(), ville: f.ville || null, geo_active: geoOn,
      };
      if (donor) {
        patch.groupe_sanguin = f.groupe_sanguin || null;
        patch.sexe = f.sexe || null;
        patch.date_naissance = f.date_naissance || null;
        patch.dernier_don = f.dernier_don || null;
      }
      if (geoOn && coords) Object.assign(patch, coords);
      if (!geoOn) Object.assign(patch, { lat: null, lng: null });
      try {
        state.profile = await API.updateProfile(p.id, patch);
        toast("Profil enregistré.");
      } catch (err) {
        $("#err").innerHTML = `<div class="erreur" role="alert">${esc(err.message)}</div>`;
      }
    });
  }

  function viewDonorProfile() {
    shell("donneur", "donneur/profil", `<h2>Mon profil</h2>${profileForm(state.profile, true)}`);
    bindProfileForm(true);
  }

  async function viewEtabHome() {
    shell("etab", "etab", `<h2>Besoins en sang</h2><p class="doux petit">${esc(state.profile.nom)}</p>
      <details class="carte mt-s"><summary><b>Vérifier un donneur</b></summary><div class="form">
        <div class="champ"><label for="cd">Code de la carte (ex. ABCD-EFGH)</label><input id="cd" class="code" type="text" autocapitalize="characters" autocomplete="off"></div>
        <button class="btn plein" id="vf" type="button">Vérifier</button><div id="vres"></div></div></details>
      <div id="liste" class="liste"></div>`);
    $("#vf").addEventListener("click", async () => {
      try {
        const d = await API.verifierDonneur($("#cd").value);
        $("#vres").innerHTML = !d ? `<div class="erreur" role="alert">Aucun donneur avec ce code.</div>`
          : `<div class="carte"><div class="ligne"><div><b>${esc(d.nom)}</b><div class="doux petit">${esc(d.ville || "")} · ${d.nb_dons} ${plural(d.nb_dons, "don", "dons")}</div></div><span class="pastille">${esc(d.groupe_sanguin || "?")}</span></div>
            <div class="mt-s"><span class="tag ${d.eligible ? "vert" : "jaune"}">${d.eligible ? "Repos terminé" : `En repos jusqu'au ${fmtDate(new Date(d.prochain + "T00:00:00"))}`}</span></div></div>`;
      } catch (err) { $("#vres").innerHTML = `<div class="erreur" role="alert">${esc(err.message)}</div>`; }
    });
    const rows = await API.myBesoins(state.profile.id);
    const liste = $("#liste");
    if (!rows.length) {
      liste.innerHTML = emptyState("Aucun besoin signalé.") + `<a class="btn plein" href="#/etab/nouveau">Signaler un besoin</a>`;
      return;
    }
    liste.innerHTML = rows.map((b) => {
      const al = b.alertes || [];
      const ok = al.filter((a) => a.statut === "accepte").length;
      return `<a class="carte" href="#/etab/besoin/${b.id}" style="text-decoration:none;display:block">
        <div class="ligne">
          <div class="ligne" style="justify-content:flex-start"><span class="pastille">${esc(b.groupe_sanguin)}</span>
            <div><b>${b.quantite} ${plural(b.quantite, "poche", "poches")} · ${esc(b.ville)}</b>
              <div class="doux petit">${ago(b.created_at)} · ${al.length} ${plural(al.length, "alerte", "alertes")} · ${ok} ${plural(ok, "acceptée", "acceptées")}</div></div></div>
          <div>${b.urgence ? `<span class="tag rouge">Urgent</span>` : ""} <span class="tag ${b.statut === "ouvert" ? "vert" : ""}">${b.statut === "ouvert" ? "Ouvert" : "Clos"}</span></div>
        </div></a>`;
    }).join("");
  }

  function viewNewBesoin() {
    const p = state.profile;
    shell("etab", "etab/nouveau", `
      <h2>Signaler un besoin</h2>
      <form class="form" id="f" novalidate>
        <div class="champ"><span class="lbl">Groupe sanguin recherché</span>${groupPicker("groupe_sanguin", "")}</div>
        <div class="champ"><label for="qte">Nombre de poches</label><input id="qte" name="quantite" type="number" min="1" max="50" value="1" inputmode="numeric"></div>
        <div class="champ"><label for="ville">Ville</label><select id="ville" name="ville">${villeOptions(p.ville)}</select></div>
        <div class="interrupteur">
          <div><b>Urgence vitale</b><div class="doux petit">Seuls les donneurs disponibles en cas d'urgence seront alertés.</div></div>
          <input type="checkbox" name="urgence" aria-label="Urgence vitale">
        </div>
        <div id="err"></div>
        <button class="btn plein" type="submit">Publier le besoin</button>
      </form>`);
    bindGroupPicker(app);
    $("#f").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const err = $("#err");
      if (!f.get("groupe_sanguin")) { err.innerHTML = `<div class="erreur" role="alert">Choisissez un groupe sanguin.</div>`; return; }
      if (!f.get("ville")) { err.innerHTML = `<div class="erreur" role="alert">Choisissez une ville.</div>`; return; }
      const btn = $("button[type=submit]");
      btn.disabled = true;
      try {
        const b = await API.createBesoin({
          etablissement_id: p.id, etablissement_nom: p.nom,
          groupe_sanguin: f.get("groupe_sanguin"), quantite: Number(f.get("quantite")) || 1,
          ville: f.get("ville"), urgence: f.get("urgence") === "on",
          lat: p.geo_active ? p.lat : null, lng: p.geo_active ? p.lng : null,
        });
        location.hash = `#/etab/besoin/${b.id}`;
      } catch (e2) { err.innerHTML = `<div class="erreur" role="alert">${esc(/row-level security/.test(e2.message) ? "Compte suspendu. Contactez l'administration nationale." : e2.message)}</div>`; btn.disabled = false; }
    });
  }

  async function viewBesoin(id) {
    shell("etab", "etab", `<a class="retour" href="#/etab">Tous les besoins</a><div id="corps"><p class="doux">Chargement…</p></div>`);
    const b = await API.getBesoin(id);
    const [donors, accepted] = await Promise.all([b.statut === "ouvert" ? API.searchDonors(id) : [], API.accepted(id)]);
    const al = b.alertes || [];
    const count = (s) => al.filter((a) => a.statut === s).length;
    const aAlerter = donors.filter((d) => !d.deja_alerte);

    $("#corps").innerHTML = `
      <div class="besoin-tete"><span class="pastille">${esc(b.groupe_sanguin)}</span>
        <div><h2 style="margin:0">${b.quantite} ${plural(b.quantite, "poche", "poches")} · ${esc(b.ville)}</h2>
          <div class="doux petit">${ago(b.created_at)} ${b.urgence ? `· <span class="tag rouge">Urgent</span>` : ""} ${b.statut === "clos" ? `· <span class="tag">Clos</span>` : ""}</div></div></div>
      <div class="stats">
        <div><b>${al.length}</b><span>alertés</span></div>
        <div><b style="color:var(--ok)">${count("accepte") + count("honore")}</b><span>acceptés</span></div>
        <div><b>${count("refuse")}</b><span>refus</span></div>
      </div>

      ${b.urgence && b.statut === "ouvert" ? `<div class="carte mt-s"><div class="ligne"><div><b>SOS actif</b><div class="doux petit">Rayon ${b.rayon_km} km · élargissement ${b.escalade}/3</div></div>
        <button class="btn contour petit-btn" id="esc" ${b.escalade >= 3 ? "disabled" : ""}>Élargir +25 km</button></div>
        <p class="doux petit mt-s">Sans réponse après 10 minutes, la recherche s'élargit automatiquement.</p></div>` : ""}
      <h3 class="mt">Ils viennent</h3>
      ${accepted.length ? `<div class="liste">${accepted.map((d) => `
        <article class="carte"><div class="ligne"><div class="ligne" style="justify-content:flex-start"><span class="pastille">${esc(d.groupe_sanguin)}</span>
          <div><b>${esc(d.nom)}</b><div class="doux petit">${esc(d.ville || "")}</div></div></div></div>
          ${d.statut === "honore" ? `<div class="tag vert mt-s">Don confirmé</div>` : ""}
          <div class="contacts">
            <a class="btn petit-btn" style="flex:1" href="tel:${esc(d.telephone)}">Appeler</a>
            <a class="btn contour petit-btn" style="flex:1" href="https://wa.me/221${esc(String(d.telephone).replace(/\D/g, "").replace(/^221/, ""))}" target="_blank" rel="noopener">WhatsApp</a>
          </div>${d.statut === "honore" ? "" : `<button class="btn ok petit-btn plein mt-s" data-don="${d.alerte_id}">Confirmer le don reçu</button>`}</article>`).join("")}</div>`
        : `<p class="doux petit">Personne n'a encore accepté. Les réponses apparaissent ici en direct.</p>`}

      ${b.statut === "ouvert" ? `
        <h3 class="mt">Donneurs disponibles (${donors.length})</h3>
        <p class="doux petit">Compatibles, hors période de repos, disponibles et proches.</p>
        ${donors.length ? `<div class="liste">${donors.map((d) => `
          <article class="carte"><div class="ligne"><div class="ligne" style="justify-content:flex-start"><span class="pastille">${esc(d.groupe_sanguin)}</span>
            <div><b>${esc(maskName(d.nom))}</b><div class="doux petit">${esc(d.ville || "")}${d.distance_km != null ? ` · ${d.distance_km} km` : ""}</div></div></div>
            <div style="text-align:right"><span class="tag ${d.meme_groupe ? "vert" : ""}">${d.meme_groupe ? "Même groupe" : "Compatible"}</span>
              ${d.deja_alerte ? `<div class="tag jaune" style="margin-top:4px">Déjà alerté</div>` : ""}</div></div></article>`).join("")}</div>`
          : emptyState("Aucun donneur disponible pour l'instant.")}
        <div class="mt">
          <button class="btn plein" id="alerter" ${aAlerter.length ? "" : "disabled"}>${aAlerter.length ? `Alerter ${aAlerter.length} ${plural(aAlerter.length, "donneur", "donneurs")}` : "Tous les donneurs sont déjà alertés"}</button>
          <button class="btn contour plein mt-s" id="clore">Clôturer ce besoin</button>
        </div>` : ""}`;

    $("#esc")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try { const n = await API.escalate(id); toast(`Recherche élargie : ${n} ${plural(n, "nouvelle alerte", "nouvelles alertes")}.`); viewBesoin(id); }
      catch (err) { toast(err.message); e.target.disabled = false; }
    });
    $$("[data-don]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Confirmer que ce donneur a bien donné son sang ? Son repos biologique démarre aujourd'hui.")) return;
      try { await API.confirmDon(b.dataset.don); toast("Don confirmé. Merci à l'établissement."); viewBesoin(id); } catch (err) { toast(err.message); }
    }));
    $("#alerter")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        const n = await API.sendAlerts(id);
        toast(`${n} ${plural(n, "alerte envoyée", "alertes envoyées")}.`);
        viewBesoin(id);
      } catch (err) { toast(err.message); e.target.disabled = false; }
    });
    $("#clore")?.addEventListener("click", async () => {
      if (!confirm("Clôturer ce besoin ? Les donneurs ne pourront plus répondre.")) return;
      try { await API.closeBesoin(id); toast("Besoin clôturé."); viewBesoin(id); } catch (err) { toast(err.message); }
    });
  }

  function viewEtabAccount() {
    shell("etab", "etab/compte", `<h2>Mon établissement</h2>${profileForm(state.profile, false)}`);
    bindProfileForm(false);
  }

  function viewActivation() {
    app.innerHTML = `
      <header class="top"><a class="brand" href="#/"><span class="logo">${ICONS.drop}</span><span>Jokko Sang<small>Don de sang · Sénégal</small></span></a></header>
      <main class="screen">
        <a class="retour" href="#/">Retour</a>
        <h2>Espace établissement</h2>
        <p class="doux petit">Les comptes sont créés par l'administration nationale. Saisissez le code d'activation qui vous a été remis.</p>
        <form class="form" id="f1" novalidate>
          <div class="champ"><label for="code">Code d'activation</label>
            <input id="code" type="text" class="code" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" required></div>
          <div id="err"></div>
          <button class="btn plein" type="submit">Vérifier le code</button>
        </form>
        <form class="form" id="f2" novalidate hidden>
          <div class="carte"><b id="enom"></b><div class="doux petit" id="eville"></div></div>
          <div class="champ"><label for="email">Email professionnel</label><input id="email" name="email" type="email" autocomplete="email" required></div>
          <div class="champ"><label for="pw">Mot de passe (8 caractères minimum)</label><input id="pw" name="password" type="password" autocomplete="new-password" minlength="8" required></div>
          <div id="err2"></div>
          <button class="btn plein" type="submit">Activer le compte</button>
        </form>
      </main>`;
    let code = "";
    $("#f1").addEventListener("submit", async (e) => {
      e.preventDefault();
      code = $("#code").value.trim().toUpperCase();
      try {
        const etab = await API.verifyCode(code);
        if (!etab) { $("#err").innerHTML = `<div class="erreur" role="alert">Code invalide, déjà utilisé ou expiré. Contactez l'administration nationale.</div>`; return; }
        $("#enom").textContent = etab.nom;
        $("#eville").textContent = `${etab.type} · ${etab.ville}`;
        $("#f1").hidden = true;
        $("#f2").hidden = false;
      } catch (err) { $("#err").innerHTML = `<div class="erreur" role="alert">${esc(err.message)}</div>`; }
    });
    $("#f2").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (!f.email?.trim() || !f.password || f.password.length < 8) {
        $("#err2").innerHTML = `<div class="erreur" role="alert">Renseignez un email et un mot de passe de 8 caractères minimum.</div>`;
        return;
      }
      try {
        const res = await API.signUp({ email: f.email.trim(), password: f.password, code_activation: code });
        if (!res.session) {
          app.innerHTML = `<main class="screen" style="padding-top:60px"><h2>Vérifiez votre email</h2>
            <p class="doux mt-s">Confirmez votre adresse, puis connectez-vous.</p><a class="btn plein mt" href="#/connexion">Aller à la connexion</a></main>`;
          return;
        }
        await afterAuth();
      } catch (err) { $("#err2").innerHTML = `<div class="erreur" role="alert">${esc(err.message)}</div>`; }
    });
  }

  const niveauStock = (n) => {
    const crit = state.settings.seuil_critique ?? 5, faible = state.settings.seuil_faible ?? 15;
    return n === undefined ? ["Non saisi", ""] : n < crit ? ["Critique", "rouge"] : n < faible ? ["Faible", "jaune"] : ["Normal", "vert"];
  };

  async function viewStock() {
    shell("etab", "etab/stock", `<h2>Stock de sang</h2>
      <p class="doux petit">Poches disponibles par groupe. Mettez à jour après chaque réception ou transfusion.</p>
      <form class="form" id="f" novalidate><div class="grille-stock" id="g"></div><div id="err"></div>
      <button class="btn plein" type="submit">Enregistrer le stock</button></form>`);
    const rows = await API.stockGet(state.profile.id);
    const m = Object.fromEntries(rows.map((r) => [r.groupe_sanguin, r.poches]));
    $("#g").innerHTML = GROUPES.map((g) => {
      const [l, c] = niveauStock(m[g]);
      return `<label class="carte stock"><b>${g}</b><input type="number" min="0" max="9999" inputmode="numeric" name="${g}" value="${m[g] ?? ""}" aria-label="Poches ${g}"><span class="tag ${c}">${l}</span></label>`;
    }).join("");
    $("#f").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const data = GROUPES.filter((g) => f.get(g) !== "").map((g) => ({ etablissement_id: state.profile.id, groupe_sanguin: g, poches: Math.max(0, parseInt(f.get(g), 10) || 0), maj: new Date().toISOString() }));
      if (!data.length) { $("#err").innerHTML = `<div class="erreur" role="alert">Saisissez au moins un groupe.</div>`; return; }
      try { await API.stockSave(data); toast("Stock enregistré."); viewStock(); }
      catch (err) { $("#err").innerHTML = `<div class="erreur" role="alert">${esc(err.message)}</div>`; }
    });
  }

  const GEO = { Dakar: [14.69, -17.45], Pikine: [14.75, -17.38], "Guédiawaye": [14.84, -17.40], Rufisque: [14.72, -17.27], "Thiès": [14.79, -16.93],
    Mbour: [14.42, -16.96], "Saint-Louis": [16.02, -16.5], Touba: [14.85, -15.88], Diourbel: [14.66, -16.23], Kaolack: [14.15, -16.08],
    Kaffrine: [14.11, -15.55], Fatick: [14.34, -16.41], Louga: [15.62, -16.22], Matam: [15.66, -13.26], Tambacounda: [13.77, -13.67],
    "Kédougou": [12.56, -12.18], Kolda: [12.89, -14.95], "Sédhiou": [12.71, -15.56], Ziguinchor: [12.58, -16.27] };
  const CONTOUR = [[16.05,-16.52],[16.45,-16.0],[16.6,-14.8],[16.45,-14.0],[16.0,-13.4],[15.2,-12.9],[14.7,-12.2],[14.0,-12.2],[13.4,-12.0],[12.7,-11.5],[12.4,-11.6],[12.35,-12.4],[12.6,-13.7],[12.45,-14.5],[12.7,-15.2],[12.4,-15.9],[12.35,-16.7],[12.7,-16.8],[13.0,-16.75],[13.6,-16.7],[14.3,-17.05],[14.7,-17.5],[15.4,-16.6]];
  const COULEURS = { critique: "#FF4D5E", faible: "#F2B84B", normal: "#34D17A", inconnu: "#7A6F76" };
  const niveauEtab = (r) => (!r.saisi ? "inconnu" : r.critiques >= 3 ? "critique" : r.critiques >= 1 ? "faible" : "normal");
  const proj = ([lat, lng]) => [((lng + 17.8) * 80).toFixed(1), ((16.9 - lat) * 80).toFixed(1)];

  async function viewAdminCarte() {
    shell("admin", "admin/carte", `<h2>Carte nationale des stocks</h2>
      <p class="doux petit">Carte schématique. Rouge : 3 groupes sanguins ou plus en stock critique · Jaune : 1 ou 2 · Vert : stock correct · Gris : stock non saisi.</p>
      <div class="carte mt-s"><svg id="map" viewBox="0 0 520 380" role="img" aria-label="Carte schématique du Sénégal avec le niveau de stock par ville" style="width:100%;height:auto;max-height:68vh"></svg></div>
      <h3 class="mt">À surveiller</h3><div id="liste" class="liste"></div>`);
    const rows = await API.adminCarte();
    const parVille = {};
    rows.forEach((r) => { (parVille[r.ville] ||= []).push(r); });
    const ordre = ["inconnu", "normal", "faible", "critique"];
    const points = Object.entries(parVille).filter(([v]) => GEO[v]).map(([v, rs]) => {
      const niv = rs.map(niveauEtab).sort((a, b) => ordre.indexOf(b) - ordre.indexOf(a))[0];
      const [x, y] = proj(GEO[v]);
      return `<g><circle cx="${x}" cy="${y}" r="${7 + rs.length * 2}" fill="${COULEURS[niv]}" fill-opacity=".85" stroke="#0B0709" stroke-width="2"><title>${esc(v)} : ${rs.length} établissement(s), ${niv}</title></circle>
        <text x="${+x + 14}" y="${+y + 4}" fill="#E7E9EF" font-size="11">${esc(v)}</text></g>`;
    }).join("");
    $("#map").innerHTML = `<polygon points="${CONTOUR.map((p) => proj(p).join(",")).join(" ")}" fill="#140D10" stroke="#F2B84B" stroke-opacity=".6" stroke-width="1.5"/>${points}`;
    const surv = rows.filter((r) => ["critique", "faible"].includes(niveauEtab(r)) || r.besoins_ouverts > 0);
    $("#liste").innerHTML = surv.length ? surv.map((r) => {
      const n = niveauEtab(r);
      return `<article class="carte"><div class="ligne"><div><b>${esc(r.nom)}</b><div class="doux petit">${esc(r.ville)} · ${r.poches} poches · ${r.besoins_ouverts} besoin(s) ouvert(s)</div></div>
        <span class="tag ${n === "critique" ? "rouge" : n === "faible" ? "jaune" : ""}">${n === "critique" ? "Critique" : n === "faible" ? "Faible" : "Besoin ouvert"}</span></div></article>`;
    }).join("") : emptyState("Aucun établissement à surveiller pour le moment.");
  }

  function viewAdminLogin(message) {
    app.innerHTML = `
      <section class="hero" style="justify-content:center">
        <div class="brand" style="margin-bottom:28px"><span class="logo">${ICONS.drop}</span><span>Jokko Sang<small>Administration nationale</small></span></div>
        <h2 style="font-size:32px">Espace administrateur</h2>
        <p class="doux petit">Accès réservé. Connectez-vous avec votre compte administrateur.</p>
        <form class="form" id="f" novalidate>
          <div class="champ"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required></div>
          <div class="champ"><label for="pw">Mot de passe</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div>
          <div id="err">${message ? `<div class="erreur" role="alert">${esc(message)}</div>` : ""}</div>
          <button class="btn plein" type="submit">Entrer</button>
        </form>
      </section>`;
    $("#f").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = $("button[type=submit]");
      btn.disabled = true;
      try {
        await API.signIn(f.get("email").trim(), f.get("password"));
        await afterAuth();
      } catch (err) {
        $("#err").innerHTML = `<div class="erreur" role="alert">${esc(err.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : err.message)}</div>`;
        btn.disabled = false;
      }
    });
  }

  const TYPES = ["Hôpital national", "Hôpital régional", "Hôpital départemental", "Centre de santé", "Clinique", "Centre de transfusion"];

  async function viewAdminHome() {
    shell("admin", "admin", `<h2>Tableau de bord national</h2><div id="c"><p class="doux">Chargement…</p></div>`);
    const s = await API.adminStats();
    const taux = s.alertes ? Math.round((s.acceptees / s.alertes) * 100) : 0;
    const max = Math.max(1, ...GROUPES.map((g) => s.par_groupe[g] || 0));
    $("#c").innerHTML = `
      <div class="stats" style="grid-template-columns:repeat(2,1fr)">
        <div><b>${s.donneurs}</b><span>donneurs inscrits</span></div>
        <div><b style="color:var(--ok)">${s.disponibles}</b><span>disponibles maintenant</span></div>
        <div><b>${s.etab_actifs} / ${s.etab_total}</b><span>établissements actifs</span></div>
        <div><b>${s.besoins_ouverts}</b><span>besoins ouverts</span></div>
        <div><b>${taux}%</b><span>alertes acceptées</span></div>
        <div><b>${s.dons}</b><span>dons confirmés</span></div>
      </div>
      <h3 class="mt">Donneurs disponibles par groupe</h3>
      <div class="liste">${GROUPES.map((g) => `<div class="ligne"><b style="width:38px">${g}</b>
        <div style="flex:1;height:10px;background:var(--surface-2);border-radius:5px"><div style="width:${((s.par_groupe[g] || 0) / max) * 100}%;height:100%;background:var(--sang-vif);border-radius:5px"></div></div>
        <span class="doux petit" style="width:30px;text-align:right">${s.par_groupe[g] || 0}</span></div>`).join("")}</div>`;
  }

  async function viewAdminEtabs() {
    shell("admin", "admin/etabs", `
      <h2>Établissements</h2>
      <p class="doux petit">Créez le compte, puis remettez le code d'activation à l'établissement.</p>
      <details class="carte mt-s"><summary><b>Ajouter un établissement</b></summary>
        <form class="form" id="f" novalidate>
          <div class="champ"><label for="nom">Nom</label><input id="nom" name="nom" type="text" required></div>
          <div class="champ"><label for="type">Type</label><select id="type" name="type">${TYPES.map((t) => `<option>${t}</option>`).join("")}</select></div>
          <div class="champ"><label for="ville">Ville</label><select id="ville" name="ville">${villeOptions("")}</select></div>
          <div class="champ"><label for="tel">Téléphone</label><input id="tel" name="telephone" type="tel"></div>
          <div id="err"></div>
          <button class="btn plein" type="submit">Créer et générer le code</button>
        </form></details>
      <details class="carte mt-s"><summary><b>Importer une liste</b></summary>
        <p class="doux petit mt-s">Une ligne par établissement : <code>nom ; type ; ville ; téléphone</code> (type et téléphone facultatifs). Collez depuis Excel ou un fichier texte.</p>
        <div class="form"><textarea id="lot" rows="6" placeholder="Hôpital Régional de Thiès ; Hôpital régional ; Thiès ; 33 951 10 24" style="width:100%;padding:12px;background:var(--surface);border:1.5px solid var(--ligne);border-radius:12px;color:inherit;font:inherit"></textarea>
          <div id="errlot"></div><button class="btn plein" id="imp" type="button">Importer et générer les codes</button></div></details>
      <button class="btn contour plein mt-s" id="exp" type="button">Exporter les codes en attente (CSV)</button>
      <input id="rech" type="text" class="mt-s" placeholder="Rechercher un établissement ou une ville" aria-label="Rechercher">
      <div id="liste" class="liste"></div>`);
    const load = async () => {
      const rows = await API.adminEtabs();
      const liste = $("#liste");
      if (!rows.length) { liste.innerHTML = emptyState("Aucun établissement. Ajoutez le premier."); return; }
      const qv = ($("#rech").value || "").toLowerCase();
      liste.innerHTML = rows.filter((e) => !qv || `${e.nom} ${e.ville}`.toLowerCase().includes(qv)).map((e) => {
        const expire = e.code_expire && new Date(e.code_expire) < new Date();
        const etat = !e.actif ? `<span class="tag rouge">Suspendu</span>`
          : e.profil_id ? `<span class="tag vert">Actif</span>`
          : expire ? `<span class="tag jaune">Code expiré</span>` : `<span class="tag jaune">En attente</span>`;
        return `<article class="carte"><div class="ligne"><div><b>${esc(e.nom)}</b><div class="doux petit">${esc(e.type)} · ${esc(e.ville)}</div></div>${etat}</div>
          ${!e.profil_id && e.code_activation ? `<div class="code carte mt-s" style="text-align:center;font-size:20px">${esc(e.code_activation)}</div>
            <div class="contacts"><button class="btn petit-btn" style="flex:1" data-act="copy" data-id="${e.id}">Copier le message</button>
            <button class="btn contour petit-btn" style="flex:1" data-act="code" data-id="${e.id}">Nouveau code</button></div>` : ""}
          ${!e.profil_id && !e.code_activation ? `<button class="btn contour petit-btn mt-s" data-act="code" data-id="${e.id}">Générer un code</button>` : ""}
          <div class="contacts"><button class="btn contour petit-btn" style="flex:1" data-act="toggle" data-id="${e.id}" data-actif="${e.actif}">${e.actif ? "Suspendre" : "Réactiver"}</button></div></article>`;
      }).join("");
      $$("[data-act]", liste).forEach((b) => b.addEventListener("click", async () => {
        const e = rows.find((x) => x.id === b.dataset.id);
        try {
          if (b.dataset.act === "copy") {
            const lien = `${location.origin}${location.pathname}#/activation`;
            await navigator.clipboard.writeText(`Jokko Sang : code d'activation de ${e.nom} : ${e.code_activation}\nActivez votre compte ici : ${lien}\nCode valable jusqu'au ${fmtDate(new Date(e.code_expire))}.`);
            toast("Message copié. Collez-le dans WhatsApp ou un email.");
          } else if (b.dataset.act === "code") {
            await API.adminNewCode(e.id); toast("Nouveau code généré."); load();
          } else {
            const suspendre = b.dataset.actif === "true";
            if (suspendre && !confirm(`Suspendre ${e.nom} ? Il ne pourra plus publier de besoins.`)) return;
            await API.adminUpdateEtab(e.id, { actif: !suspendre }); load();
          }
        } catch (err) { toast(err.message); }
      }));
    };
    await load();
    $("#rech").addEventListener("input", load);
    $("#imp").addEventListener("click", async () => {
      const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const ok = [], ko = [];
      $("#lot").value.split("\n").map((l) => l.trim()).filter(Boolean).forEach((l, i) => {
        const [nom, type, ville, tel] = l.split(/[;\t]/).map((x) => x.trim());
        const v = VILLES.find((x) => norm(x) === norm(ville));
        const t = TYPES.find((x) => norm(x) === norm(type));
        if (nom && v) ok.push({ nom, type: t || type || "Hôpital", ville: v, telephone: tel || null }); else ko.push(i + 1);
      });
      const msg = ko.length ? `<div class="erreur" role="alert">Ligne${ko.length > 1 ? "s" : ""} ignorée${ko.length > 1 ? "s" : ""} (nom ou ville inconnue) : ${ko.join(", ")}.</div>` : "";
      $("#errlot").innerHTML = msg;
      if (!ok.length) return;
      try {
        await API.adminCreateEtabs(ok);
        $("#lot").value = "";
        toast(`${ok.length} ${plural(ok.length, "établissement créé", "établissements créés")}.`);
        load();
      } catch (err) { $("#errlot").innerHTML = `<div class="erreur" role="alert">${esc(err.message)}</div>`; }
    });
    $("#exp").addEventListener("click", async () => {
      const rows = (await API.adminEtabs()).filter((e) => !e.profil_id && e.code_activation);
      if (!rows.length) return toast("Aucun code en attente.");
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = "\ufeffnom;ville;telephone;code;expire\n" + rows.map((e) => [e.nom, e.ville, e.telephone, e.code_activation, (e.code_expire || "").slice(0, 10)].map(q).join(";")).join("\n");
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: "codes-activation.csv" });
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $("#f").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      if (!f.nom.trim() || !f.ville) { $("#err").innerHTML = `<div class="erreur" role="alert">Le nom et la ville sont obligatoires.</div>`; return; }
      try {
        await API.adminCreateEtab({ nom: f.nom.trim(), type: f.type, ville: f.ville, telephone: f.telephone.trim() || null });
        ev.target.reset(); $("#err").innerHTML = ""; toast("Établissement créé. Le code est affiché dans la liste."); load();
      } catch (err) { $("#err").innerHTML = `<div class="erreur" role="alert">${esc(err.message)}</div>`; }
    });
  }

  function viewAdminAccount() {
    shell("admin", "admin/compte", `<h2>Super administrateur</h2><p class="doux petit">${esc(state.profile.nom || "Administration nationale")}</p>
      <button class="btn contour plein mt" id="out">Se déconnecter</button>`);
    $("#out").addEventListener("click", logout);
  }

  async function loadUser() {
    state.profile = await API.getProfile();
    if (state.profile) {
      state.settings = await API.settings();
      if (state.profile.role === "donneur") {
        const rows = await API.myAlertes(state.profile.id);
        state.pending = rows.filter((r) => r.statut === "envoyee" && r.besoins?.statut === "ouvert").length;
      }
      startLive();
    }
  }

  async function afterAuth() {
    await loadUser();
    const cible = { etablissement: "#/etab", admin: "#/admin" }[state.profile?.role] || "#/donneur";
    if (location.hash === cible) router();
    else location.hash = cible;
  }

  async function logout() {
    API.unlisten(state.channel);
    state.channel = null;
    await API.signOut();
    state.profile = null;
    state.pending = 0;
    location.hash = "#/";
    router();
  }

  function startLive() {
    if (state.channel) return;
    state.channel = API.listen(async () => {
      const r = currentRoute();
      if (state.profile?.role === "donneur") {
        const before = state.pending;
        const rows = await API.myAlertes(state.profile.id);
        state.pending = rows.filter((x) => x.statut === "envoyee" && x.besoins?.statut === "ouvert").length;
        if (state.pending > before) toast("Nouvelle alerte reçue.");
        if (r === "donneur/alertes" || r === "donneur") router();
      } else if (r === "etab" || r.startsWith("etab/besoin/")) {
        router();
      }
    });
  }

  const currentRoute = () => (location.hash || "#/").replace(/^#\/?/, "").replace(/\/$/, "");

  async function router() {
    app.classList.remove("wide", "landing");
    if (!window.API) {
      app.innerHTML = `<main class="screen" style="padding-top:60px"><h2>Configuration requise</h2><p class="doux mt-s">${esc(window.API_ERROR)}</p></main>`;
      return;
    }
    try {
      const route = currentRoute();
      const session = await API.session();
      if (session && !state.profile) await loadUser();
      if (!session) state.profile = null;

      if (window.ADMIN_ONLY) {
        if (!state.profile) return viewAdminLogin();
        if (state.profile.role !== "admin") {
          await API.signOut();
          state.profile = null;
          return viewAdminLogin("Accès réservé à l'administration nationale.");
        }
      }
      const publicRoutes = ["", "connexion", "inscription/donneur", "activation"];
      if (!state.profile) {
        if (!publicRoutes.includes(route)) return void (location.hash = "#/");
        if (route === "") return viewWelcome();
        if (route === "connexion") return viewLogin();
        if (route === "activation") return viewActivation();
        return viewSignup("donneur");
      }

      const role = state.profile.role;
      const home = role === "etablissement" ? "etab" : role === "admin" ? "admin" : "donneur";
      if (publicRoutes.includes(route)) return void (location.hash = "#/" + home);

      if (role === "admin") {
        if (route === "admin") return viewAdminHome();
        if (route === "admin/etabs") return viewAdminEtabs();
        if (route === "admin/compte") return viewAdminAccount();
        if (route === "admin/carte") return viewAdminCarte();
      } else if (role === "donneur") {
        if (route === "donneur") return viewDonorHome();
        if (route === "donneur/alertes") return viewDonorAlertes();
        if (route === "donneur/profil") return viewDonorProfile();
        if (route === "donneur/conseils") return viewConseils();
        if (route === "donneur/carte") return viewCarte();
        if (route === "donneur/dons") return viewDons();
        if (route === "donneur/eligibilite") return viewEligibilite();
        if (route.startsWith("donneur/certificat/")) return viewCertificat(route.split("/")[2]);
      } else {
        if (route === "etab") return viewEtabHome();
        if (route === "etab/nouveau") return viewNewBesoin();
        if (route === "etab/stock") return viewStock();
        if (route === "etab/compte") return viewEtabAccount();
        if (route.startsWith("etab/besoin/")) return viewBesoin(route.split("/")[2]);
      }
      location.hash = "#/" + home;
    } catch (e) {
      app.innerHTML = `<main class="screen" style="padding-top:60px"><h2>Un problème est survenu</h2>
        <div class="erreur mt-s" role="alert">${esc(e.message)}</div>
        <a class="btn plein mt" href="#/">Retour à l'accueil</a></main>`;
    }
  }

  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  new MutationObserver(() => {
    document.querySelectorAll(".stats b").forEach((el) => {
      if (el.dataset.cu) return;
      const t = el.textContent.trim();
      if (!/^\d+$/.test(t)) return;
      el.dataset.cu = "1";
      const n = Number(t);
      if (reduit || n < 2) return;
      const t0 = performance.now(), d = 900;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / d);
        el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }).observe(app, { childList: true, subtree: true });

  window.addEventListener("hashchange", router);
  router();
})();
