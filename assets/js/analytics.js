/* 觅梦 Dream Atlas — funnel events.
   Canonical names (keep stable; dashboards depend on them):
   page_view · waitlist_join · auth_link_sent · signed_in ·
   engrave · engrave_first · engrave_blocked · card_saved */
window.Atlas = window.Atlas || {};
Atlas.track = function (name, props) { AtlasStore.logEvent(name, props); };

document.addEventListener("DOMContentLoaded", function () {
  Atlas.track("page_view", {
    path: location.pathname.split("/").pop() || "index.html",
    locale: window.AtlasI18N ? AtlasI18N.locale : null,
    ref: document.referrer ? new URL(document.referrer).hostname : null,
    src: new URLSearchParams(location.search).get("s")  // ?s=card|share|x → which share surface brought them
  });
});
