/* 觅梦 Dream Atlas — data layer.
   Cloud mode (Supabase) when config.js has credentials; otherwise local
   mode (localStorage). Guests in cloud mode also write locally, and their
   plates migrate into their account on first sign-in. */
window.AtlasStore = (function () {
  const cfg = window.ATLAS_CONFIG || {};
  const hasCloud = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  let sb = null, user = null, profile = null;

  const LS = { dreams: "atlas.dreams", waitlist: "atlas.waitlist", anon: "atlas.anon" };

  function anonId() {
    let a = localStorage.getItem(LS.anon);
    if (!a) {
      a = (crypto.randomUUID ? crypto.randomUUID() : "a" + Date.now() + Math.floor(Math.random() * 1e6));
      localStorage.setItem(LS.anon, a);
    }
    return a;
  }
  function localDreams() {
    try { return JSON.parse(localStorage.getItem(LS.dreams)) || []; } catch (e) { return []; }
  }
  function setLocalDreams(list) { localStorage.setItem(LS.dreams, JSON.stringify(list)); }

  async function init() {
    if (!hasCloud) return;
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const { data } = await sb.auth.getSession();
    user = (data.session && data.session.user) || null;
    sb.auth.onAuthStateChange(async (_e, session) => {
      const wasOut = !user;
      user = (session && session.user) || null;
      profile = null;
      if (user && wasOut) await migrateLocal();
      document.dispatchEvent(new CustomEvent("atlas:auth"));
    });
    if (user) await migrateLocal();
  }

  /* move guest plates into the account, once */
  async function migrateLocal() {
    const local = localDreams();
    if (!local.length || !user) return;
    const rows = local.map(d => ({
      user_id: user.id, text: d.text, motifs: d.motifs,
      art_params: d.art_params, dreamed_on: d.dreamed_on || (d.created_at || "").slice(0, 10) || undefined
    }));
    const { error } = await sb.from("dreams").insert(rows);
    if (!error) setLocalDreams([]);
  }

  const signedIn = () => hasCloud && !!user;

  async function getProfile() {
    if (!signedIn()) return null;
    if (profile) return profile;
    const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    profile = data;
    return data;
  }

  async function signIn(email) {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
  }
  async function signOut() { if (sb) await sb.auth.signOut(); }

  async function saveDream(d) {
    if (signedIn()) {
      const { data, error } = await sb.from("dreams")
        .insert({ user_id: user.id, text: d.text, motifs: d.motifs, art_params: d.art_params, dreamed_on: d.dreamed_on })
        .select().single();
      if (error) throw error;
      return data;
    }
    const row = {
      id: "local-" + Date.now(), text: d.text, motifs: d.motifs, art_params: d.art_params,
      dreamed_on: d.dreamed_on, created_at: new Date().toISOString()
    };
    const all = localDreams(); all.unshift(row); setLocalDreams(all);
    return row;
  }

  async function listDreams(limit) {
    limit = limit || 200;
    if (signedIn()) {
      const { data } = await sb.from("dreams").select("*")
        .order("created_at", { ascending: false }).limit(limit);
      return data || [];
    }
    return localDreams().slice(0, limit);
  }

  async function countSince(iso) {
    if (signedIn()) {
      const { count } = await sb.from("dreams")
        .select("*", { count: "exact", head: true }).gte("created_at", iso);
      return count || 0;
    }
    return localDreams().filter(d => (d.created_at || "") >= iso).length;
  }

  async function joinWaitlist(email, source) {
    if (hasCloud) {
      const { error } = await sb.from("waitlist")
        .insert({ email, locale: window.AtlasI18N ? AtlasI18N.locale : null, source });
      if (error && error.code !== "23505") throw error; // 23505 = already on the list: fine
      return { cloud: true };
    }
    let list; try { list = JSON.parse(localStorage.getItem(LS.waitlist)) || []; } catch (e) { list = []; }
    if (!list.includes(email)) list.push(email);
    localStorage.setItem(LS.waitlist, JSON.stringify(list));
    return { cloud: false };
  }

  /* ---------- public gallery ---------- */
  async function donateToGallery(row) {
    if (!hasCloud) return { cloud: false };
    const { error } = await sb.from("gallery").insert({
      dream_id: row.id && !String(row.id).startsWith("local-") ? row.id : null,
      user_id: user ? user.id : null,
      text: row.text, motifs: row.motifs, art_params: row.art_params,
      locale: window.AtlasI18N ? AtlasI18N.locale : null
    });
    if (error) throw error;
    return { cloud: true };
  }
  async function fetchGallery(limit) {
    if (!hasCloud) return [];
    const { data } = await sb.from("gallery").select("id,text,motifs,art_params,donated_at")
      .eq("approved", true).order("donated_at", { ascending: false }).limit(limit || 60);
    return data || [];
  }

  /* ---------- resonance: one lamp per visitor per plate ---------- */
  async function fetchResonance(ids) {
    if (!hasCloud || !ids.length) return {};
    const { data } = await sb.from("gallery_resonance")
      .select("gallery_id").in("gallery_id", ids);
    const counts = {};
    (data || []).forEach(r => { counts[r.gallery_id] = (counts[r.gallery_id] || 0) + 1; });
    return counts;
  }
  async function resonate(galleryId) {
    if (!hasCloud) return false;
    const { error } = await sb.from("gallery_resonance")
      .insert({ gallery_id: galleryId, anon_id: user ? user.id : anonId() });
    return !error || error.code === "23505"; // duplicate lamp = already lit: fine
  }

  async function logEvent(name, props) {
    try {
      if (hasCloud) {
        await sb.from("events").insert({
          user_id: user ? user.id : null, anon_id: anonId(), name, props: props || {}
        });
      } else {
        console.debug("[atlas event]", name, props || {});
      }
    } catch (e) { /* analytics must never break the product */ }
  }

  return { init, isCloud: () => hasCloud, signedIn, getUser: () => user, getProfile, signIn, signOut, saveDream, listDreams, countSince, joinWaitlist, donateToGallery, fetchGallery, fetchResonance, resonate, anonId, logEvent };
})();
