/* =============================================================================
 * Một sảnh "Đại Sảnh Nét Online" (tối đa cfg.roomCap người)
 * - Mỗi người 1 nhân vật; trình duyệt gửi vị trí, MÁY CHỦ kiểm tra tốc độ (chống tốc biến) + vật cản
 * - Hộp quà rơi quanh quầy dịch vụ, Siêu Deal ở bục giữa, khiên ngẫu nhiên; ai ĐI TỚI trước thì nhặt
 *   (thứ tự = thứ tự máy chủ nhận vị trí, đơn luồng → công bằng)
 * - Bọ DDoS đi lang thang, đụng phải bị đơ
 * - Ảnh chụp vị trí gửi 6 lần/giây, chỉ gồm người vừa di chuyển
 * ============================================================================= */
'use strict';
const WR = require('../public/assets/world-map-rules-shared.js');

const SERVICES = ['domain', 'hosting', 'vps', 'ssl', 'email'];
const TICK_MS = 66, SNAP_EVERY = 3;
// Quỹ quãng đường dự phòng (giây đi bộ). Phải NHỎ: quỹ này đầy lên khi đứng chờ, kẻ gian lận dùng nó "nhảy" lên trước
// lúc hộp vừa rơi (đo được: quỹ 0,3s → bot gian lận thắng 89% cuộc đua 1 suất). 0,15s ≈ 42 đơn vị, chỉ hơn 1 gói vị trí.
const BURST_SEC = 0.15;            // 15 nhịp/giây, gửi ảnh chụp mỗi 3 nhịp (~5–6 lần/giây)
const lerp = (a, b, t) => a + (b - a) * t;
const r1 = v => Math.round(v);

class Room {
  constructor(id, hub){
    this.id = id; this.hub = hub; this.cfg = hub.cfg;
    this.members = new Set();
    this.drops = new Map(); this.bugs = [];
    this.seq = 0; this.ridSeq = 0; this.tickN = 0;
    this.timers = []; this.live = null; this.shieldSpawns = 0;
    this.loop = setInterval(() => this.tick(), TICK_MS);
  }
  get size(){ return this.members.size; }
  destroy(){ this.stopLive(); clearInterval(this.loop); }

  broadcast(obj, except){
    const s = JSON.stringify(obj);
    for (const p of this.members) if (p !== except) p.sendRaw(s);
  }
  pub(p){ return [p.rid, p.nick, p.avatar, r1(p.x), r1(p.y)]; }
  roster(){ return [...this.members].map(p => this.pub(p)); }

  add(p){
    p.rid = ++this.ridSeq;
    if (typeof p.x !== 'number' || WR.blocked(p.x, p.y)){ const s = WR.spawnPoint(); p.x = s.x; p.y = s.y; }
    p.budget = WR.SPEED * BURST_SEC; p.lastMv = Date.now(); p.moved = false; p.lastEmo = 0; p.bugSafeUntil = 0;
    this.members.add(p); p.room = this;
    this.broadcast({ t:'join', p: this.pub(p) }, p);
  }
  remove(p){
    if (!this.members.delete(p)) return;
    if (p.room === this) p.room = null;
    this.broadcast({ t:'leave', id: p.rid });
  }

  /* ---------- Di chuyển (chống tốc biến) ---------- */
  move(p, x, y){
    const now = Date.now();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const dt = Math.min(1, (now - p.lastMv) / 1000); p.lastMv = now;
    // "Ngân sách quãng đường": hồi ĐÚNG bằng tốc độ đi bộ theo đồng hồ máy chủ (không cộng % dư — dư 5% đo được
    // đủ để bot gian lận đi trước 1 nhịp mỗi cuộc đua), quỹ dự phòng tối đa BURST_SEC.
    // KHÔNG cộng dung sai theo từng gói (gửi dày không đi nhanh hơn được).
    p.budget = Math.min(WR.SPEED * BURST_SEC, p.budget + WR.SPEED * dt);
    if (p.stunUntil > now){ p.reply({ t:'pos', x: r1(p.x), y: r1(p.y) }); return; }
    let dx = x - p.x, dy = y - p.y;
    const d = Math.hypot(dx, dy), allow = p.budget;
    if (d > allow){ const k = allow / d; dx *= k; dy *= k; }
    const n = WR.moveSteppedWithCollision(p.x, p.y, dx, dy);      // kiểm tra va chạm trên cả đường đi, không chỉ điểm đến
    // Lệch nhỏ (mạng chập chờn) thì để máy chủ tự đuổi kịp, không bắt người chơi giật lùi; vị trí máy chủ vẫn là chuẩn để nhặt hộp
    const corrected = Math.hypot(n.x - x, n.y - y) > 24;
    p.budget = Math.max(0, p.budget - Math.hypot(n.x - p.x, n.y - p.y));
    if (n.x !== p.x || n.y !== p.y){ p.x = n.x; p.y = n.y; p.moved = true; }
    if (corrected) p.reply({ t:'pos', x: r1(p.x), y: r1(p.y) });
    if (this.live) this.checkPickups(p, now);
  }
  emote(p, i){
    const now = Date.now();
    if (!Number.isInteger(i) || i < 0 || i > 5 || now - p.lastEmo < 1500) return;
    p.lastEmo = now;
    this.broadcast({ t:'emo', id: p.rid, i });
  }

  /* ---------- Phiên live ---------- */
  startLive(session){
    this.stopLive();
    this.live = session; this.shieldSpawns = 0;
    const dur = session.end - session.start, now = Date.now();
    for (const f of this.cfg.superAtFractions){
      const at = session.start + dur * f - now;
      if (at - this.cfg.superWarnMs > 0) this.later(at - this.cfg.superWarnMs, () => this.broadcast({ t:'super_soon', ms: this.cfg.superWarnMs }));
      if (at > 0) this.later(at, () => this.spawnSuper());
    }
    this.resizeBugs();
    this.scheduleNext(500);
  }
  stopLive(){
    this.timers.forEach(clearTimeout); this.timers = [];
    if (this.drops.size || this.bugs.length) this.broadcast({ t:'clear' });
    this.drops.clear(); this.bugs = []; this.live = null;
  }
  later(ms, fn){ const t = setTimeout(fn, ms); this.timers.push(t); return t; }
  progress(){ return this.live ? Math.min(1, Math.max(0, (Date.now() - this.live.start) / (this.live.end - this.live.start))) : 0; }
  scheduleNext(ms){
    this.later(ms, () => {
      if (!this.live) return;
      this.spawn();
      const [a, b] = this.cfg.dropEveryMs;
      this.scheduleNext(lerp(a, b, this.progress()) * (0.85 + Math.random() * 0.3));
    });
  }
  resizeBugs(){
    const want = Math.min(this.cfg.bugMax, this.cfg.bugBase + Math.floor(this.size / 25));
    while (this.bugs.length < want){
      let p; do { p = WR.randomWalkable(); } while (WR.dist2(p, WR.SPAWN) < 400 ** 2);
      this.bugs.push({ id: this.bugs.length + 1, x: p.x, y: p.y, a: Math.random() * 6.28, turnIn: 1 });
    }
  }
  slotsForGift(){ return Math.max(1, Math.min(this.cfg.slotMax, Math.ceil(this.size * this.cfg.slotRatio))); }

  spawn(){
    if (!this.size) return;
    if (this.drops.size >= this.cfg.maxActiveDrops) return;
    const r = Math.random();
    if (r < 0.06 && this.shieldSpawns < 3){
      this.shieldSpawns++;
      const p = WR.randomWalkable();
      return this.addDrop({ kind:'shield', svc:null, x:p.x, y:p.y, slots: Math.max(1, Math.ceil(this.slotsForGift() / 2)), ttl: this.cfg.dropTtlMs });
    }
    const svc = SERVICES[Math.floor(Math.random() * SERVICES.length)];
    const p = WR.dropPointNearBooth(svc);
    this.addDrop({ kind:'gift', svc, x:p.x, y:p.y, slots: this.slotsForGift(), ttl: this.cfg.dropTtlMs });
  }
  spawnSuper(){
    if (!this.live || !this.size) return;
    const left = (this.hub.stockOf('super') || {}).free || 0;
    if (left <= 0){ this.broadcast({ t:'feed', items:['Kho Siêu Deal đã hết, săn hộp thường tiếp nhé!'] }); return; }
    const a = Math.random() * 6.28, d = Math.random() * 60;
    this.addDrop({ kind:'super', svc:'super', x: WR.STAGE.x + Math.cos(a) * d, y: WR.STAGE.y + Math.sin(a) * d * .6,
                   slots: Math.min(this.cfg.superSlotsPerDrop, left), ttl: this.cfg.superTtlMs });
  }
  addDrop({ kind, svc, x, y, slots, ttl }){
    const id = `${this.id}.${++this.seq}`;
    const d = { id, kind, svc, x, y, slots, takers: new Set(), until: Date.now() + ttl };
    this.drops.set(id, d);
    this.broadcast({ t:'drop', id, kind, svc, x: r1(x), y: r1(y), slots, ttl });
    // ai đang đứng sẵn ở đó thì nhặt luôn
    for (const p of this.members) this.tryPick(p, d, Date.now());
  }
  removeDrop(d, reason){
    if (!this.drops.delete(d.id)) return;
    this.broadcast({ t:'gone', id: d.id, r: reason });
  }

  /* ---------- Nhặt hộp & đụng bọ ---------- */
  checkPickups(p, now){
    for (const d of this.drops.values()) this.tryPick(p, d, now);
  }
  tryPick(p, d, now){
    if (now > d.until || d.takers.has(p.pid) || p.stunUntil > now) return;
    if (WR.dist2(p, d) > WR.PICK_R ** 2) return;
    if (d.takers.size >= d.slots) return;
    d.takers.add(p.pid);
    const left = d.slots - d.takers.size;
    let res;
    if (d.kind === 'shield'){ p.shieldUntil = now + this.cfg.shieldMs; res = { ms: this.cfg.shieldMs, score: p.score }; }
    else if (d.kind === 'super') res = this.hub.grantSuper(p);
    else res = this.hub.grantPiece(p, d.svc);
    p.reply({ t:'pick', id: d.id, kind: d.kind, svc: d.svc, ...res });
    if (left <= 0) this.removeDrop(d, 'full');
    else this.broadcast({ t:'slots', id: d.id, left });
  }
  bugHits(now){
    for (const p of this.members){
      if (p.stunUntil > now || p.bugSafeUntil > now) continue;
      for (const b of this.bugs){
        if (WR.dist2(p, b) > WR.BUG_R ** 2) continue;
        if (p.shieldUntil > now){ p.bugSafeUntil = now + 1200; this.hub.addScore(p, this.cfg.points.shieldBlock, false); p.reply({ t:'blocked', score: p.score }); }
        else { p.stunUntil = now + this.cfg.stunMs; p.bugSafeUntil = p.stunUntil + 1500; p.streak = 0; p.reply({ t:'stun', ms: this.cfg.stunMs }); }
        break;
      }
    }
  }

  /* ---------- Nhịp 15 lần/giây ---------- */
  tick(){
    const now = Date.now();
    this.tickN++;
    if (this.live){
      const dt = TICK_MS / 1000;
      this.bugs.forEach(b => WR.stepBug(b, dt));
      this.bugHits(now);
      for (const d of this.drops.values()) if (now > d.until + 200) this.removeDrop(d, 'ttl');
    }
    if (this.tickN % SNAP_EVERY) return;
    const moved = [];
    for (const p of this.members) if (p.moved){ p.moved = false; moved.push([p.rid, r1(p.x), r1(p.y)]); }
    const bugs = this.live ? this.bugs.map(b => [b.id, r1(b.x), r1(b.y)]) : null;
    if (moved.length || (bugs && bugs.length)) this.broadcast(bugs ? { t:'snap', p: moved, b: bugs } : { t:'snap', p: moved });
  }
}

module.exports = { Room };
