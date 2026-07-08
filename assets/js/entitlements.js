/* 觅梦 Dream Atlas — entitlement layer.
   ALL plan/quota decisions live here. On launch day, flipping paid tiers on
   means changing config + server, never page code.
   NOTE: these client checks are UX; when real AI generation lands, the same
   limits must be enforced server-side (edge function) as the cost guardrail. */
window.AtlasEntitlements = (function () {
  const LIMITS = (window.ATLAS_CONFIG || {}).LIMITS || {};

  const planOf = profile => (profile && profile.plan) || "free";
  const limitsOf = plan => LIMITS[plan] || LIMITS.free || { platesPerMonth: 3, dailyCap: 3 };

  function monthStartISO() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }
  function dayStartISO() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  }

  async function usage() {
    const [month, today] = await Promise.all([
      AtlasStore.countSince(monthStartISO()),
      AtlasStore.countSince(dayStartISO())
    ]);
    return { month, today };
  }

  /* → {ok, reason?, used, limit} */
  async function canEngrave(profile) {
    const l = limitsOf(planOf(profile));
    const u = await usage();
    if (u.month >= l.platesPerMonth) return { ok: false, reason: "month", used: u.month, limit: l.platesPerMonth };
    if (u.today >= l.dailyCap)       return { ok: false, reason: "day",   used: u.month, limit: l.platesPerMonth };
    return { ok: true, used: u.month, limit: l.platesPerMonth };
  }

  const watermark = profile => planOf(profile) === "free";

  return { planOf, limitsOf, usage, canEngrave, watermark };
})();
