/* =============================================================================
 * Đại Sảnh Nét Online — bộ hình (SVG vẽ bằng code → Image) + ảnh 6 bé Nét
 * window.WorldSprites = { SVC_COLORS, SVC_NAMES, AVATARS, img: {...}, mascot: {...}, ready: Promise }
 * ============================================================================= */
window.WorldSprites = (() => {
  'use strict';
  // Màu nhận diện từng dịch vụ (hộp quà, quầy, ô tiến độ)
  const SVC_COLORS = { domain:'#0582D4', hosting:'#0E9F6E', vps:'#7C3AED', ssl:'#D47B0A', email:'#DB2777', super:'#E5A900' };
  const AVATARS = ['wave', 'shield', 'thumb', 'idea', 'book', 'support'];
  const AVATAR_NAMES = { wave:'Nét Vẫy Tay', shield:'Nét Bảo Mật', thumb:'Nét Like', idea:'Nét Ý Tưởng', book:'Nét Mọt Sách', support:'Nét Hỗ Trợ' };

  const svgImg = svg => { const i = new Image(); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); return i; };
  const shade = (hex, k) => {               // làm tối màu (k<1) hoặc sáng (k>1)
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c * k)));
    return '#' + [f(n >> 16), f(n >> 8 & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
  };
  function giftSvg(c, mark){
    const d = shade(c, .62), l = shade(c, 1.25);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <ellipse cx="32" cy="60" rx="22" ry="4" fill="rgba(0,0,0,.25)"/>
      <rect x="8" y="26" width="48" height="32" rx="6" fill="${c}" stroke="${d}" stroke-width="3"/>
      <rect x="4" y="18" width="56" height="14" rx="5" fill="${l}" stroke="${d}" stroke-width="3"/>
      <rect x="28" y="18" width="8" height="40" fill="#ffe27a"/>
      <path d="M32 18C20 2 6 12 20 18ZM32 18C44 2 58 12 44 18Z" fill="#ffe27a" stroke="${d}" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="32" cy="44" r="9" fill="#fff"/>
      <text x="32" y="49.5" text-anchor="middle" font-size="14" font-weight="900" fill="${d}" font-family="Be Vietnam Pro,Arial,sans-serif">${mark}</text>
    </svg>`;
  }
  const img = {};
  ['domain', 'hosting', 'vps', 'ssl', 'email'].forEach(s => { img['gift_' + s] = svgImg(giftSvg(SVC_COLORS[s], '?')); });
  img.gift_super = svgImg(giftSvg('#ffcf3a', '%'));
  img.bug = svgImg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <g stroke="#7a0707" stroke-width="4" stroke-linecap="round"><path d="M32 4v11M32 49v11M4 32h11M49 32h11M12 12l8 8M52 12l-8 8M12 52l8-8M52 52l-8-8"/></g>
      <circle cx="32" cy="32" r="18" fill="#cc0e0e" stroke="#7a0707" stroke-width="3"/>
      <ellipse cx="25" cy="29" rx="4.5" ry="5.5" fill="#fff"/><ellipse cx="39" cy="29" rx="4.5" ry="5.5" fill="#fff"/>
      <circle cx="26" cy="30" r="2.2" fill="#111"/><circle cx="38" cy="30" r="2.2" fill="#111"/>
      <path d="M19 21l10 4M45 21l-10 4" stroke="#7a0707" stroke-width="3" stroke-linecap="round"/>
      <path d="M24 42l4-3 4 3 4-3 4 3" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="32" y="63" text-anchor="middle" font-size="9" font-weight="900" fill="#7a0707" font-family="Arial,sans-serif">DDoS</text></svg>`);
  img.shield = svgImg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <ellipse cx="32" cy="61" rx="18" ry="3" fill="rgba(0,0,0,.25)"/>
      <path d="M32 4L56 12V32C56 46 46 56 32 61C18 56 8 46 8 32V12Z" fill="#0582D4" stroke="#024799" stroke-width="3" stroke-linejoin="round"/>
      <rect x="23" y="30" width="18" height="15" rx="3" fill="#fff"/>
      <path d="M27 30v-5a5 5 0 0 1 10 0v5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="32" cy="37.5" r="2.4" fill="#024799"/></svg>`);
  img.plant = svgImg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 200">
      <path d="M38 130h74l-9 62H47z" fill="#b25a34" stroke="#6e3418" stroke-width="3" stroke-linejoin="round"/>
      <rect x="30" y="122" width="90" height="16" rx="5" fill="#cf7046" stroke="#6e3418" stroke-width="3"/>
      <g stroke="#245c2a" stroke-width="2.5" stroke-linejoin="round">
        <path d="M75 126C40 120 20 90 22 50c30 6 50 36 53 76z" fill="#3f9a45"/>
        <path d="M75 126c35-6 55-36 53-76-30 6-50 36-53 76z" fill="#58b55c"/>
        <path d="M75 126C65 90 52 60 20 42c22-4 50 10 55 84z" fill="#2f8a3a"/>
        <path d="M75 126c10-36 23-66 55-84-22-4-50 10-55 84z" fill="#6fc46f"/>
        <path d="M75 126C72 80 72 40 75 8c4 32 4 72 0 118z" fill="#45a84d"/>
      </g></svg>`);
  img.lamp = svgImg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 150">
      <line x1="40" y1="0" x2="40" y2="58" stroke="#2d170a" stroke-width="3"/>
      <path d="M12 96L26 58h28l14 38z" fill="#b22a2a" stroke="#6e1212" stroke-width="2.5" stroke-linejoin="round"/>
      <rect x="10" y="94" width="60" height="8" rx="3" fill="#f0c04a" stroke="#a86a00" stroke-width="2"/>
      <circle cx="40" cy="102" r="7" fill="#fff6c9" stroke="#f0c04a" stroke-width="2"/></svg>`);
  img.banner = svgImg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 130">
      <path d="M40 0v34M280 0v34" stroke="#2d170a" stroke-width="3"/>
      <path d="M14 34h292l-12 12 12 12-12 12 12 12-12 12 12 12-12 12H14l12-12-12-12 12-12-12-12 12-12-12-12 12-12z" fill="#cc0e0e"/>
      <rect x="26" y="40" width="268" height="78" rx="10" fill="#024799" stroke="#ffcf3a" stroke-width="3"/>
      <text x="160" y="82" text-anchor="middle" font-family="Be Vietnam Pro,Arial,sans-serif" font-weight="900" font-size="31" fill="#fff" letter-spacing="2">BLACK FRIDAY</text>
      <text x="160" y="104" text-anchor="middle" font-family="Be Vietnam Pro,Arial,sans-serif" font-weight="800" font-size="13.5" fill="#ffcf3a" letter-spacing="3">SĂN DEAL CÙNG NÉT · iNET</text></svg>`);

  const mascot = {};
  AVATARS.forEach(a => { const i = new Image(); i.src = `assets/mascot/net-${a}.webp`; mascot[a] = i; });
  const logo = new Image(); logo.src = 'assets/inet-logo.svg'; img.logo = logo;

  const all = [...Object.values(img), ...Object.values(mascot)];
  const ready = Promise.all(all.map(i => i.complete && i.naturalWidth ? null : new Promise(r => { i.onload = i.onerror = r; })));
  return { SVC_COLORS, AVATARS, AVATAR_NAMES, img, mascot, ready, shade };
})();
