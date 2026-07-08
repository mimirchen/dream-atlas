/* 觅梦 Dream Atlas — the engraving engine.
   Deterministic: a dream's text → artParams → always the same plate.
   Store artParams (not pixels) in the archive; re-render anywhere.
   v1 = local algorithm; the real AI engraver will slot in behind
   the same artParams/renderArt contract. */
window.AtlasEngraver = (function () {

  /* ---------- seeded rng ---------- */
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- motif dictionary (zh + en) ---------- */
  const MOTIFS = [
    { key: "water",  re: /水|海|河|湖|雨|游泳|洪|浪|潮|water|sea|ocean|river|lake|rain|swim|wave|flood|tide/i,
      cn: "水", en: "Water",     line: "水到访的夜晚,情绪正在寻找它的岸。", lineEn: "Water visits when a feeling looks for its shore." },
    { key: "flight", re: /飞|翅|风筝|翱|悬浮|漂浮|fly|flying|flew|wing|float|soar|hover/i,
      cn: "飞", en: "Flight",    line: "飞行,是身体还记得的自由。",        lineEn: "Flight is a freedom the body still remembers." },
    { key: "falling", re: /坠|掉下|摔|下坠|跌|fall|falling|fell|plunge|drop/i,
      cn: "坠", en: "Falling",   line: "坠落的梦,往往醒在触地之前。",      lineEn: "Falling dreams wake a breath before landing." },
    { key: "teeth",  re: /牙|tooth|teeth/i,
      cn: "牙", en: "Teeth",     line: "牙齿松动的夜里,多半有话未说。",    lineEn: "Loose teeth guard the unsaid." },
    { key: "clock",  re: /考试|迟到|赶不上|错过|来不及|钟|exam|late|miss(ed|ing)? the|clock|deadline/i,
      cn: "钟", en: "The Clock", line: "迟到的梦里,时间只是焦虑换的衣裳。", lineEn: "In late dreams, time is anxiety in costume." },
    { key: "snake",  re: /蛇|snake|serpent/i,
      cn: "蛇", en: "Serpent",   line: "蛇是旧皮与新生之间的信使。",        lineEn: "The serpent carries word between old skin and new." },
    { key: "door",   re: /门|钥匙|锁|door|key|lock|gate/i,
      cn: "门", en: "The Door",  line: "梦里的每一扇门,都通向你自己。",    lineEn: "Every door in a dream opens inward." },
    { key: "stairs", re: /楼梯|电梯|台阶|往上爬|攀|stair|staircase|elevator|climb|ladder/i,
      cn: "梯", en: "Stairs",    line: "楼梯上上下下,是心里的海拔在变。",  lineEn: "Stairs measure the altitude of the heart." },
    { key: "maze",   re: /迷路|迷宫|找不到|走廊|maze|labyrinth|lost|corridor|hallway/i,
      cn: "迷", en: "Labyrinth", line: "迷路的梦,是还没做完的决定。",      lineEn: "A maze is a decision still being made." },
    { key: "chase",  re: /追|逃|躲|chas(e|ed|ing)|flee|escape|hide|hiding|pursu/i,
      cn: "追", en: "The Chase", line: "被追赶时,回头看清它的脸。",        lineEn: "When chased, turn and learn its face." },
    { key: "home",   re: /老家|童年|故乡|外婆|奶奶|爷爷|小时候|旧屋|childhood|grandm|grandf|hometown|old house|home I grew/i,
      cn: "屋", en: "Home",      line: "故乡在梦里,永远比地图上近。",      lineEn: "Home in dreams is nearer than on maps." },
    { key: "moon",   re: /月|星|夜空|moon|star|night sky/i,
      cn: "月", en: "Moon",      line: "月亮收藏所有无处安放的梦。",        lineEn: "The moon keeps every unhomed dream." }
  ];
  const DEFAULT_KEY = "moon";
  const byKey = k => MOTIFS.find(m => m.key === k) || MOTIFS[MOTIFS.length - 1];

  /* ---------- symbol library (etched line art in a ~[-50,50] box) ---------- */
  const SYM = {
    moon() {
      let s = '<path d="M 10,-40 A 41 41 0 1 0 10,40 A 31 31 0 1 1 10,-40 Z"/>';
      for (let r = 14; r <= 30; r += 8)
        s += `<path d="M ${-r * 0.55},${-r * 0.8} A ${r} ${r} 0 0 0 ${-r * 0.55},${r * 0.8}" opacity=".45"/>`;
      return s;
    },
    water() {
      let s = "";
      for (let i = 0; i < 4; i++) {
        const y = -16 + i * 13;
        s += `<path d="M -44 ${y} q 11 -9 22 0 q 11 9 22 0 q 11 -9 22 0 q 11 9 22 0" opacity="${1 - i * 0.16}"/>`;
      }
      return s;
    },
    flight() {
      let s = "";
      for (const [x, y, k] of [[-14, -14, 1], [12, -2, .8], [-2, 14, .6]])
        s += `<g transform="translate(${x},${y}) scale(${k})" opacity="${k}"><path d="M -16 0 Q -8 -11 0 0 Q 8 -11 16 0"/></g>`;
      return s + '<path d="M -40 34 q 20 -6 80 0" opacity=".3"/>';
    },
    falling() {
      let s = '<path d="M 2,-44 C 12,-18 -8,16 4,44"/>';
      for (let t = 0; t < 9; t++) {
        const y = -38 + t * 9, dx = 10 - t * 0.6, x = 2 + Math.sin(t) * 4;
        s += `<path d="M ${x},${y} l ${-dx},5" opacity=".6"/><path d="M ${x},${y} l ${dx * 0.8},6" opacity=".6"/>`;
      }
      return s;
    },
    teeth() {
      return '<path d="M -20,-12 C -20,-36 20,-36 20,-12 C 20,2 15,9 12,28 C 10,39 4,39 3,28 L 0,16 L -3,28 C -4,39 -10,39 -12,28 C -15,9 -20,2 -20,-12 Z"/><path d="M -12,-22 Q 0,-28 12,-22" opacity=".5"/>';
    },
    clock() {
      let s = '<circle cx="0" cy="0" r="37"/><circle cx="0" cy="0" r="2.2" fill="currentColor"/>';
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        s += `<path d="M ${33 * Math.sin(a)},${-33 * Math.cos(a)} L ${37 * Math.sin(a)},${-37 * Math.cos(a)}"/>`;
      }
      return s + '<path d="M 0,0 L 0,-23"/><path d="M 0,0 L 15,9"/>';
    },
    snake() {
      return '<path d="M -42,26 C -22,4 -24,46 -2,26 C 18,8 16,44 36,26 C 40,22 44,20 45,16"/><circle cx="45" cy="13" r="3.4"/><path d="M 47,10 l 5,-5 M 52,5 l 2,2 M 52,5 l -2,-2" opacity=".8"/><path d="M -38,30 C -20,12 -24,48 -4,30" opacity=".35"/>';
    },
    door() {
      let s = '<path d="M -19,46 L -19,-12 A 19 19 0 0 1 19,-12 L 19,46"/><path d="M -26,46 L 26,46"/><circle cx="11" cy="14" r="2"/>';
      for (let i = -3; i <= 3; i++) s += `<path d="M ${i * 5},-34 L ${i * 8},-48" opacity=".5"/>`;
      for (let y = -8; y < 40; y += 9) s += `<path d="M -13,${y} L 13,${y}" opacity=".28"/>`;
      return s;
    },
    stairs() {
      return '<path d="M -42,42 L -42,26 L -28,26 L -28,10 L -14,10 L -14,-6 L 0,-6 L 0,-22 L 14,-22 L 14,-38 L 30,-38"/><path d="M -42,42 L 30,42 L 30,-38" opacity=".3"/><circle cx="36" cy="-44" r="4" opacity=".7"/>';
    },
    maze() {
      return '<path d="M -38,-38 L 38,-38 L 38,38 L -10,38"/><path d="M -38,-38 L -38,24"/><path d="M -25,25 L -25,-25 L 25,-25 L 25,25 L 0,25"/><path d="M -12,12 L -12,-12 L 12,-12 L 12,12"/><circle cx="0" cy="2" r="2.4" fill="currentColor"/>';
    },
    chase() {
      let s = "";
      for (let i = 0; i < 5; i++) {
        const x = -36 + i * 17, y = 26 - i * 13;
        s += `<ellipse cx="${x}" cy="${y}" rx="4.5" ry="7" transform="rotate(${18 + i * 4} ${x} ${y})" opacity="${0.35 + i * 0.16}"/>`;
      }
      return s + '<path d="M 40,-34 l -10,4 M 40,-34 l -4,10 M 40,-34 L 18,-16" opacity=".7"/>';
    },
    home() {
      let s = '<path d="M -30,38 L -30,-4 L 0,-30 L 30,-4 L 30,38 Z"/><path d="M -7,38 L -7,14 L 7,14 L 7,38"/><path d="M -38,2 L 0,-32 L 38,2" opacity=".5"/>';
      for (let y = 4; y < 36; y += 7) s += `<path d="M -26,${y} L -11,${y}" opacity=".25"/><path d="M 11,${y} L 26,${y}" opacity=".25"/>`;
      return s + '<path d="M 14,-14 L 14,-26 L 20,-26 L 20,-9" opacity=".8"/>';
    }
  };
  SYM.moonDefault = SYM.moon;

  /* ---------- public: motif detection ---------- */
  function detectMotifs(text) {
    const found = [];
    for (const m of MOTIFS) {
      const i = text.search(m.re);
      if (i >= 0) found.push({ m, i });
    }
    found.sort((a, b) => a.i - b.i);
    const list = found.slice(0, 2).map(f => f.m.key);
    return list.length ? list : [DEFAULT_KEY];
  }

  /* ---------- public: text → deterministic art parameters ---------- */
  function artParams(text) {
    return { v: 1, seed: xmur3(text.trim())(), motifs: detectMotifs(text) };
  }

  /* ---------- public: render params into an <svg> (viewBox 0 0 320 320) ---------- */
  function renderArt(svgEl, params) {
    const rng = mulberry32(params.seed);
    const primary = SYM[params.motifs[0]] ? params.motifs[0] : "moon";
    const secondary = params.motifs[1] && SYM[params.motifs[1]] ? params.motifs[1] : null;
    const seedDisp = Math.floor(rng() * 100);

    let stars = "";
    const n = 8 + Math.floor(rng() * 8);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = 70 + rng() * 55;
      const x = 160 + Math.cos(a) * r, y = 140 + Math.sin(a) * r * 0.82;
      if (y > 190) continue;
      stars += rng() < 0.3
        ? `<path d="M ${x - 3},${y} L ${x + 3},${y} M ${x},${y - 3} L ${x},${y + 3}" opacity=".55"/>`
        : `<circle cx="${x}" cy="${y}" r="${0.8 + rng() * 1.1}" fill="currentColor" stroke="none" opacity=".6"/>`;
    }
    let ground = "";
    for (let i = 0; i < 9; i++) {
      const y = 216 + i * 6;
      const half = Math.sqrt(Math.max(0, 1 - ((y - 160) / 122) ** 2)) * 118;
      ground += `<path d="M ${160 - half},${y} L ${160 + half},${y}" opacity="${0.32 - i * 0.03}"/>`;
    }
    const rot = (rng() * 10 - 5).toFixed(1);
    const secX = 110 + rng() * 100, secY = 70 + rng() * 30;
    const uid = "e" + params.seed % 100000;

    svgEl.setAttribute("viewBox", "0 0 320 320");
    svgEl.innerHTML = `
    <defs>
      <filter id="${uid}-etch" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.032" numOctaves="3" seed="${seedDisp}" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/>
      </filter>
      <filter id="${uid}-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seedDisp + 7}"/><feColorMatrix type="matrix" values="0 0 0 0 0.93 0 0 0 0 0.92 0 0 0 0 0.89 0 0 0 0.05 0"/></filter>
      <clipPath id="${uid}-vig"><ellipse cx="160" cy="160" rx="118" ry="122"/></clipPath>
    </defs>
    <g stroke="#ECEAE3" fill="none" stroke-width="1.1" stroke-linecap="round" color="#ECEAE3" filter="url(#${uid}-etch)">
      <ellipse cx="160" cy="160" rx="126" ry="130" opacity=".55"/>
      <ellipse cx="160" cy="160" rx="118" ry="122" opacity=".9"/>
      <g clip-path="url(#${uid}-vig)">
        ${stars}
        ${ground}
        ${secondary ? `<g transform="translate(${secX},${secY}) scale(0.42)" opacity=".55">${SYM[secondary]()}</g>` : ""}
        <g transform="translate(160,152) rotate(${rot}) scale(1.18)">${SYM[primary]()}</g>
      </g>
    </g>
    <rect width="320" height="320" filter="url(#${uid}-grain)" opacity=".8"/>`;
  }

  /* ---------- public: share card PNG (watermark per plan, QR back home) ---------- */
  async function drawCard(o) {
    // o: {params, excerpt, plateNo, dateStr, nightStr, motifs:[keys], watermark, siteUrl, qrUrl, filename}
    const W = 800, H = 1180, PAD = 56;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");

    ctx.fillStyle = "#141518"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(236,234,227,0.16)";
    ctx.strokeRect(28, 28, W - 56, H - 56);
    ctx.strokeStyle = "rgba(236,234,227,0.08)";
    ctx.strokeRect(44, 44, W - 88, H - 88);

    // header
    ctx.fillStyle = "#6E6E67";
    ctx.font = "600 20px 'Instrument Sans','Noto Sans SC',sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText((o.plateNo || "").toUpperCase(), PAD + 14, PAD + 18);
    const dw = ctx.measureText(o.dateStr || "").width;
    ctx.fillText(o.dateStr || "", W - PAD - 14 - dw, PAD + 18);

    // art (SVG → image)
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    tmp.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    renderArt(tmp, o.params);
    const svgStr = new XMLSerializer().serializeToString(tmp);
    const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, (W - 620) / 2, 128, 620, 620); URL.revokeObjectURL(url); res(); };
      img.onerror = rej;
      img.src = url;
    });

    // motif tags
    const names = (o.motifs || []).map(k => { const m = byKey(k); return `${m.cn} · ${m.en}`; });
    ctx.font = "16px 'Instrument Sans','Noto Sans SC',sans-serif";
    let tagY = 776;
    let widths = names.map(nm => ctx.measureText(nm).width + 44);
    let x = (W - (widths.reduce((a, b) => a + b, 0) + (names.length - 1) * 12)) / 2;
    names.forEach((nm, i) => {
      ctx.strokeStyle = "rgba(236,234,227,0.16)";
      roundRect(ctx, x, tagY, widths[i], 36, 18); ctx.stroke();
      ctx.fillStyle = "#9C9C93";
      ctx.fillText(nm, x + 22, tagY + 9);
      x += widths[i] + 12;
    });

    // excerpt (wrapped, max 3 lines)
    ctx.fillStyle = "#ECEAE3";
    ctx.font = "26px 'Noto Serif SC',Georgia,serif";
    const lines = wrap(ctx, "「" + (o.excerpt || "") + "」", W - PAD * 2 - 60, 3);
    let y = 856;
    for (const ln of lines) {
      const w = ctx.measureText(ln).width;
      ctx.fillText(ln, (W - w) / 2, y); y += 46;
    }

    // reading line
    if (o.reading) {
      ctx.fillStyle = "#9C9C93";
      ctx.font = "italic 21px 'Cormorant Garamond',Georgia,serif";
      const w = ctx.measureText(o.reading).width;
      ctx.fillText(o.reading, (W - w) / 2, y + 10);
      y += 48;
    }

    // seal
    ctx.save();
    ctx.translate(W - PAD - 46, H - PAD - 52); ctx.rotate(-0.07);
    ctx.fillStyle = "#CE4A33"; roundRect(ctx, 0, 0, 52, 52, 5); ctx.fill();
    ctx.fillStyle = "#F5EFE4"; ctx.font = "30px 'Noto Serif SC',serif";
    ctx.fillText("觅", 11, 10);
    ctx.restore();

    // QR back home (a small paper label on the plate; needs light-on-dark inversion avoided)
    let footX = PAD + 14;
    if (o.qrUrl && window.qrcode) {
      try {
        const qr = window.qrcode(0, "M");
        qr.addData(o.qrUrl); qr.make();
        const n = qr.getModuleCount(), size = 96, pad = 8;
        const qx = PAD + 14, qy = H - PAD - 108;
        ctx.fillStyle = "#ECEAE3";
        roundRect(ctx, qx, qy, size + pad * 2, size + pad * 2, 4); ctx.fill();
        ctx.fillStyle = "#141518";
        const m = size / n;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
          if (qr.isDark(r, c)) ctx.fillRect(qx + pad + c * m, qy + pad + r * m, Math.ceil(m), Math.ceil(m));
        footX = qx + size + pad * 2 + 16;
      } catch (e) { /* QR is decoration; never block the card */ }
    }

    // footer / watermark
    ctx.fillStyle = "#6E6E67";
    ctx.font = "600 17px 'Instrument Sans','Noto Sans SC',sans-serif";
    ctx.fillText(o.nightStr || "", footX, H - PAD - 40);
    if (o.watermark) {
      const wm = "觅梦 Dream Atlas · " + (o.siteUrl || "").replace(/^https?:\/\//, "");
      ctx.fillStyle = "#9C9C93";
      const w = ctx.measureText(wm).width;
      ctx.fillText(wm, Math.max(footX, (W - w) / 2), H - PAD + 6);
    }
    return cv;
  }
  async function exportCardPNG(o) {
    const cv = await drawCard(o);
    const a = document.createElement("a");
    a.download = o.filename || "dream-plate.png";
    a.href = cv.toDataURL("image/png");
    a.click();
  }
  async function makeCardBlob(o) {
    const cv = await drawCard(o);
    return new Promise(res => cv.toBlob(res, "image/png"));
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrap(ctx, text, maxW, maxLines) {
    const lines = []; let cur = "";
    for (const ch of text) {
      if (ctx.measureText(cur + ch).width > maxW) {
        lines.push(cur); cur = ch;
        if (lines.length === maxLines) { lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…"; return lines; }
      } else cur += ch;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, maxLines);
  }

  return { MOTIFS, byKey, detectMotifs, artParams, renderArt, exportCardPNG, makeCardBlob };
})();
