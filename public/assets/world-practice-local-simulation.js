/* =============================================================================
 * Đại Sảnh Nét Online — "máy chủ giả" chạy ngay trong trình duyệt cho bản LUYỆN TAY
 * Phát đúng các tin nhắn như máy chủ thật (welcome, phase, drop, pick, snap, stun...) nên
 * giao diện dùng chung 100%. KHÔNG phát mã giảm giá. Có 8 bot đi tranh hộp cho vui.
 * Dùng: const hub = PracticeHub.create(onMessage); hub.send({ t:'hello', ... })
 * ============================================================================= */
window.PracticeHub = (() => {
  'use strict';
  const WR = window.WorldRules;
  const SERVICES = ['domain', 'hosting', 'vps', 'ssl', 'email'];
  const BOT_NAMES = ['Lan', 'Minh', 'Tuấn', 'Hà', 'Phong', 'Vy', 'Khoa', 'Trang'];
  const AVATARS = ['wave', 'shield', 'thumb', 'idea', 'book', 'support'];
  const LOBBY_MS = 6000, LIVE_MS = 90000, NEED = 5, SLOTS = 3, TTL = 7000;

  function create(emit){
    let me = null, bots = [], drops = new Map(), bugs = [], seq = 0, timers = [], loop = null;
    let session = null, phase = 'idle', pieces = {}, done = new Set(), score = 0;
    const out = m => setTimeout(() => emit(m), 0);
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));

    function start(){
      timers.forEach(clearTimeout); timers = []; clearInterval(loop);
      drops.clear(); pieces = {}; done = new Set(); score = 0;
      const now = Date.now();
      session = { id:'practice-' + now, title:'Luyện tay', lobbyAt: now, start: now + LOBBY_MS, end: now + LOBBY_MS + LIVE_MS };
      setPhase('lobby');
      bugs = [0, 1, 2].map(i => { let p; do { p = WR.randomWalkable(); } while (WR.dist2(p, WR.SPAWN) < 450 ** 2); return { id:i + 1, x:p.x, y:p.y, a:Math.random() * 6.28, turnIn:1 }; });
      later(LOBBY_MS, () => {
        setPhase('live');
        [0.3, 0.65, 0.92].forEach(f => {
          later(LIVE_MS * f - 5000, () => out({ t:'super_soon', ms:5000 }));
          later(LIVE_MS * f, () => addDrop('super', 'super', WR.STAGE.x + (Math.random() - .5) * 80, WR.STAGE.y, 2, 6000));
        });
        spawnLoop(400);
      });
      later(LOBBY_MS + LIVE_MS, end);
      loop = setInterval(tick, 66);
    }
    function setPhase(p){ phase = p; out({ t:'phase', phase:p, session, next:null, now: Date.now(), practice:true }); }
    function spawnLoop(ms){
      later(ms, () => {
        if (phase !== 'live') return;
        if (drops.size < 8){
          if (Math.random() < .07){ const p = WR.randomWalkable(); addDrop('shield', null, p.x, p.y, 1, TTL); }
          else { const svc = SERVICES[Math.floor(Math.random() * 5)], p = WR.dropPointNearBooth(svc); addDrop('gift', svc, p.x, p.y, SLOTS, TTL); }
        }
        const prog = (Date.now() - session.start) / LIVE_MS;
        spawnLoop((900 - 350 * prog) * (.85 + Math.random() * .3));
      });
    }
    function addDrop(kind, svc, x, y, slots, ttl){
      const id = 'L.' + (++seq), d = { id, kind, svc, x, y, slots, takers:new Set(), until: Date.now() + ttl };
      drops.set(id, d);
      out({ t:'drop', id, kind, svc, x:Math.round(x), y:Math.round(y), slots, ttl });
    }
    function take(who, d, now){
      if (now > d.until || d.takers.has(who.id) || d.takers.size >= d.slots || (who.stunUntil || 0) > now) return;
      if (WR.dist2(who, d) > WR.PICK_R ** 2) return;
      d.takers.add(who.id);
      if (who === me){
        const res = { t:'pick', id:d.id, kind:d.kind, svc:d.svc };
        if (d.kind === 'shield'){ me.shieldUntil = now + 5000; res.ms = 5000; }
        else if (d.kind === 'super'){ score += 50; res.practiceDone = 'super'; }
        else {
          score += 10;
          if (!done.has(d.svc)){
            pieces[d.svc] = (pieces[d.svc] || 0) + 1; res.pieces = pieces[d.svc];
            if (pieces[d.svc] >= NEED){ done.add(d.svc); res.practiceDone = d.svc; }
          } else res.done = true;
        }
        res.score = score;
        out(res);
      } else who.score += d.kind === 'super' ? 50 : 10;
      const left = d.slots - d.takers.size;
      if (left <= 0){ drops.delete(d.id); out({ t:'gone', id:d.id, r:'full' }); }
      else out({ t:'slots', id:d.id, left });
    }
    function tick(){
      const now = Date.now(), dt = .066;
      if (phase === 'live'){
        bugs.forEach(b => WR.stepBug(b, dt));
        if (me && me.stunUntil < now && (me.safeUntil || 0) < now){
          for (const b of bugs) if (WR.dist2(me, b) < WR.BUG_R ** 2){
            if (me.shieldUntil > now){ me.safeUntil = now + 1200; score += 5; out({ t:'blocked', score }); }
            else { me.stunUntil = now + 3000; me.safeUntil = now + 4500; out({ t:'stun', ms:3000 }); }
            break;
          }
        }
        for (const d of drops.values()){
          if (now > d.until + 200){ drops.delete(d.id); out({ t:'gone', id:d.id, r:'ttl' }); continue; }
          if (me) take(me, d, now);
        }
      }
      // Bot: chạy tới hộp gần nhất (chậm hơn người một chút), không có thì đi dạo
      bots.forEach(b => {
        let tgt = null, best = Infinity;
        if (phase === 'live') for (const d of drops.values()){ if (d.takers.has(b.id)) continue; const q = WR.dist2(b, d); if (q < best){ best = q; tgt = d; } }
        if (!tgt){ if (!b.wander || WR.dist2(b, b.wander) < 900) b.wander = WR.randomWalkable(); tgt = b.wander; }
        const dx = tgt.x - b.x, dy = tgt.y - b.y, L = Math.hypot(dx, dy) || 1, sp = b.speed * dt;
        const n = WR.moveWithCollision(b.x, b.y, dx / L * Math.min(sp, L), dy / L * Math.min(sp, L));
        if (n.x === b.x && n.y === b.y) b.wander = WR.randomWalkable();
        b.x = n.x; b.y = n.y;
        if (phase === 'live') for (const d of drops.values()) take(b, d, now);
      });
      if (++lbTick % 15 === 0 && phase === 'live'){
        const top = [{ nick: me.nick, score }, ...bots.map(b => ({ nick: b.nick, score: b.score }))].filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score).slice(0, 10).map(x => [x.nick, x.score]);
        out({ t:'lb', top });
      }
      seqTick = (seqTick + 1) % 3;
      if (!seqTick) out({ t:'snap', p: bots.map(b => [b.rid, Math.round(b.x), Math.round(b.y)]), b: phase === 'live' ? bugs.map(b => [b.id, Math.round(b.x), Math.round(b.y)]) : [] });
    }
    let seqTick = 0, lbTick = 0;
    function end(){
      setPhase('ended');
      clearInterval(loop); loop = setInterval(tick, 66);
      drops.clear(); out({ t:'clear' });
      const board = [{ nick: me.nick, score }, ...bots.map(b => ({ nick: b.nick, score: b.score }))].sort((a, b) => b.score - a.score);
      out({ t:'result', practice:true, score, rank: board.findIndex(x => x.nick === me.nick) + 1, of: board.length, codes:[], top: board.map(x => [x.nick, x.score]) });
    }

    function send(m){
      if (m.t === 'hello'){
        const s = WR.spawnPoint();
        me = { id:'me', nick:m.nick, avatar:m.avatar, x:s.x, y:s.y, stunUntil:0, shieldUntil:0 };
        bots = BOT_NAMES.map((n, i) => { const p = WR.randomWalkable(); return { id:'b' + i, rid:i + 2, nick:n + ' (bot)', avatar:AVATARS[i % 6], x:p.x, y:p.y, speed:170 + Math.random() * 60, score:0 }; });
        out({ t:'welcome', practice:true, you:{ pid:'practice', nick:m.nick, avatar:m.avatar, rid:1, x:Math.round(s.x), y:Math.round(s.y) }, room:'Luyện tay',
              roster: bots.map(b => [b.rid, b.nick, b.avatar, Math.round(b.x), Math.round(b.y)]), drops:[], need:NEED, maxCodes:0,
              state:{ score:0, pieces:{}, codes:[], claimed:[] }, stock:{} });
        out({ t:'room', room:'Luyện tay', n: bots.length + 1, online: bots.length + 1, rooms:1 });
        start();
      } else if (m.t === 'mv' && me){
        if (me.stunUntil > Date.now()){ out({ t:'pos', x:Math.round(me.x), y:Math.round(me.y) }); return; }
        const n = WR.moveWithCollision(me.x, me.y, m.x - me.x, m.y - me.y); me.x = n.x; me.y = n.y;
      } else if (m.t === 'emo' && me){
        out({ t:'emo', id:1, i:m.i });
        if (Math.random() < .5){ const b = bots[Math.floor(Math.random() * bots.length)]; later(700, () => out({ t:'emo', id:b.rid, i: Math.floor(Math.random() * 6) })); }
      } else if (m.t === 'restart'){ start(); }
    }
    return { send, close(){ timers.forEach(clearTimeout); clearInterval(loop); } };
  }
  return { create };
})();
