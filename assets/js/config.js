/* 觅梦 Dream Atlas — configuration
   ──────────────────────────────────────────────────────────────
   CLOUD MODE: create a Supabase project, run supabase/schema.sql,
   then paste your project URL + anon key below. Until then the app
   runs in LOCAL MODE (everything stays in this browser).            */
window.ATLAS_CONFIG = {
  SUPABASE_URL: "https://gvuhoeaaykbycscxkzqg.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_OFfHETOEGJAJ7nO8m9W3Lg_qUcD9RRz",  // publishable key — safe to ship; RLS protects the data

  SITE_URL: "https://dream.doublemi.ai",   // canonical URL: share watermark + auth redirects
  PARENT_URL: "https://doublemi.ai",       // the DoubleMi studio site
  BRAND: { zh: "觅梦", en: "Dream Atlas" },

  /* Monetization switch.
     MUST stay false until: (1) Hirslanden Nebenbeschäftigung approval,
     (2) Zurich GmbH established. See 觅梦-商业化蓝图-2026-07.md §5.      */
  PAYMENTS_ENABLED: false,
  FOUNDING_SEATS: 200,

  /* Cost guardrails (enforced in entitlements.js; mirror server-side
     when real AI generation lands) */
  LIMITS: {
    free:    { platesPerMonth: 3,        dailyCap: 3  },
    plus:    { platesPerMonth: Infinity, dailyCap: 30 },
    founder: { platesPerMonth: Infinity, dailyCap: 30 }
  }
};
