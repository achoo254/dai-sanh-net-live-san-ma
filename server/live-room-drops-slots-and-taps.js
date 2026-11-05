/* =============================================================================
 * Một sảnh live (tối đa cfg.roomCap người)
 * - Thả hộp quà / DDoS / khiên / Siêu Deal CÙNG LÚC cho mọi người trong sảnh
 * - Mỗi hộp có K suất; máy chủ xếp thứ tự chạm theo thứ tự nhận được (đơn luồng → công bằng tuyệt đối)
 * - Cập nhật "còn x suất" được gộp 200ms/lần để không nghẽn khi sảnh đông
 * ============================================================================= */
'use strict';

const SEATS = ['domain', 'hosting', 'vps', 'ssl', 'email'];  // ghế ra hộp thường ('deal' chỉ ra Siêu Deal)
const lerp = (a, b, t) => a + (b - a) * t;

class Room {
  constructor(id, hub){
    this.id = id; this.hub = hub; this.cfg = hub.cfg;
    this.members = new Set();
    this.drops = new Map();
    this.seq = 0;
    this.timers = [];
    this.dirtySlots = new Set();
    this.live = null;
    this.shieldSpawns = 0;
  }
  get size(){ return this.members.size; }
  add(p){ this.members.add(p); p.room = this; }
  remove(p){ this.members.delete(p); if (p.room === this) p.room = null; }

  broadcast(obj){
    const s = JSON.stringify(obj);
    for (const p of this.members) p.sendRaw(s);
  }

  /** Bắt đầu phát hộp cho phiên live. */
  startLive(session){
    this.stopLive();
    this.live = session;
    this.shieldSpawns = 0;
    const dur = session.end - session.start, now = Date.now();
    // Siêu Deal: báo trước rồi thả trên ghế giữa
    for (const f of this.cfg.superAtFractions){
      const at = session.start + dur * f - now;
      if (at - this.cfg.superWarnMs > 0) this.later(at - this.cfg.superWarnMs, () => this.broadcast({ t:'super_soon', ms:this.cfg.superWarnMs }));
      if (at > 0) this.later(at, () => this.spawnSuper());
    }
    this.flushTimer = setInterval(() => this.flushSlots(), 200);
    this.scheduleNext(400);
  }
  stopLive(){
    this.timers.forEach(clearTimeout); this.timers = [];
    clearInterval(this.flushTimer); this.flushTimer = null;
    this.drops.clear(); this.dirtySlots.clear();
    this.live = null;
  }
  later(ms, fn){ const t = setTimeout(fn, ms); this.timers.push(t); return t; }

  progress(){
    if (!this.live) return 0;
    return Math.min(1, Math.max(0, (Date.now() - this.live.start) / (this.live.end - this.live.start)));
  }
  scheduleNext(ms){
    this.later(ms, () => {
      if (!this.live) return;
      this.spawn();
      const [a, b] = this.cfg.dropEveryMs;
      this.scheduleNext(lerp(a, b, this.progress()) * (0.85 + Math.random() * 0.3));
    });
  }
  slotsForGift(){
    return Math.max(1, Math.min(this.cfg.slotMax, Math.ceil(this.size * this.cfg.slotRatio)));
  }

  spawn(){
    if (!this.size) return;
    const now = Date.now();
    const active = [...this.drops.values()].filter(d => d.until > now);
    if (active.length >= this.cfg.maxActiveDrops) return;
    const busy = new Set(active.map(d => d.seat));
    const free = SEATS.filter(s => !busy.has(s));
    if (!free.length) return;
    const seat = free[Math.floor(Math.random() * free.length)];
    const p = this.progress(), r = Math.random();
    let kind = 'gift';
    if (r < 0.15 + 0.07 * p) kind = 'bug';
    else if (r < 0.15 + 0.07 * p + 0.04 && this.shieldSpawns < 3) { kind = 'shield'; this.shieldSpawns++; }
    const K = this.slotsForGift();
    const slots = kind === 'bug' ? 0 : kind === 'shield' ? Math.max(1, Math.ceil(K / 2)) : K;
    this.addDrop({ seat, kind, slots, ttl: this.cfg.dropTtlMs });
  }
  spawnSuper(){
    if (!this.live || !this.size) return;
    const left = (this.hub.stockOf('super') || {}).free || 0;
    if (left <= 0){ this.broadcast({ t:'feed', m:'Kho Siêu Deal đã hết, săn hộp thường tiếp nhé!' }); return; }
    this.addDrop({ seat:'deal', kind:'super', slots: Math.min(this.cfg.superSlotsPerDrop, left), ttl: 4000 });
  }
  addDrop({ seat, kind, slots, ttl }){
    const id = `${this.id}.${++this.seq}`;
    const d = { id, seat, kind, slots, takers: new Set(), until: Date.now() + ttl };
    this.drops.set(id, d);
    this.broadcast({ t:'drop', id, seat, kind, slots, ttl });
    this.later(ttl + 400, () => { this.drops.delete(id); this.dirtySlots.delete(id); });
  }

  /** Xử lý 1 lần chạm. Kết quả gửi riêng cho người chạm. */
  tap(player, id){
    const now = Date.now();
    const d = this.drops.get(id);
    if (!d || now > d.until + 300) return player.reply({ t:'tapr', id, ok:false, reason:'late' });
    if (d.takers.has(player.pid)) return;
    if (player.stunUntil > now) return player.reply({ t:'tapr', id, ok:false, reason:'stunned', ms: player.stunUntil - now });

    if (d.kind === 'bug'){
      d.takers.add(player.pid);
      if (player.shieldUntil > now){
        this.hub.addScore(player, this.cfg.points.shieldBlock, false);
        return player.reply({ t:'tapr', id, ok:true, kind:'bug', blocked:true, score: player.score });
      }
      player.stunUntil = now + this.cfg.stunMs; player.streak = 0;
      return player.reply({ t:'tapr', id, ok:true, kind:'bug', stun:this.cfg.stunMs, score: player.score, streak:0 });
    }
    if (d.takers.size >= d.slots) return player.reply({ t:'tapr', id, ok:false, reason:'full' });
    d.takers.add(player.pid);
    this.dirtySlots.add(id);

    if (d.kind === 'shield'){
      player.shieldUntil = now + this.cfg.shieldMs;
      return player.reply({ t:'tapr', id, ok:true, kind:'shield', ms:this.cfg.shieldMs, score: player.score });
    }
    const res = d.kind === 'super' ? this.hub.grantSuper(player) : this.hub.grantPiece(player, d.seat);
    player.reply({ t:'tapr', id, ok:true, kind:d.kind, seat:d.seat, ...res });
  }

  /** Gửi gộp số suất còn lại của các hộp vừa có người giành. */
  flushSlots(){
    if (!this.dirtySlots.size) return;
    const u = [];
    for (const id of this.dirtySlots){
      const d = this.drops.get(id);
      if (d) u.push([id, Math.max(0, d.slots - d.takers.size)]);
    }
    this.dirtySlots.clear();
    if (u.length) this.broadcast({ t:'slots', u });
  }
}

module.exports = { Room };
