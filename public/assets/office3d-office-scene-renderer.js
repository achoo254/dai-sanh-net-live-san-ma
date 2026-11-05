/* =============================================================================
 * iNET Tech Office 3D — dựng văn phòng + vẽ thế giới bằng Three.js
 * Toạ độ: bản đồ (x, y) của WorldRules → Three (x, z); chiều cao là y (đơn vị ≈ cm).
 * Văn phòng 4000 × 2600 (sảnh 150 người): lễ tân + tường logo neon, phòng máy chủ kính, 8 cụm bàn,
 * 2 phòng họp kính có TV, pantry + lounge (sofa, bean bag, kệ sách, cây nước), 4 quầy dịch vụ có thảm
 * khu + biển tồn kho, atrium bục Siêu Deal + màn LED, cột tròn, poster dịch vụ trên tường, bảng trắng,
 * đèn thả trần, standee bé Nét.
 * Đồ hoạ: tone mapping ACES, bóng đổ thật (máy tính; điện thoại dùng bóng tròn), sàn gỗ bóng nhẹ.
 * Giao diện giống bản 2D: create(canvas) → { resize, render(S,t), toWorld, toScreen, drawMinimap, zoomBy }
 * ============================================================================= */
import * as THREE from '../vendor/three.module.min.js';
import { Avatar, textSprite, mergeColored, SHARED_MAT } from './office3d-human-avatar-factory.js';

const WR = window.WorldRules, SP = window.WorldSprites;
const { W, H, WALL_Y, MARGIN, BOOTHS, STAGE, SPAWN, OBSTACLES, CLUE_SPOTS, ZONE_NAMES } = WR;
const FONT = '"Be Vietnam Pro", system-ui, Arial, sans-serif';
const BOOTH_POSE = { domain:'book', hosting:'wave', vps:'thumb', ssl:'shield', email:'support' };
const NEAR_N = 30;                 // số nhân vật gần nhất được vẽ đầy đủ
const DARK = '#2b3340', FRAME = '#1f2630';

/* ---------- Tiện ích ---------- */
function canvasTex(w, h, draw, repeat){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
function boxAt(parent, mat, x, z, w, d, h, y0 = 0){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y0 + h / 2, z); parent.add(m); return m;
}
function cylAt(parent, mat, x, z, r, h, y0 = 0, seg = 16, rTop){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop == null ? r : rTop, r, h, seg), mat);
  m.position.set(x, y0 + h / 2, z); parent.add(m); return m;
}
function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function signPlane(parent, text, { w = 240, h = 46, bg = '#024799', fg = '#fff', size = 40, x, y, z, rotY = 0, sub } = {}){
  const tex = canvasTex(Math.round(w * 2.4), Math.round(h * 2.4), (g, cw, ch) => {
    g.fillStyle = bg; roundRect(g, 0, 0, cw, ch, 16); g.fill();
    g.fillStyle = fg; g.font = `900 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, cw / 2, sub ? ch * .38 : ch / 2 + 2);
    if (sub){ g.font = `700 ${size * .55}px ${FONT}`; g.globalAlpha = .85; g.fillText(sub, cw / 2, ch * .76); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent:true }));
  m.position.set(x, y, z); m.rotation.y = rotY; parent.add(m); return m;
}
/* Poster quảng cáo dịch vụ (vẽ bằng chữ + hình khối, không bịa giá) */
function posterTex(title, line, color){
  return canvasTex(360, 480, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, color); gr.addColorStop(1, '#0d1b2a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h * .62);
    for (let i = 0; i < 14; i++){ g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(40 + i * 60 % w, 40 + (i * 97) % (h * .5), 18 + i % 4 * 10, 0, 7); g.fill(); }
    g.fillStyle = '#ffffff'; g.font = `900 46px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const words = title.split(' '); let y = 130; let cur = '';
    for (const wd of words){ const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > w - 60){ g.fillText(cur, 30, y); y += 54; cur = wd; } else cur = t; }
    g.fillText(cur, 30, y);
    g.fillStyle = '#ffcf3a'; g.font = `800 26px ${FONT}`; g.fillText('BLACK FRIDAY 2026', 30, h * .62 - 24);
    g.fillStyle = '#0F1E2D'; g.font = `700 24px ${FONT}`; g.fillText(line, 30, h * .62 + 50);
    g.fillStyle = color; g.font = `900 28px ${FONT}`; g.fillText('iNET.vn', 30, h - 40);
    g.fillStyle = '#024799'; g.fillRect(w - 110, h - 70, 80, 36); g.fillStyle = '#fff'; g.font = `800 18px ${FONT}`; g.textAlign = 'center'; g.fillText('SĂN MÃ', w - 70, h - 46);
  });
}

/* ---------- Dựng văn phòng ---------- */
function buildOffice(scene, shadows){
  const office = new THREE.Group(); scene.add(office);
  const api = { leds: [], signs: {}, lamps: [] };

  // Sàn gỗ (ván dài, vân gỗ, bóng nhẹ)
  const floorTex = canvasTex(1024, 1024, (g, w, h) => {
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let y = 0; y < h; y += 42){
      let x = -rnd() * 300;
      while (x < w){
        const bw = 220 + rnd() * 220, k = 0.9 + rnd() * .16;
        g.fillStyle = `rgb(${Math.round(214 * k)},${Math.round(180 * k)},${Math.round(138 * k)})`; g.fillRect(x, y, bw, 42);
        g.strokeStyle = 'rgba(120,75,35,.16)'; g.lineWidth = 1.2;
        for (let v = 0; v < 4; v++){ const yy = y + 6 + rnd() * 30; g.beginPath(); g.moveTo(x + 8, yy); g.bezierCurveTo(x + bw * .3, yy - 5, x + bw * .6, yy + 5, x + bw - 8, yy); g.stroke(); }
        g.fillStyle = 'rgba(90,55,25,.28)'; g.fillRect(x + bw - 2, y, 2, 42);
        x += bw;
      }
      g.fillStyle = 'rgba(90,55,25,.3)'; g.fillRect(0, y + 40, w, 2);
      g.fillStyle = 'rgba(255,245,225,.15)'; g.fillRect(0, y, w, 1.5);
    }
  }, [W / 900, H / 900]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshPhongMaterial({ map: floorTex, shininess: 22, specular: new THREE.Color('#3a3a3a') }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = shadows; office.add(floor);

  // Sảnh ngoài (sàn đá) + mặt tiền kính có cửa vào
  const outTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#c9d1db'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); }, [40, 40]);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(W + 8000, H + 8000), new THREE.MeshLambertMaterial({ map: outTex }));
  outside.rotation.x = -Math.PI / 2; outside.position.set(W / 2, -1, H / 2); office.add(outside);
  const glassMat = new THREE.MeshLambertMaterial({ color:'#bfe3ff', transparent:true, opacity:.24, depthWrite:false });
  const doorW = 400;
  boxAt(office, glassMat, (SPAWN.x - doorW / 2) / 2, H, SPAWN.x - doorW / 2, 6, 150);
  boxAt(office, glassMat, (W + SPAWN.x + doorW / 2) / 2, H, W - SPAWN.x - doorW / 2, 6, 150);
  boxAt(office, lam(FRAME), W / 2, H, W, 10, 8, 148);
  for (let x = 0; x <= W; x += 400) boxAt(office, lam(FRAME), x, H, 8, 10, 150);
  [SPAWN.x - doorW / 2, SPAWN.x + doorW / 2].forEach(x => boxAt(office, lam(FRAME), x, H, 14, 14, 240));
  signPlane(office, 'CỬA VÀO · iNET TECH OFFICE', { w: doorW - 20, h: 46, x: SPAWN.x, y: 214, z: H + 7, rotY: Math.PI });

  // Thảm xám dưới khu bàn làm việc, thảm xanh iNET từ cửa vào tới atrium, thảm khu dịch vụ
  const rugMat = lam('#8e98a6');
  OBSTACLES.filter(o => o.kind === 'desks').forEach(o => {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(o.w + 160, o.h + 160), rugMat);
    r.rotation.x = -Math.PI / 2; r.position.set(o.x + o.w / 2, 0.8, o.y + o.h / 2); r.receiveShadow = shadows; office.add(r);
  });
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(240, SPAWN.y - STAGE.y + 60), lam('#024799'));
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(SPAWN.x, 1, (SPAWN.y + STAGE.y) / 2 + 30); carpet.receiveShadow = shadows; office.add(carpet);
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.PlaneGeometry(8, SPAWN.y - STAGE.y + 60), lam('#ffcf3a')); e.rotation.x = -Math.PI / 2; e.position.set(SPAWN.x + s * 116, 1.2, carpet.position.z); office.add(e); });
  for (const id in BOOTHS){
    const b = BOOTHS[id], c = new THREE.Color(SP.SVC_COLORS[id]);
    const zoneTex = canvasTex(512, 512, (g, w) => {
      g.fillStyle = '#' + c.clone().lerp(new THREE.Color('#ffffff'), .72).getHexString(); g.fillRect(0, 0, w, w);
      g.strokeStyle = '#' + c.getHexString(); g.lineWidth = 14; g.strokeRect(14, 14, w - 28, w - 28);
      g.fillStyle = '#' + c.getHexString(); g.font = `900 54px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalAlpha = .55; g.fillText((ZONE_NAMES[id] || id).toUpperCase().split(' · ')[0], w / 2, w / 2);
    });
    const z = new THREE.Mesh(new THREE.PlaneGeometry(760, 560), new THREE.MeshLambertMaterial({ map: zoneTex }));
    z.rotation.x = -Math.PI / 2; z.position.set(b.x, 0.6, b.y + 170); z.receiveShadow = shadows; office.add(z);
  }

  // Tường sau: cửa kính nhìn ra thành phố, poster dịch vụ giữa các cửa; tường hai bên thấp có bảng trắng
  const wallMat = lam('#eef2f7'), trimMat = lam('#cfd8e3');
  boxAt(office, wallMat, W / 2, WALL_Y / 2 - 35, W, WALL_Y - 70, 360);
  const skyTex = canvasTex(2048, 300, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8fc8ff'); gr.addColorStop(1, '#e8f4ff');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let x = 0; x < w; x += 26 + rnd() * 40){
      const bh = 70 + rnd() * 190, bw = 30 + rnd() * 60;
      g.fillStyle = `rgba(${60 + rnd() * 50},${95 + rnd() * 50},${140 + rnd() * 50},.9)`; g.fillRect(x, h - bh, bw, bh);
      g.fillStyle = 'rgba(255,255,255,.5)';
      for (let yy = h - bh + 8; yy < h - 6; yy += 14) for (let xx = x + 5; xx < x + bw - 5; xx += 10) if (rnd() < .6) g.fillRect(xx, yy, 4, 6);
    }
    g.fillStyle = 'rgba(255,255,255,.35)'; [[300, 60, 90], [900, 40, 120], [1500, 70, 80]].forEach(([cx, cy, r]) => { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.arc(cx + r, cy + 10, r * .7, 0, 7); g.fill(); });
  });
  const glassWall = new THREE.Mesh(new THREE.PlaneGeometry(W - 160, 250), new THREE.MeshBasicMaterial({ map: skyTex }));
  glassWall.position.set(W / 2, 185, WALL_Y - 69); office.add(glassWall);
  for (let x = 80; x <= W - 80; x += 160) boxAt(office, trimMat, x, WALL_Y - 66, 10, 8, 260, 60);
  boxAt(office, trimMat, W / 2, WALL_Y - 66, W - 160, 8, 10, 310);
  boxAt(office, trimMat, W / 2, WALL_Y - 66, W - 160, 8, 10, 56);
  const posters = [['Tên miền .VN', 'Khẳng định thương hiệu Việt', SP.SVC_COLORS.domain], ['Hosting OnePanel', 'Nhanh · Ổn định · Dễ dùng', SP.SVC_COLORS.hosting],
    ['OneShield', 'Lá chắn DNS cho website', SP.SVC_COLORS.ssl], ['Cloud Server', 'Máy chủ ảo hiệu năng cao', SP.SVC_COLORS.vps], ['Email doanh nghiệp', 'Chuyên nghiệp theo tên miền', SP.SVC_COLORS.email]];
  [420, 1180, 2000, 2820, 3580].forEach((x, i) => {
    const [t, l, c] = posters[i];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(150, 200), new THREE.MeshBasicMaterial({ map: posterTex(t, l, c) }));
    m.position.set(x, 180, WALL_Y - 64); office.add(m);
    boxAt(office, lam(FRAME), x, WALL_Y - 66, 160, 3, 210, 75);
  });
  boxAt(office, wallMat, MARGIN / 2 - 10, H / 2, MARGIN - 20, H, 130);
  boxAt(office, wallMat, W - MARGIN / 2 + 10, H / 2, MARGIN - 20, H, 130);
  // Bảng trắng trên tường hai bên
  const wbTex = canvasTex(400, 240, (g, w, h) => {
    g.fillStyle = '#fbfcfe'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#0582D4'; g.lineWidth = 4; g.beginPath(); g.moveTo(30, 60); g.lineTo(140, 60); g.moveTo(30, 100); g.lineTo(220, 100); g.moveTo(30, 140); g.lineTo(180, 140); g.stroke();
    g.strokeStyle = '#cc0e0e'; g.beginPath(); g.moveTo(260, 70); g.lineTo(360, 70); g.lineTo(310, 170); g.closePath(); g.stroke();
    g.strokeStyle = '#0E9F6E'; g.beginPath(); g.moveTo(40, 190); g.lineTo(100, 170); g.lineTo(160, 200); g.lineTo(240, 160); g.stroke();
  });
  [[MARGIN - 18, 900, Math.PI / 2], [MARGIN - 18, 1700, Math.PI / 2], [W - MARGIN + 18, 900, -Math.PI / 2], [W - MARGIN + 18, 1700, -Math.PI / 2]].forEach(([x, z, r]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(220, 130), new THREE.MeshBasicMaterial({ map: wbTex })); m.position.set(x, 90, z); m.rotation.y = r; office.add(m);
  });

  // Logo iNET + neon BLACK FRIDAY
  const logoTex = canvasTex(1024, 256, () => {});
  const drawLogo = () => {
    const c = logoTex.image, g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    if (SP.img.logo.naturalWidth){ const lh = 150, lw = lh * SP.img.logo.naturalWidth / SP.img.logo.naturalHeight; g.drawImage(SP.img.logo, (c.width - lw) / 2, 40, lw, lh); }
    g.fillStyle = '#024799'; g.font = `800 34px ${FONT}`; g.textAlign = 'center'; g.fillText('TECH OFFICE · BLACK FRIDAY 2026', c.width / 2, 228);
    logoTex.needsUpdate = true;
  };
  SP.ready.then(drawLogo);

  OBSTACLES.forEach(o => {
    const cx = o.x + o.w / 2, cz = o.y + o.h / 2;
    switch (o.kind){
      case 'logowall': {
        boxAt(office, lam('#16213a'), cx, cz, o.w, o.h, 250);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(o.w - 24, (o.w - 24) / 4), new THREE.MeshBasicMaterial({ map: logoTex }));
        panel.position.set(cx, 150, o.y + o.h + 1); office.add(panel);
        signPlane(office, 'BLACK FRIDAY', { w: o.w - 40, h: 44, bg:'#cc0e0e', fg:'#fff', size: 44, x: cx, y: 230, z: o.y + o.h + 1.5 });
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(o.w + 16, 6), new THREE.MeshBasicMaterial({ color:'#5fb3ff' })); glow.position.set(cx, 254, o.y + o.h + 2); office.add(glow);
        break; }
      case 'reception': {
        boxAt(office, lam('#f7f9fc'), cx, cz, o.w, o.h, 104);
        boxAt(office, lam('#024799'), cx, o.y + o.h + 1, o.w - 10, 2, 18, 70);
        boxAt(office, lam('#c9a46c'), cx, cz, o.w + 12, o.h + 12, 6, 104);
        boxAt(office, lam(DARK), cx - 50, cz - 10, 46, 6, 30, 110); boxAt(office, lam(DARK), cx + 60, cz - 8, 30, 20, 4, 110);
        api.lamps.push([cx - 90, cz], [cx + 90, cz]);
        break; }
      case 'serverroom': buildServerRoom(office, o, api); break;
      case 'desks': buildDeskCluster(office, o, shadows); break;
      case 'meeting': buildMeetingRoom(office, o); break;
      case 'pantry': {
        boxAt(office, lam('#f2f4f7'), cx, cz, o.w, o.h, 92);
        boxAt(office, lam(DARK), cx, cz, o.w + 6, o.h + 6, 5, 92);
        boxAt(office, lam('#1d2b3f'), o.x + 50, cz, 40, 36, 48, 97);                    // máy pha cà phê
        boxAt(office, lam('#dfe6ee'), o.x + o.w - 36, cz, 56, o.h, 196);                 // tủ lạnh
        boxAt(office, lam('#9aa5b4'), o.x + o.w - 36, cz - o.h / 2 - 1, 4, 1, 60, 110);
        [0, 1, 2, 3].forEach(i => cylAt(office, lam(['#ffcf3a', '#0582D4', '#0E9F6E', '#f4f7fa'][i]), o.x + 130 + i * 28, cz, 7, 14, 97, 10));
        boxAt(office, lam('#e8c48c'), o.x + 260, cz, 90, 40, 6, 92);                     // khay bánh
        signPlane(office, 'PANTRY', { w: 160, h: 40, bg:'#0E9F6E', x: cx, y: 180, z: o.y + o.h + 4, size: 36 });
        break; }
      case 'sofa': {
        const m = lam('#4e5f86');
        boxAt(office, m, cx, cz + o.h / 2 - 12, o.w, 24, 72); boxAt(office, m, cx, cz, o.w, o.h, 40);
        [-1, 1].forEach(s => boxAt(office, m, cx + s * (o.w / 2 - 12), cz, 24, o.h, 56));
        boxAt(office, lam('#e8c48c'), cx, cz + o.h + 70, 130, 70, 38);                   // bàn trà
        [-1, 1].forEach(s => boxAt(office, lam('#ffcf3a'), cx + s * 80, cz - 4, 40, 20, 32, 40));
        boxAt(office, lam('#f7f9fc'), cx - 260, cz + 60, 60, 200, 180);                   // kệ sách
        [0, 1, 2].forEach(i => boxAt(office, lam(['#0582D4', '#cc0e0e', '#0E9F6E'][i]), cx - 260, cz + 60, 50, 170, 10, 40 + i * 50));
        break; }
      case 'beanbag': {
        const bb = new THREE.Mesh(new THREE.SphereGeometry(40, 14, 10), lam(o.x < 1300 ? '#7C3AED' : '#DB2777')); bb.scale.set(1, .6, 1); bb.position.set(cx, 22, cz); office.add(bb);
        break; }
      case 'water': {
        boxAt(office, lam('#dfe6ee'), cx, cz, 44, 40, 110);
        const jug = new THREE.Mesh(new THREE.CylinderGeometry(16, 18, 50, 14), new THREE.MeshLambertMaterial({ color:'#9fd0ff', transparent:true, opacity:.6 })); jug.position.set(cx, 135, cz); office.add(jug);
        break; }
      case 'pillar': {
        cylAt(office, lam('#dfe6ee'), cx, cz, 22, 330, 0, 20); cylAt(office, lam(FRAME), cx, cz, 27, 8, 0, 20);
        break; }
      case 'plant': buildPlant(office, cx, cz, o.w > 70 ? 1.25 : 1); break;
      case 'counter': buildBoothCounter(office, o, api); break;
    }
  });
  buildAtrium(office, api);
  // Đèn thả trần (dây + chao + bóng ấm) trên quầy, lễ tân, pantry
  for (const id in BOOTHS) if (id !== 'vps') api.lamps.push([BOOTHS[id].x - 90, BOOTHS[id].y + 20], [BOOTHS[id].x + 90, BOOTHS[id].y + 20]);
  const bulbMat = new THREE.MeshBasicMaterial({ color:'#fff1c2' });
  api.lamps.forEach(([x, z]) => {
    boxAt(office, lam(FRAME), x, z, 2, 2, 120, 280);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(28, 30, 20, 1, true), new THREE.MeshLambertMaterial({ color:'#1d2b3f', side:THREE.DoubleSide })); shade.position.set(x, 265, z); office.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), bulbMat); bulb.position.set(x, 256, z); office.add(bulb);
  });
  mergeStatic(office, shadows);
  buildStandees(office);
  return api;
}

function buildPlant(parent, x, z, k = 1){
  cylAt(parent, lam('#e9e3d8'), x, z, 18 * k, 36 * k, 0, 12, 24 * k);
  const leafMat = lam('#3f9a45'), leafMat2 = lam('#5fb85f');
  for (let i = 0; i < 7; i++){
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry((16 + i * 2.5) * k, 0), i % 2 ? leafMat : leafMat2);
    l.position.set(x + Math.cos(i * 1.9) * 14 * k, (48 + i * 15) * k, z + Math.sin(i * 1.7) * 14 * k); parent.add(l);
  }
}

function buildServerRoom(parent, o, api){
  const cx = o.x + o.w / 2;
  boxAt(parent, lam('#c3ccd8'), cx, o.y + o.h / 2, o.w, o.h, 4);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(o.w - 40, o.h - 40), new THREE.MeshBasicMaterial({ color:'#0b3a66' })); glow.rotation.x = -Math.PI / 2; glow.position.set(cx, 4.5, o.y + o.h / 2); parent.add(glow);
  const glass = new THREE.MeshLambertMaterial({ color:'#bfe3ff', transparent:true, opacity:.26, depthWrite:false });
  boxAt(parent, glass, cx, o.y + o.h - 2, o.w, 4, 260);
  [o.x + 2, o.x + o.w - 2].forEach(x => boxAt(parent, glass, x, o.y + o.h / 2, 4, o.h, 260));
  boxAt(parent, lam(FRAME), cx, o.y + o.h, o.w + 8, 8, 8, 256);
  for (let x = o.x; x <= o.x + o.w; x += o.w / 8) boxAt(parent, lam(FRAME), x, o.y + o.h, 6, 8, 260);
  // Cửa kính + biển
  boxAt(parent, lam(FRAME), cx, o.y + o.h, 90, 10, 200);
  signPlane(parent, 'PHÒNG MÁY CHỦ · CLOUD', { w: 300, h: 46, bg:'#0d1117', fg:'#5fb3ff', x: cx, y: 230, z: o.y + o.h + 3, sub:'Kết nối 10Gbps · 24/7' });
  // Tủ rack + đèn nháy
  const rackMat = lam('#1c2230'), rackGeo = new THREE.BoxGeometry(60, 210, 70), ledGeo = new THREE.BoxGeometry(6, 3, 2);
  const ledColors = ['#34d399', '#5fb3ff', '#fbbf24'];
  [o.y + 60, o.y + 180].forEach(z => {
    for (let x = o.x + 70; x < o.x + o.w - 40; x += 78){
      const r = new THREE.Mesh(rackGeo, rackMat); r.position.set(x, 105, z); parent.add(r);
      const inst = new THREE.InstancedMesh(ledGeo, new THREE.MeshBasicMaterial({ color:'#ffffff' }), 21), m4 = new THREE.Matrix4();
      for (let i = 0; i < 21; i++){ m4.makeTranslation(x - 20 + (i % 3) * 12, 30 + Math.floor(i / 3) * 26, z + 36); inst.setMatrixAt(i, m4); inst.setColorAt(i, new THREE.Color(ledColors[i % 3])); }
      inst.instanceColor.needsUpdate = true; parent.add(inst); api.leds.push(inst);
    }
  });
}

function buildDeskCluster(parent, o, shadows){
  const top = lam('#f3e6d2'), leg = lam('#9aa5b4'), chairMat = lam('#2b3442'), mon = lam('#1b1f27'), part = lam('#c5cfdb');
  const scrTex = canvasTex(128, 80, (g, w, h) => {
    g.fillStyle = '#0d1b2a'; g.fillRect(0, 0, w, h);
    const cols = ['#5fb3ff', '#34d399', '#fbbf24', '#ffffff'];
    for (let y = 8; y < h - 4; y += 9){ let x = 6 + Math.random() * 14; while (x < w - 20){ const lw = 8 + Math.random() * 28; g.fillStyle = cols[Math.floor(Math.random() * 4)]; g.fillRect(x, y, lw, 4); x += lw + 6; } }
  });
  const scrMat = new THREE.MeshBasicMaterial({ map: scrTex });
  const dw = o.w / 2, dd = o.h / 2;
  boxAt(parent, part, o.x + o.w / 2, o.y + o.h / 2, o.w + 4, 4, 112, 72);          // vách ngăn giữa
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++){
    const x = o.x + dw / 2 + i * dw, z = o.y + dd / 2 + j * dd, face = j === 0 ? -1 : 1;
    boxAt(parent, top, x, z, dw - 8, dd - 6, 4, 72);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => boxAt(parent, leg, x + a * (dw / 2 - 12), z + b * (dd / 2 - 10), 5, 5, 72));
    boxAt(parent, mon, x, z - face * 12, 60, 4, 38, 82);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(54, 32), scrMat); s.position.set(x, 101, z - face * 12 + face * 2.2); if (face < 0) s.rotation.y = Math.PI; parent.add(s);
    boxAt(parent, mon, x, z - face * 12, 6, 6, 12, 76);
    boxAt(parent, lam('#dfe6ee'), x, z + face * 14, 36, 12, 2, 76);                   // bàn phím
    if ((i + j) % 2) boxAt(parent, lam('#ffffff'), x + dw / 2 - 30, z, 14, 10, 8, 76);   // cốc
    else { cylAt(parent, lam('#e9e3d8'), x - dw / 2 + 28, z, 7, 12, 76, 10); const l = new THREE.Mesh(new THREE.IcosahedronGeometry(10, 0), lam('#5fb85f')); l.position.set(x - dw / 2 + 28, 96, z); parent.add(l); }
    const ch = new THREE.Group(); ch.position.set(x, 0, z + face * (dd / 2 + 28));
    boxAt(ch, chairMat, 0, 0, 42, 42, 8, 44); boxAt(ch, chairMat, 0, face * 18, 42, 6, 48, 50); boxAt(ch, leg, 0, 0, 6, 6, 40);
    cylAt(ch, leg, 0, 0, 22, 3, 0, 10); parent.add(ch);
  }
}

function buildMeetingRoom(parent, o){
  const cx = o.x + o.w / 2, cz = o.y + o.h / 2;
  const glass = new THREE.MeshLambertMaterial({ color:'#cfe8ff', transparent:true, opacity:.28, depthWrite:false });
  boxAt(parent, glass, cx, o.y, o.w, 4, 230); boxAt(parent, glass, o.x, cz, 4, o.h, 230);
  boxAt(parent, glass, o.x + o.w, cz, 4, o.h, 230); boxAt(parent, glass, cx, o.y + o.h, o.w, 4, 230);
  boxAt(parent, lam(FRAME), cx, cz, o.w + 6, o.h + 6, 6, 228);
  [o.x, o.x + o.w].forEach(x => [o.y, o.y + o.h].forEach(z => boxAt(parent, lam(FRAME), x, z, 10, 10, 232)));
  boxAt(parent, lam('#ffffff'), cx, cz, o.w - 160, o.h - 130, 6, 74);
  boxAt(parent, lam('#9aa5b4'), cx, cz, 34, 34, 74);
  for (let i = 0; i < 5; i++){ boxAt(parent, lam('#0582D4'), cx - 160 + i * 80, cz - 78, 42, 42, 46); boxAt(parent, lam('#0582D4'), cx - 160 + i * 80, cz + 78, 42, 42, 46); }
  // TV trên tường trong + biển tên 2 mặt
  boxAt(parent, lam('#111'), cx, o.y + 8, 180, 6, 100, 100);
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(170, 92), new THREE.MeshBasicMaterial({ map: canvasTex(340, 184, (g, w, h) => {
    g.fillStyle = '#0d1b2a'; g.fillRect(0, 0, w, h); g.fillStyle = '#5fb3ff'; g.font = `900 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BLACK FRIDAY', w / 2, h / 2 - 20);
    g.fillStyle = '#ffcf3a'; g.font = `800 22px ${FONT}`; g.fillText('Săn mã cùng iNET', w / 2, h / 2 + 24);
  }) })); tv.position.set(cx, 150, o.y + 12); parent.add(tv);
  signPlane(parent, o.name || 'Phòng họp', { w: 260, h: 40, x: cx, y: 200, z: o.y - 4, rotY: Math.PI, size: 34 });
  signPlane(parent, o.name || 'Phòng họp', { w: 260, h: 40, x: cx, y: 200, z: o.y + o.h + 4, size: 34 });
}

function buildBoothCounter(parent, o, api){
  const id = o.id, c = SP.SVC_COLORS[id], cx = o.x + o.w / 2, cz = o.y + o.h / 2;
  boxAt(parent, lam(c), cx, cz, o.w, o.h, 104);
  boxAt(parent, lam('#ffffff'), cx, cz, o.w + 12, o.h + 12, 6, 104);
  boxAt(parent, lam('#ffffff'), cx, o.y + o.h + 1, o.w - 20, 2, 26, 60);               // dải trắng mặt quầy
  boxAt(parent, lam(DARK), cx + 70, cz, 40, 24, 3, 110); boxAt(parent, lam(DARK), cx + 70, cz - 8, 38, 3, 26, 113);   // laptop
  const tex = canvasTex(512, 220, () => {});
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(240, 103), new THREE.MeshBasicMaterial({ map: tex, transparent:true }));
  sign.position.set(cx, 262, o.y - 6); parent.add(sign);
  boxAt(parent, lam('#9aa5b4'), cx, o.y - 8, 6, 6, 215);
  api.signs[id] = (stock) => {
    const g = tex.image.getContext('2d'), w = 512, h = 220;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; roundRect(g, 4, 4, w - 8, h - 8, 28); g.fill();
    g.lineWidth = 8; g.strokeStyle = c; g.stroke();
    g.fillStyle = c; g.font = `900 50px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ZONE_NAMES[id] || id, w / 2, 74);
    const v = stock && stock[id] ? stock[id][0] : null;
    g.fillStyle = v === 0 ? '#cc0e0e' : '#0F1E2D'; g.font = `800 42px ${FONT}`;
    g.fillText(v == null ? '' : v > 0 ? `còn ${v} mã` : 'hết mã', w / 2, 152);
    tex.needsUpdate = true;
  };
  api.signs[id](null);
}

function buildAtrium(parent, api){
  // Bục Siêu Deal 2 tầng + viền đèn
  cylAt(parent, lam('#c9a46c'), STAGE.x, STAGE.y, STAGE.r + 14, 10, 0, 56);
  cylAt(parent, lam('#a86a00'), STAGE.x, STAGE.y, STAGE.r, 12, 10, 56);
  const topT = canvasTex(1024, 1024, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 40, w / 2, w / 2, w / 2); gr.addColorStop(0, '#fff6d0'); gr.addColorStop(1, '#ffcf3a');
    g.fillStyle = gr; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, 7); g.fill();
    g.strokeStyle = 'rgba(168,106,0,.5)'; g.lineWidth = 6; for (let r = 120; r < w / 2; r += 120){ g.beginPath(); g.arc(w / 2, w / 2, r, 0, 7); g.stroke(); }
    g.fillStyle = '#7a4a00'; g.font = `900 96px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SIÊU DEAL', w / 2, w / 2);
  });
  const top = new THREE.Mesh(new THREE.CircleGeometry(STAGE.r - 6, 56), new THREE.MeshLambertMaterial({ map: topT }));
  top.rotation.x = -Math.PI / 2; top.position.set(STAGE.x, 22.5, STAGE.y); parent.add(top);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(STAGE.r + 4, 4, 8, 64), new THREE.MeshBasicMaterial({ color:'#ffe27a' })); ring.rotation.x = Math.PI / 2; ring.position.set(STAGE.x, 22, STAGE.y); parent.add(ring);
  // Màn LED lớn đứng sau bục + 2 cột
  const led = canvasTex(1024, 320, () => {});
  const scr = new THREE.Mesh(new THREE.BoxGeometry(460, 144, 14), [lam('#111'), lam('#111'), lam('#111'), lam('#111'), new THREE.MeshBasicMaterial({ map: led }), new THREE.MeshBasicMaterial({ map: led })]);
  scr.position.set(STAGE.x, 240, STAGE.y - STAGE.r - 40); parent.add(scr);
  [-180, 180].forEach(dx => boxAt(parent, lam(FRAME), STAGE.x + dx, STAGE.y - STAGE.r - 40, 10, 10, 190));
  let lastTxt = '';
  api.led = (text, sub, live) => {
    const k = text + '|' + sub + '|' + live; if (k === lastTxt) return; lastTxt = k;
    const g = led.image.getContext('2d'), w = 1024, h = 320;
    g.fillStyle = '#05080d'; g.fillRect(0, 0, w, h);
    g.strokeStyle = live ? '#ff4d4d' : '#ffcf3a'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = live ? '#ff8a84' : '#ffe27a'; g.font = `800 48px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sub || 'iNET TECH OFFICE', w / 2, 78);
    g.fillStyle = '#ffffff'; g.font = `900 140px "JetBrains Mono", monospace`; g.fillText(text || '--:--', w / 2, 200);
    led.needsUpdate = true;
  };
}

function buildStandees(parent){
  const spots = [{ pose:'wave', x: 1760, z: 2300 }];
  for (const id in BOOTHS){ const b = BOOTHS[id]; spots.push({ pose: BOOTH_POSE[id], x: b.x + (id === 'vps' ? 320 : 170), z: b.y + 40 }); }
  SP.ready.then(() => spots.forEach(s => {
    const im = SP.mascot[s.pose]; if (!im || !im.naturalWidth) return;
    const h = 130, w = h * im.naturalWidth / im.naturalHeight;
    const tex = new THREE.Texture(im); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent:true, alphaTest:.05, side:THREE.DoubleSide }));
    m.position.set(s.x, h / 2 + 8, s.z); parent.add(m);
    cylAt(parent, lam('#024799'), s.x, s.z, 30, 8, 0, 20, 28);
  }));
}

/** Gộp mọi khối đặc, một màu, không trong suốt của văn phòng thành 1 lưới (hàng trăm lệnh vẽ → 1). */
function mergeStatic(office, shadows){
  office.updateMatrixWorld(true);
  const parts = [], victims = [];
  office.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const m = o.material;
    if (!m.isMeshLambertMaterial || m.map || m.transparent || m.side === THREE.DoubleSide) return;
    parts.push({ geo: o.geometry, color: '#' + m.color.getHexString(), m: o.matrixWorld.clone() });
    victims.push(o);
  });
  if (!parts.length) return;
  victims.forEach(o => o.parent.remove(o));
  const merged = new THREE.Mesh(mergeColored(parts), SHARED_MAT);
  merged.castShadow = shadows; merged.receiveShadow = shadows;
  office.add(merged);
}

/* ---------- Thực thể động ---------- */
const GIFT_GEO = { body: new THREE.BoxGeometry(46, 36, 46), lid: new THREE.BoxGeometry(52, 12, 52), ribbonA: new THREE.BoxGeometry(10, 50, 48), ribbonB: new THREE.BoxGeometry(48, 50, 10) };
const RING_GEO = new THREE.RingGeometry(40, 56, 40), SPARK_GEO = new THREE.OctahedronGeometry(5);
function makeGift(color, big){
  const g = new THREE.Group(), m = lam(color), rib = lam('#ffe27a');
  const b = new THREE.Mesh(GIFT_GEO.body, m); b.position.y = 18; g.add(b);
  const l = new THREE.Mesh(GIFT_GEO.lid, m); l.position.y = 42; g.add(l);
  const r1 = new THREE.Mesh(GIFT_GEO.ribbonA, rib); r1.position.y = 24; g.add(r1);
  const r2 = new THREE.Mesh(GIFT_GEO.ribbonB, rib); r2.position.y = 24; g.add(r2);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(10, 3.5, 6, 12), rib); bow.position.y = 52; bow.rotation.y = Math.PI / 4; g.add(bow);
  if (big) g.scale.setScalar(1.5);
  return g;
}
function makeGroundFx(color){
  // Vòng sáng trên sàn + 4 tia lấp lánh quanh hộp (không gắn vào hộp để không rơi theo)
  const g = new THREE.Group();
  const ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.55, depthWrite:false, side:THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 1.5; g.add(ring);
  const sm = new THREE.MeshBasicMaterial({ color:'#fff6c9' });
  for (let i = 0; i < 4; i++){ const s = new THREE.Mesh(SPARK_GEO, sm); s.userData.a = i * Math.PI / 2; g.add(s); }
  return g;
}
function makeShieldItem(){
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 8, 6), lam('#0582D4')); s.rotation.x = Math.PI / 2; s.position.y = 40; g.add(s);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(18, 16, 10), lam('#ffffff')); lock.position.set(0, 36, 4); g.add(lock);
  return g;
}
function makeVirus(){
  const g = new THREE.Group(), red = lam('#cc0e0e', { emissive:'#3a0000' });
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(22, 1), red));
  const spikeGeo = new THREE.ConeGeometry(5, 18, 6), dark = lam('#7a0707');
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[.7,.7,0],[-.7,.7,0],[.7,-.7,0],[-.7,-.7,0],[0,.7,.7],[0,-.7,-.7]];
  dirs.forEach(d => { const s = new THREE.Mesh(spikeGeo, dark); const v = new THREE.Vector3(...d).normalize(); s.position.copy(v.clone().multiplyScalar(26)); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v); g.add(s); });
  const eyeM = new THREE.MeshBasicMaterial({ color:'#ffffff' });
  [-8, 8].forEach(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), eyeM); e.position.set(x, 4, 19); g.add(e); });
  const lbl = textSprite('DDoS', { bg:'#cc0e0e', fg:'#fff', size:28, h:18 }); lbl.position.y = 46; g.add(lbl);
  return g;
}
function makeBeam(){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(60, 100, 600, 24, 1, true),
    new THREE.MeshBasicMaterial({ color:'#ffd65a', transparent:true, opacity:.26, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending }));
  m.position.y = 300; return m;
}
function makeClueMarker(found){
  const g = new THREE.Group();
  const env = new THREE.Mesh(new THREE.BoxGeometry(40, 28, 4), lam(found ? '#0E9F6E' : '#ffcf3a', { emissive: found ? '#04331f' : '#5a4300' }));
  env.position.y = 120; g.add(env);
  const ring = new THREE.Mesh(new THREE.RingGeometry(WR.CLUE_R - 12, WR.CLUE_R, 40), new THREE.MeshBasicMaterial({ color: found ? '#34d399' : '#ffcf3a', transparent:true, opacity:.55, depthWrite:false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 2; g.add(ring);
  const lbl = textSprite(found ? '✓ Đã đọc' : 'Manh mối', { bg: found ? '#0B7A55' : '#ffcf3a', fg: found ? '#fff' : '#3a2400', size:28, h:20 });
  lbl.position.y = 156; g.add(lbl);
  g.userData.env = env;
  return g;
}

/* ---------- Bộ vẽ chính ---------- */
export function create(canvas){
  const isMobile = matchMedia('(pointer:coarse)').matches;
  const shadows = !isMobile;                               // bóng đổ thật trên máy tính; điện thoại dùng bóng tròn
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(isMobile ? 1.5 : 2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  if (shadows){ renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d6e3f0');
  scene.fog = new THREE.Fog('#d6e3f0', 2600, 5200);
  scene.add(new THREE.HemisphereLight('#ffffff', '#a99a86', 2.2));
  const sun = new THREE.DirectionalLight('#fff3e0', 2.4); scene.add(sun); scene.add(sun.target);
  const sunOff = new THREE.Vector3(600, 1500, 900);
  if (shadows){
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -1300; c.right = 1300; c.top = 1100; c.bottom = -1100; c.near = 200; c.far = 4000;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 2;
  }
  const office = buildOffice(scene, shadows);

  const cam = new THREE.PerspectiveCamera(36, 1, 20, 12000);
  let zoom = isMobile ? 1.15 : 1.25, cw = 0, ch = 0;
  const camOff = new THREE.Vector3(0, 1050, 900);
  const camTarget = new THREE.Vector3(SPAWN.x, 0, SPAWN.y);

  const avatars = new Map(), drops = new Map(), bugs = new Map(), clueMarks = new Map();
  let lastStock = '';
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), v2 = new THREE.Vector2(), hit = new THREE.Vector3();

  function resize(){
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    renderer.setSize(cw, ch, false);
    cam.aspect = cw / Math.max(1, ch);
    cam.fov = cam.aspect < 0.8 ? 50 : 36;
    cam.updateProjectionMatrix();
  }
  resize();

  function syncAvatar(key, a, isMe){
    let av = avatars.get(key);
    if (!av || av.lookStr !== a.avatar || av.nick !== a.nick){
      if (av){ scene.remove(av.group); av.dispose(); }
      av = new Avatar(a.avatar, a.nick, isMe); av.lookStr = a.avatar; av.nick = a.nick;
      av.prevX = a.x; av.prevY = a.y;
      if (shadows){ av.group.traverse(o => { if (o.isMesh && !o.isSprite) o.castShadow = true; }); av.group.children[1].visible = false; }
      avatars.set(key, av); scene.add(av.group);
    }
    av.seen = true;
    return av;
  }

  function render(S, t){
    if (canvas.clientWidth !== cw || canvas.clientHeight !== ch) resize();
    const dt = Math.min(.1, (t - (render.last || t)) / 1000); render.last = t;
    avatars.forEach(a => { a.seen = false; });
    if (!render.nearAt || t - render.nearAt > 300){
      render.nearAt = t;
      const arr = [];
      for (const [id, o] of S.others) arr.push([id, (o.x - S.me.x) ** 2 + (o.y - S.me.y) ** 2]);
      arr.sort((a, b) => a[1] - b[1]);
      render.near = new Set(arr.slice(0, NEAR_N).map(x => x[0]));
    }
    const list = [['me', S.me, true]];
    for (const [id, o] of S.others) list.push([id, o, false]);
    for (const [key, a, isMe] of list){
      const av = syncAvatar(key, a, isMe);
      const dx = a.x - av.prevX, dy = a.y - av.prevY;
      av.group.position.set(a.x, 0, a.y);
      const near = isMe || render.near.has(key);
      if (av.near !== near){ av.near = near; av.name.visible = near; av.group.children[1].visible = near && !shadows; av.setFar(!near); }
      const moving = isMe ? a.moving : Math.hypot(dx, dy) > 0.6;
      if (near || moving){
        av.update(near ? dt : dt * 2, t, { moving, dirX: dx, dirY: dy, stunned: a.stunUntil > t, shielded: a.shieldUntil > t,
                           waving: near && a.emote && a.emoteUntil > t, cheering: a.cheerUntil > t });
      }
      av.setEmote(near && a.emote && a.emoteUntil > t ? a.emote : '');
      av.prevX = a.x; av.prevY = a.y;
    }
    avatars.forEach((av, key) => { if (!av.seen){ scene.remove(av.group); av.dispose(); avatars.delete(key); } });

    // Hộp quà / khiên / Siêu Deal
    const seenDrops = new Set();
    for (const d of S.drops.values()){
      seenDrops.add(d.id);
      let e = drops.get(d.id);
      if (!e){
        const color = d.kind === 'super' ? '#ffcf3a' : d.kind === 'shield' ? '#5fb3ff' : SP.SVC_COLORS[d.svc];
        const obj = d.kind === 'shield' ? makeShieldItem() : makeGift(color, d.kind === 'super');
        obj.position.set(d.x, 0, d.y); obj.userData.born = t; if (shadows) obj.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(obj);
        const fx = makeGroundFx(color); fx.position.set(d.x, 0, d.y); if (d.kind === 'super') fx.scale.setScalar(1.6); scene.add(fx);
        e = { obj, fx, left: -1, label: null }; drops.set(d.id, e);
      }
      const age = (t - e.obj.userData.born) / 1000;
      const fall = Math.max(0, 1 - age / .5);
      e.obj.position.y = fall * fall * 480 + Math.abs(Math.sin(t / 260 + d.x)) * 8;
      e.obj.rotation.y = t / 900 + d.x;
      const blink = d.until - t < 1500 && Math.floor(t / 120) % 2;
      e.obj.visible = !blink; e.fx.visible = !blink && !d.mine;
      e.fx.children[0].scale.setScalar(1 + Math.sin(t / 200 + d.x) * .08);
      for (let i = 1; i < 5; i++){ const s = e.fx.children[i], a = s.userData.a + t / 700; s.position.set(Math.cos(a) * 44, 36 + Math.sin(t / 180 + i) * 14, Math.sin(a) * 44); s.rotation.y = t / 300; }
      if (e.mine !== !!d.mine){
        e.mine = !!d.mine;
        e.obj.traverse(m => { if (m.material && !m.isSprite){ m.material.transparent = e.mine; m.material.opacity = e.mine ? .35 : 1; } });
      }
      if (d.kind !== 'shield' && e.left !== d.left && !d.mine){
        if (e.label){ e.obj.remove(e.label); e.label.material.map.dispose(); }
        e.label = textSprite(`còn ${d.left}`, { bg: d.left <= 2 ? '#cc0e0e' : '#024799', fg:'#fff', size:28, h:20 });
        e.label.position.y = d.kind === 'super' ? 70 : 78; e.obj.add(e.label); e.left = d.left;
      }
      if (d.mine && e.label) e.label.visible = false;
      if (d.kind === 'super' && !e.beam){ e.beam = makeBeam(); e.beam.position.set(d.x, 300, d.y); scene.add(e.beam); }
    }
    drops.forEach((e, id) => { if (!seenDrops.has(id)){ scene.remove(e.obj); scene.remove(e.fx); if (e.beam) scene.remove(e.beam); drops.delete(id); } });

    // Virus DDoS
    const seenBugs = new Set();
    for (const b of S.bugs.values()){
      seenBugs.add(b.id);
      let v = bugs.get(b.id);
      if (!v){ v = makeVirus(); scene.add(v); bugs.set(b.id, v); }
      v.position.set(b.x, 72 + Math.sin(t / 300 + b.id) * 12, b.y);
      v.rotation.y = t / 500; v.rotation.x = Math.sin(t / 700) * .3;
    }
    bugs.forEach((v, id) => { if (!seenBugs.has(id)){ scene.remove(v); bugs.delete(id); } });

    // Điểm manh mối của mật thư cấp 3 đang giải
    const wantClues = new Map();
    if (S.puzzle && S.puzzle.clues) S.puzzle.clues.forEach(c => wantClues.set(c.spot, !!c.text));
    clueMarks.forEach((m, spot) => { if (!wantClues.has(spot) || m.userData.found !== wantClues.get(spot)){ scene.remove(m); clueMarks.delete(spot); } });
    wantClues.forEach((found, spot) => {
      if (clueMarks.has(spot)) return;
      const sp = CLUE_SPOTS[spot]; if (!sp) return;
      const m = makeClueMarker(found); m.userData.found = found; m.position.set(sp.x, 0, sp.y); scene.add(m); clueMarks.set(spot, m);
    });
    clueMarks.forEach(m => { m.userData.env.position.y = 120 + Math.sin(t / 300) * 10; m.userData.env.rotation.y = t / 700; });

    // Màn LED, biển kho, đèn rack
    office.led(S.screenText, S.screenSub, S.live);
    const sk = JSON.stringify(S.stock || {});
    if (sk !== lastStock){ lastStock = sk; for (const id in office.signs) office.signs[id](S.stock); }
    if (office.leds.length && Math.floor(t / 250) !== render.ledTick){
      render.ledTick = Math.floor(t / 250);
      office.leds.forEach((inst, k) => { inst.visible = (render.ledTick + k) % 3 !== 0; });
    }

    // Camera bám nhân vật, giới hạn trong văn phòng; mặt trời (và vùng bóng) đi theo camera
    const portrait = cam.aspect < 0.8;
    const mx = (portrait ? 300 : 420) * zoom, mzTop = WALL_Y + (portrait ? 420 : 280) * zoom, mzBot = (portrait ? 640 : 360) * zoom;
    const tx = Math.min(W - mx, Math.max(mx, S.me.x)), tz = Math.min(H - mzBot, Math.max(mzTop, S.me.y));
    camTarget.lerp(new THREE.Vector3(tx, 0, tz), Math.min(1, dt * 6));
    cam.position.copy(camTarget).addScaledVector(camOff, zoom);
    cam.lookAt(camTarget.x, 60, camTarget.z - 40);
    sun.position.copy(camTarget).add(sunOff); sun.target.position.copy(camTarget);

    if (S.target){
      if (!render.tgt){ render.tgt = new THREE.Mesh(new THREE.RingGeometry(18, 26, 32), new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:.9, depthWrite:false })); render.tgt.rotation.x = -Math.PI / 2; scene.add(render.tgt); }
      render.tgt.visible = true; render.tgt.position.set(S.target.x, 2, S.target.y); render.tgt.scale.setScalar(1 + Math.sin(t / 120) * .15);
    } else if (render.tgt) render.tgt.visible = false;

    renderer.render(scene, cam);
  }

  function toWorld(clientX, clientY){
    const r = canvas.getBoundingClientRect();
    v2.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, cam);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.z } : { x: camTarget.x, y: camTarget.z };
  }
  function toScreen(wx, wy, h = 170){
    const p = new THREE.Vector3(wx, h, wy).project(cam);
    return { x: (p.x + 1) / 2 * cw, y: (1 - p.y) / 2 * ch };
  }
  function zoomBy(k){ zoom = Math.min(2.2, Math.max(0.7, zoom * k)); }

  /* Bản đồ nhỏ: sơ đồ mặt bằng văn phòng */
  function drawMinimap(mc, S){
    const g = mc.getContext('2d'), mw = mc.width, mh = mc.height, sx = mw / W, sy = mh / H;
    g.fillStyle = '#e8dcc8'; g.fillRect(0, 0, mw, mh);
    g.fillStyle = '#9fb3c8'; g.fillRect(0, 0, mw, WALL_Y * sy);
    g.fillStyle = '#024799'; g.fillRect((SPAWN.x - 120) * sx, STAGE.y * sy, 240 * sx, (H - STAGE.y) * sy);
    g.fillStyle = '#ffcf3a'; g.beginPath(); g.arc(STAGE.x * sx, STAGE.y * sy, STAGE.r * sx, 0, 7); g.fill();
    OBSTACLES.forEach(o => {
      g.fillStyle = o.kind === 'counter' ? SP.SVC_COLORS[o.id] : o.kind === 'serverroom' ? '#24303f' : o.kind === 'plant' ? '#3f9a45' : '#a7b2c0';
      g.fillRect(o.x * sx, o.y * sy, Math.max(2, o.w * sx), Math.max(2, o.h * sy));
    });
    if (S.puzzle && S.puzzle.clues) S.puzzle.clues.forEach(c => { const sp = CLUE_SPOTS[c.spot]; if (!sp) return; g.fillStyle = c.text ? '#0E9F6E' : '#ff9f1a'; g.beginPath(); g.arc(sp.x * sx, sp.y * sy, 5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); });
    g.fillStyle = 'rgba(15,30,45,.55)'; for (const a of S.others.values()) g.fillRect(a.x * sx - 1, a.y * sy - 1, 3, 3);
    for (const d of S.drops.values()){ if (d.mine) continue; g.fillStyle = d.kind === 'super' ? '#ffcf3a' : d.kind === 'shield' ? '#619ee9' : SP.SVC_COLORS[d.svc]; g.beginPath(); g.arc(d.x * sx, d.y * sy, d.kind === 'super' ? 5 : 3.5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
    g.fillStyle = '#cc0e0e'; for (const b of S.bugs.values()){ g.beginPath(); g.arc(b.x * sx, b.y * sy, 3, 0, 7); g.fill(); }
    // Khung nhìn camera
    const vw = cw / (cw / 1500) * zoom * 0.9, vh = vw * ch / Math.max(1, cw);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5; g.strokeRect((camTarget.x - vw / 2) * sx, (camTarget.z - vh / 2) * sy, vw * sx, vh * sy);
    g.fillStyle = '#fff'; g.strokeStyle = '#0F1E2D'; g.lineWidth = 2; g.beginPath(); g.arc(S.me.x * sx, S.me.y * sy, 4.5, 0, 7); g.fill(); g.stroke();
  }

  return { resize, render, toWorld, toScreen, drawMinimap, zoomBy, is3D:true, get scale(){ return 1; }, info: () => ({ ...renderer.info.render }) };
}
