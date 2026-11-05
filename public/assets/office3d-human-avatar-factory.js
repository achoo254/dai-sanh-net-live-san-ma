/* =============================================================================
 * iNET Tech Office 3D — nhân vật người 3D low-poly dựng bằng code (không cần file mô hình)
 * - Phối đồ: giới tính, màu da, 5 kiểu tóc × 5 màu tóc, 4 kiểu áo × 5 màu áo, phụ kiện (kính, tai nghe, mũ)
 * - Gộp các khối cùng chuyển động thành 1 lưới có màu theo đỉnh → mỗi nhân vật chỉ ~5 lần vẽ (nhẹ cho điện thoại)
 * - Hoạt cảnh: đứng thở, đi bộ, vẫy tay (biểu cảm), nhảy mừng (nhận mã), choáng (DDoS), khiên
 * Chuỗi phối đồ (gửi qua mạng): "g:m|s:1|h:0|hc:0|t:polo|tc:0|a:none"
 * ============================================================================= */
import * as THREE from '../vendor/three.module.min.js';

export const LOOK_OPTIONS = {
  g:  ['m', 'f'],
  s:  ['#f6d5bd', '#ecc19f', '#d8a47d', '#b67d56', '#8a5636'],            // màu da
  h:  [0, 1, 2, 3, 4],                                                  // kiểu tóc (khác nhau theo giới tính)
  hc: ['#1b1b1b', '#3d2a1e', '#7a4b28', '#d6b26c', '#2f5fa8'],           // màu tóc
  t:  ['polo', 'hoodie', 'shirt', 'tee'],                               // kiểu áo
  tc: ['#024799', '#0582D4', '#f4f7fa', '#24303f', '#0E9F6E'],           // màu áo (xanh iNET đầu tiên)
  a:  ['none', 'glasses', 'headset', 'cap']                             // phụ kiện
};
export const HAIR_NAMES = { m:['Ngắn gọn', 'Rẽ ngôi', 'Dựng chỉa', 'Cắt sát', 'Xoăn'], f:['Bob', 'Dài', 'Đuôi ngựa', 'Búi', 'Tém'] };
export const TOP_NAMES = { polo:'Polo', hoodie:'Hoodie', shirt:'Sơ mi', tee:'Áo thun' };
export const ACC_NAMES = { none:'Không', glasses:'Kính', headset:'Tai nghe', cap:'Mũ' };
const PANTS = '#1f2a44', SHOE = '#eef2f7', DARK = '#16181d';

export function parseLook(str){
  const o = { g:'m', s:1, h:0, hc:0, t:'polo', tc:0, a:'none' };
  String(str || '').split('|').forEach(kv => {
    const [k, v] = kv.split(':');
    if (k === 'g' && (v === 'm' || v === 'f')) o.g = v;
    else if (['s', 'h', 'hc', 'tc'].includes(k)){ const n = +v; if (Number.isInteger(n) && n >= 0 && n <= 4) o[k] = n; }
    else if (k === 't' && LOOK_OPTIONS.t.includes(v)) o.t = v;
    else if (k === 'a' && LOOK_OPTIONS.a.includes(v)) o.a = v;
  });
  return o;
}
export const lookToString = o => `g:${o.g}|s:${o.s}|h:${o.h}|hc:${o.hc}|t:${o.t}|tc:${o.tc}|a:${o.a}`;
export function randomLook(rand = Math.random){
  const r = n => Math.floor(rand() * n);
  return { g: rand() < .5 ? 'm' : 'f', s:r(5), h:r(5), hc: r(10) < 8 ? r(4) : 4, t: LOOK_OPTIONS.t[r(4)], tc:r(5), a: LOOK_OPTIONS.a[r(4)] };
}

/* ---------- Gộp nhiều khối thành 1 lưới có màu theo đỉnh ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function M(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1){
  return new THREE.Matrix4().compose(_v.set(x, y, z).clone(), _q.setFromEuler(_e.set(rx, ry, rz)).clone(), _s.set(sx, sy, sz).clone());
}
export function mergeColored(parts){
  const arr = []; let total = 0;
  for (const p of parts){
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(p.m || _m.identity());
    arr.push({ g, c: new THREE.Color(p.color) }); total += g.attributes.position.count;
  }
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  let o = 0;
  for (const { g, c } of arr){
    const n = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < n; i++){ C[(o + i) * 3] = c.r; C[(o + i) * 3 + 1] = c.g; C[(o + i) * 3 + 2] = c.b; }
    o += n; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.computeBoundingSphere();
  return out;
}

/** Gộp các lưới đã có màu theo đỉnh (giữ nguyên màu). */
function mergeKeepColors(list){
  let total = 0; const gs = list.map(({ geo, m }) => { const g = geo.clone().applyMatrix4(m); total += g.attributes.position.count; return g; });
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  let o = 0;
  for (const g of gs){ P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.computeBoundingSphere();
  return out;
}

// Hình khối dùng chung (tạo 1 lần)
const G = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  sphereLo: new THREE.SphereGeometry(1, 10, 8),
  cap: (t) => new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * t),
  box: new THREE.BoxGeometry(1, 1, 1),
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 6),
  torus: new THREE.TorusGeometry(1, 0.18, 6, 16),
  arc: new THREE.TorusGeometry(1, 0.08, 6, 20, Math.PI)
};
export const SHARED_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

/** Dựng các phần của nhân vật theo phối đồ. Toạ độ: y lên trên, mặt nhìn về +z, đơn vị ≈ cm (cao ~150). */
function buildParts(look){
  const skin = LOOK_OPTIONS.s[look.s], hair = LOOK_OPTIONS.hc[look.hc], top = LOOK_OPTIONS.tc[look.tc];
  const female = look.g === 'f', wTorso = female ? 0.9 : 1;
  const body = [];
  // Thân + cổ + đầu + mặt
  body.push({ geo:G.capsule, color:top, m:M(0, 76, 0, 0, 0, 0, 20 * wTorso, 16, 15) });
  body.push({ geo:G.box, color:PANTS, m:M(0, 55, 0, 0, 0, 0, 38 * wTorso, 10, 28) });
  body.push({ geo:G.cyl, color:skin, m:M(0, 101, 0, 0, 0, 0, 7, 10, 7) });
  body.push({ geo:G.sphere, color:skin, m:M(0, 128, 0, 0, 0, 0, 26, 27, 25) });
  body.push({ geo:G.sphereLo, color:skin, m:M(-25, 127, 0, 0, 0, 0, 4, 6, 4) });
  body.push({ geo:G.sphereLo, color:skin, m:M(25, 127, 0, 0, 0, 0, 4, 6, 4) });
  body.push({ geo:G.sphereLo, color:DARK, m:M(-9, 129, 23.5, 0, 0, 0, 3.2, 4.2, 2) });
  body.push({ geo:G.sphereLo, color:DARK, m:M(9, 129, 23.5, 0, 0, 0, 3.2, 4.2, 2) });
  body.push({ geo:G.sphereLo, color:'#ffffff', m:M(-8, 130.5, 25, 0, 0, 0, 1, 1.2, .6) });
  body.push({ geo:G.sphereLo, color:'#ffffff', m:M(10, 130.5, 25, 0, 0, 0, 1, 1.2, .6) });
  body.push({ geo:G.box, color:hair, m:M(-9, 136, 23, 0, 0, .08, 8, 1.6, 2) });
  body.push({ geo:G.box, color:hair, m:M(9, 136, 23, 0, 0, -.08, 8, 1.6, 2) });
  body.push({ geo:G.arc, color:'#a3473a', m:M(0, 120, 24, Math.PI, 0, 0, 5, 3.5, 3) });
  body.push({ geo:G.sphereLo, color:'#f4a3a3', m:M(-15, 122, 21, 0, 0, 0, 4, 2.5, 1.5) });
  body.push({ geo:G.sphereLo, color:'#f4a3a3', m:M(15, 122, 21, 0, 0, 0, 4, 2.5, 1.5) });
  // Kiểu áo
  if (look.t === 'polo'){
    body.push({ geo:G.torus, color:top, m:M(0, 99, 2, Math.PI / 2, 0, 0, 10, 10, 6) });
    body.push({ geo:G.box, color:'#ffffff', m:M(0, 92, 15.5, 0, 0, 0, 4, 10, 1) });
    body.push({ geo:G.box, color:'#ffffff', m:M(11, 88, 14.5, 0, -.25, 0, 6, 4, 1) });          // logo ngực
  } else if (look.t === 'shirt'){
    body.push({ geo:G.cone, color:'#ffffff', m:M(-5, 97, 9, .9, 0, .6, 6, 9, 3) });
    body.push({ geo:G.cone, color:'#ffffff', m:M(5, 97, 9, .9, 0, -.6, 6, 9, 3) });
    body.push({ geo:G.box, color:'#ffffff', m:M(0, 78, 15.8, 0, 0, 0, 2.5, 34, 1) });
  } else if (look.t === 'hoodie'){
    body.push({ geo:G.sphere, color:top, m:M(0, 108, -14, -.3, 0, 0, 22, 14, 12) });
    body.push({ geo:G.box, color:SHOEPOCKET(top), m:M(0, 66, 15, 0, 0, 0, 24, 9, 2) });
    body.push({ geo:G.cyl, color:'#ffffff', m:M(-5, 90, 15, .2, 0, 0, .8, 12, .8) });
    body.push({ geo:G.cyl, color:'#ffffff', m:M(5, 90, 15, .2, 0, 0, .8, 12, .8) });
  } else {
    body.push({ geo:G.torus, color:top, m:M(0, 99, 1, Math.PI / 2, 0, 0, 9, 9, 4) });
    body.push({ geo:G.box, color:'#ffffff', m:M(0, 82, 15.6, 0, 0, 0, 12, 8, 1) });
  }
  // Tóc
  const H = look.h;
  if (!female){
    if (H === 3) body.push({ geo:G.cap(.5), color:hair, m:M(0, 129, -1, -.15, 0, 0, 27.3, 28, 26.3) });
    else body.push({ geo:G.cap(.46), color:hair, m:M(0, 130, -2, -.2, 0, 0, 28, 29, 27.5) });
    if (H === 1) body.push({ geo:G.box, color:hair, m:M(-6, 150, 16, .5, 0, .35, 28, 7, 10) });
    if (H === 2) for (let i = 0; i < 7; i++){ const a = i / 7 * Math.PI * 2; body.push({ geo:G.cone, color:hair, m:M(Math.cos(a) * 12, 154, Math.sin(a) * 12 + 2, Math.sin(a) * .5, 0, -Math.cos(a) * .5, 6, 14, 6) }); }
    if (H === 4) for (let i = 0; i < 10; i++){ const a = i / 10 * Math.PI * 2; body.push({ geo:G.sphereLo, color:hair, m:M(Math.cos(a) * 22, 145, Math.sin(a) * 20, 0, 0, 0, 9, 9, 9) }); }
    if (H === 0) body.push({ geo:G.box, color:hair, m:M(0, 148, 17, .45, 0, 0, 34, 6, 8) });
  } else {
    body.push({ geo:G.cap(.48), color:hair, m:M(0, 130, -2, -.2, 0, 0, 28.5, 29.5, 28) });
    body.push({ geo:G.box, color:hair, m:M(0, 147, 18, .5, 0, 0, 36, 6, 8) });
    if (H === 0) body.push({ geo:G.cap(.72), color:hair, m:M(0, 132, -3, 0, 0, 0, 29.5, 26, 28.5) });
    if (H === 1){ body.push({ geo:G.box, color:hair, m:M(0, 108, -18, .12, 0, 0, 50, 54, 12) }); body.push({ geo:G.box, color:hair, m:M(-24, 116, -4, 0, 0, 0, 8, 34, 24) }); body.push({ geo:G.box, color:hair, m:M(24, 116, -4, 0, 0, 0, 8, 34, 24) }); }
    if (H === 2){ body.push({ geo:G.sphereLo, color:hair, m:M(0, 138, -26, 0, 0, 0, 9, 9, 9) }); body.push({ geo:G.capsule, color:hair, m:M(0, 118, -32, .3, 0, 0, 7, 22, 7) }); }
    if (H === 3) body.push({ geo:G.sphere, color:hair, m:M(0, 156, -12, 0, 0, 0, 13, 12, 13) });
    if (H === 4) body.push({ geo:G.box, color:hair, m:M(10, 146, 17, .5, 0, -.3, 22, 6, 10) });
  }
  // Phụ kiện
  if (look.a === 'glasses'){
    body.push({ geo:G.torus, color:DARK, m:M(-9, 129, 26, 0, 0, 0, 6.5, 6, 6) });
    body.push({ geo:G.torus, color:DARK, m:M(9, 129, 26, 0, 0, 0, 6.5, 6, 6) });
    body.push({ geo:G.box, color:DARK, m:M(0, 130, 26.5, 0, 0, 0, 5, 1.2, 1.2) });
  } else if (look.a === 'headset'){
    body.push({ geo:G.arc, color:'#2b2f38', m:M(0, 132, 0, 0, 0, 0, 30, 30, 20) });
    body.push({ geo:G.cyl, color:'#2b2f38', m:M(-28, 127, 0, 0, 0, Math.PI / 2, 8, 6, 8) });
    body.push({ geo:G.cyl, color:'#2b2f38', m:M(28, 127, 0, 0, 0, Math.PI / 2, 8, 6, 8) });
    body.push({ geo:G.cyl, color:'#2b2f38', m:M(-20, 118, 16, 1.1, .6, 0, 1.4, 22, 1.4) });
    body.push({ geo:G.sphereLo, color:'#0582D4', m:M(-12, 113, 24, 0, 0, 0, 3, 3, 3) });
  } else if (look.a === 'cap'){
    body.push({ geo:G.cap(.5), color:top, m:M(0, 133, -1, -.1, 0, 0, 29, 24, 28.5) });
    body.push({ geo:G.box, color:top, m:M(0, 140, 26, .12, 0, 0, 30, 2.5, 22) });
    body.push({ geo:G.sphereLo, color:'#ffffff', m:M(0, 157, -1, 0, 0, 0, 3, 3, 3) });
  }
  // Tay (quanh khớp vai) và chân (quanh khớp hông)
  const arm = [
    { geo:G.capsule, color:top, m:M(0, -12, 0, 0, 0, 0, 6.5, 10, 6.5) },
    { geo:G.capsule, color:skin, m:M(0, -30, 0, 0, 0, 0, 5.2, 7, 5.2) },
    { geo:G.sphereLo, color:skin, m:M(0, -40, 1, 0, 0, 0, 6, 6, 6) }
  ];
  const leg = [
    { geo:G.capsule, color:PANTS, m:M(0, -22, 0, 0, 0, 0, 7.5, 14, 8) },
    { geo:G.box, color:SHOE, m:M(0, -46, 4, 0, 0, 0, 14, 8, 22) },
    { geo:G.box, color:'#0582D4', m:M(0, -49.5, 4, 0, 0, 0, 14.4, 1.6, 22.4) }
  ];
  return { body: mergeColored(body), arm: mergeColored(arm), leg: mergeColored(leg), torsoW: wTorso };
}
function SHOEPOCKET(c){ const k = new THREE.Color(c); k.multiplyScalar(.82); return '#' + k.getHexString(); }

/* ---------- Nhãn tên / bong bóng (sprite vẽ canvas) ---------- */
const FONT = '"Be Vietnam Pro", system-ui, Arial, sans-serif';
export function textSprite(text, { bg = 'rgba(15,30,45,.82)', fg = '#fff', size = 30, h = 22, pad = 18, border = null } = {}){
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `800 ${size}px ${FONT}`;
  const w = Math.ceil(g.measureText(text).width) + pad * 2, hh = size + 20;
  c.width = w; c.height = hh;
  g.font = `800 ${size}px ${FONT}`;
  const r = hh / 2;
  g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, hh, r); g.arcTo(w, hh, 0, hh, r); g.arcTo(0, hh, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath();
  g.fillStyle = bg; g.fill();
  if (border){ g.lineWidth = 4; g.strokeStyle = border; g.stroke(); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, hh / 2 + 1);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest:false, transparent:true }));
  sp.scale.set(h * w / hh, h, 1); sp.renderOrder = 10;
  return sp;
}

/* Bóng tròn dưới chân (dùng chung) */
let shadowTex = null;
function blobShadow(){
  if (!shadowTex){
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), new THREE.MeshBasicMaterial({ map: shadowTex, transparent:true, depthWrite:false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.6;
  return m;
}

/* ---------- Nhân vật ---------- */
export class Avatar {
  constructor(lookStr, nick, isMe = false){
    this.look = parseLook(lookStr);
    this.group = new THREE.Group();
    this.rig = new THREE.Group(); this.group.add(this.rig);
    const parts = buildParts(this.look);
    this.parts = parts;
    this.body = new THREE.Mesh(parts.body, SHARED_MAT); this.rig.add(this.body);
    const sx = 26 * parts.torsoW;
    this.armL = new THREE.Group(); this.armL.position.set(-sx, 94, 0); this.armL.add(new THREE.Mesh(parts.arm, SHARED_MAT));
    this.armR = new THREE.Group(); this.armR.position.set(sx, 94, 0); this.armR.add(new THREE.Mesh(parts.arm, SHARED_MAT));
    this.legL = new THREE.Group(); this.legL.position.set(-10, 52, 0); this.legL.add(new THREE.Mesh(parts.leg, SHARED_MAT));
    this.legR = new THREE.Group(); this.legR.position.set(10, 52, 0); this.legR.add(new THREE.Mesh(parts.leg, SHARED_MAT));
    this.rig.add(this.armL, this.armR, this.legL, this.legR);
    this.group.add(blobShadow());
    this.name = textSprite(nick, isMe ? { bg:'#ffcf3a', fg:'#3a2400', border:'#ffffff' } : {});
    this.name.position.y = 178; this.group.add(this.name);
    this.phase = Math.random() * 6; this.heading = 0; this.emote = null; this.emoteText = '';
    this.stars = null; this.shield = null;
  }
  /** Nhân vật ở xa: gộp thân + tay + chân thành 1 lưới (1 lệnh vẽ thay vì 5), không đung đưa tay chân. */
  setFar(far){
    if (this.far === far) return;
    this.far = far;
    if (far && !this.low){
      const list = [{ geo:this.parts.body, m:new THREE.Matrix4() }];
      for (const g of [this.armL, this.armR, this.legL, this.legR]) list.push({ geo:g.children[0].geometry, m:new THREE.Matrix4().makeTranslation(g.position.x, g.position.y, g.position.z) });
      this.low = new THREE.Mesh(mergeKeepColors(list), SHARED_MAT); this.rig.add(this.low);
    }
    this.body.visible = this.armL.visible = this.armR.visible = this.legL.visible = this.legR.visible = !far;
    if (this.low) this.low.visible = far;
  }
  setEmote(text){
    if (this.emoteText === text) return;
    if (this.emote){ this.group.remove(this.emote); this.emote.material.map.dispose(); this.emote.material.dispose(); this.emote = null; }
    this.emoteText = text;
    if (text){ this.emote = textSprite(text, { bg:'#ffffff', fg:'#0F1E2D', size:30, h:26, border:'#d0dae6' }); this.emote.position.y = 210; this.group.add(this.emote); }
  }
  /** Cập nhật mỗi khung hình. s: { moving, dirX, dirY, stunned, shielded, waving, cheering } */
  update(dt, t, s){
    // Quay mặt theo hướng đi (xoay mượt)
    if (s.moving && (s.dirX || s.dirY)){
      const want = Math.atan2(s.dirX, s.dirY);
      let d = want - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 12);
    }
    this.rig.rotation.y = this.heading;
    const sp = s.moving && !s.stunned ? 1 : 0;
    this.phase += dt * (sp ? 11 : 2);
    const swing = Math.sin(this.phase) * 0.65 * sp;
    this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * .8; this.armR.rotation.x = swing * .8;
    this.armL.rotation.z = 0.08; this.armR.rotation.z = -0.08;
    let y = sp ? Math.abs(Math.sin(this.phase)) * 4 : Math.sin(t / 600) * 0.8;
    if (s.waving){ this.armR.rotation.z = -2.6 + Math.sin(t / 90) * .35; this.armR.rotation.x = 0; }
    if (s.cheering){ y += Math.abs(Math.sin(t / 130)) * 26; this.armL.rotation.z = 2.7; this.armR.rotation.z = -2.7; }
    this.rig.position.y = y;
    this.rig.rotation.z = s.stunned ? Math.sin(t / 120) * .12 : 0;
    // Sao xoay khi bị DDoS
    if (s.stunned && !this.stars){
      this.stars = new THREE.Group();
      const m = new THREE.MeshBasicMaterial({ color:'#ffe27a' });
      for (let i = 0; i < 3; i++){ const st = new THREE.Mesh(new THREE.OctahedronGeometry(6), m); st.position.set(Math.cos(i * 2.1) * 26, 0, Math.sin(i * 2.1) * 26); this.stars.add(st); }
      this.stars.position.y = 166; this.group.add(this.stars);
    }
    if (this.stars){ this.stars.visible = !!s.stunned; this.stars.rotation.y = t / 250; }
    // Khiên OneShield
    if (s.shielded && !this.shield){
      this.shield = new THREE.Mesh(new THREE.SphereGeometry(62, 18, 12), new THREE.MeshBasicMaterial({ color:'#3ea0ff', transparent:true, opacity:.18, depthWrite:false }));
      this.shield.position.y = 80; this.group.add(this.shield);
    }
    if (this.shield){ this.shield.visible = !!s.shielded; this.shield.scale.setScalar(1 + Math.sin(t / 200) * .03); }
  }
  dispose(){
    this.parts.body.dispose(); this.parts.arm.dispose(); this.parts.leg.dispose();
    if (this.low) this.low.geometry.dispose();
    this.name.material.map.dispose(); this.name.material.dispose();
    this.setEmote('');
  }
}

/* ---------- Khung xem trước nhân vật (màn phối đồ) ---------- */
export function createPreview(canvas){
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9b79c', 2.2));
  const dl = new THREE.DirectionalLight('#fff4e6', 1.6); dl.position.set(120, 260, 260); scene.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 1, 10, 2000);
  cam.position.set(0, 120, 420); cam.lookAt(0, 88, 0);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(70, 76, 8, 40), new THREE.MeshLambertMaterial({ color:'#d7e6f7' }));
  disc.position.y = -4; scene.add(disc);
  let av = null, raf = 0, last = performance.now(), spin = 0.5, alive = true;
  function setLook(str){
    if (av){ scene.remove(av.group); av.dispose(); }
    av = new Avatar(str, ' ', false); av.name.visible = false; scene.add(av.group);
  }
  function loop(t){
    if (!alive) return;
    const dt = Math.min(.05, (t - last) / 1000); last = t;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())){ renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    if (av){ av.group.rotation.y += dt * spin; av.update(dt, t, { moving:false, waving: (t % 4000) < 1300 }); }
    renderer.render(scene, cam);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return { setLook, dispose(){ alive = false; cancelAnimationFrame(raf); renderer.dispose(); } };
}
