/* 觅梦 Dream Atlas — press page logic */
(async function () {
  const $ = id => document.getElementById(id);
  const E = window.AtlasEngraver, S = window.AtlasStore, ENT = window.AtlasEntitlements, T = window.AtlasI18N;

  T.apply();
  await S.init();

  let profile = null;
  let current = null;           // the plate on display: {dream row, nightNo}
  let dreamsCache = null;

  async function dreams() {
    if (!dreamsCache) dreamsCache = await S.listDreams();
    return dreamsCache;
  }
  function invalidate() { dreamsCache = null; }

  /* ---------- header / auth ---------- */
  async function refreshAuthUI() {
    profile = await S.getProfile();
    const btn = $("authBtn");
    if (!S.isCloud()) {
      $("localBanner").style.display = "block";
      btn.textContent = T.t("app.signin");
      return;
    }
    if (S.signedIn()) {
      const email = (S.getUser().email || "").split("@")[0];
      btn.textContent = email + " · " + T.t("app.signout");
    } else {
      btn.textContent = T.t("app.signin");
    }
  }
  $("authBtn").addEventListener("click", async e => {
    e.preventDefault();
    if (!S.isCloud()) { $("localBanner").style.display = "block"; $("localBanner").scrollIntoView({ behavior: "smooth" }); return; }
    if (S.signedIn()) { await S.signOut(); invalidate(); await refreshAll(); return; }
    $("authModal").classList.add("open");
    $("authEmail").focus();
  });
  $("authModal").addEventListener("click", e => { if (e.target === $("authModal")) $("authModal").classList.remove("open"); });
  $("authSend").addEventListener("click", async () => {
    const email = $("authEmail").value.trim();
    if (!email || !email.includes("@")) { $("authNote").textContent = T.t("auth.err"); return; }
    try {
      await S.signIn(email);
      $("authNote").textContent = T.t("auth.sent");
      Atlas.track("auth_link_sent");
    } catch (err) { $("authNote").textContent = T.t("auth.err"); }
  });
  document.addEventListener("atlas:auth", async () => {
    invalidate();
    if (S.signedIn()) Atlas.track("signed_in");
    await refreshAll();
  });

  /* ---------- usage badge ---------- */
  async function refreshUsage() {
    const check = await ENT.canEngrave(profile);
    const badge = $("usageBadge");
    badge.style.display = "inline-block";
    badge.textContent = check.limit === Infinity
      ? T.t("usage.unlimited", { used: check.used })
      : T.t("usage.count", { used: check.used, limit: check.limit });
    $("limitBanner").style.display = check.ok ? "none" : "block";
    $("engraveBtn").disabled = !check.ok;
    return check;
  }

  /* ---------- the plate ---------- */
  function motifChips(keys) {
    return keys.map(k => { const m = E.byKey(k); return `<span class="motif-tag">${m.cn} · ${m.en}</span>`; }).join("");
  }
  function fmtDate(iso) {
    const d = iso ? new Date(iso) : new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }
  function showPlate(row, nightNo) {
    current = { row, nightNo };
    const m0 = E.byKey(row.motifs[0]);
    $("plateNo").textContent = "Plate No. " + String(nightNo).padStart(3, "0");
    $("plateDate").textContent = fmtDate(row.created_at);
    $("plateNight").textContent = T.t("card.night", { n: nightNo });
    $("cardMotifs").innerHTML = motifChips(row.motifs);
    $("cardExcerpt").textContent = row.text.length > 52 ? row.text.slice(0, 52) + "…" : row.text;
    $("cardReading").innerHTML = m0.lineEn + '<span class="cn">' + m0.line + "</span>";
    E.renderArt($("cardArt"), row.art_params);

    $("cardEmpty").style.display = "none";
    $("cardActions").style.display = "flex";
    const db = $("donateBtn");
    db.textContent = T.t("donate.btn"); db.disabled = false;
    $("shareMenu").style.display = "none"; $("shareNote").textContent = "";
    const card = $("card");
    card.style.display = "block"; card.classList.remove("shown");
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("shown")));
  }

  async function engrave() {
    const text = $("dreamText").value.trim();
    if (!text) { $("dreamText").focus(); return; }
    const check = await refreshUsage();
    if (!check.ok) { Atlas.track("engrave_blocked", { reason: check.reason }); return; }

    const params = E.artParams(text);
    const today = new Date();
    const dreamed_on = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const row = await S.saveDream({ text, motifs: params.motifs, art_params: params, dreamed_on });
    invalidate();

    const all = await dreams();
    showPlate(row, all.length);
    Atlas.track(all.length === 1 ? "engrave_first" : "engrave", { motifs: params.motifs });
    await Promise.all([refreshUsage(), renderArchive(), renderLedger()]);
  }
  $("engraveBtn").addEventListener("click", engrave);
  document.querySelectorAll(".chip[data-chip]").forEach(c =>
    c.addEventListener("click", () => { $("dreamText").value = T.t("chip." + c.dataset.chip + ".text"); engrave(); }));

  /* ---------- save / share ---------- */
  const SITE = (window.ATLAS_CONFIG || {}).SITE_URL || "";
  function cardExportOpts() {
    const { row, nightNo } = current;
    const m0 = E.byKey(row.motifs[0]);
    return {
      params: row.art_params,
      excerpt: row.text.length > 52 ? row.text.slice(0, 52) + "…" : row.text,
      plateNo: "Plate No. " + String(nightNo).padStart(3, "0"),
      dateStr: fmtDate(row.created_at),
      nightStr: T.t("card.night", { n: nightNo }),
      motifs: row.motifs,
      reading: T.locale === "zh" ? m0.line : m0.lineEn,
      watermark: ENT.watermark(profile),
      siteUrl: SITE,
      qrUrl: SITE + "/?s=card",
      filename: "dream-plate-" + String(nightNo).padStart(3, "0") + ".png"
    };
  }
  $("saveBtn").addEventListener("click", async () => {
    if (!current) return;
    await E.exportCardPNG(cardExportOpts());
    Atlas.track("card_saved", { night: current.nightNo });
  });

  $("shareBtn").addEventListener("click", async () => {
    if (!current) return;
    const shareText = T.t("share.text") + " " + SITE + "/?s=share";
    const blob = await E.makeCardBlob(cardExportOpts());
    const file = new File([blob], cardExportOpts().filename, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: shareText });
        Atlas.track("card_shared", { method: "native", night: current.nightNo });
      } catch (e) { /* user closed the sheet */ }
      return;
    }
    const menu = $("shareMenu");
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  });
  $("shareX").addEventListener("click", () => {
    const text = T.t("share.text") + " " + SITE + "/?s=x";
    window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(text), "_blank");
    Atlas.track("card_shared", { method: "x" });
  });
  $("shareCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(T.t("share.text") + " " + SITE + "/?s=share"); } catch (e) {}
    await E.exportCardPNG(cardExportOpts());
    $("shareNote").textContent = T.t("share.copied");
    Atlas.track("card_shared", { method: "copy" });
  });
  $("shareApps").addEventListener("click", async () => {
    await E.exportCardPNG(cardExportOpts());
    $("shareNote").textContent = T.t("share.appsHint");
    Atlas.track("card_shared", { method: "apps" });
  });

  /* ---------- donate to the public gallery ---------- */
  $("donateBtn").addEventListener("click", async () => {
    if (!current) return;
    const btn = $("donateBtn");
    btn.disabled = true;
    try {
      const res = await S.donateToGallery(current.row);
      btn.textContent = res.cloud ? T.t("donate.sent") : T.t("donate.needCloud");
      if (res.cloud) Atlas.track("gallery_donated", { night: current.nightNo });
    } catch (e) {
      btn.textContent = T.t("wl.err"); btn.disabled = false;
    }
  });

  /* ---------- archive ---------- */
  async function renderArchive() {
    const all = await dreams();
    const grid = $("archiveGrid");
    grid.innerHTML = "";
    $("archiveEmpty").style.display = all.length ? "none" : "block";
    all.forEach((row, idx) => {
      const nightNo = all.length - idx;
      const item = document.createElement("div");
      item.className = "archive-item";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      item.appendChild(svg);
      E.renderArt(svg, row.art_params);
      const meta = document.createElement("div");
      meta.className = "m";
      meta.innerHTML = `<span>No.${String(nightNo).padStart(3, "0")}</span><span>${fmtDate(row.created_at)}</span>`;
      item.appendChild(meta);
      item.addEventListener("click", () => { showPlate(row, nightNo); $("press").scrollIntoView({ behavior: "smooth" }); });
      grid.appendChild(item);
    });
  }

  /* ---------- ledger (derived from the archive — single source of truth) ---------- */
  async function renderLedger() {
    const all = await dreams();
    const counts = {};
    all.forEach(r => (r.motifs || []).forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    $("ledgerGrid").innerHTML = entries.map(([k, v]) => {
      const m = E.byKey(k);
      return `<div class="ledger-item"><b>${m.cn} · ${m.en}</b><span class="n">× ${v}</span></div>`;
    }).join("");
    $("ledgerEmpty").style.display = entries.length ? "none" : "block";
  }

  /* ---------- voice ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceBtn = $("voiceBtn");
  if (!SR) {
    voiceBtn.style.display = "none";
    $("voiceHint").textContent = T.t("maker.voice.unsupported");
  } else {
    let rec = null, listening = false;
    voiceBtn.addEventListener("click", () => {
      if (listening) { rec.stop(); return; }
      rec = new SR();
      rec.lang = T.locale === "zh" ? "zh-CN" : "en-US";
      rec.interimResults = true; rec.continuous = true;
      const base = $("dreamText").value;
      rec.onresult = e => {
        let t = ""; for (const r of e.results) t += r[0].transcript;
        $("dreamText").value = (base ? base + " " : "") + t;
      };
      rec.onend = () => { listening = false; voiceBtn.classList.remove("listening"); voiceBtn.textContent = T.t("maker.voice"); };
      rec.onerror = () => { $("voiceHint").textContent = T.t("maker.voice.error"); };
      rec.start(); listening = true;
      voiceBtn.classList.add("listening"); voiceBtn.textContent = T.t("maker.voice.stop");
    });
  }

  /* ---------- locale switch re-renders dynamic strings ---------- */
  document.addEventListener("atlas:locale", async () => {
    await refreshAuthUI(); await refreshUsage();
    if (current) showPlate(current.row, current.nightNo);
  });

  async function refreshAll() {
    await refreshAuthUI();
    await Promise.all([refreshUsage(), renderArchive(), renderLedger()]);
  }
  await refreshAll();
})();
