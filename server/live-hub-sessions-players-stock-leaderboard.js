/* =============================================================================
 * Bộ điều phối sự kiện live
 * - Theo dõi pha (sảnh chờ → live → kết thúc) theo lịch, báo cho mọi người
 * - Chia người chơi vào các sảnh (tối đa cfg.roomCap/sảnh), mọi sảnh dùng CHUNG kho mã
 * - Giữ trạng thái người chơi (mảnh, điểm, mã) để rớt mạng vào lại không mất
 * - Cấp mã theo giới hạn: tối đa N mã/phiên, 1 mã/dịch vụ/ngày, 1 Siêu Deal/ngày
 * - Bảng xếp hạng, tồn kho, dòng tin, số người online
 * ============================================================================= */
'use strict';
const { Room } = require('./live-room-drops-slots-and-taps');
const { phaseAt } = require('./session-schedule-phase-calculator');

const vnDay = ts => new Date(ts + 7 * 3600e3).toISOString().slice(0, 10);

class Player {
  constructor(pid, nick){
    this.pid = pid; this.nick = nick;
    this.ws = null; this.ip = ''; this.room = null;
    this.resetSession(null);
  }
  resetSession(sessionId){
    this.session = sessionId;
    this.score = 0; this.streak = 0; this.pieces = {};
    this.claimed = new Set(); this.codes = [];
    this.stunUntil = 0; this.shieldUntil = 0; this.dirty = false;
  }
  sendRaw(s){
    const ws = this.ws;
    // Bỏ qua nếu kết nối nghẽn (máy yếu/mạng chậm) để không kéo chậm cả sảnh
    if (ws && ws.readyState === 1 && ws.bufferedAmount < 512 * 1024) ws.send(s);
  }
  reply(obj){ this.sendRaw(JSON.stringify(obj)); }
}

class Hub {
  constructor(cfg, store){
    this.cfg = cfg; this.store = store;
    this.players = new Map();     // pid → Player (giữ cả người tạm rớt mạng trong phiên)
    this.rooms = [];
    this.roomSeq = 0;
    this.state = { phase:'idle', session:null, next:null };
    this.stock = {};
    this.feedQ = [];
    this.lastTop = '';
    this.svcIds = cfg.services.map(s => s.id);
    this.svcName = Object.fromEntries([...cfg.services, cfg.superService].map(s => [s.id, s.short]));
  }

  start(){
    const st = phaseAt(Date.now(), this.cfg);
    this.refreshStock((st.session || st.next || {}).id || '');
    this.tick();
    this.timers = [
      setInterval(() => this.tick(), 250),
      setInterval(() => this.flushProgress(), 1000),
      setInterval(() => this.broadcastBoard(), 1000),
      setInterval(() => this.broadcastPresence(), 2000),
      setInterval(() => this.flushFeed(), 600)
    ];
  }
  stop(){ (this.timers || []).forEach(clearInterval); this.rooms.forEach(r => r.stopLive()); this.flushProgress(); }

  /* ---------- Pha & phiên ---------- */
  sessionId(){ return this.state.session ? this.state.session.id : null; }
  tick(){
    const now = Date.now();
    const st = phaseAt(now, this.cfg);
    const prev = this.state;
    const sameSession = (prev.session && prev.session.id) === (st.session && st.session.id);
    if (st.phase === prev.phase && sameSession) { this.state = st; return; }

    // Rời live → dừng phát hộp + gửi kết quả
    if (prev.phase === 'live' && !(st.phase === 'live' && sameSession)) this.endLive();
    // Sang phiên mới (sảnh chờ hoặc vào thẳng live) → làm mới trạng thái người chơi
    if ((st.phase === 'lobby' || st.phase === 'live') && !sameSession) this.newSession(st.session);
    this.state = st;
    if (st.phase === 'live' && !(prev.phase === 'live' && sameSession)) this.rooms.forEach(r => r.startLive(st.session));
    this.broadcastAll(this.phaseMsg());
  }
  newSession(session){
    this.flushProgress();
    for (const p of this.players.values()){
      if (!p.ws){ this.players.delete(p.pid); continue; }   // dọn người đã rời
      p.resetSession(session.id);
    }
    // Gộp lại sảnh: bỏ các sảnh trống (giữ sảnh số 1)
    this.rooms = this.rooms.filter((r, i) => i === 0 || r.size > 0);
    this.refreshStock(session.id);
    this.lastTop = '';
  }
  endLive(){
    this.rooms.forEach(r => r.stopLive());
    this.flushProgress();
    const ranked = this.sessionPlayers().sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, 10).map(p => [p.nick, p.score]);
    ranked.forEach((p, i) => p.reply({ t:'result', rank: p.score > 0 ? i + 1 : null, of: ranked.length, score: p.score, codes: p.codes, top }));
    for (const p of this.players.values()) if (!ranked.includes(p)) p.reply({ t:'result', rank:null, of: ranked.length, score:0, codes:[], top });
  }
  phaseMsg(){
    const s = this.state, pick = x => x && { id:x.id, title:x.title, start:x.start, end:x.end, lobbyAt:x.lobbyAt };
    return { t:'phase', phase: s.phase, session: pick(s.session), next: pick(s.next), now: Date.now() };
  }

  /* ---------- Người chơi ---------- */
  join(ws, { pid, nick, ip }){
    let p = this.players.get(pid);
    if (p && p.ws && p.ws !== ws){
      try { p.ws.close(4001, 'Đã mở ở thiết bị/tab khác'); } catch(e){}
    }
    if (!p){ p = new Player(pid, nick); this.players.set(pid, p); }
    p.nick = nick; p.ws = ws; p.ip = ip;
    const sid = this.sessionId();
    if (sid && p.session !== sid){
      p.resetSession(sid);
      // Máy chủ vừa khởi động lại giữa phiên → nạp lại tiến độ + mã đã nhận
      const saved = this.store.loadProgress(sid, pid);
      if (saved){ p.score = saved.score; p.pieces = saved.pieces; }
      p.codes = this.store.myCodes(pid, sid);
      p.codes.forEach(c => p.claimed.add(c.service));
    }
    if (!p.room) this.assignRoom(p);
    p.reply({
      t:'welcome', you:{ pid, nick }, room: p.room.id,
      services: this.cfg.services, need: this.cfg.piecesToUnlock, maxCodes: this.cfg.maxCodesPerSession,
      state:{ score:p.score, pieces:p.pieces, codes:p.codes, claimed:[...p.claimed] },
      stock: this.stockMsg().s
    });
    p.reply(this.phaseMsg());
    if (this.lastTop) p.sendRaw(this.lastTop);
    return p;
  }
  leave(p, ws){
    if (p.ws !== ws) return;             // kết nối cũ đã bị thay thế
    p.ws = null;
    if (p.room) p.room.remove(p);
    p.dirty = true;
  }
  assignRoom(p){
    let room = this.rooms.find(r => r.size < this.cfg.roomCap);
    if (!room){
      room = new Room('S' + (++this.roomSeq), this);
      this.rooms.push(room);
      if (this.state.phase === 'live') room.startLive(this.state.session);
    }
    room.add(p);
  }
  sessionPlayers(){
    const sid = this.sessionId();
    return [...this.players.values()].filter(p => p.session === sid);
  }

  /* ---------- Điểm, mảnh, cấp mã ---------- */
  addScore(p, pts, combo = true){
    p.score += pts * (combo && p.streak >= this.cfg.comboAt ? 2 : 1);
    p.dirty = true;
  }
  grantPiece(p, svc){
    p.streak++;
    this.addScore(p, this.cfg.points.gift);
    const need = this.cfg.piecesToUnlock;
    if (p.claimed.has(svc)) return { score:p.score, streak:p.streak, pieces:p.pieces[svc] || need, done:true };
    p.pieces[svc] = (p.pieces[svc] || 0) + 1;
    const out = { score:p.score, streak:p.streak, pieces:p.pieces[svc] };
    if (p.pieces[svc] >= need){
      const r = this.tryIssue(p, svc);
      if (r.code){ out.code = r.code; p.claimed.add(svc); }
      else { out.blocked = r.reason; p.pieces[svc] = need; if (r.reason !== 'stockout') p.claimed.add(svc); }
    }
    return out;
  }
  grantSuper(p){
    p.streak++;
    this.addScore(p, this.cfg.points.super, false);
    const out = { score:p.score, streak:p.streak };
    const day = vnDay(this.state.session.start);
    if (this.store.countDayService(p.pid, 'super', day) >= this.cfg.maxSuperPerDay){ out.blocked = 'limit'; return out; }
    const code = this.issue(p, 'super', day);
    if (code) out.code = code; else out.blocked = 'stockout';
    return out;
  }
  tryIssue(p, svc){
    const day = vnDay(this.state.session.start);
    const inSession = p.codes.filter(c => c.service !== 'super').length;
    if (inSession >= this.cfg.maxCodesPerSession) return { reason:'limit_session' };
    if (this.stock[svc] && this.stock[svc].free <= 0) return { reason:'stockout' };   // khỏi hỏi DB khi đã biết hết kho
    if (this.store.countDayService(p.pid, svc, day) >= this.cfg.maxCodesPerServicePerDay) return { reason:'limit_day' };
    const code = this.issue(p, svc, day);
    return code ? { code } : { reason:'stockout' };
  }
  issue(p, svc, day){
    const code = this.store.issue(svc, { pid:p.pid, nick:p.nick, session:this.sessionId(), day });
    if (!code) { this.setStockFree(svc, 0); return null; }
    p.codes.push(code);
    const st = this.stock[svc]; if (st) st.free = Math.max(0, st.free - 1);
    this.stockDirty = true;
    this.feedQ.push(`${p.nick} vừa nhận mã ${this.svcName[svc]}!`);
    return code;
  }

  /* ---------- Tồn kho ---------- */
  refreshStock(sessionId){ this.stock = this.store.stock(sessionId || this.sessionId()); this.stockDirty = true; }
  setStockFree(svc, n){ if (this.stock[svc]) { this.stock[svc].free = n; this.stockDirty = true; } }
  stockOf(svc){ return this.stock[svc]; }
  stockMsg(){
    const s = {};
    for (const id of [...this.svcIds, 'super']){ const v = this.stock[id] || { free:0, total:0 }; s[id] = [v.free, v.total]; }
    return { t:'stock', s };
  }

  /* ---------- Phát sóng định kỳ ---------- */
  broadcastAll(obj){
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    for (const r of this.rooms) for (const p of r.members) p.sendRaw(s);
  }
  broadcastBoard(){
    if (this.stockDirty){ this.stockDirty = false; this.broadcastAll(this.stockMsg()); }
    if (this.state.phase !== 'live') return;
    const top = this.sessionPlayers().filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 10).map(p => [p.nick, p.score]);
    const msg = JSON.stringify({ t:'lb', top });
    if (msg !== this.lastTop){ this.lastTop = msg; this.broadcastAll(msg); }
  }
  broadcastPresence(){
    const online = this.rooms.reduce((n, r) => n + r.size, 0);
    for (const r of this.rooms){
      const nicks = [...r.members].slice(-16).map(p => p.nick);
      r.broadcast({ t:'room', room:r.id, n:r.size, online, rooms:this.rooms.length, nicks });
    }
  }
  flushFeed(){
    if (!this.feedQ.length) return;
    const items = this.feedQ.splice(0, 4);
    if (this.feedQ.length > 40) this.feedQ.length = 0;   // quá đông: bỏ bớt, chỉ giữ tin mới
    this.broadcastAll({ t:'feed', items });
  }
  flushProgress(){
    const list = [];
    for (const p of this.players.values()){
      if (!p.dirty || !p.session) continue;
      p.dirty = false;
      list.push({ session:p.session, pid:p.pid, nick:p.nick, score:p.score, pieces:p.pieces });
    }
    this.store.saveProgress(list);
  }

  status(){
    return {
      phase: this.state.phase, session: this.state.session, next: this.state.next,
      online: this.rooms.reduce((n, r) => n + r.size, 0),
      rooms: this.rooms.map(r => ({ id:r.id, n:r.size, live: !!r.live })),
      players: this.players.size, stock: this.stockMsg().s
    };
  }
}

module.exports = { Hub };
