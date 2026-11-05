/* =============================================================================
 * Đại Sảnh Nét Online — luật bản đồ DÙNG CHUNG cho máy chủ (Node) và trình duyệt
 * - Kích thước sảnh, quầy dịch vụ, bục Siêu Deal, cửa vào, vật cản
 * - Va chạm (đi trượt theo tường/vật cản), chọn điểm rơi hộp, bọ DDoS đi lang thang
 * Node:    const W = require('../public/assets/world-map-rules-shared.js')
 * Browser: window.WorldRules
 * ============================================================================= */
(function (root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WorldRules = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  const W = 2400, H = 1500;           // kích thước sảnh (đơn vị thế giới ~ px)
  const WALL_Y = 300;                 // phần tường phía trên, không đi được
  const MARGIN = 40;
  const SPEED = 280;                  // tốc độ đi bộ (đơn vị/giây)
  const FOOT_R = 16;                  // bán kính "chân" nhân vật khi va chạm
  const PICK_R = 58;                  // tới gần hộp trong bán kính này là nhặt
  const BUG_R = 46;                   // đụng bọ DDoS trong bán kính này là bị đơ
  const BUG_SPEED = 110;

  // 5 quầy dịch vụ (vị trí chân bé Nét đứng quầy)
  const BOOTHS = {
    domain:  { x: 360,  y: 610 },
    hosting: { x: 2040, y: 610 },
    email:   { x: 1200, y: 560 },
    vps:     { x: 360,  y: 1190 },
    ssl:     { x: 2040, y: 1190 }
  };
  const STAGE = { x: 1200, y: 920, r: 150 };   // bục Siêu Deal giữa sảnh
  const SPAWN = { x: 1200, y: 1400 };          // cửa vào

  // Vật cản: quầy (mặt bàn) + chậu cây góc
  const OBSTACLES = [];
  for (const id in BOOTHS){
    const b = BOOTHS[id];
    OBSTACLES.push({ x: b.x - 115, y: b.y - 8, w: 230, h: 58, kind:'counter', id });
  }
  [[60, 330], [2260, 330], [60, 1380], [2260, 1380]].forEach(([x, y]) => OBSTACLES.push({ x, y, w: 80, h: 70, kind:'plant' }));

  function blocked(x, y){
    if (x < MARGIN || x > W - MARGIN || y < WALL_Y || y > H - MARGIN) return true;
    for (const o of OBSTACLES){
      if (x > o.x - FOOT_R && x < o.x + o.w + FOOT_R && y > o.y - FOOT_R && y < o.y + o.h + FOOT_R) return true;
    }
    return false;
  }
  /** Đi từ (x,y) thêm (dx,dy), trượt theo trục khi vướng vật cản. */
  function moveWithCollision(x, y, dx, dy){
    let nx = x + dx, ny = y + dy;
    if (!blocked(nx, ny)) return { x: nx, y: ny };
    if (!blocked(nx, y)) return { x: nx, y };
    if (!blocked(x, ny)) return { x, y: ny };
    return { x, y };
  }
  /** Như moveWithCollision nhưng chia nhỏ bước (≤ maxStep) → không thể "nhảy xuyên" qua quầy/vật cản mỏng. */
  function moveSteppedWithCollision(x, y, dx, dy, maxStep = 16){
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / maxStep));
    let p = { x, y };
    for (let i = 0; i < n; i++){
      const q = moveWithCollision(p.x, p.y, dx / n, dy / n);
      if (q.x === p.x && q.y === p.y) break;
      p = q;
    }
    return p;
  }
  function clampWalkable(x, y){
    x = Math.min(W - MARGIN - 1, Math.max(MARGIN + 1, x));
    y = Math.min(H - MARGIN - 1, Math.max(WALL_Y + 1, y));
    return { x, y };
  }
  function randomWalkable(rand = Math.random){
    for (let i = 0; i < 50; i++){
      const x = MARGIN + rand() * (W - 2 * MARGIN), y = WALL_Y + rand() * (H - WALL_Y - MARGIN);
      if (!blocked(x, y)) return { x, y };
    }
    return { x: SPAWN.x, y: SPAWN.y - 100 };
  }
  /** Điểm rơi hộp quà gần quầy dịch vụ (vòng 150–430 đơn vị quanh quầy). */
  function dropPointNearBooth(id, rand = Math.random){
    const b = BOOTHS[id] || STAGE;
    for (let i = 0; i < 30; i++){
      const a = rand() * Math.PI * 2, d = 150 + rand() * 280;
      const p = clampWalkable(b.x + Math.cos(a) * d, b.y + 60 + Math.sin(a) * d * 0.75);
      if (!blocked(p.x, p.y)) return p;
    }
    return randomWalkable(rand);
  }
  function spawnPoint(rand = Math.random){
    for (let i = 0; i < 20; i++){
      const p = { x: SPAWN.x + (rand() - .5) * 360, y: SPAWN.y - rand() * 80 };
      if (!blocked(p.x, p.y)) return p;
    }
    return { x: SPAWN.x, y: SPAWN.y };
  }
  /** Bước đi của 1 con bọ DDoS (lang thang, đổi hướng khi vướng). */
  function stepBug(bug, dt, rand = Math.random){
    bug.turnIn -= dt;
    if (bug.turnIn <= 0){ bug.a = rand() * Math.PI * 2; bug.turnIn = 1.5 + rand() * 2.5; }
    const nx = bug.x + Math.cos(bug.a) * BUG_SPEED * dt, ny = bug.y + Math.sin(bug.a) * BUG_SPEED * dt;
    if (blocked(nx, ny)){ bug.a = rand() * Math.PI * 2; return; }
    bug.x = nx; bug.y = ny;
  }
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  return { W, H, WALL_Y, MARGIN, SPEED, FOOT_R, PICK_R, BUG_R, BUG_SPEED, BOOTHS, STAGE, SPAWN, OBSTACLES,
           blocked, moveWithCollision, moveSteppedWithCollision, clampWalkable, randomWalkable, dropPointNearBooth, spawnPoint, stepBug, dist2 };
});
