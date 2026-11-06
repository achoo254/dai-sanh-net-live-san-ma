/* =============================================================================
 * iNET Tech Office — điều khiển phía người chơi (3D, tự chuyển 2D nếu máy không hỗ trợ WebGL)
 * - Vào văn phòng: biệt danh + phối đồ nhân vật người 3D
 * - Gom đủ mảnh / giành Siêu Deal → giải MẬT THƯ mới nhận mã (máy chủ chấm)
 * - Đi lại: chạm/click sàn để đi tới, kéo để dùng cần điều khiển, phím mũi tên/WASD
 * - Gửi vị trí ~10 lần/giây; máy chủ kiểm tra tốc độ, quyết định ai nhặt được hộp
 * - Chế độ LIVE (WebSocket) hoặc LUYỆN TAY (?mode=practice, máy chủ giả trong trình duyệt)
 * ============================================================================= */
(async () => {
'use strict';
const SCRIPT_BASE = document.currentScript ? document.currentScript.src : location.href;
const WR = window.WorldRules, SP = window.WorldSprites;
const PRACTICE = new URLSearchParams(location.search).get('mode') === 'practice';
const EMOTES = ['Săn deal thôi!', 'Chờ Siêu Deal!', 'Hết mã rồi 😭', 'Được mã rồi 🎉', 'Ai đi Hosting?', 'Cảm ơn iNET!'];
const PRACTICE_SERVICES = [
  { id:'domain', name:'Tên miền', short:'Tên miền' }, { id:'hosting', name:'Hosting OnePanel', short:'Hosting' },
  { id:'vps', name:'Cloud Server / VPS', short:'VPS' }, { id:'ssl', name:'Chứng chỉ SSL', short:'SSL' }, { id:'email', name:'Email doanh nghiệp', short:'Email' }];

/* ---------- Tiện ích ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mem = {};
const store = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return mem[k] ?? null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch(e){ mem[k] = String(v); } }
};
const track = (name, data = {}) => { try { (window.dataLayer = window.dataLayer || []).push({ event:'net_world_' + name, practice:PRACTICE, ...data }); } catch(e){} };
const fmt = ms => {
  ms = Math.max(0, ms); const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60, p = n => String(n).padStart(2, '0');
  return d ? `${d} ngày ${p(h)}:${p(m)}:${p(ss)}` : h ? `${p(h)}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
};
const vnTime = ts => { const d = new Date(ts + 7 * 3600e3), p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ngày ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`; };

/* ---------- Âm thanh ---------- */
let actx = null, muted = store.get('netDeal.mute') === '1';
function tone(freq, dur, type = 'sine', vol = .15, delay = 0, slideTo){
  if (muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + .02);
  } catch(e){}
}
const sfx = {
  drop: () => tone(520, .05, 'sine', .04),
  gift: () => { tone(740, .09, 'sine', .16); tone(1110, .12, 'sine', .14, .07); },
  super: () => [660, 880, 1100, 1320].forEach((f, i) => tone(f, .12, 'triangle', .15, i * .06)),
  bug: () => tone(220, .3, 'sawtooth', .16, 0, 70),
  shield: () => { tone(440, .1, 'triangle', .15); tone(880, .2, 'triangle', .15, .08); },
  code: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, .16, 'triangle', .17, i * .09)),
  tick: () => tone(600, .06, 'sine', .1),
  warn: () => [880, 660, 880].forEach((f, i) => tone(f, .12, 'square', .07, i * .15)),
  pop: () => tone(900, .05, 'sine', .08)
};

/* ---------- Trạng thái ---------- */
const stage = $('#stage'), canvas = $('#world'), mini = $('#mini'), fxEl = $('#fx'), chipsEl = $('#chips');
// Ưu tiên 3D (Three.js); máy không có WebGL hoặc lỗi → bản 2D. Thêm ?2d để ép bản 2D.
const FORCE_2D = new URLSearchParams(location.search).has('2d');
let R = null, avatarMod = null;
function webglOK(){ try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch(e){ return false; } }
if (!FORCE_2D && webglOK()){
  try {
    avatarMod = await import(new URL('office3d-human-avatar-factory.js', SCRIPT_BASE).href);
    R = (await import(new URL('office3d-office-scene-renderer.js', SCRIPT_BASE).href)).create(canvas);
  } catch(e){ console.warn('[3D] không chạy được, chuyển sang 2D:', e); R = null; avatarMod = null; }
}
if (!R) R = WorldRenderer.create(canvas);
stage.classList.toggle('mode3d', !!R.is3D);
const S = {                                     // trạng thái để vẽ
  me: { x: WR.SPAWN.x, y: WR.SPAWN.y - 40, avatar:'wave', nick:'', facing:1, moving:false, stunUntil:0, shieldUntil:0, emote:'', emoteUntil:0 },
  others: new Map(), drops: new Map(), bugs: new Map(), stock:{}, names:{}, live:false, screenText:'--:--', screenSub:'', target:null, puzzle:null
};
const G = { score:0, pieces:{}, claimed:new Set(), codes:[], top:[] };   // trạng thái phiên của em
let services = PRACTICE ? PRACTICE_SERVICES : [], need = 5, myRid = 0;
let link = null, joined = false, retry = 0, stopReconnect = false, siteKey = '', tsWidget = null, chatAutoOpened = false;
let offset = 0, phase = { phase:'idle', session:null, next:null }, sessionId = null;
let me = { pid: store.get('netLive.pid'), nick: store.get('netLive.nick') || '', avatar: store.get('netLive.look') || CharacterCustomizer.str(CharacterCustomizer.random()) };
if (!me.pid || !/^[A-Za-z0-9_-]{8,40}$/.test(me.pid)){
  me.pid = 'p' + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => (b % 36).toString(36)).join('');
  store.set('netLive.pid', me.pid);
}
const serverNow = () => Date.now() + offset;
function setServices(list){
  services = list; S.names = Object.fromEntries(list.map(s => [s.id, s.short]));
  buildChips(); renderChips();
}

/* ---------- Khởi động ---------- */
const customizer = CharacterCustomizer.create({ root: $('#custom'), previewCanvas: $('#preview'), avatarMod, initial: me.avatar,
  onChange: v => { me.avatar = v; S.me.avatar = v; store.set('netLive.look', v); } });
const chat = ChatBox.create({ root: $('#chat'), btn: $('#chatBtn'), badge: $('#chatBadge'),
  onSend: text => send({ t:'chat', m:text }), onReport: id => send({ t:'report', id }) });
const pz = PuzzlePanel.create({ root: $('#puzzle'), onSubmit: (id, a) => send({ t:'ans', id, a }),
  svcName: svc => svc === 'super' ? 'Siêu Deal' : (S.names[svc] || svc) });
const arrows = TargetArrows.create(stage);
const roomLabel = id => String(id || '').replace(/^S/, '');          // máy chủ đặt tên sảnh "S1" → hiện "Sảnh 1"
$('#nick').value = me.nick;
if (PRACTICE){
  stage.classList.add('practice');
  $('#tJoin').innerHTML = 'Luyện tay <em>iNET Tech Office</em>';
  $('#joinSub').innerHTML = 'Đi lại trong văn phòng, tranh hộp quà với 8 đồng nghiệp ảo và thử giải mật thư. Bản luyện tay <b>không phát mã</b>.';
  $('#nextInfo').innerHTML = '<a href="./">← Về sảnh live săn mã thật</a>';
  $('#btnJoin').textContent = 'Bắt đầu luyện';
  $('#practiceLink').hidden = true;
  setServices(PRACTICE_SERVICES);
} else {
  fetch('api/config', { cache:'no-store' }).then(r => r.json()).then(cfg => {
    setServices(cfg.services); need = cfg.need; siteKey = cfg.turnstileSiteKey || '';
    $('#needN').textContent = need; $('#maxCodes').textContent = cfg.maxCodes;
    S.stock = cfg.stock || {}; renderChips();
    setPhase(cfg.phase);
    if (siteKey) loadTurnstile();
    else if (me.nick.length >= 2 && store.get('netLive.auto') === '1') connect();
  }).catch(() => { $('#nextInfo').innerHTML = '<b>Chưa kết nối được máy chủ live.</b> Em thử tải lại trang sau ít phút nhé.'; });
}
setInterval(clockTick, 250);
requestAnimationFrame(frame);

/* ---------- Turnstile ---------- */
let tsResolve = null, tsToken = '';
function loadTurnstile(){
  window.onTsLoad = () => {
    tsWidget = turnstile.render('#ts', { sitekey: siteKey, theme:'light', language:'vi',
      callback: t => { tsToken = t; if (tsResolve){ tsResolve(t); tsResolve = null; } }, 'expired-callback': () => { tsToken = ''; } });
  };
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTsLoad'; s.async = true; document.head.appendChild(s);
}
function getToken(){
  if (!siteKey) return Promise.resolve('');
  if (tsToken){ const t = tsToken; tsToken = ''; return Promise.resolve(t); }
  try { if (window.turnstile && tsWidget != null) turnstile.reset(tsWidget); } catch(e){}
  return new Promise(res => { tsResolve = t => { tsToken = ''; res(t); }; });
}

/* ---------- Vào sảnh ---------- */
$('#joinForm').addEventListener('submit', e => {
  e.preventDefault();
  const nick = $('#nick').value.replace(/\s+/g, ' ').trim();
  if (nick.length < 2){ showJoinErr('Biệt danh cần 2–16 ký tự.'); return; }
  me.nick = nick; store.set('netLive.nick', nick); store.set('netLive.auto', '1');
  $('#btnJoin').disabled = true; $('#btnJoin').textContent = 'Đang vào sảnh…';
  stopReconnect = false; tone(0, 0);
  connect();
});
function showJoinErr(msg){
  const el = $('#joinErr'); el.textContent = msg; el.hidden = !msg;
  $('#btnJoin').disabled = false; $('#btnJoin').textContent = PRACTICE ? 'Bắt đầu luyện' : 'Vào sảnh';
}

/* ---------- Kết nối (WebSocket hoặc máy chủ giả) ---------- */
async function connect(){
  if (PRACTICE){
    link = window.PracticeHub.create(handle);
    link.send({ t:'hello', nick: me.nick, avatar: me.avatar });
    return;
  }
  if (link && link.readyState <= 1) return;
  const token = await getToken();
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/[^/]*$/, '') + 'ws';
  const ws = new WebSocket(url); link = ws;
  ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ t:'hello', pid: me.pid, nick: me.nick, avatar: me.avatar, ts: token })); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch(err){ return; } handle(m); };
  ws.onclose = e => {
    const fatal = { 4002:'Thiết bị không hợp lệ, em tải lại trang nhé.', 4003:'Biệt danh cần 2–16 ký tự.', 4005:'Biệt danh chưa phù hợp (không dùng từ thô tục, link, số điện thoại). Em đổi tên khác nhé.',
                    4004:'Chưa qua bước xác minh chống bot, em thử lại nhé.', 4001:'Em đang mở sảnh ở một tab/thiết bị khác.' }[e.code];
    if (fatal){
      stopReconnect = true; joined = false; stage.classList.remove('joined'); store.set('netLive.auto', '0');
      $('#screenJoin').hidden = false; showJoinErr(fatal); $('#net').hidden = true; return;
    }
    if (stopReconnect) return;
    $('#net').hidden = !joined;
    setTimeout(connect, Math.min(10000, 800 * Math.pow(2, retry++)) * (0.7 + Math.random() * 0.6));
  };
}
function send(obj){
  if (PRACTICE){ if (link) link.send(obj); return; }
  if (link && link.readyState === 1) link.send(JSON.stringify(obj));
}

/* ---------- Tin nhắn từ máy chủ ---------- */
function handle(m){
  switch (m.t){
    case 'welcome': return onWelcome(m);
    case 'phase': return setPhase(m);
    case 'join': return addOther(m.p);
    case 'leave': return S.others.delete(m.id);
    case 'snap': return onSnap(m);
    case 'pos': S.me.x = m.x; S.me.y = m.y; S.target = null; return;
    case 'drop': return onDrop(m);
    case 'slots': { const d = S.drops.get(m.id); if (d) d.left = m.left; return; }
    case 'gone': return S.drops.delete(m.id);
    case 'clear': S.drops.clear(); S.bugs.clear(); return;
    case 'pick': return onPick(m);
    case 'stun': S.me.stunUntil = Date.now() + m.ms; S.target = null; G.streak = 0; fxAt('Dính DDoS! Đơ 3 giây', S.me, 'bad'); sfx.bug(); shake(); return;
    case 'blocked':
      if (m.reason){ blockedMsg(m.reason, m.svc); return; }                     // mật thư kế tiếp không mở được
      G.score = m.score; updateScore(); fxAt('Khiên chặn DDoS! +5', S.me, 'info'); sfx.shield(); return;
    case 'puzzle':
      S.puzzle = { id:m.id, clues:(m.clues || []).map(c => ({ ...c })) };
      pz.open(m); sfx.warn(); track('puzzle_open', { svc:m.svc, tier:m.tier });
      if (m.clues && m.clues.length && !m.clues.every(c => c.text)) toast('Mật thư cấp 3: đi tìm manh mối trong văn phòng!');
      return;
    case 'clue':
      if (S.puzzle && S.puzzle.id === m.id){ const c = S.puzzle.clues.find(x => x.spot === m.spot); if (c) c.text = m.text; }
      pz.clue(m); sfx.pop(); fxAt('Đọc được manh mối!', S.me, 'info'); return;
    case 'ans_r':
      if (pz.result(m)){
        S.puzzle = null; S.me.cheerUntil = Date.now() + 1600;
        if (typeof m.score === 'number'){ G.score = m.score; updateScore(); }
        if (m.code) gotCode(m.code); else { toast('Giải đúng mật thư!'); sfx.code(); }
        track('puzzle_solved', { ms:m.ms });
      } else if (m.needClues){ toast(`Đi đọc thêm ${m.needClues} manh mối rồi mới trả lời được`, 'warn'); sfx.warn(); }
      else if (!m.slow){ sfx.bug(); if (m.end === 'expired'){ S.puzzle = null; pz.close(); toast('Mã giữ chỗ đã hết hạn', 'warn'); } }
      return;
    case 'puzzle_end':
      S.puzzle = null; pz.end(m);
      if (m.pieces){ G.pieces = m.pieces; renderChips(); }
      toast(m.reason === 'timeout' ? 'Hết giờ giữ mã, mã trả lại kho' : 'Hết lượt thử, mã trả lại kho', 'warn');
      track('puzzle_' + m.reason); return;
    case 'emo': return onEmote(m);
    case 'chat': return onChat(m);
    case 'chat_hide': return chat.hide(m.id);
    case 'chat_err':
      chat.sys(m.m, m.soft ? 'info' : 'warn');
      if (m.mutedUntil) chat.setMuted(m.mutedUntil);
      return;
    case 'stock': S.stock = m.s; return renderChips();
    case 'feed': return (m.items || []).forEach(pushTicker);
    case 'room': return onRoom(m);
    case 'lb': G.top = m.top; return renderTop();
    case 'super_soon': return superWarn(m.ms);
    case 'result': return onResult(m);
  }
}
function onWelcome(m){
  joined = true; $('#net').hidden = true;
  if (m.services) setServices(m.services);
  need = m.need || need; myRid = m.you.rid;
  S.me.x = m.you.x; S.me.y = m.you.y; S.me.avatar = m.you.avatar; S.me.nick = m.you.nick; S.target = null;
  S.puzzle = null; pz.close();
  chat.load(m.chat || [], myRid); chat.setMuted(m.chatMutedUntil || 0);
  if (stage.classList.contains('wide') && !chatAutoOpened){ chatAutoOpened = true; chat.open(true, false); }   // máy tính: mở sẵn khung chat (không cướp phím)
  $('#chatRoom').textContent = m.room ? (PRACTICE ? 'Luyện tay' : 'Sảnh ' + roomLabel(m.room)) : '';
  S.others.clear(); (m.roster || []).forEach(addOther);
  S.drops.clear(); (m.drops || []).forEach(d => onDrop(d, true));
  G.score = m.state.score; G.pieces = m.state.pieces || {}; G.codes = m.state.codes || []; G.claimed = new Set(m.state.claimed || []);
  if (m.stock) S.stock = m.stock;
  $('#screenJoin').hidden = true; showJoinErr('');
  stage.classList.add('joined');
  updateScore(); renderChips(); renderCodes();
  track('join', { avatar: me.avatar });
}
function addOther(p){
  const [id, nick, avatar, x, y] = p;
  if (id === myRid) return;
  S.others.set(id, { id, nick, avatar, x, y, tx:x, ty:y, facing:1, moving:false, emote:'', emoteUntil:0, stunUntil:0, shieldUntil:0, lastMove:0 });
}
function onSnap(m){
  const now = performance.now();
  (m.p || []).forEach(([id, x, y]) => {
    const o = S.others.get(id); if (!o) return;
    if (x !== o.tx) o.facing = x > o.tx ? 1 : -1;
    o.tx = x; o.ty = y; o.lastMove = now;
  });
  if (m.b){
    const seen = new Set();
    m.b.forEach(([id, x, y]) => { seen.add(id); const b = S.bugs.get(id); if (b){ b.tx = x; b.ty = y; } else S.bugs.set(id, { id, x, y, tx:x, ty:y }); });
    for (const id of S.bugs.keys()) if (!seen.has(id)) S.bugs.delete(id);
  }
}
function onDrop(m, silent){
  S.drops.set(m.id, { id:m.id, kind:m.kind, svc:m.svc, x:m.x, y:m.y, left:m.slots, until: Date.now() + m.ttl, mine: !!m.mine });
  if (!silent) m.kind === 'super' ? sfx.super() : sfx.drop();
}
function onPick(m){
  const d = S.drops.get(m.id); if (d) d.mine = true;
  if (typeof m.score === 'number') G.score = m.score;
  if (typeof m.streak === 'number') G.streak = m.streak;
  const name = m.svc === 'super' ? 'Siêu Deal' : (S.names[m.svc] || '');
  if (m.kind === 'shield'){ S.me.shieldUntil = Date.now() + m.ms; fxAt('Khiên OneShield 5 giây!', S.me, 'info'); sfx.shield(); }
  else if (m.kind === 'super'){ fxAt('+50 Siêu Deal!', S.me); sfx.super(); }
  else { if (!m.done && m.pieces) G.pieces[m.svc] = m.pieces; fxAt(m.done ? '+10 điểm' : `+1 mảnh ${name} (${Math.min(m.pieces, need)}/${need})`, S.me); sfx.gift(); }
  if (m.blocked) blockedMsg(m.blocked, m.svc);
  else if (m.queued) toast(`Đủ mảnh ${name}! Giải xong mật thư đang mở sẽ tới lượt ${name}`);
  updateScore(); renderChips();
}
function blockedMsg(reason, svc){
  const name = svc === 'super' ? 'Siêu Deal' : (S.names[svc] || '');
  const txt = { stockout:`Kho ${name} vừa hết mã`, limit_session:'Em đã nhận đủ mã của phiên này', limit_day:`Hôm nay em đã nhận mã ${name} rồi`,
                limit:`Hôm nay em đã nhận ${name} rồi`, busy:'Giải xong mật thư đang mở rồi mới nhận được Siêu Deal' }[reason];
  if (txt) toast(txt, 'warn');
  if (reason !== 'stockout' && svc !== 'super') G.claimed.add(svc);
}
function gotCode(code){
  G.codes.push(code); G.claimed.add(code.service);
  const name = code.service === 'super' ? 'Siêu Deal' : (S.names[code.service] || code.service);
  toast(`Em nhận được mã ${name}!`); sfx.code(); renderCodes(); track('code', { service: code.service });
  if (!$('#panel').classList.contains('open')) $('#panelBtn').textContent = `Mã của em (${G.codes.length}) ✨`;
}
function onEmote(m){
  const t = Date.now() + 2800, txt = EMOTES[m.i] || '';
  if (m.id === myRid){ S.me.emote = txt; S.me.emoteUntil = t; return; }
  const o = S.others.get(m.id); if (o){ o.emote = txt; o.emoteUntil = t; }
}
/** Tin chat: vào khung chat + bong bóng trên đầu nhân vật 5 giây */
function onChat(m){
  const mine = m.rid === myRid;
  chat.add(m, mine);
  const bubble = m.m.length > 38 ? m.m.slice(0, 36) + '…' : m.m, until = Date.now() + 5000;
  if (mine){ S.me.emote = bubble; S.me.emoteUntil = until; }
  else { const o = S.others.get(m.rid); if (o){ o.emote = bubble; o.emoteUntil = until; } }
  if (!mine) sfx.pop();
}
function onRoom(m){
  const o = $('#online'); o.hidden = false;
  o.textContent = PRACTICE ? `Luyện tay cùng ${m.n - 1} bot` : `${m.online.toLocaleString('vi-VN')} người online · Sảnh ${roomLabel(m.room)}${m.rooms > 1 ? '/' + m.rooms : ''}`;
}

/* ---------- Pha phiên ---------- */
function setPhase(p){
  if (!p) return;
  if (typeof p.now === 'number') offset = p.now - Date.now();
  const prev = phase.phase; phase = p;
  const sid = p.session && p.session.id;
  if ((p.phase === 'lobby' || p.phase === 'live') && sid !== sessionId){
    G.score = 0; G.streak = 0; G.pieces = {}; G.claimed = new Set(); G.codes = []; G.top = [];
    updateScore(); renderChips(); renderCodes(); renderTop();
  }
  if (p.phase === 'lobby' || p.phase === 'live') sessionId = sid;
  if (prev === 'live' && p.phase !== 'live'){ S.drops.clear(); S.bugs.clear(); }
  if (p.phase === 'live' && prev !== 'live' && joined){
    showCount('Săn!'); sfx.super(); $('#screenResult').hidden = true; track('live_start');
    setTimeout(() => toast('Đi theo mũi tên ở mép màn hình tới hộp quà gần nhất!'), 900);
  }
  S.live = p.phase === 'live';
  stage.classList.toggle('playing', S.live);
  const el = $('#phase'); el.className = 'phase ' + p.phase;
  $('span', el).textContent = PRACTICE ? ({ live:'LUYỆN TAY', lobby:'Sắp bắt đầu', ended:'Đã xong lượt luyện' }[p.phase] || 'Luyện tay')
    : ({ live:'LIVE · ' + (p.session ? p.session.title : ''), lobby:'Sảnh chờ · ' + (p.session ? p.session.title : ''), ended:'Phiên đã kết thúc', idle:'Chưa tới giờ live' }[p.phase] || '');
  renderNextInfo(); clockTick();
}
function renderNextInfo(){
  if (PRACTICE) return;
  const p = phase, el = $('#nextInfo');
  if (p.phase === 'live') el.innerHTML = `<b>Đang LIVE:</b> ${esc(p.session.title)}. Vào ngay còn kịp săn hộp!`;
  else if (p.phase === 'lobby') el.innerHTML = `<b>Sảnh đang mở:</b> ${esc(p.session.title)}, live lúc ${vnTime(p.session.start)}.`;
  else if (p.next){ const lm = Math.round((p.next.start - p.next.lobbyAt) / 60000);
    el.innerHTML = `<b>Phiên kế tiếp:</b> ${esc(p.next.title)}, live lúc ${vnTime(p.next.start)}.` + (lm ? ` Sảnh mở trước ${lm} phút.` : ''); }
  else el.innerHTML = '<b>Chương trình đã kết thúc.</b> Cảm ơn em đã tham gia cùng iNET!';
  $('#rNext').innerHTML = el.innerHTML;
}
let lastCount = null;
function clockTick(){
  const now = serverNow(), p = phase;
  if (p.phase === 'live' && p.session){
    const left = p.session.end - now, dur = p.session.end - p.session.start;
    $('#hClock').textContent = fmt(left);
    $('#hBarI').style.transform = `scaleX(${Math.max(0, left / dur)})`;
    $('#hBar').classList.toggle('low', left < 30000);
    S.screenText = fmt(left); S.screenSub = PRACTICE ? 'LUYỆN TAY · CÒN LẠI' : 'ĐANG LIVE · CÒN LẠI';
  }
  let target = null, lbl = '', sub = '';
  if (p.phase === 'lobby'){ target = p.session.start; lbl = 'Live bắt đầu sau'; sub = 'Đi dạo, ghé các quầy, chờ hộp quà rơi!'; }
  else if (p.phase !== 'live' && p.next){ target = p.next.start; lbl = 'Phiên kế tiếp sau'; sub = `${esc(p.next.title)} · <a href="?mode=practice">Luyện tay trong lúc chờ</a>`; }
  if (p.phase !== 'live'){ S.screenText = target ? fmt(target - now) : '--:--'; S.screenSub = target ? (p.phase === 'lobby' ? 'LIVE BẮT ĐẦU SAU' : 'PHIÊN KẾ TIẾP SAU') : 'ĐẠI SẢNH NÉT'; }
  const w = $('#wait');
  w.hidden = !joined || p.phase === 'live' || !target;
  if (!w.hidden){ $('#wLbl').textContent = lbl; $('#wClock').textContent = fmt(target - now); $('#wSub').innerHTML = sub; }
  if (p.phase === 'lobby' && joined){
    const s = Math.ceil((p.session.start - now) / 1000);
    if (s <= 3 && s >= 1 && s !== lastCount){ lastCount = s; showCount(String(s)); sfx.tick(); }
  }
  stage.classList.toggle('stunned', S.me.stunUntil > Date.now());
  stage.classList.toggle('shielded', S.me.shieldUntil > Date.now());
}
function showCount(txt){
  const c = $('#count'); c.hidden = false; c.innerHTML = `<span>${esc(txt)}</span>`;
  clearTimeout(showCount.t); showCount.t = setTimeout(() => { c.hidden = true; }, 800);
}

/* ---------- Điều khiển ---------- */
const keys = new Set();
const KEYMAP = { ArrowUp:'u', KeyW:'u', ArrowDown:'d', KeyS:'d', ArrowLeft:'l', KeyA:'l', ArrowRight:'r', KeyD:'r' };
addEventListener('keydown', e => {
  if (e.target.closest('input, textarea')) return;
  const k = KEYMAP[e.code]; if (k){ keys.add(k); S.target = null; e.preventDefault(); }
  if (/^Digit[1-6]$/.test(e.code) && joined) sendEmote(+e.code.slice(5) - 1);
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
addEventListener('blur', () => keys.clear());

// Chạm/click = đi tới điểm đó; nhấn giữ rồi kéo = cần điều khiển ảo
let joy = null;
const joyEl = $('#joy'), knob = $('#joy i');
canvas.addEventListener('pointerdown', e => {
  if (!joined) return;
  canvas.setPointerCapture(e.pointerId);
  joy = { id:e.pointerId, sx:e.clientX, sy:e.clientY, dx:0, dy:0, active:false };
});
canvas.addEventListener('pointermove', e => {
  if (!joy || e.pointerId !== joy.id) return;
  const dx = e.clientX - joy.sx, dy = e.clientY - joy.sy, L = Math.hypot(dx, dy);
  if (!joy.active && L > 14){
    joy.active = true; S.target = null;
    const r = stage.getBoundingClientRect();
    joyEl.style.left = (joy.sx - r.left) + 'px'; joyEl.style.top = (joy.sy - r.top) + 'px'; joyEl.hidden = false;
  }
  if (joy.active){
    const k = Math.min(1, 50 / Math.max(L, 1));
    joy.dx = dx / Math.max(L, 1) * Math.min(1, L / 50); joy.dy = dy / Math.max(L, 1) * Math.min(1, L / 50);
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  }
});
function endJoy(e){
  if (!joy || e.pointerId !== joy.id) return;
  if (!joy.active){                         // chạm nhẹ → đi tới điểm đó
    const p = R.toWorld(e.clientX, e.clientY);
    const c = WR.clampWalkable(p.x, p.y);
    S.target = WR.blocked(c.x, c.y) ? null : c;
  }
  joy = null; joyEl.hidden = true; knob.style.transform = '';
}
canvas.addEventListener('pointerup', endJoy);
canvas.addEventListener('pointercancel', endJoy);

/* ---------- Vòng lặp khung hình ---------- */
let last = performance.now(), lastSend = 0, lastSentX = 0, lastSentY = 0, lastMini = 0, lastMoveAt = 0;
function frame(t){
  const dt = Math.min(0.1, (t - last) / 1000); last = t;     // máy yếu ≥10 khung/giây vẫn đi đúng tốc độ
  const now = Date.now(), me_ = S.me;
  // Hướng đi
  let vx = 0, vy = 0;
  if (joined && me_.stunUntil <= now){
    if (keys.size){ vx = (keys.has('r') - keys.has('l')); vy = (keys.has('d') - keys.has('u')); }
    else if (joy && joy.active){ vx = joy.dx; vy = joy.dy; }
    else if (S.target){
      const dx = S.target.x - me_.x, dy = S.target.y - me_.y, L = Math.hypot(dx, dy);
      if (L < 6) S.target = null; else { vx = dx / L; vy = dy / L; }
    }
  }
  const L = Math.hypot(vx, vy);
  me_.moving = L > 0.05;
  if (me_.moving){
    const k = Math.min(1, L) / (L || 1), step = WR.SPEED * dt;
    let mx = vx * k * step, my = vy * k * step;
    if (S.target){ const rem = Math.hypot(S.target.x - me_.x, S.target.y - me_.y); if (rem < step){ mx = S.target.x - me_.x; my = S.target.y - me_.y; } }
    const n = WR.moveSteppedWithCollision(me_.x, me_.y, mx, my);   // cùng hàm với máy chủ → không lệch vị trí
    if (n.x === me_.x && n.y === me_.y) S.target = null;
    if (Math.abs(n.x - me_.x) > .3) me_.facing = n.x > me_.x ? 1 : -1;
    me_.x = n.x; me_.y = n.y;
  }
  // Gửi vị trí 10 lần/giây khi đang đi, và thêm ~0,6 giây sau khi dừng để máy chủ (nếu đang chậm vài bước) đuổi kịp
  const changed = Math.abs(me_.x - lastSentX) > .5 || Math.abs(me_.y - lastSentY) > .5;
  if (changed) lastMoveAt = t;
  if (joined && t - lastSend > 100 && (changed || t - lastMoveAt < 600)){
    lastSend = t; lastSentX = me_.x; lastSentY = me_.y;
    send({ t:'mv', x: Math.round(me_.x), y: Math.round(me_.y) });
  }
  // Nội suy người khác + bọ
  const a = 1 - Math.exp(-dt * 10);
  for (const o of S.others.values()){
    o.x += (o.tx - o.x) * a; o.y += (o.ty - o.y) * a;
    o.moving = Math.hypot(o.tx - o.x, o.ty - o.y) > 2;
  }
  for (const b of S.bugs.values()){ b.x += (b.tx - b.x) * a; b.y += (b.ty - b.y) * a; }
  R.render(S, now);
  if (t - lastMini > 200){ lastMini = t; R.drawMinimap(mini, S); }
  if (t - lastArrows > 100){ lastArrows = t; updateArrows(); }
  requestAnimationFrame(frame);
}
/* Mũi tên mép màn hình: 3 hộp quà gần nhất (ưu tiên dịch vụ em còn thiếu mảnh), Siêu Deal, manh mối mật thư cấp 3 */
let lastArrows = 0;
const panelEl = $('#panel');
function updateArrows(){
  if (!joined){ arrows.clear(); return; }
  const me_ = S.me, list = [], d2 = o => (o.x - me_.x) ** 2 + (o.y - me_.y) ** 2;
  if (S.puzzle && S.puzzle.clues) S.puzzle.clues.forEach(c => {
    const sp = WR.CLUE_SPOTS[c.spot];
    if (sp && !c.text) list.push({ key:'clue:' + c.spot, x:sp.x, y:sp.y, color:'#ffcf3a', label:'Manh mối', hot:true });
  });
  if (S.live){
    const gifts = [];
    for (const d of S.drops.values()){
      if (d.mine || d.until < Date.now()) continue;
      if (d.kind === 'super') list.push({ key:d.id, x:d.x, y:d.y, color:'#ffcf3a', label:'Siêu Deal', hot:true });
      else if (d.kind === 'gift') gifts.push(d);
    }
    const want = gifts.filter(d => !G.claimed.has(d.svc));
    (want.length ? want : gifts).sort((a, b) => d2(a) - d2(b)).slice(0, 3).forEach(d =>
      list.push({ key:d.id, x:d.x, y:d.y, color: SP.SVC_COLORS[d.svc], label: Math.max(1, Math.round(Math.sqrt(d2(d)) / 100)) + ' m' }));
  }
  const wide = stage.classList.contains('wide');
  arrows.update(list, (x, y) => R.is3D ? R.toScreen(x, y, 40) : R.toScreen(x, y),
    wide ? { l:16, r: panelEl.offsetWidth + 28, t:100, b:100 } : { l:10, r:10, t:210, b:92 });   // máy tính: chừa chỗ bảng Top bên phải
}
addEventListener('resize', () => { R.resize(); layoutClass(); });
// Lăn chuột để zoom (bản 3D)
canvas.addEventListener('wheel', e => { if (R.zoomBy){ e.preventDefault(); R.zoomBy(e.deltaY > 0 ? 1.08 : 0.92); } }, { passive:false });
function layoutClass(){ stage.classList.toggle('wide', stage.clientWidth / Math.max(1, stage.clientHeight) >= 1.05); }
layoutClass();

/* ---------- Biểu cảm ---------- */
$('#emotes').innerHTML = EMOTES.map((e, i) => `<button type="button" data-i="${i}" title="Phím ${i + 1}">${esc(e)}</button>`).join('');
let lastEmo = 0;
function sendEmote(i){
  if (Date.now() - lastEmo < 1500) return;
  lastEmo = Date.now(); send({ t:'emo', i }); $('#emotes').classList.remove('open');
}
$('#emotes').addEventListener('click', e => { const b = e.target.closest('button'); if (b) sendEmote(+b.dataset.i); });
$('#emoBtn').addEventListener('click', () => $('#emotes').classList.toggle('open'));

/* ---------- Hiển thị ---------- */
function updateScore(){ $('#hScore').textContent = G.score; }
function buildChips(){
  chipsEl.innerHTML = services.map(s => `<div class="chip" id="chip-${s.id}" style="--c:${SP.SVC_COLORS[s.id]}"><span>${esc(s.short)}</span><div class="pips">${'<i></i>'.repeat(need)}</div><small class="stock"></small></div>`).join('') +
    '<div class="chip super" id="chip-super"><span>Siêu Deal</span><small class="stock"></small></div>';
}
function renderChips(){
  services.forEach(s => {
    const c = document.getElementById('chip-' + s.id); if (!c) return;
    const n = Math.min(need, G.pieces[s.id] || 0), st = S.stock[s.id];
    const got = G.codes.some(x => x.service === s.id), done = got || G.claimed.has(s.id) || (PRACTICE && n >= need);
    c.classList.toggle('done', done); c.classList.toggle('out', !PRACTICE && !done && st && st[0] <= 0);
    c.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', done || i < n));
    $('.stock', c).textContent = got ? '✓ Có mã' : PRACTICE ? (done ? '✓ Đủ bộ' : `${n}/${need}`) : (st ? (st[0] > 0 ? `còn ${st[0]}` : 'hết mã') : '');
  });
  const sc = document.getElementById('chip-super');
  if (sc){ const st = S.stock.super; $('.stock', sc).textContent = PRACTICE ? 'bục giữa' : (st ? (st[0] > 0 ? `còn ${st[0]}` : 'hết mã') : ''); }
}
function codeCard(c){
  const name = c.service === 'super' ? 'Siêu Deal' : (services.find(s => s.id === c.service) || {}).name || c.service;
  return `<div class="code hit">
    <div class="row1"><span class="svc">${esc(name)}</span><span class="off">${esc(c.offer || '')}</span></div>
    <div class="row2"><code>${esc(c.code)}</code><button type="button" class="copy" data-code="${esc(c.code)}">Sao chép</button></div>
    <div class="cond">${esc(c.cond || '')}${c.expires ? ' · HSD: ' + esc(c.expires) : ''}</div>
    ${c.url ? `<a class="use" href="${esc(c.url)}" target="_blank" rel="noopener" data-use="1">Dùng mã ngay →</a>` : ''}
  </div>`;
}
function renderCodes(){
  $('#myCodes').innerHTML = PRACTICE ? '<p class="empty">Bản luyện tay không phát mã. <a href="./">Vào phiên live</a> để săn mã thật.</p>'
    : G.codes.length ? G.codes.map(c => `<div class="mycode"><div style="flex:1"><small>${esc(c.service === 'super' ? 'Siêu Deal' : S.names[c.service] || c.service)} · ${esc(c.offer || '')}</small><code>${esc(c.code)}</code></div><button type="button" class="copy" data-code="${esc(c.code)}">Chép</button></div>`).join('')
    : `<p class="empty">Gom đủ ${need} mảnh một dịch vụ để nhận mã.</p>`;
}
function renderTop(){
  const list = G.top || [];
  $('#top').innerHTML = list.map(([n, s]) => `<li class="${n === me.nick ? 'me' : ''}">${esc(n)} <span>${s}</span></li>`).join('');
  $('#topEmpty').hidden = list.length > 0;
}
const tickerQ = []; let tickerBusy = false;
function pushTicker(txt){ if (!txt) return; tickerQ.push(txt); if (tickerQ.length > 6) tickerQ.splice(0, tickerQ.length - 6); if (!tickerBusy) nextTicker(); }
function nextTicker(){
  const t = $('#ticker'), txt = tickerQ.shift();
  if (!txt){ tickerBusy = false; t.classList.remove('show'); return; }
  tickerBusy = true; t.innerHTML = esc(txt).replace(/^(.+?) vừa/, '<b>$1</b> vừa'); t.classList.add('show');
  setTimeout(nextTicker, 2200);
}
function superWarn(ms){
  const w = document.createElement('div'); w.className = 'superwarn';
  w.textContent = `Siêu Deal sau ${Math.round(ms / 1000)} giây! Chạy về bục giữa!`;
  stage.appendChild(w); setTimeout(() => w.remove(), 1900); sfx.warn();
}
function onResult(m){
  S.drops.clear();
  if (!joined) return;
  G.codes = m.codes || G.codes; renderCodes();
  $('#tResult').textContent = PRACTICE ? 'Xong lượt luyện tay!' : 'Phiên đã kết thúc';
  $('#rScore').textContent = m.score;
  $('#rRank').textContent = m.rank ? `Hạng ${m.rank}/${m.of.toLocaleString('vi-VN')}` : 'Chưa có điểm phiên này';
  $('#rCodes').innerHTML = PRACTICE ? '<p class="sub">Bản luyện tay không phát mã. Vào phiên live để săn mã thật nhé!</p>'
    : G.codes.length ? G.codes.map(codeCard).join('') : '<p class="sub">Phiên này em chưa nhận được mã. Phiên sau nhanh chân hơn nhé!</p>';
  $('#rTop').innerHTML = (m.top || []).slice(0, 10).map(([n, s]) => `<li class="${n === me.nick ? 'me' : ''}">${esc(n)} <span>${s}</span></li>`).join('');
  $('#rClose').textContent = PRACTICE ? 'Luyện lượt nữa' : 'Ở lại sảnh chờ phiên sau';
  $('#rAlt').textContent = PRACTICE ? 'Vào sảnh live' : 'Luyện tay';
  $('#rAlt').href = PRACTICE ? './' : '?mode=practice';
  $('#rNext').hidden = PRACTICE;
  $('#screenResult').hidden = false;
  track('result', { score: m.score, codes: G.codes.length });
}
$('#rClose').addEventListener('click', () => { $('#screenResult').hidden = true; if (PRACTICE) send({ t:'restart' }); });

function fxAt(text, w, cls = ''){
  const p = R.is3D ? R.toScreen(w.x, w.y, 200) : R.toScreen(w.x, w.y - 150);
  const d = document.createElement('div'); d.className = 'pop ' + cls; d.textContent = text;
  d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
  fxEl.appendChild(d); setTimeout(() => d.remove(), 1000);
}
function toast(text, kind){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  if (kind === 'warn') t.style.background = 'var(--warn)';
  stage.appendChild(t); setTimeout(() => t.remove(), 1700);
}
function shake(){ stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); }

/* ---------- Bảng, sao chép, chia sẻ, âm thanh ---------- */
$('#panelBtn').addEventListener('click', () => {
  const p = $('#panel'), open = !p.classList.contains('open');
  p.classList.toggle('open', open); $('#panelBtn').setAttribute('aria-expanded', open);
  $('#panelBtn').textContent = open ? 'Đóng' : (G.codes.length ? `Mã của em (${G.codes.length})` : 'Top · Mã của em');
});
async function copyText(t){
  try { await navigator.clipboard.writeText(t); return true; }
  catch(e){ try { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;opacity:0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch(e2){ return false; } }
}
document.addEventListener('click', async e => {
  const cp = e.target.closest('.copy');
  if (cp){
    const ok = await copyText(cp.dataset.code), old = cp.textContent;
    cp.textContent = ok ? 'Đã chép ✓' : 'Chọn mã & Ctrl+C'; cp.classList.toggle('ok', ok);
    setTimeout(() => { cp.textContent = old; cp.classList.remove('ok'); }, 1600); track('copy'); return;
  }
  if (e.target.closest('[data-use]')) track('use_code');
});
$('#btnShare').addEventListener('click', async () => {
  const text = `Mình vừa săn được ${G.score} điểm${G.codes.length ? ` và ${G.codes.length} mã giảm giá` : ''} ở iNET Tech Office 3D – Black Friday 2026! Vào săn cùng nhé:`;
  const url = new URL('./', location.href).href;
  try { if (navigator.share){ await navigator.share({ title:'iNET Tech Office 3D – Săn mã Black Friday', text, url }); return; } } catch(e){ return; }
  const ok = await copyText(text + ' ' + url), b = $('#btnShare'), old = b.textContent;
  b.textContent = ok ? 'Đã chép ✓' : 'Chia sẻ'; setTimeout(() => b.textContent = old, 1800);
});
const muteBtn = $('#mute');
function paintMute(){ muteBtn.classList.toggle('off', muted); muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false'); }
muteBtn.addEventListener('click', () => { muted = !muted; store.set('netDeal.mute', muted ? '1' : '0'); paintMute(); if (!muted) sfx.tick(); });
paintMute();

// Cho trang thử nghiệm/kiểm tra
window.__world = { S, G, R, send, get phase(){ return phase; } };
})();
