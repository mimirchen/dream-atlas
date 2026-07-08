/* 觅梦 Dream Atlas — landing page logic */
(async function () {
  const $ = id => document.getElementById(id);
  const E = window.AtlasEngraver, S = window.AtlasStore, T = window.AtlasI18N;

  T.apply();
  await S.init();

  /* ---------- specimens: three sample plates, cut live from their own words ---------- */
  function renderSamples() {
    const wrap = $("samples");
    wrap.innerHTML = "";
    [1, 2, 3].forEach(i => {
      const text = T.t("chip." + i + ".text");
      const params = E.artParams(text);
      const m = params.motifs.map(k => E.byKey(k));
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-inner">
          <div class="card-head"><span>Plate</span><span>${m.map(x => x.en).join(" · ")}</span></div>
          <svg class="card-art" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg"></svg>
          <p class="card-excerpt" style="font-size:13.5px">${text.length > 40 ? text.slice(0, 40) + "…" : text}</p>
          <p class="card-reading">${T.locale === "zh" ? m[0].line : m[0].lineEn}</p>
        </div>`;
      wrap.appendChild(card);
      E.renderArt(card.querySelector("svg"), params);
    });
  }
  renderSamples();
  document.addEventListener("atlas:locale", renderSamples);

  /* ---------- waitlist ---------- */
  async function join() {
    const email = $("wlEmail").value.trim();
    if (!email || !email.includes("@")) { $("wlEmail").focus(); return; }
    $("wlBtn").disabled = true;
    try {
      const res = await S.joinWaitlist(email, "landing");
      $("wlNote").textContent = T.t("wl.ok") + (res.cloud ? "" : " " + T.t("wl.local"));
      $("wlEmail").value = "";
      Atlas.track("waitlist_join", { cloud: res.cloud });
    } catch (err) {
      $("wlNote").textContent = T.t("wl.err");
    }
    $("wlBtn").disabled = false;
  }
  $("wlBtn").addEventListener("click", join);
  $("wlEmail").addEventListener("keydown", e => { if (e.key === "Enter") join(); });

  /* ---------- founding curator intent (registration only — NO payment) ---------- */
  async function reserveSeat() {
    const email = $("fiEmail").value.trim();
    if (!email || !email.includes("@")) { $("fiEmail").focus(); return; }
    $("fiBtn").disabled = true;
    try {
      const res = await S.joinWaitlist(email, "founder-intent");
      $("fiNote").textContent = T.t("fi.ok") + (res.cloud ? "" : " " + T.t("wl.local"));
      $("fiEmail").value = "";
      Atlas.track("founder_intent", { cloud: res.cloud });
    } catch (err) { $("fiNote").textContent = T.t("wl.err"); }
    $("fiBtn").disabled = false;
  }
  $("fiBtn").addEventListener("click", reserveSeat);
  $("fiEmail").addEventListener("keydown", e => { if (e.key === "Enter") reserveSeat(); });
})();
