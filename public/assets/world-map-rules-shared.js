/* =============================================================================
 * iNET Tech Office — luật bản đồ DÙNG CHUNG cho máy chủ (Node) và trình duyệt (3D + 2D dự phòng)
 * Mặt bằng văn phòng 4000 × 2600 đơn vị (≈ 40 m × 26 m, 1 đơn vị ≈ 1 cm) — mở rộng cho sảnh 150 người:
 *   - Lễ tân + tường logo iNET (cửa vào phía dưới)   - Phòng máy chủ kính (giữa phía trên) = khu Cloud/VPS
 *   - 8 cụm bàn làm việc mở                          - 2 phòng họp kính (OneShield, OnePanel)
 *   - Pantry + lounge (dưới trái), góc thư giãn       - Atrium giữa: bục Siêu Deal + màn LED
 *   - 4 quầy: Tên miền (trên trái), Hosting (trên phải), Bảo mật SSL (giữa trái), CSKH Email (giữa phải)
 *   - 6 điểm giấu manh mối mật thư cấp 3
 * Node: require('../public/assets/world-map-rules-shared.js') · Browser: window.WorldRules
 * ============================================================================= */
(function (root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WorldRules = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  const W = 4000, H = 2600;
  const WALL_Y = 140;                 // tường sau (phía trên bản đồ)
  const MARGIN = 70;
  const SPEED = 300;                  // tốc độ đi bộ (đơn vị/giây) — sảnh rộng hơn nên đi nhanh hơn chút
  const FOOT_R = 16;
  const PICK_R = 62;                  // tới gần hộp trong bán kính này là nhặt
  const BUG_R = 48;
  const BUG_SPEED = 120;
  const CLUE_R = 110;                 // đứng gần điểm manh mối trong bán kính này là đọc được
  const AOI_R = 1150;                 // bán kính "vùng quan tâm" (màn hình thấy ~1500×1000 quanh mình): chỉ nhận vị trí người trong vùng này thường xuyên

  // 5 khu dịch vụ: vị trí nhân viên đứng quầy (hộp quà rơi quanh đây)
  const BOOTHS = {
    domain:  { x: 560,  y: 420 },
    hosting: { x: 3440, y: 420 },
    vps:     { x: 2000, y: 520 },     // trước vách kính phòng máy chủ
    ssl:     { x: 400,  y: 1450 },
    email:   { x: 3600, y: 1450 }
  };
  const ZONE_NAMES = { domain:'Tên miền', hosting:'Hosting', vps:'Cloud · Phòng máy chủ', ssl:'Bảo mật SSL', email:'CSKH · Email' };
  const STAGE = { x: 2000, y: 1350, r: 200 };  // atrium + bục Siêu Deal
  const SPAWN = { x: 2000, y: 2500 };          // cửa vào

  // Vật cản (hình chữ nhật trên mặt sàn). kind dùng để dựng mô hình 3D tương ứng.
  const OBSTACLES = [];
  ['domain', 'hosting', 'ssl', 'email'].forEach(id => {
    const b = BOOTHS[id];
    OBSTACLES.push({ x: b.x - 125, y: b.y - 8, w: 250, h: 60, kind:'counter', id });
  });
  OBSTACLES.push(
    { x: 1600, y: WALL_Y, w: 800, h: 280, kind:'serverroom', id:'vps' },
    // Lễ tân + tường logo đặt lệch phải lối vào → từ cửa nhìn thẳng thảm xanh tới bục Siêu Deal
    { x: 2280, y: 2330,   w: 280, h: 64,  kind:'reception' },
    { x: 2250, y: 2250,   w: 340, h: 24,  kind:'logowall' },
    { x: 700,  y: 800,    w: 300, h: 130, kind:'desks' }, { x: 1250, y: 800,  w: 300, h: 130, kind:'desks' },
    { x: 2450, y: 800,    w: 300, h: 130, kind:'desks' }, { x: 3000, y: 800,  w: 300, h: 130, kind:'desks' },
    { x: 1050, y: 1750,   w: 300, h: 130, kind:'desks' }, { x: 2650, y: 1750, w: 300, h: 130, kind:'desks' },
    { x: 3100, y: 2100,   w: 540, h: 330, kind:'meeting', name:'Phòng họp OneShield' },
    { x: 360,  y: 2100,   w: 540, h: 330, kind:'meeting', name:'Phòng họp OnePanel' },
    { x: 1000, y: 2460,   w: 440, h: 76,  kind:'pantry' },
    { x: 560,  y: 1880,   w: 300, h: 66,  kind:'sofa' },
    { x: 1250, y: 2250,   w: 70,  h: 70,  kind:'beanbag' }, { x: 1340, y: 2300, w: 70, h: 70, kind:'beanbag' },
    { x: 2700, y: 2440,   w: 90,  h: 40,  kind:'water' },
    { x: 1600, y: 1120,   w: 44,  h: 44,  kind:'pillar' }, { x: 2356, y: 1120, w: 44, h: 44, kind:'pillar' },
    { x: 1600, y: 1600,   w: 44,  h: 44,  kind:'pillar' }, { x: 2356, y: 1600, w: 44, h: 44, kind:'pillar' },
    { x: 90,   y: 170,    w: 80,  h: 70,  kind:'plant' },  { x: 3830, y: 170,  w: 80, h: 70, kind:'plant' },
    { x: 90,   y: 1200,   w: 80,  h: 70,  kind:'plant' },  { x: 3830, y: 1200, w: 80, h: 70, kind:'plant' },
    { x: 1500, y: 2440,   w: 70,  h: 70,  kind:'plant' },  { x: 2620, y: 2440, w: 70, h: 70, kind:'plant' },
    { x: 1150, y: 1100,   w: 60,  h: 60,  kind:'plant' },  { x: 2800, y: 1100, w: 60, h: 60, kind:'plant' }
  );

  // Điểm giấu manh mối mật thư cấp 3 (đề sẽ chỉ định 2–3 điểm trong số này)
  const CLUE_SPOTS = {
    pantry:    { x: 1220, y: 2380, name:'Bảng ghim Pantry' },
    server:    { x: 2000, y: 480,  name:'Vách kính phòng máy chủ' },
    reception: { x: 2330, y: 2450, name:'Quầy lễ tân' },
    meeting:   { x: 3050, y: 2200, name:'Cửa phòng họp OneShield' },
    lounge:    { x: 760,  y: 2000, name:'Góc sofa thư giãn' },
    atrium:    { x: 2000, y: 1040, name:'Dưới màn LED atrium' }
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
      const a = rand() * Math.PI * 2, d = 170 + rand() * 380;
      const p = clampWalkable(b.x + Math.cos(a) * d, b.y + 100 + Math.sin(a) * d * 0.8);
      if (!blocked(p.x, p.y)) return p;
    }
    return randomWalkable(rand);
  }
  function spawnPoint(rand = Math.random){
    for (let i = 0; i < 20; i++){
      const p = { x: SPAWN.x + (rand() - .5) * 400, y: SPAWN.y - rand() * 60 };
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

  return { W, H, WALL_Y, MARGIN, SPEED, FOOT_R, PICK_R, BUG_R, BUG_SPEED, CLUE_R, AOI_R,
           BOOTHS, ZONE_NAMES, STAGE, SPAWN, OBSTACLES, CLUE_SPOTS,
           blocked, moveWithCollision, moveSteppedWithCollision, clampWalkable, randomWalkable, dropPointNearBooth, spawnPoint, stepBug, dist2 };
});
