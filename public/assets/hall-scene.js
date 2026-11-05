/* =============================================================================
 * Đại Sảnh Nét — cảnh sảnh dùng chung (bản Live + bản Luyện tay)
 * - Chèn sprite SVG (hộp quà, DDoS, khiên, nệm, đèn, cây, băng rôn) vào <body>
 * - Dựng cảnh sảnh gỗ + 6 ghế Nét tương tác + ghế Nét trang trí
 * - Tự đổi bố cục dọc (điện thoại) / ngang (máy tính) theo tỉ lệ sân khấu
 * Dùng: const hall = Hall.build(stageEl, services, { assetBase:'assets/' })
 *       → { seats, seatById, seatsEl, SVC, setDecorNames(names), decorCount() }
 * ============================================================================= */
window.Hall = (() => {
  'use strict';
  const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <symbol id="i-gift" viewBox="0 0 64 64">
      <rect x="8" y="26" width="48" height="32" rx="6" fill="#ff6fa0" stroke="#b3205c" stroke-width="3"/>
      <rect x="4" y="18" width="56" height="14" rx="5" fill="#ff8fb7" stroke="#b3205c" stroke-width="3"/>
      <rect x="28" y="18" width="8" height="40" fill="#ffe27a"/>
      <path d="M32 18C20 2 6 12 20 18ZM32 18C44 2 58 12 44 18Z" fill="#ffe27a" stroke="#b3205c" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="32" cy="44" r="9" fill="#fff"/>
      <text x="32" y="50" text-anchor="middle" font-size="16" font-weight="900" fill="#b3205c" font-family="Be Vietnam Pro,sans-serif">?</text>
    </symbol>
    <symbol id="i-gold" viewBox="0 0 64 64">
      <rect x="8" y="26" width="48" height="32" rx="6" fill="#ffcf3a" stroke="#a86a00" stroke-width="3"/>
      <rect x="4" y="18" width="56" height="14" rx="5" fill="#ffe27a" stroke="#a86a00" stroke-width="3"/>
      <rect x="28" y="18" width="8" height="40" fill="#fff6c9"/>
      <path d="M32 18C20 2 6 12 20 18ZM32 18C44 2 58 12 44 18Z" fill="#fff6c9" stroke="#a86a00" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="32" cy="44" r="9" fill="#fff"/>
      <text x="32" y="49.5" text-anchor="middle" font-size="13" font-weight="900" fill="#a86a00" font-family="Be Vietnam Pro,sans-serif">%</text>
      <path d="M54 6l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff"/>
    </symbol>
    <symbol id="i-bug" viewBox="0 0 64 64">
      <g stroke="#7a0707" stroke-width="4" stroke-linecap="round">
        <path d="M32 4v11M32 49v11M4 32h11M49 32h11M12 12l8 8M52 12l-8 8M12 52l8-8M52 52l-8-8"/>
      </g>
      <circle cx="32" cy="32" r="18" fill="#cc0e0e" stroke="#7a0707" stroke-width="3"/>
      <ellipse cx="25" cy="29" rx="4.5" ry="5.5" fill="#fff"/><ellipse cx="39" cy="29" rx="4.5" ry="5.5" fill="#fff"/>
      <circle cx="26" cy="30" r="2.2" fill="#111"/><circle cx="38" cy="30" r="2.2" fill="#111"/>
      <path d="M19 21l10 4M45 21l-10 4" stroke="#7a0707" stroke-width="3" stroke-linecap="round"/>
      <path d="M24 42l4-3 4 3 4-3 4 3" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="i-shield" viewBox="0 0 64 64">
      <path d="M32 4L56 12V32C56 46 46 56 32 61C18 56 8 46 8 32V12Z" fill="#0582D4" stroke="#024799" stroke-width="3" stroke-linejoin="round"/>
      <rect x="23" y="30" width="18" height="15" rx="3" fill="#fff"/>
      <path d="M27 30v-5a5 5 0 0 1 10 0v5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="32" cy="37.5" r="2.4" fill="#024799"/>
    </symbol>
    <symbol id="i-cushion" viewBox="0 0 120 44">
      <path d="M8 10Q60-4 112 10L118 30Q60 46 2 30Z" fill="#2f5fa8" stroke="#1d3f78" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M12 12Q60 0 108 12L113 26Q60 40 7 26Z" fill="#4f82d6"/>
      <path d="M22 16Q60 8 98 16" fill="none" stroke="#86b3f0" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
      <path d="M26 22Q60 15 94 22M28 27Q60 21 92 27" fill="none" stroke="#1d3f78" stroke-width="1.4" stroke-dasharray="3 3" opacity=".55"/>
      <circle cx="60" cy="19" r="3.2" fill="#ffcf3a" stroke="#a86a00" stroke-width="1"/>
      <path d="M4 30l-3 7M116 30l3 7" stroke="#ffcf3a" stroke-width="2.5" stroke-linecap="round"/>
    </symbol>
    <symbol id="i-lamp" viewBox="0 0 80 150">
      <line x1="40" y1="0" x2="40" y2="58" stroke="#2d170a" stroke-width="3"/>
      <path d="M12 96L26 58h28l14 38z" fill="#b22a2a" stroke="#6e1212" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M26 58h28l-4 10H30z" fill="#d8403d"/>
      <rect x="10" y="94" width="60" height="8" rx="3" fill="#f0c04a" stroke="#a86a00" stroke-width="2"/>
      <circle cx="40" cy="102" r="7" fill="#fff6c9" stroke="#f0c04a" stroke-width="2"/>
      <ellipse cx="40" cy="104" rx="30" ry="16" fill="url(#lampGlow)"/>
    </symbol>
    <radialGradient id="lampGlow"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".85"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>
    <symbol id="i-plant" viewBox="0 0 150 200">
      <path d="M38 130h74l-9 62H47z" fill="#b25a34" stroke="#6e3418" stroke-width="3" stroke-linejoin="round"/>
      <rect x="30" y="122" width="90" height="16" rx="5" fill="#cf7046" stroke="#6e3418" stroke-width="3"/>
      <g fill="#3f9a45" stroke="#245c2a" stroke-width="2.5" stroke-linejoin="round">
        <path d="M75 126C40 120 20 90 22 50c30 6 50 36 53 76z"/>
        <path d="M75 126c35-6 55-36 53-76-30 6-50 36-53 76z" fill="#58b55c"/>
        <path d="M75 126C65 90 52 60 20 42c22-4 50 10 55 84z" fill="#2f8a3a"/>
        <path d="M75 126c10-36 23-66 55-84-22-4-50 10-55 84z" fill="#6fc46f"/>
        <path d="M75 126C72 80 72 40 75 8c4 32 4 72 0 118z" fill="#45a84d"/>
      </g>
    </symbol>
    <symbol id="i-banner" viewBox="0 0 320 130">
      <path d="M40 0v34M280 0v34" stroke="#2d170a" stroke-width="3"/>
      <path d="M14 34h292l-12 12 12 12-12 12 12 12-12 12 12 12-12 12H14l12-12-12-12 12-12-12-12 12-12-12-12 12-12z" fill="#cc0e0e"/>
      <rect x="26" y="40" width="268" height="78" rx="10" fill="#024799" stroke="#ffcf3a" stroke-width="3"/>
      <rect x="34" y="48" width="252" height="62" rx="7" fill="none" stroke="#619ee9" stroke-width="1.5" stroke-dasharray="4 4" opacity=".7"/>
      <text x="160" y="82" text-anchor="middle" font-family="Be Vietnam Pro,sans-serif" font-weight="900" font-size="31" fill="#fff" letter-spacing="2">BLACK FRIDAY</text>
      <text x="160" y="104" text-anchor="middle" font-family="Be Vietnam Pro,sans-serif" font-weight="800" font-size="13.5" fill="#ffcf3a" letter-spacing="3">SĂN DEAL CÙNG NÉT · iNET</text>
    </symbol>
  </defs>
</svg>`;
  const SCENE = `<div class="scene" aria-hidden="true">
    <div class="wall">
      <div class="panels"></div>
      <div class="win w1"></div><div class="win w2"></div><div class="win w3"></div><div class="win w4"></div>
      <svg class="banner" viewBox="0 0 320 130"><use href="#i-banner"/></svg>
      <div class="rail"></div>
    </div>
    <div class="floor"><div class="planks"></div><div class="floor-glow"></div></div>
    <div class="ceiling"></div>
    <div class="lamp l1"><svg viewBox="0 0 80 150"><use href="#i-lamp"/></svg></div>
    <div class="lamp l2"><svg viewBox="0 0 80 150"><use href="#i-lamp"/></svg></div>
    <div class="lamp l3"><svg viewBox="0 0 80 150"><use href="#i-lamp"/></svg></div>
    <div class="lamp l4"><svg viewBox="0 0 80 150"><use href="#i-lamp"/></svg></div>
    <svg class="plant pl" viewBox="0 0 150 200"><use href="#i-plant"/></svg>
    <svg class="plant pr" viewBox="0 0 150 200"><use href="#i-plant"/></svg>
    <div class="sunbeam"></div>
    <div class="dust"></div>
  </div>`;

  // Kích thước gốc 6 pose Nét (px) để giữ đúng tỉ lệ
  const POSE = { wave:[274,416], shield:[190,290], thumb:[300,419], idea:[190,365], book:[190,277], support:[190,234] };
  // 6 ghế tương tác (thứ tự cố định)
  const FRONT = [
    { id:'domain' }, { id:'hosting' },
    { id:'deal', pose:'idea', label:'Thích Săn Deal', deal:true },
    { id:'vps' }, { id:'ssl' }, { id:'email' }
  ];
  // Toạ độ % sân khấu: x = tâm, y = đáy nệm, w = bề rộng (% chiều ngang)
  const LAYOUTS = {
    portrait: {
      front: { domain:[22,50,22], hosting:[78,50,22], deal:[50,59.5,30], vps:[21,73,22], ssl:[79,73,22], email:[50,83,23] },
      decor: [[9,31,13,'thumb'],[26,31,13,'book'],[43,31,13,'support'],[60,31,13,'wave'],[77,31,13,'shield'],[93,31,13,'idea'],
              [16,40,15,'support'],[34,40,15,'thumb'],[66,40,15,'book'],[84,40,15,'wave']]
    },
    wide: {
      front: { domain:[13,72,11], hosting:[31,70,11], deal:[50,76,14.5], vps:[69,70,11], ssl:[87,72,11], email:[50,92,10.5] },
      decor: [[6,46,7.5,'thumb'],[17,45,7.5,'book'],[28,46,7.5,'support'],[39,45,7.5,'wave'],[61,45,7.5,'shield'],[72,46,7.5,'idea'],[83,45,7.5,'book'],[94,46,7.5,'thumb'],
              [22,56,8.5,'support'],[40,57,8.5,'thumb'],[60,57,8.5,'wave'],[78,56,8.5,'book'],
              [16,94,10,'wave'],[84,94,10,'shield']]
    }
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function build(stage, services, opts = {}){
    const base = opts.assetBase || 'assets/';
    if (!document.getElementById('i-gift')) document.body.insertAdjacentHTML('afterbegin', SPRITE);
    stage.insertAdjacentHTML('afterbegin', SCENE + '<div class="seats" id="seats"></div><div class="vignette" aria-hidden="true"></div>');
    const seatsEl = stage.querySelector('#seats');
    const SVC = Object.fromEntries(services.map(s => [s.id, s]));
    const seats = [];
    let decorNames = [];

    function placeSeat(el, x, y, w){
      el.style.left = x + '%'; el.style.top = y + '%'; el.style.setProperty('--w', w + '%');
      el.style.zIndex = Math.round(y * 10);
    }
    function mkSeat(def, decor, i){
      const pose = def.pose || SVC[def.id].pose;
      const [pw, ph] = POSE[pose];
      const el = document.createElement('div');
      el.className = 'seat' + (decor ? ' decor' : '') + (def.deal ? ' deal' : '') + (i % 2 ? ' flip' : '');
      el.style.setProperty('--d', (Math.random() * -3).toFixed(2) + 's');
      const label = def.deal ? def.label : (SVC[def.id] ? SVC[def.id].label : '');
      el.innerHTML =
        (decor ? '<div class="nick" hidden></div>' : `<div class="label">${esc(label)}</div>`) +
        '<div class="shadow"></div>' +
        `<div class="wrap" style="aspect-ratio:${pw}/${(ph * .82).toFixed(1)}"><img class="net" src="${base}mascot/net-${pose}.webp" alt="" width="${pw}" height="${ph}" draggable="false"></div>` +
        '<svg class="cushion" viewBox="0 0 120 44" aria-hidden="true"><use href="#i-cushion"/></svg>' +
        (decor ? '' : '<div class="item"></div>');
      if (!decor){
        el.setAttribute('role', 'button'); el.tabIndex = 0;
        el.setAttribute('aria-label', 'Nét ' + label.toLowerCase());
        el.dataset.id = def.id;
      }
      seatsEl.appendChild(el);
      return el;
    }
    FRONT.forEach((d, i) => seats.push({ def:d, id:d.id, el:mkSeat(d, false, i + 1), item:null }));
    const seatById = Object.fromEntries(seats.map(s => [s.id, s]));

    // Biệt danh người chơi khác hiện trên ghế trang trí (bản Live)
    function paintDecorNames(){
      stage.querySelectorAll('.seat.decor').forEach((el, i) => {
        const n = el.querySelector('.nick'), name = decorNames[i];
        n.hidden = !name; n.textContent = name || '';
        el.classList.toggle('taken', !!name);
      });
    }
    let layoutKey = '';
    function applyLayout(){
      const wide = stage.clientWidth / Math.max(1, stage.clientHeight) >= 1.05;
      const key = wide ? 'wide' : 'portrait';
      if (key === layoutKey) return;
      layoutKey = key;
      const L = LAYOUTS[key];
      stage.classList.toggle('wide', wide);
      seatsEl.querySelectorAll('.seat.decor').forEach(e => e.remove());
      L.decor.forEach((d, i) => { const el = mkSeat({ pose:d[3] }, true, i); placeSeat(el, d[0], d[1], d[2]); });
      seats.forEach(s => { const p = L.front[s.id]; placeSeat(s.el, p[0], p[1], p[2]); });
      paintDecorNames();
    }
    applyLayout();
    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(applyLayout); }).observe(stage);

    return {
      seats, seatById, seatsEl, SVC,
      setDecorNames(names){ decorNames = names.slice(); paintDecorNames(); },
      decorCount(){ return stage.querySelectorAll('.seat.decor').length; }
    };
  }
  return { build, POSE };
})();
