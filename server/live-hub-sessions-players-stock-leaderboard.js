/* =============================================================================
 * Bộ điều phối sự kiện live
 * - Theo dõi pha (sảnh chờ → live → kết thúc) theo lịch, báo cho mọi người
 * - Chia người chơi vào các sảnh (tối đa cfg.roomCap/sảnh, mỗi người 1 nhân vật đi lại), mọi sảnh dùng CHUNG kho mã
 * - Giữ trạng thái người chơi (mảnh, điểm, mã) để rớt mạng vào lại không mất
 * - Mở hộp → giải MẬT THƯ: giữ chỗ mã 90s, chấm đáp án trên máy chủ, sai hết lượt/hết giờ thì trả mã về kho
 * - Cấp mã theo giới hạn: tối đa N mã/phiên, 1 mã/dịch vụ/ngày, 1 Siêu Deal/ngày
 * - Bảng xếp hạng, tồn kho, dòng tin, số người online
 * ============================================================================= */
'use strict';
const { Room } = require('./live-room-world-movement-drops-bugs');
const { phaseAt } = require('./session-schedule-phase-calculator');
const WR = require('../public/assets/world-map-rules-shared.js');
const PuzzleKit = require('../public/assets/puzzle-cipher-generator-shared.js');

const vnDay = ts => new Date(ts + 7 * 3600e3).toISOString().slice(0, 10);

class Player {
  constructor(pid, nick, avatar){
    this.pid = pid; this.nick = nick; this.avatar = avatar;
    this.ws = null; this.ip = ''; this.room = null;
    this.resetSession(null);
  }
  resetSession(sessionId){
    this.session = sessionId;
    this.score = 0; this.streak = 0; this.pieces = {};
    this.claimed = new Set(); this.codes = []; this.pendingUnlock = new Set();
    if (this.puzzle) clearTimeout(this.puzzle.timer);
    this.puzzle = null;
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
    this.cfg = cfg; this.store = store; this.WR = WR; this.kit = PuzzleKit;
    // CHỈ dùng khi load test ở chế độ chạy thử: gửi kèm đáp án để bot giải được (không bao giờ bật khi chạy thật)
    this.revealAnswers = cfg.demoLoop && process.env.LOADTEST_REVEAL_ANSWERS === '1';
    if (this.revealAnswers) console.warn('[CẢNH BÁO] LOADTEST_REVEAL_ANSWERS=1: đáp án mật thư được gửi kèm (chỉ để load test)!');
    store.seedSamplePuzzles(PuzzleKit);
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
  stop(){ (this.timers || []).forEach(clearInterval); this.rooms.forEach(r => r.destroy()); this.flushProgress(); }

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
    this.rooms = this.rooms.filter((r, i) => { const keep = i === 0 || r.size > 0; if (!keep) r.destroy(); return keep; });
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
  join(ws, { pid, nick, avatar, ip }){
    let p = this.players.get(pid);
    if (p && p.ws && p.ws !== ws){
      try { p.ws.close(4001, 'Đã mở ở thiết bị/tab khác'); } catch(e){}
    }
    if (!p){ p = new Player(pid, nick, avatar); this.players.set(pid, p); }
    p.nick = nick; p.avatar = avatar; p.ws = ws; p.ip = ip;
    const sid = this.sessionId();
    if (sid && p.session !== sid){
      p.resetSession(sid);
      // Máy chủ vừa khởi động lại giữa phiên → nạp lại tiến độ + mã đã nhận
      const saved = this.store.loadProgress(sid, pid);
      if (saved){ p.score = saved.score; p.pieces = saved.pieces; }
      p.codes = this.store.myCodes(pid, sid);
      p.codes.forEach(c => p.claimed.add(c.service));
    }
    if (p.room) p.room.remove(p);              // vào lại (đổi tab/mạng) → xuất hiện lại trong sảnh
    this.assignRoom(p);
    p.reply({
      t:'welcome', you:{ pid, nick, avatar, rid: p.rid, x: Math.round(p.x), y: Math.round(p.y) }, room: p.room.id,
      roster: p.room.roster().filter(r => r[0] !== p.rid),
      drops: p.room.live ? [...p.room.drops.values()].map(d => ({ id:d.id, kind:d.kind, svc:d.svc, x:Math.round(d.x), y:Math.round(d.y),
              slots:d.slots - d.takers.size, ttl: Math.max(0, d.until - Date.now()), mine: d.takers.has(pid) })) : [],
      services: this.cfg.services, need: this.cfg.piecesToUnlock, maxCodes: this.cfg.maxCodesPerSession,
      state:{ score:p.score, pieces:p.pieces, codes:p.codes, claimed:[...p.claimed] },
      stock: this.stockMsg().s
    });
    p.reply(this.phaseMsg());
    if (this.lastTop) p.sendRaw(this.lastTop);
    if (p.puzzle) this.sendPuzzle(p);            // vào lại giữa lúc giải mật thư → mở lại đúng đề, đúng giờ còn lại
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

  /* ---------- Điểm, mảnh ---------- */
  addScore(p, pts, combo = true){
    p.score += pts * (combo && p.streak >= this.cfg.comboAt ? 2 : 1);
    p.dirty = true;
  }
  grantPiece(p, svc){
    p.streak++;
    this.addScore(p, this.cfg.points.gift);
    const need = this.cfg.piecesToUnlock;
    if (p.claimed.has(svc)) return { score:p.score, streak:p.streak, pieces:need, done:true };
    p.pieces[svc] = Math.min(need, (p.pieces[svc] || 0) + 1);
    const out = { score:p.score, streak:p.streak, pieces:p.pieces[svc] };
    if (p.pieces[svc] >= need){
      if (p.puzzle){ p.pendingUnlock.add(svc); out.queued = true; }      // đang giải đề khác → mở sau
      else { const r = this.openPuzzle(p, svc); if (r.blocked) out.blocked = r.blocked; else out.puzzle = true; }
    }
    return out;
  }
  grantSuper(p){
    p.streak++;
    this.addScore(p, this.cfg.points.super, false);
    const out = { score:p.score, streak:p.streak };
    if (p.puzzle){ out.blocked = 'busy'; return out; }
    const r = this.openPuzzle(p, 'super');
    if (r.blocked) out.blocked = r.blocked; else out.puzzle = true;
    return out;
  }

  /* ---------- Mật thư: giữ mã → mở đề → chấm đáp án ---------- */
  limitReason(p, svc){
    const day = vnDay(this.state.session.start);
    if (svc === 'super') return this.store.countDayService(p.pid, 'super', day) >= this.cfg.maxSuperPerDay ? 'limit' : null;
    if (p.codes.filter(c => c.service !== 'super').length >= this.cfg.maxCodesPerSession) return 'limit_session';
    if (this.store.countDayService(p.pid, svc, day) >= this.cfg.maxCodesPerServicePerDay) return 'limit_day';
    return null;
  }
  pickPuzzle(tier){
    // Cấp 3 luôn lấy từ ngân hàng (cần manh mối); cấp 1–2 trộn đề MKT (60%) với đề tự sinh (mỗi người một đề)
    const fromBank = tier >= 3 || (this.store.bankCount(tier) > 0 && Math.random() < 0.6);
    if (fromBank){ const q = this.store.randomPuzzle(tier); if (q) return q; }
    const g = this.kit.generate(tier);
    return Object.assign({ key:'gen:' + g.type }, g);
  }
  openPuzzle(p, svc){
    const reason = this.limitReason(p, svc);
    if (reason){ if (reason !== 'limit' && svc !== 'super') p.claimed.add(svc); return { blocked: reason }; }
    if (this.stock[svc] && this.stock[svc].free <= 0) return { blocked:'stockout' };
    const holdMs = this.cfg.puzzleHoldMs;
    const code = this.store.reserve(svc, { pid:p.pid, session:this.sessionId(), holdMs });
    if (!code){ this.setStockFree(svc, 0); return { blocked:'stockout' }; }
    this.bumpStock(svc, -1);
    const tier = this.cfg.puzzleTiers[svc] || 1;
    const q = this.pickPuzzle(tier);
    const now = Date.now();
    p.puzzle = { id: Math.random().toString(36).slice(2, 10), svc, tier, key:q.key, type:q.type, question:q.question,
                 answers:q.answers, hints:[q.hint1, q.hint2].filter(Boolean), clues:q.clues || [], found:new Set(),
                 attempts:0, opened:now, until: now + holdMs, code };
    p.puzzle.timer = setTimeout(() => this.endPuzzle(p, 'timeout'), holdMs);
    this.store.statOpen(q.key);
    this.sendPuzzle(p);
    return {};
  }
  sendPuzzle(p){
    const z = p.puzzle; if (!z) return;
    const WR = this.WR;
    p.reply({ t:'puzzle', id:z.id, svc:z.svc, tier:z.tier, type:z.type, question:z.question,
      ms: Math.max(0, z.until - Date.now()), attempts: this.cfg.puzzleAttempts - z.attempts,
      hints: z.hints.slice(0, z.attempts),
      clues: z.clues.map(c => ({ spot:c.spot, name:(WR.CLUE_SPOTS[c.spot] || {}).name || c.spot, text: z.found.has(c.spot) ? c.text : null })),
      ...(this.revealAnswers ? { _answer: z.answers[0] } : {}) });
  }
  /** Đứng gần điểm manh mối → máy chủ gửi nội dung manh mối (gọi mỗi khi người chơi di chuyển). */
  checkClues(p){
    const z = p.puzzle; if (!z || !z.clues.length) return;
    for (const c of z.clues){
      if (z.found.has(c.spot)) continue;
      const spot = this.WR.CLUE_SPOTS[c.spot];
      if (spot && this.WR.dist2(p, spot) <= this.WR.CLUE_R ** 2){ z.found.add(c.spot); p.reply({ t:'clue', id:z.id, spot:c.spot, text:c.text }); }
    }
  }
  answer(p, id, text){
    const z = p.puzzle, now = Date.now();
    if (!z || z.id !== id || typeof text !== 'string') return;
    if (now - (p.lastAns || 0) < 1200) return p.reply({ t:'ans_r', id, ok:false, slow:true });   // chống dò đáp án bằng máy
    p.lastAns = now;
    if (this.kit.check(z.answers, text.slice(0, 80))){
      const day = vnDay(this.state.session ? this.state.session.start : now);
      const code = this.store.confirm(z.code, { pid:p.pid, nick:p.nick, session:this.sessionId(), day });
      const ms = now - z.opened;
      this.clearPuzzle(p);
      if (!code){ p.reply({ t:'ans_r', id, ok:false, end:'expired' }); return this.afterPuzzle(p); }
      this.store.statResult(z.key, true, ms);
      p.codes.push(code); if (z.svc !== 'super') p.claimed.add(z.svc);
      const bonus = this.cfg.points.puzzle + Math.max(0, Math.round(this.cfg.points.puzzleSpeed * (1 - ms / this.cfg.puzzleHoldMs)));
      this.addScore(p, bonus, false);
      this.feedQ.push(`${p.nick} vừa giải mật thư, nhận mã ${this.svcName[z.svc]}!`);
      p.reply({ t:'ans_r', id, ok:true, code, bonus, score:p.score, ms });
      return this.afterPuzzle(p);
    }
    z.attempts++;
    if (z.attempts >= this.cfg.puzzleAttempts) return this.endPuzzle(p, 'fail');
    p.reply({ t:'ans_r', id, ok:false, left: this.cfg.puzzleAttempts - z.attempts, hint: z.hints[z.attempts - 1] || null });
  }
  /** Hết lượt / hết giờ: trả mã về kho, dịch vụ đó phải gom lại mảnh. */
  endPuzzle(p, reason){
    const z = p.puzzle; if (!z) return;
    this.clearPuzzle(p);
    this.store.release(z.code, p.pid);
    this.bumpStock(z.svc, +1);
    this.store.statResult(z.key, false, 0);
    if (z.svc !== 'super') p.pieces[z.svc] = 0;
    p.dirty = true;
    p.reply({ t:'puzzle_end', id:z.id, reason, svc:z.svc, pieces:p.pieces });
    this.afterPuzzle(p);
  }
  clearPuzzle(p){ if (p.puzzle){ clearTimeout(p.puzzle.timer); p.puzzle = null; } }
  afterPuzzle(p){
    for (const svc of p.pendingUnlock){
      p.pendingUnlock.delete(svc);
      if (!p.claimed.has(svc) && (p.pieces[svc] || 0) >= this.cfg.piecesToUnlock && this.state.session){
        const r = this.openPuzzle(p, svc);
        if (r.blocked) p.reply({ t:'blocked', svc, reason:r.blocked });
        else break;
      }
    }
  }

  /* ---------- Tồn kho ---------- */
  refreshStock(sessionId){ this.stock = this.store.stock(sessionId || this.sessionId()); this.stockDirty = true; }
  setStockFree(svc, n){ if (this.stock[svc]) { this.stock[svc].free = n; this.stockDirty = true; } }
  bumpStock(svc, d){ const st = this.stock[svc]; if (st){ st.free = Math.max(0, st.free + d); this.stockDirty = true; } }
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
    for (const r of this.rooms) r.broadcast({ t:'room', room:r.id, n:r.size, online, rooms:this.rooms.length });
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
