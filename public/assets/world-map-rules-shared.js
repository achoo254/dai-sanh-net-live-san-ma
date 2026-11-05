/* =============================================================================
 * iNET Tech Office — luật bản đồ DÙNG CHUNG cho máy chủ (Node) và trình duyệt (3D + 2D dự phòng)
 * Mặt bằng văn phòng công ty công nghệ 2400 × 1500 đơn vị (≈ 24 m × 15 m, 1 đơn vị ≈ 1 cm):
 *   - Lễ tân + tường logo iNET (cửa vào phía dưới)   - Phòng máy chủ kính (giữa phía trên) = khu Cloud/VPS
 *   - 4 cụm bàn làm việc mở                          - Phòng họp kính (dưới phải)
 *   - Pantry + sofa (dưới trái)                      - Atrium giữa: bục Siêu Deal + màn LED treo
 *   - 4 quầy: Tên miền, Hosting, Bảo mật SSL, CSKH Email
 *   - 6 điểm giấu manh mối mật thư cấp 3
 * Node: require('../public/assets/world-map-rules-shared.js') · Browser: window.WorldRules
 * ============================================================================= */
(function (root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WorldRules = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  const W = 2400, H = 1500;
  const WALL_Y = 120;                 // tường sau (phía trên bản đồ)
  const MARGIN = 60;
  const SPEED = 280;                  // tốc độ đi bộ (đơn vị/giây)
  const FOOT_R = 16;
  const PICK_R = 58;                  // tới gần hộp trong bán kính này là nhặt
  const BUG_R = 46;
  const BUG_SPEED = 110;
  const CLUE_R = 95;                  // đứng gần điểm manh mối trong bán kính này là đọc được

  // 5 khu dịch vụ: vị trí nhân viên đứng quầy (hộp quà rơi quanh đây)
  const BOOTHS = {
    domain:  { x: 420,  y: 330 },
    hosting: { x: 1980, y: 330 },
    vps:     { x: 1200, y: 400 },     // trước vách kính phòng máy chủ
    ssl:     { x: 330,  y: 820 },
    email:   { x: 2070, y: 820 }
  };
  const ZONE_NAMES = { domain:'Tên miền', hosting:'Hosting', vps:'Cloud · Phòng máy chủ', ssl:'Bảo mật SSL', email:'CSKH · Email' };
  const STAGE = { x: 1200, y: 800, r: 150 };   // atrium + bục Siêu Deal
  const SPAWN = { x: 1200, y: 1410 };          // cửa vào

  // Vật cản (hình chữ nhật trên mặt sàn). kind dùng để dựng mô hình 3D tương ứng.
  const OBSTACLES = [];
  ['domain', 'hosting', 'ssl', 'email'].forEach(id => {
    const b = BOOTHS[id];
    OBSTACLES.push({ x: b.x - 115, y: b.y - 8, w: 230, h: 58, kind:'counter', id });
  });
  OBSTACLES.push(
    { x: 950,  y: WALL_Y, w: 500, h: 210, kind:'serverroom', id:'vps' },
    { x: 860,  y: 1250,   w: 220, h: 60,  kind:'reception' },
    { x: 840,  y: 1180,   w: 260, h: 22,  kind:'logowall' },
    { x: 620,  y: 520,    w: 280, h: 120, kind:'desks' },
    { x: 1500, y: 520,    w: 280, h: 120, kind:'desks' },
    { x: 620,  y: 1000,   w: 280, h: 120, kind:'desks' },
    { x: 1500, y: 1000,   w: 280, h: 120, kind:'desks' },
    { x: 1720, y: 1180,   w: 420, h: 220, kind:'meeting', name:'Phòng họp OneShield' },
    { x: 180,  y: 1360,   w: 340, h: 70,  kind:'pantry' },
    { x: 260,  y: 1150,   w: 260, h: 64,  kind:'sofa' },
    { x: 80,   y: 150,    w: 80,  h: 70,  kind:'plant' },
    { x: 2240, y: 150,    w: 80,  h: 70,  kind:'plant' },
    { x: 80,   y: 1020,   w: 80,  h: 70,  kind:'plant' },
    { x: 2240, y: 1020,   w: 80,  h: 70,  kind:'plant' },
    { x: 1500, y: 1330,   w: 70,  h: 70,  kind:'plant' }
  );

  // Điểm giấu manh mối mật thư cấp 3 (đề sẽ chỉ định 2–3 điểm trong số này)
  const CLUE_SPOTS = {
    pantry:    { x: 350,  y: 1300, name:'Bảng ghim Pantry' },
    server:    { x: 1200, y: 365,  name:'Vách kính phòng máy chủ' },
    reception: { x: 1160, y: 1290, name:'Quầy lễ tân' },
    meeting:   { x: 1670, y: 1290, name:'Cửa phòng họp OneShield' },
    lounge:    { x: 600,  y: 1180, name:'Góc sofa thư giãn' },
    atrium:    { x: 1200, y: 600,  name:'Dưới màn LED atrium' }
  };

  function blocked(x, y){
    if (x < MARGIN || x > W - MARGIN || y < WALL_Y || y > H - MARGIN) return true;
    for (const o of OBSTACLES){
      if (x > o.x - FOOT_R && x < o.x + o.w + FOOT_R && y > o.y - FOOT_R && y < o.y + o.h + FOOT_R) return true;
    }
    return false;
  }
  function moveWithCollision(x, y, dx, dy){
    const nx = x + dx, ny = y + dy;
    if (!blocked(nx, ny)) return { x: nx, y: ny };
    if (!blocked(nx, y)) return { x: nx, y };
    if (!blocked(x, ny)) return { x, y: ny };
    return { x, y };
  }
  /** Chia nhỏ bước (≤ maxStep) → không thể "nhảy xuyên" vật cản mỏng. */
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
    return { x: Math.min(W - MARGIN - 1, Math.max(MARGIN + 1, x)), y: Math.min(H - MARGIN - 1, Math.max(WALL_Y + 1, y)) };
  }
  function randomWalkable(rand = Math.random){
    for (let i = 0; i < 60; i++){
      const x = MARGIN + rand() * (W - 2 * MARGIN), y = WALL_Y + rand() * (H - WALL_Y - MARGIN);
      if (!blocked(x, y)) return { x, y };
    }
    return { x: SPAWN.x, y: SPAWN.y - 100 };
  }
  function dropPointNearBooth(id, rand = Math.random){
    const b = BOOTHS[id] || STAGE;
    for (let i = 0; i < 40; i++){
      const a = rand() * Math.PI * 2, d = 140 + rand() * 300;
      const p = clampWalkable(b.x + Math.cos(a) * d, b.y + 90 + Math.sin(a) * d * 0.8);
      if (!blocked(p.x, p.y)) return p;
    }
    return randomWalkable(rand);
  }
  function spawnPoint(rand = Math.random){
    for (let i = 0; i < 20; i++){
      const p = { x: SPAWN.x + (rand() - .5) * 300, y: SPAWN.y - rand() * 60 };
      if (!blocked(p.x, p.y)) return p;
    }
    return { x: SPAWN.x, y: SPAWN.y };
  }
  function stepBug(bug, dt, rand = Math.random){
    bug.turnIn -= dt;
    if (bug.turnIn <= 0){ bug.a = rand() * Math.PI * 2; bug.turnIn = 1.5 + rand() * 2.5; }
    const nx = bug.x + Math.cos(bug.a) * BUG_SPEED * dt, ny = bug.y + Math.sin(bug.a) * BUG_SPEED * dt;
    if (blocked(nx, ny)){ bug.a = rand() * Math.PI * 2; return; }
    bug.x = nx; bug.y = ny;
  }
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  return { W, H, WALL_Y, MARGIN, SPEED, FOOT_R, PICK_R, BUG_R, BUG_SPEED, CLUE_R,
           BOOTHS, ZONE_NAMES, STAGE, SPAWN, OBSTACLES, CLUE_SPOTS,
           blocked, moveWithCollision, moveSteppedWithCollision, clampWalkable, randomWalkable, dropPointNearBooth, spawnPoint, stepBug, dist2 };
});
