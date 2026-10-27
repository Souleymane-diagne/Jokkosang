(function () {
  const cfg = window.JOKKO_CONFIG;
  const configured = cfg && !cfg.SUPABASE_URL.includes("VOTRE-PROJET");
  if (!window.supabase || !configured) {
    window.API = null;
    window.API_ERROR = !window.supabase
      ? "Impossible de charger Supabase. Vérifiez la connexion internet."
      : "Renseignez SUPABASE_URL et SUPABASE_ANON_KEY dans js/config.js.";
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const unwrap = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };

  window.API = {
    sb,

    async session() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    async signUp({ email, password, ...meta }) {
      const data = unwrap(await sb.auth.signUp({ email, password, options: { data: meta } }));
      return data;
    },
    async signIn(email, password) {
      return unwrap(await sb.auth.signInWithPassword({ email, password }));
    },
    async signOut() {
      await sb.auth.signOut();
    },

    async settings() {
      const rows = unwrap(await sb.from("app_settings").select("cle, valeur"));
      return Object.fromEntries(rows.map((r) => [r.cle, Number(r.valeur)]));
    },
    async getProfile() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      return unwrap(await sb.from("profiles").select("*").eq("id", user.id).single());
    },
    async updateProfile(id, patch) {
      return unwrap(await sb.from("profiles").update(patch).eq("id", id).select().single());
    },

    async myAlertes(donneurId) {
      return unwrap(
        await sb
          .from("alertes")
          .select("id, statut, created_at, besoins(id, groupe_sanguin, ville, quantite, urgence, etablissement_nom, statut)")
          .eq("donneur_id", donneurId)
          .order("created_at", { ascending: false })
      );
    },
    async respond(alerteId, statut) {
      return unwrap(
        await sb.from("alertes")
          .update({ statut, repondu_le: new Date().toISOString() })
          .eq("id", alerteId)
      );
    },

    async myBesoins(etabId) {
      return unwrap(
        await sb.from("besoins").select("*, alertes(statut)")
          .eq("etablissement_id", etabId).order("created_at", { ascending: false })
      );
    },
    async getBesoin(id) {
      return unwrap(await sb.from("besoins").select("*, alertes(statut)").eq("id", id).single());
    },
    async createBesoin(row) {
      return unwrap(await sb.from("besoins").insert(row).select().single());
    },
    async closeBesoin(id) {
      return unwrap(await sb.from("besoins").update({ statut: "clos" }).eq("id", id));
    },
    async searchDonors(besoinId) {
      return unwrap(await sb.rpc("rechercher_donneurs", { p_besoin: besoinId, p_rayon: cfg.RAYON_KM }));
    },
    async sendAlerts(besoinId) {
      return unwrap(await sb.rpc("envoyer_alertes", { p_besoin: besoinId, p_rayon: cfg.RAYON_KM }));
    },
    async accepted(besoinId) {
      return unwrap(await sb.rpc("reponses_acceptees", { p_besoin: besoinId }));
    },

    async verifyCode(code) {
      const rows = unwrap(await sb.rpc("verifier_code", { p_code: code }));
      return rows[0] || null;
    },
    async adminStats() { return unwrap(await sb.rpc("admin_stats")); },
    async adminEtabs() {
      return unwrap(await sb.from("etablissements").select("*").order("created_at", { ascending: false }));
    },
    async adminCreateEtab(row) { return unwrap(await sb.from("etablissements").insert(row).select().single()); },
    async adminCreateEtabs(rows) { return unwrap(await sb.from("etablissements").insert(rows).select("id")); },
    async adminUpdateEtab(id, patch) { return unwrap(await sb.from("etablissements").update(patch).eq("id", id)); },
    async adminNewCode(id) { return unwrap(await sb.rpc("admin_nouveau_code", { p_id: id })); },
    async confirmDon(alerteId) { return unwrap(await sb.rpc("confirmer_don", { p_alerte: alerteId })); },

    async stockGet(id) { return unwrap(await sb.from("stocks").select("groupe_sanguin, poches").eq("etablissement_id", id)); },
    async stockSave(rows) {
      return unwrap(await sb.from("stocks").upsert(rows, { onConflict: "etablissement_id,groupe_sanguin" }));
    },
    async escalate(besoinId) { return unwrap(await sb.rpc("escalader_besoin", { p_besoin: besoinId })); },
    async adminCarte() { return unwrap(await sb.rpc("admin_carte")); },
    async mesDons(id) {
      return unwrap(await sb.from("alertes").select("id, honore_le, repondu_le, besoins(etablissement_nom, ville)")
        .eq("donneur_id", id).eq("statut", "honore").order("honore_le", { ascending: false }));
    },
    async verifierDonneur(code) {
      const rows = unwrap(await sb.rpc("verifier_donneur", { p_code: code }));
      return rows[0] || null;
    },

    listen(onChange) {
      return sb
        .channel("alertes-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, onChange)
        .subscribe();
    },
    unlisten(channel) {
      if (channel) sb.removeChannel(channel);
    },
  };
})();
