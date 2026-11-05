/* =============================================================================
 * iNET Tech Office 3D — dựng văn phòng + vẽ thế giới bằng Three.js
 * Toạ độ: bản đồ (x, y) của WorldRules → Three (x, z); chiều cao là y (đơn vị ≈ cm).
 * - Văn phòng: sàn gỗ + thảm, tường + cửa kính nhìn thành phố, lễ tân + tường logo iNET phát sáng,
 *   phòng máy chủ kính (tủ rack đèn nháy), 4 cụm bàn làm việc (màn hình sáng), phòng họp kính,
 *   pantry + sofa, 4 quầy dịch vụ có biển tồn kho, atrium: bục Siêu Deal + màn LED treo, standee bé Nét
 * - Thực thể: nhân vật người 3D, hộp quà 3D, virus DDoS, khiên, cột sáng Siêu Deal, điểm manh mối mật thư
 * - Camera nghiêng từ trên, bám nhân vật, chụm/giãn để zoom
 * Giao diện giống bản 2D: create(canvas) → { resize, render(S,t), toWorld, toScreen, drawMinimap, zoomBy }
 * ============================================================================= */
import * as THREE from '../vendor/three.module.min.js';
import { Avatar, textSprite, mergeColored, SHARED_MAT } from './office3d-human-avatar-factory.js';

const WR = window.WorldRules, SP = window.WorldSprites;
const { W, H, WALL_Y, MARGIN, BOOTHS, STAGE, SPAWN, OBSTACLES, CLUE_SPOTS, ZONE_NAMES } = WR;
const FONT = '"Be Vietnam Pro", system-ui, Arial, sans-serif';
const BOOTH_POSE = { domain:'book', hosting:'wave', vps:'thumb', ssl:'shield', email:'support' };
const NEAR_N = 30;                 // số nhân vật gần nhất được vẽ đầy đủ

/* ---------- Tiện ích ---------- */
function canvasTex(w, h, draw, repeat){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
function boxAt(parent, mat, x, z, w, d, h, y0 = 0){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y0 + h / 2, z); parent.add(m); return m;
}
function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* ---------- Dựng văn phòng ---------- */
function buildOffice(scene){
  const office = new THREE.Group(); scene.add(office);
  const api = {};

  // Sàn gỗ
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let y = 0; y < h; y += 32){
      let x = -rnd() * 200;
      while (x < w){
        const bw = 140 + rnd() * 140, k = 0.9 + rnd() * .16;
        g.fillStyle = `rgb(${Math.round(222 * k)},${Math.round(190 * k)},${Math.round(150 * k)})`; g.fillRect(x, y, bw, 32);
        g.fillStyle = 'rgba(110,70,35,.18)'; g.fillRect(x + bw - 2, y, 2, 32);
        x += bw;
      }
      g.fillStyle = 'rgba(110,70,35,.22)'; g.fillRect(0, y + 30, w, 2);
    }
  }, [W / 520, H / 520]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); office.add(floor);
  api.floor = floor;

  // Thảm xám dưới khu bàn làm việc + thảm xanh iNET từ cửa vào tới atrium
  const rugMat = lam('#8c96a3');
  OBSTACLES.filter(o => o.kind === 'desks').forEach(o => {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(o.w + 140, o.h + 140), rugMat);
    r.rotation.x = -Math.PI / 2; r.position.set(o.x + o.w / 2, 0.8, o.y + o.h / 2); office.add(r);
  });
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(220, SPAWN.y - STAGE.y + 60), lam('#024799'));
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(SPAWN.x, 1, (SPAWN.y + STAGE.y) / 2 + 30); office.add(carpet);
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.PlaneGeometry(8, SPAWN.y - STAGE.y + 60), lam('#ffcf3a')); e.rotation.x = -Math.PI / 2; e.position.set(SPAWN.x + s * 106, 1.2, carpet.position.z); office.add(e); });

  // Tường sau có cửa kính nhìn ra thành phố + tường hai bên thấp (để camera nhìn rõ)
  const wallMat = lam('#eef2f7'), trimMat = lam('#cfd8e3');
  boxAt(office, wallMat, W / 2, WALL_Y / 2 - 30, W, WALL_Y - 60, 340);
  const skyTex = canvasTex(1024, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9fd2ff'); gr.addColorStop(1, '#e3f3ff');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let x = 0; x < w; x += 30 + rnd() * 40){
      const bh = 60 + rnd() * 150, bw = 30 + rnd() * 50;
      g.fillStyle = `rgba(${70 + rnd() * 40},${100 + rnd() * 40},${140 + rnd() * 40},.85)`; g.fillRect(x, h - bh, bw, bh);
      g.fillStyle = 'rgba(255,255,255,.45)';
      for (let yy = h - bh + 8; yy < h - 6; yy += 14) for (let xx = x + 5; xx < x + bw - 5; xx += 10) if (rnd() < .6) g.fillRect(xx, yy, 4, 6);
    }
  });
  const glassWall = new THREE.Mesh(new THREE.PlaneGeometry(W - 160, 230), new THREE.MeshBasicMaterial({ map: skyTex }));
  glassWall.position.set(W / 2, 175, WALL_Y - 59); office.add(glassWall);
  for (let x = 80; x <= W - 80; x += 160) boxAt(office, trimMat, x, WALL_Y - 56, 10, 8, 240, 60);
  boxAt(office, trimMat, W / 2, WALL_Y - 56, W - 160, 8, 10, 290);
  boxAt(office, trimMat, W / 2, WALL_Y - 56, W - 160, 8, 10, 56);
  boxAt(office, wallMat, MARGIN / 2 - 10, H / 2, MARGIN - 20, H, 120);
  boxAt(office, wallMat, W - MARGIN / 2 + 10, H / 2, MARGIN - 20, H, 120);
  // Sảnh ngoài (sàn đá) để camera không nhìn ra khoảng trống + vách kính mặt tiền có cửa vào
  const outTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9d1db'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  }, [30, 30]);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(W + 6000, H + 6000), new THREE.MeshLambertMaterial({ map: outTex }));
  outside.rotation.x = -Math.PI / 2; outside.position.set(W / 2, -1, H / 2); office.add(outside);
  const front = new THREE.MeshLambertMaterial({ color:'#cfe8ff', transparent:true, opacity:.22, depthWrite:false });
  const doorW = 360;
  boxAt(office, front, (SPAWN.x - doorW / 2) / 2, H, SPAWN.x - doorW / 2, 6, 130);
  boxAt(office, front, (W + SPAWN.x + doorW / 2) / 2, H, W - SPAWN.x - doorW / 2, 6, 130);
  boxAt(office, lam('#2e3440'), W / 2, H, W, 10, 8, 128);
  [SPAWN.x - doorW / 2, SPAWN.x + doorW / 2].forEach(x => boxAt(office, lam('#2e3440'), x, H, 12, 12, 220));
  const doorSign = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 20, 44), new THREE.MeshBasicMaterial({ map: canvasTex(640, 80, (g, w, h) => {
    g.fillStyle = '#024799'; roundRect(g, 0, 0, w, h, 16); g.fill();
    g.fillStyle = '#fff'; g.font = `900 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CỬA VÀO · iNET TECH OFFICE', w / 2, h / 2 + 2);
  }), transparent:true }));
  doorSign.position.set(SPAWN.x, 196, H + 7); doorSign.rotation.y = Math.PI; office.add(doorSign);

  // Logo iNET (vẽ SVG lên canvas)
  const logoTex = canvasTex(1024, 256, () => {});
  const logoImg = SP.img.logo;
  const drawLogo = () => {
    const c = logoTex.image, g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    if (logoImg.naturalWidth){ const lh = 150, lw = lh * logoImg.naturalWidth / logoImg.naturalHeight; g.drawImage(logoImg, (c.width - lw) / 2, 40, lw, lh); }
    g.fillStyle = '#024799'; g.font = `800 34px ${FONT}`; g.textAlign = 'center'; g.fillText('TECH OFFICE · BLACK FRIDAY 2026', c.width / 2, 228);
    logoTex.needsUpdate = true;
  };
  SP.ready.then(drawLogo);

  // Lễ tân + tường logo phát sáng
  OBSTACLES.forEach(o => {
    const cx = o.x + o.w / 2, cz = o.y + o.h / 2;
    if (o.kind === 'logowall'){
      boxAt(office, lam('#1d2b3f'), cx, cz, o.w, o.h, 230);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(o.w - 20, (o.w - 20) / 4), new THREE.MeshBasicMaterial({ map: logoTex }));
      panel.position.set(cx, 150, o.y + o.h + 1); office.add(panel);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(o.w + 10, 8), new THREE.MeshBasicMaterial({ color:'#5fb3ff' }));
      glow.position.set(cx, 220, o.y + o.h + 1.5); office.add(glow);
    } else if (o.kind === 'reception'){
      boxAt(office, lam('#f7f9fc'), cx, cz, o.w, o.h, 100);
      boxAt(office, lam('#024799'), cx, o.y + o.h + 1, o.w - 10, 2, 16, 70);
      boxAt(office, lam('#c9a46c'), cx, cz, o.w + 10, o.h + 10, 6, 100);
      boxAt(office, lam('#1d2b3f'), cx - 40, cz - 10, 46, 6, 30, 106);
    } else if (o.kind === 'serverroom'){
      buildServerRoom(office, o, api);
    } else if (o.kind === 'desks'){
      buildDeskCluster(office, o, api);
    } else if (o.kind === 'meeting'){
      buildMeetingRoom(office, o);
    } else if (o.kind === 'pantry'){
      boxAt(office, lam('#f2f4f7'), cx, cz, o.w, o.h, 90);
      boxAt(office, lam('#2e3440'), cx, cz, o.w + 6, o.h + 6, 5, 90);
      boxAt(office, lam('#1d2b3f'), o.x + 40, cz, 36, 34, 46, 95);       // máy pha cà phê
      boxAt(office, lam('#dfe6ee'), o.x + o.w - 30, cz, 50, o.h, 190);   // tủ lạnh
      [0, 1, 2].forEach(i => boxAt(office, lam(['#ffcf3a', '#0582D4', '#0E9F6E'][i]), o.x + 110 + i * 26, cz, 12, 12, 16, 95));
    } else if (o.kind === 'sofa'){
      const m = lam('#5b6b8c');
      boxAt(office, m, cx, cz + o.h / 2 - 12, o.w, 24, 70);
      boxAt(office, m, cx, cz, o.w, o.h, 38);
      boxAt(office, lam('#e8c48c'), cx, cz + o.h + 50, 110, 60, 36);     // bàn trà
      [-1, 1].forEach(s => boxAt(office, lam('#ffcf3a'), cx + s * 70, cz - 6, 34, 18, 30, 38));
    } else if (o.kind === 'plant'){
      buildPlant(office, cx, cz, 1.2);
    } else if (o.kind === 'counter'){
      buildBoothCounter(office, o, api);
    }
  });
  buildAtrium(office, api);
  mergeStatic(office);                 // gộp nội thất tĩnh trước khi thêm standee (tải ảnh sau)
  buildStandees(office);
  return api;
}

/** Gộp mọi khối đặc, một màu, không trong suốt của văn phòng thành 1 lưới (giảm hàng trăm lệnh vẽ → 1). */
function mergeStatic(office){
  office.updateMatrixWorld(true);
  const parts = [], victims = [];
  office.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const m = o.material;
    if (!m.isMeshLambertMaterial || m.map || m.transparent) return;
    parts.push({ geo: o.geometry, color: '#' + m.color.getHexString(), m: o.matrixWorld.clone() });
    victims.push(o);
  });
  if (!parts.length) return;
  victims.forEach(o => o.parent.remove(o));
  const merged = new THREE.Mesh(mergeColored(parts), SHARED_MAT);
  office.add(merged);
}

function buildPlant(parent, x, z, k = 1){
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(24 * k, 18 * k, 36 * k, 12), lam('#e9e3d8'));
  pot.position.set(x, 18 * k, z); parent.add(pot);
  const leafMat = lam('#3f9a45'), leafMat2 = lam('#5fb85f');
  for (let i = 0; i < 6; i++){
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry((18 + i * 2) * k, 0), i % 2 ? leafMat : leafMat2);
    l.position.set(x + Math.cos(i) * 12 * k, (50 + i * 14) * k, z + Math.sin(i * 1.7) * 12 * k); parent.add(l);
  }
}

function buildServerRoom(parent, o, api){
  const cx = o.x + o.w / 2;
  // Sàn kỹ thuật + vách kính
  boxAt(parent, lam('#c3ccd8'), cx, o.y + o.h / 2, o.w, o.h, 4);
  const glass = new THREE.MeshLambertMaterial({ color:'#bfe3ff', transparent:true, opacity:.28, depthWrite:false });
  boxAt(parent, glass, cx, o.y + o.h - 2, o.w, 4, 240);
  [o.x + 2, o.x + o.w - 2].forEach(x => boxAt(parent, glass, x, o.y + o.h / 2, 4, o.h, 240));
  const frame = lam('#2e3440');
  boxAt(parent, frame, cx, o.y + o.h, o.w + 8, 8, 8, 236);
  for (let x = o.x; x <= o.x + o.w; x += o.w / 5) boxAt(parent, frame, x, o.y + o.h, 6, 8, 240);
  // Tủ rack + đèn nháy (InstancedMesh cho nhẹ)
  const rackMat = lam('#1c2230'), rackGeo = new THREE.BoxGeometry(60, 200, 70);
  const ledGeo = new THREE.BoxGeometry(6, 3, 2);
  const ledColors = ['#34d399', '#5fb3ff', '#fbbf24'];
  api.leds = [];
  const rows = [o.y + 50, o.y + 140];
  rows.forEach(z => {
    for (let x = o.x + 60; x < o.x + o.w - 40; x += 75){
      const r = new THREE.Mesh(rackGeo, rackMat); r.position.set(x, 100, z); parent.add(r);
      const mats = ledColors.map(c => new THREE.MeshBasicMaterial({ color:c }));
      const inst = new THREE.InstancedMesh(ledGeo, mats[0], 18);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 18; i++){ m4.makeTranslation(x - 20 + (i % 3) * 12, 30 + Math.floor(i / 3) * 28, z + 36); inst.setMatrixAt(i, m4); inst.setColorAt(i, new THREE.Color(ledColors[i % 3])); }
      inst.instanceColor.needsUpdate = true;
      inst.material = new THREE.MeshBasicMaterial({ color:'#ffffff' });
      parent.add(inst); api.leds.push(inst);
    }
  });
  // Biển "PHÒNG MÁY CHỦ · CLOUD/VPS" trên vách kính
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(260, 46), new THREE.MeshBasicMaterial({ map: canvasTex(520, 92, (g, w, h) => {
    g.fillStyle = '#0d1117'; roundRect(g, 0, 0, w, h, 18); g.fill();
    g.fillStyle = '#5fb3ff'; g.font = `900 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PHÒNG MÁY CHỦ · CLOUD', w / 2, h / 2 + 2);
  }), transparent:true }));
  sign.position.set(cx, 210, o.y + o.h + 3); parent.add(sign);
}

function buildDeskCluster(parent, o, api){
  // 2 hàng × 2 bàn đối diện, mỗi bàn 1 màn hình sáng + ghế
  const top = lam('#f1e3cc'), leg = lam('#9aa5b4'), chairMat = lam('#2b3442'), mon = lam('#1b1f27');
  const scrTex = canvasTex(128, 80, (g, w, h) => {
    g.fillStyle = '#0d1b2a'; g.fillRect(0, 0, w, h);
    const cols = ['#5fb3ff', '#34d399', '#fbbf24', '#ffffff'];
    for (let y = 8; y < h - 4; y += 9){ let x = 6 + Math.random() * 14; while (x < w - 20){ const lw = 8 + Math.random() * 28; g.fillStyle = cols[Math.floor(Math.random() * 4)]; g.fillRect(x, y, lw, 4); x += lw + 6; } }
  });
  const scrMat = new THREE.MeshBasicMaterial({ map: scrTex });
  const dw = o.w / 2, dd = o.h / 2;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++){
    const x = o.x + dw / 2 + i * dw, z = o.y + dd / 2 + j * dd;
    boxAt(parent, top, x, z, dw - 8, dd - 6, 4, 72);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => boxAt(parent, leg, x + a * (dw / 2 - 12), z + b * (dd / 2 - 10), 5, 5, 72));
    const face = j === 0 ? -1 : 1;                                     // màn hình quay ra lối đi
    const m = boxAt(parent, mon, x, z - face * 12, 60, 4, 38, 82);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(54, 32), scrMat);
    s.position.set(x, 101, z - face * 12 + face * 2.2); if (face < 0) s.rotation.y = Math.PI; parent.add(s);
    boxAt(parent, mon, x, z - face * 12, 6, 6, 12, 76);
    const ch = new THREE.Group(); ch.position.set(x, 0, z + face * (dd / 2 + 26));
    boxAt(ch, chairMat, 0, 0, 40, 40, 8, 44); boxAt(ch, chairMat, 0, face * 18, 40, 6, 46, 50);
    boxAt(ch, leg, 0, 0, 6, 6, 40); parent.add(ch);
  }
}

function buildMeetingRoom(parent, o){
  const cx = o.x + o.w / 2, cz = o.y + o.h / 2;
  const glass = new THREE.MeshLambertMaterial({ color:'#cfe8ff', transparent:true, opacity:.3, depthWrite:false });
  boxAt(parent, glass, cx, o.y, o.w, 4, 220); boxAt(parent, glass, o.x, cz, 4, o.h, 220);
  boxAt(parent, glass, o.x + o.w, cz, 4, o.h, 220); boxAt(parent, glass, cx, o.y + o.h, o.w, 4, 220);
  const fr = lam('#2e3440'); boxAt(parent, fr, cx, cz, o.w + 6, o.h + 6, 6, 218);
  boxAt(parent, lam('#ffffff'), cx, cz, o.w - 140, o.h - 110, 6, 72);
  boxAt(parent, lam('#9aa5b4'), cx, cz, 30, 30, 72);
  for (let i = 0; i < 4; i++){ boxAt(parent, lam('#0582D4'), cx - 120 + i * 80, cz - 70, 40, 40, 44); boxAt(parent, lam('#0582D4'), cx - 120 + i * 80, cz + 70, 40, 40, 44); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(240, 40), new THREE.MeshBasicMaterial({ map: canvasTex(480, 80, (g, w, h) => {
    g.fillStyle = '#024799'; roundRect(g, 0, 0, w, h, 16); g.fill();
    g.fillStyle = '#fff'; g.font = `900 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.name || 'Phòng họp', w / 2, h / 2 + 2);
  }), transparent:true }));
  sign.position.set(cx, 190, o.y - 4); sign.rotation.y = Math.PI; parent.add(sign);
  const sign2 = sign.clone(); sign2.position.set(o.x - 4, 190, cz); sign2.rotation.y = -Math.PI / 2; parent.add(sign2);
}

function buildBoothCounter(parent, o, api){
  const id = o.id, c = SP.SVC_COLORS[id], cx = o.x + o.w / 2, cz = o.y + o.h / 2;
  boxAt(parent, lam(c), cx, cz, o.w, o.h, 100);
  boxAt(parent, lam('#ffffff'), cx, cz, o.w + 10, o.h + 10, 6, 100);
  // Biển tồn kho (vẽ lại khi kho đổi)
  const tex = canvasTex(512, 200, () => {});
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(220, 86), new THREE.MeshBasicMaterial({ map: tex, transparent:true }));
  sign.position.set(cx, 250, o.y - 6); parent.add(sign);
  const pole = boxAt(parent, lam('#9aa5b4'), cx, o.y - 8, 6, 6, 210);
  pole.renderOrder = 0;
  api.signs = api.signs || {};
  api.signs[id] = (stock) => {
    const g = tex.image.getContext('2d'), w = 512, h = 200;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; roundRect(g, 4, 4, w - 8, h - 8, 28); g.fill();
    g.lineWidth = 8; g.strokeStyle = c; g.stroke();
    g.fillStyle = c; g.font = `900 52px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ZONE_NAMES[id] || id, w / 2, 70);
    const v = stock && stock[id] ? stock[id][0] : null;
    g.fillStyle = v === 0 ? '#cc0e0e' : '#0F1E2D'; g.font = `800 44px ${FONT}`;
    g.fillText(v == null ? '' : v > 0 ? `còn ${v} mã` : 'hết mã', w / 2, 142);
    tex.needsUpdate = true;
  };
  api.signs[id](null);
}

function buildAtrium(parent, api){
  // Bục Siêu Deal
  const base = new THREE.Mesh(new THREE.CylinderGeometry(STAGE.r, STAGE.r + 10, 16, 48), lam('#c9a46c'));
  base.position.set(STAGE.x, 8, STAGE.y); parent.add(base);
  const topT = canvasTex(512, 512, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 20, w / 2, w / 2, w / 2); gr.addColorStop(0, '#fff3c2'); gr.addColorStop(1, '#ffcf3a');
    g.fillStyle = gr; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, 7); g.fill();
    g.fillStyle = '#7a4a00'; g.font = `900 58px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SIÊU DEAL', w / 2, w / 2);
  });
  const top = new THREE.Mesh(new THREE.CircleGeometry(STAGE.r - 6, 48), new THREE.MeshLambertMaterial({ map: topT }));
  top.rotation.x = -Math.PI / 2; top.position.set(STAGE.x, 16.5, STAGE.y); parent.add(top);
  // Màn LED treo (vẽ lại mỗi giây)
  const led = canvasTex(768, 256, () => {});
  // Màn LED đứng phía sau bục (không treo cao để khỏi che tầm nhìn camera)
  const scr = new THREE.Mesh(new THREE.BoxGeometry(330, 110, 12), [lam('#111'), lam('#111'), lam('#111'), lam('#111'),
    new THREE.MeshBasicMaterial({ map: led }), new THREE.MeshBasicMaterial({ map: led })]);
  scr.position.set(STAGE.x, 215, STAGE.y - STAGE.r - 30); parent.add(scr);
  [-120, 120].forEach(dx => boxAt(parent, lam('#2e3440'), STAGE.x + dx, STAGE.y - STAGE.r - 30, 8, 8, 160));
  let lastTxt = '';
  api.led = (text, sub, live) => {
    const k = text + '|' + sub + '|' + live; if (k === lastTxt) return; lastTxt = k;
    const g = led.image.getContext('2d'), w = 768, h = 256;
    g.fillStyle = '#05080d'; g.fillRect(0, 0, w, h);
    g.strokeStyle = live ? '#ff4d4d' : '#ffcf3a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = live ? '#ff8a84' : '#ffe27a'; g.font = `800 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sub || 'iNET TECH OFFICE', w / 2, 62);
    g.fillStyle = '#ffffff'; g.font = `900 110px "JetBrains Mono", monospace`; g.fillText(text || '--:--', w / 2, 160);
    led.needsUpdate = true;
  };
}

function buildStandees(parent){
  // Bé Nét dạng standee 2D ở lễ tân và cạnh các quầy (giữ linh vật iNET)
  const spots = [{ pose:'wave', x: 1140, z: 1300 }];
  for (const id in BOOTHS){ const b = BOOTHS[id]; spots.push({ pose: BOOTH_POSE[id], x: b.x + (id === 'vps' ? 290 : 150), z: b.y + 40 }); }
  SP.ready.then(() => spots.forEach(s => {
    const im = SP.mascot[s.pose]; if (!im || !im.naturalWidth) return;
    const h = 120, w = h * im.naturalWidth / im.naturalHeight;
    const tex = new THREE.Texture(im); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent:true, alphaTest:.05, side:THREE.DoubleSide }));
    m.position.set(s.x, h / 2 + 8, s.z); parent.add(m);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(28, 30, 8, 20), lam('#024799')); st.position.set(s.x, 4, s.z); parent.add(st);
  }));
}

/* ---------- Thực thể động ---------- */
const GIFT_GEO = { body: new THREE.BoxGeometry(46, 36, 46), lid: new THREE.BoxGeometry(52, 12, 52), ribbonA: new THREE.BoxGeometry(10, 50, 48), ribbonB: new THREE.BoxGeometry(48, 50, 10) };
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
function makeShieldItem(){
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 8, 6), lam('#0582D4')); s.rotation.x = Math.PI / 2; s.position.y = 40; g.add(s);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(18, 16, 10), lam('#ffffff')); lock.position.set(0, 36, 4); g.add(lock);
  return g;
}
function makeVirus(){
  const g = new THREE.Group(), red = lam('#cc0e0e', { emissive:'#3a0000' });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(22, 1), red); g.add(core);
  const spikeGeo = new THREE.ConeGeometry(5, 18, 6), dark = lam('#7a0707');
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[.7,.7,0],[-.7,.7,0],[.7,-.7,0],[-.7,-.7,0],[0,.7,.7],[0,-.7,-.7]];
  dirs.forEach(d => { const s = new THREE.Mesh(spikeGeo, dark); const v = new THREE.Vector3(...d).normalize(); s.position.copy(v.clone().multiplyScalar(26)); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v); g.add(s); });
  const eyeM = new THREE.MeshBasicMaterial({ color:'#ffffff' });
  [-8, 8].forEach(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), eyeM); e.position.set(x, 4, 19); g.add(e); });
  const lbl = textSprite('DDoS', { bg:'#cc0e0e', fg:'#fff', size:28, h:18 }); lbl.position.y = 46; g.add(lbl);
  return g;
}
function makeBeam(){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(60, 90, 520, 24, 1, true),
    new THREE.MeshBasicMaterial({ color:'#ffd65a', transparent:true, opacity:.28, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending }));
  m.position.y = 260; return m;
}
function makeClueMarker(found){
  const g = new THREE.Group();
  const env = new THREE.Mesh(new THREE.BoxGeometry(40, 28, 4), lam(found ? '#0E9F6E' : '#ffcf3a', { emissive: found ? '#04331f' : '#5a4300' }));
  env.position.y = 120; g.add(env);
  const ring = new THREE.Mesh(new THREE.RingGeometry(WR.CLUE_R - 12, WR.CLUE_R, 40),
    new THREE.MeshBasicMaterial({ color: found ? '#34d399' : '#ffcf3a', transparent:true, opacity:.55, depthWrite:false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 2; g.add(ring);
  const lbl = textSprite(found ? '✓ Đã đọc' : 'Manh mối', { bg: found ? '#0B7A55' : '#ffcf3a', fg: found ? '#fff' : '#3a2400', size:28, h:20 });
  lbl.position.y = 156; g.add(lbl);
  g.userData.env = env;
  return g;
}

/* ---------- Bộ vẽ chính ---------- */
export function create(canvas){
  const isMobile = matchMedia('(pointer:coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(isMobile ? 1.5 : 2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dce7f2');
  scene.add(new THREE.HemisphereLight('#ffffff', '#b7a68e', 1.9));
  const sun = new THREE.DirectionalLight('#fff3e0', 1.5); sun.position.set(900, 1600, 1400); scene.add(sun);
  const office = buildOffice(scene);

  const cam = new THREE.PerspectiveCamera(38, 1, 20, 9000);
  let zoom = isMobile ? 1.05 : 1, cw = 0, ch = 0;
  const camOff = new THREE.Vector3(0, 1050, 900);
  const camTarget = new THREE.Vector3(SPAWN.x, 0, SPAWN.y);

  const avatars = new Map(), drops = new Map(), bugs = new Map(), clueMarks = new Map();
  let beam = null, lastStock = '';
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), v2 = new THREE.Vector2(), hit = new THREE.Vector3();

  function resize(){
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    renderer.setSize(cw, ch, false);
    cam.aspect = cw / Math.max(1, ch);
    cam.fov = cam.aspect < 0.8 ? 52 : 38;                 // điện thoại dọc: góc rộng hơn
    cam.updateProjectionMatrix();
  }
  resize();

  function syncAvatar(key, a, isMe){
    let av = avatars.get(key);
    if (!av || av.lookStr !== a.avatar || av.nick !== a.nick){
      if (av){ scene.remove(av.group); av.dispose(); }
      av = new Avatar(a.avatar, a.nick, isMe); av.lookStr = a.avatar; av.nick = a.nick;
      av.prevX = a.x; av.prevY = a.y;
      avatars.set(key, av); scene.add(av.group);
    }
    av.seen = true;
    return av;
  }

  function render(S, t){
    if (canvas.clientWidth !== cw || canvas.clientHeight !== ch) resize();
    const dt = Math.min(.1, (t - (render.last || t)) / 1000); render.last = t;
    avatars.forEach(a => { a.seen = false; });
    // Tối ưu theo khoảng cách: NEAR_N người gần nhất vẽ đầy đủ (tên, bóng, hoạt cảnh); người xa chỉ vẽ thân
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
      if (av.near !== near){ av.near = near; av.name.visible = near; av.group.children[1].visible = near; av.setFar(!near); }
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
        const obj = d.kind === 'shield' ? makeShieldItem() : makeGift(d.kind === 'super' ? '#ffcf3a' : SP.SVC_COLORS[d.svc], d.kind === 'super');
        obj.position.set(d.x, 0, d.y); obj.userData.born = t; scene.add(obj);
        e = { obj, left: -1, label: null }; drops.set(d.id, e);
      }
      const age = (t - e.obj.userData.born) / 1000;
      const fall = Math.max(0, 1 - age / .45);                           // rơi từ trần xuống
      e.obj.position.y = fall * fall * 420 + Math.abs(Math.sin(t / 260 + d.x)) * 8;
      e.obj.rotation.y = t / 900 + d.x;
      e.obj.visible = !(d.until - t < 1500 && Math.floor(t / 120) % 2);
      if (e.mine !== !!d.mine){                                        // hộp mình đã nhặt → mờ đi
        e.mine = !!d.mine;
        e.obj.traverse(m => { if (m.material && !m.isSprite){ m.material.transparent = e.mine; m.material.opacity = e.mine ? .35 : 1; } });
      }
      if (d.kind !== 'shield' && e.left !== d.left && !d.mine){
        if (e.label){ e.obj.remove(e.label); e.label.material.map.dispose(); }
        e.label = textSprite(`còn ${d.left}`, { bg: d.left <= 2 ? '#cc0e0e' : '#024799', fg:'#fff', size:28, h:20 });
        e.label.position.y = d.kind === 'super' ? 70 : 78; e.obj.add(e.label); e.left = d.left;
      }
      if (d.mine && e.label){ e.label.visible = false; }
      if (d.kind === 'super' && !e.beam){ e.beam = makeBeam(); e.obj.add(e.beam); }
    }
    drops.forEach((e, id) => { if (!seenDrops.has(id)){ scene.remove(e.obj); drops.delete(id); } });

    // Virus DDoS
    const seenBugs = new Set();
    for (const b of S.bugs.values()){
      seenBugs.add(b.id);
      let v = bugs.get(b.id);
      if (!v){ v = makeVirus(); scene.add(v); bugs.set(b.id, v); }
      v.position.set(b.x, 70 + Math.sin(t / 300 + b.id) * 12, b.y);
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
    if (office.leds && Math.floor(t / 250) !== render.ledTick){
      render.ledTick = Math.floor(t / 250);
      office.leds.forEach((inst, k) => { inst.visible = (render.ledTick + k) % 3 !== 0; });
    }

    // Camera bám nhân vật (mượt)
    // Giới hạn camera trong văn phòng (không nhìn quá xa ra sảnh ngoài)
    const portrait = cam.aspect < 0.8;                     // điện thoại dọc nhìn được xa hơn → giới hạn chặt hơn
    const tx = Math.min(W - (portrait ? 250 : 350), Math.max(portrait ? 250 : 350, S.me.x));
    const tz = Math.min(H - (portrait ? 600 : 330), Math.max(WALL_Y + (portrait ? 420 : 260), S.me.y));
    camTarget.lerp(new THREE.Vector3(tx, 0, tz), Math.min(1, dt * 6));
    cam.position.copy(camTarget).addScaledVector(camOff, zoom);
    cam.lookAt(camTarget.x, 60, camTarget.z - 40);

    // Điểm đến khi chạm sàn
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
  function zoomBy(k){ zoom = Math.min(1.6, Math.max(0.6, zoom * k)); }

  /* Bản đồ nhỏ: sơ đồ mặt bằng văn phòng */
  function drawMinimap(mc, S){
    const g = mc.getContext('2d'), mw = mc.width, mh = mc.height, sx = mw / W, sy = mh / H;
    g.fillStyle = '#e8dcc8'; g.fillRect(0, 0, mw, mh);
    g.fillStyle = '#9fb3c8'; g.fillRect(0, 0, mw, WALL_Y * sy);
    g.fillStyle = '#024799'; g.fillRect((SPAWN.x - 110) * sx, STAGE.y * sy, 220 * sx, (H - STAGE.y) * sy);
    g.fillStyle = '#ffcf3a'; g.beginPath(); g.arc(STAGE.x * sx, STAGE.y * sy, STAGE.r * sx, 0, 7); g.fill();
    OBSTACLES.forEach(o => {
      g.fillStyle = o.kind === 'counter' ? SP.SVC_COLORS[o.id] : o.kind === 'serverroom' ? '#24303f' : o.kind === 'plant' ? '#3f9a45' : '#a7b2c0';
      g.fillRect(o.x * sx, o.y * sy, Math.max(2, o.w * sx), Math.max(2, o.h * sy));
    });
    if (S.puzzle && S.puzzle.clues) S.puzzle.clues.forEach(c => { const sp = CLUE_SPOTS[c.spot]; if (!sp) return; g.fillStyle = c.text ? '#0E9F6E' : '#ff9f1a'; g.beginPath(); g.arc(sp.x * sx, sp.y * sy, 5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); });
    g.fillStyle = 'rgba(15,30,45,.55)'; for (const a of S.others.values()) g.fillRect(a.x * sx - 1, a.y * sy - 1, 3, 3);
    for (const d of S.drops.values()){ if (d.mine) continue; g.fillStyle = d.kind === 'super' ? '#ffcf3a' : d.kind === 'shield' ? '#619ee9' : SP.SVC_COLORS[d.svc]; g.beginPath(); g.arc(d.x * sx, d.y * sy, d.kind === 'super' ? 5 : 3.5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
    g.fillStyle = '#cc0e0e'; for (const b of S.bugs.values()){ g.beginPath(); g.arc(b.x * sx, b.y * sy, 3, 0, 7); g.fill(); }
    g.fillStyle = '#fff'; g.strokeStyle = '#0F1E2D'; g.lineWidth = 2; g.beginPath(); g.arc(S.me.x * sx, S.me.y * sy, 4.5, 0, 7); g.fill(); g.stroke();
  }

  return { resize, render, toWorld, toScreen, drawMinimap, zoomBy, is3D:true, get scale(){ return 1; }, info: () => ({ ...renderer.info.render }) };
}
