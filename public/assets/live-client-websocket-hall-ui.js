/* =============================================================================
 * Đại Sảnh Nét — trình duyệt phía người chơi cho phiên LIVE
 * - Kết nối WebSocket /ws, tự kết nối lại khi rớt mạng (giữ mảnh/mã nhờ máy chủ)
 * - Hiển thị hộp quà máy chủ thả, gửi lần chạm; MỌI kết quả do máy chủ quyết định
 * - Sảnh chờ + đếm ngược theo giờ máy chủ, kho mã live, dòng tin, Top 10, mã của em
 * ============================================================================= */
(() => {
'use strict';

/* ---------- Tiện ích ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mem = {};
const store = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return mem[k] ?? null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch(e){ mem[k] = String(v); } }
};
const track = (name, data = {}) => { try { (window.dataLayer = window.dataLayer || []).push({ event:'net_live_' + name, ...data }); } catch(e){} };
const fmt = ms => {
  ms = Math.max(0, ms); const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return d ? `${d} ngày ${p(h)}:${p(m)}:${p(ss)}` : h ? `${p(h)}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
};
// Giờ Việt Nam dạng "20:00 ngày 27/11"
const vnTime = ts => { const d = new Date(ts + 7 * 3600e3), p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ngày ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`; };

/* ---------- Âm thanh (Web Audio) ---------- */
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
  drop: () => tone(520, .05, 'sine', .05),
  gift: () => { tone(740, .09, 'sine', .16); tone(1110, .12, 'sine', .14, .07); },
  super: () => [660, 880, 1100, 1320].forEach((f, i) => tone(f, .12, 'triangle', .15, i * .06)),
  bug: () => tone(220, .3, 'sawtooth', .16, 0, 70),
  shield: () => { tone(440, .1, 'triangle', .15); tone(880, .2, 'triangle', .15, .08); },
  code: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, .16, 'triangle', .17, i * .09)),
  miss: () => tone(180, .08, 'square', .05),
  tick: () => tone(600, .06, 'sine', .1),
  warn: () => [880, 660, 880].forEach((f, i) => tone(f, .12, 'square', .07, i * .15))
};

/* ---------- Trạng thái ---------- */
const stage = $('#stage'), fxEl = $('#fx'), chipsEl = $('#chips');
let hall = null, services = [], SVC = {}, need = 5;
let ws = null, joined = false, retry = 0, stopReconnect = false, siteKey = '', tsWidget = null;
let offset = 0;                                  // giờ máy chủ − giờ máy người chơi
let phase = { phase:'idle', session:null, next:null };
let sessionId = null;
let me = { pid: store.get('netLive.pid'), nick: store.get('netLive.nick') || '' };
if (!me.pid || !/^[A-Za-z0-9_-]{8,40}$/.test(me.pid)){
  me.pid = 'p' + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => (b % 36).toString(36)).join('');
  store.set('netLive.pid', me.pid);
}
const S = { score:0, streak:0, pieces:{}, claimed:new Set(), codes:[], stock:{}, stunUntil:0, shieldUntil:0, top:[] };
const drops = new Map();                         // id → { id, seat, kind, slots, until, mine }
const serverNow = () => Date.now() + offset;

/* ---------- Khởi động ---------- */
fetch('api/config', { cache:'no-store' }).then(r => r.json()).then(cfg => {
  services = cfg.services; need = cfg.need; siteKey = cfg.turnstileSiteKey || '';
  SVC = Object.fromEntries(services.map(s => [s.id, s]));
  hall = Hall.build(stage, services, { assetBase:'assets/' });
  $('#needN').textContent = need; $('#maxCodes').textContent = cfg.maxCodes;
  S.stock = cfg.stock || {};
  buildChips(); renderChips(); renderCodes();
  setPhase(cfg.phase);
  $('#nick').value = me.nick;
  if (siteKey) loadTurnstile();
  else if (me.nick.length >= 2) connect();       // đã từng vào sảnh → vào lại luôn
  setInterval(clockTick, 250);
}).catch(() => {
  $('#nextInfo').innerHTML = '<b>Chưa kết nối được máy chủ live.</b> Em thử tải lại trang sau ít phút nhé.';
});

/* ---------- Turnstile (chống bot, chỉ bật khi máy chủ cấu hình) ---------- */
let tsResolve = null, tsToken = '';
function loadTurnstile(){
  window.onTsLoad = () => {
    tsWidget = turnstile.render('#ts', { sitekey: siteKey, theme:'light', language:'vi',
      callback: t => { tsToken = t; if (tsResolve){ tsResolve(t); tsResolve = null; } },
      'expired-callback': () => { tsToken = ''; } });
  };
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTsLoad';
  s.async = true; document.head.appendChild(s);
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
  me.nick = nick; store.set('netLive.nick', nick);
  $('#btnJoin').disabled = true; $('#btnJoin').textContent = 'Đang vào sảnh…';
  stopReconnect = false; connect();
  tone(0, 0);                                    // mở khoá âm thanh trên iOS bằng thao tác người dùng
});
function showJoinErr(msg){
  const el = $('#joinErr'); el.textContent = msg; el.hidden = !msg;
  $('#btnJoin').disabled = false; $('#btnJoin').textContent = 'Vào sảnh';
}

/* ---------- WebSocket ---------- */
async function connect(){
  if (ws && ws.readyState <= 1) return;
  const token = await getToken();
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/[^/]*$/, '') + 'ws';
  ws = new WebSocket(url);
  ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ t:'hello', pid: me.pid, nick: me.nick, ts: token })); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch(err){ return; } handle(m); };
  ws.onclose = e => {
    const fatal = { 4002:'Thiết bị không hợp lệ, em tải lại trang nhé.', 4003:'Biệt danh cần 2–16 ký tự.',
                    4004:'Chưa qua bước xác minh chống bot, em thử lại nhé.', 4001:'Em đang mở sảnh ở một tab/thiết bị khác.' }[e.code];
    if (fatal){
      stopReconnect = true; joined = false; stage.classList.remove('joined');
      $('#screenJoin').hidden = false; showJoinErr(fatal); $('#net').hidden = true; return;
    }
    if (stopReconnect) return;
    $('#net').hidden = !joined;
    const wait = Math.min(10000, 800 * Math.pow(2, retry++)) * (0.7 + Math.random() * 0.6);
    setTimeout(connect, wait);
  };
}
function send(obj){ if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

function handle(m){
  switch (m.t){
    case 'welcome': return onWelcome(m);
    case 'phase': return setPhase(m);
    case 'drop': return onDrop(m);
    case 'slots': return m.u.forEach(([id, left]) => setSlots(id, left));
    case 'tapr': return onTapResult(m);
    case 'stock': S.stock = m.s; return renderChips();
    case 'feed': return (m.items || [m.m]).forEach(pushTicker);
    case 'room': return onRoom(m);
    case 'lb': S.top = m.top; return renderTop();
    case 'super_soon': return superWarn(m.ms);
    case 'result': return onResult(m);
  }
}

function onWelcome(m){
  joined = true; $('#net').hidden = true;
  services = m.services; need = m.need;
  S.score = m.state.score; S.pieces = m.state.pieces || {}; S.codes = m.state.codes || [];
  S.claimed = new Set(m.state.claimed || []);
  S.stock = m.stock || S.stock;
  $('#screenJoin').hidden = true; showJoinErr('');
  stage.classList.add('joined');
  updateScore(); renderChips(); renderCodes();
  track('join', {});
}

/* ---------- Pha phiên ---------- */
function setPhase(p){
  if (!p) return;
  if (typeof p.now === 'number') offset = p.now - Date.now();
  const prev = phase.phase;
  phase = p;
  const sid = p.session && p.session.id;
  if ((p.phase === 'lobby' || p.phase === 'live') && sid !== sessionId){
    // phiên mới: làm mới trạng thái của em
    S.score = 0; S.streak = 0; S.pieces = {}; S.claimed = new Set(); S.codes = []; S.top = [];
    updateScore(); renderChips(); renderCodes(); renderTop();
  }
  if (p.phase === 'lobby' || p.phase === 'live') sessionId = sid;
  if (prev === 'live' && p.phase !== 'live') clearDrops();
  if (p.phase === 'live' && prev !== 'live' && joined){ countdownGo(); $('#screenResult').hidden = true; track('live_start', {}); }
  stage.classList.toggle('playing', p.phase === 'live');
  const el = $('#phase');
  el.className = 'phase ' + p.phase;
  $('span', el).textContent = { live:'LIVE · ' + (p.session ? p.session.title : ''), lobby:'Sảnh chờ · ' + (p.session ? p.session.title : ''),
                                ended:'Phiên đã kết thúc', idle:'Chưa tới giờ live' }[p.phase] || '';
  renderNextInfo();
  clockTick();
}
function renderNextInfo(){
  const p = phase, el = $('#nextInfo');
  if (p.phase === 'live') el.innerHTML = `<b>Đang LIVE:</b> ${esc(p.session.title)}. Vào ngay còn kịp giành hộp!`;
  else if (p.phase === 'lobby') el.innerHTML = `<b>Sảnh đang mở:</b> ${esc(p.session.title)}, live lúc ${vnTime(p.session.start)}.`;
  else if (p.next){
    const lobbyMin = Math.round((p.next.start - p.next.lobbyAt) / 60000);
    el.innerHTML = `<b>Phiên kế tiếp:</b> ${esc(p.next.title)}, live lúc ${vnTime(p.next.start)}.` + (lobbyMin ? ` Sảnh mở trước ${lobbyMin} phút.` : '');
  }
  else el.innerHTML = '<b>Chương trình đã kết thúc.</b> Cảm ơn em đã tham gia cùng iNET!';
  $('#rNext').innerHTML = el.innerHTML;
}
let lastCount = null;
function clockTick(){
  const now = serverNow(), p = phase;
  const live = p.phase === 'live' && p.session;
  if (live){
    const left = p.session.end - now, dur = p.session.end - p.session.start;
    $('#hClockLbl').textContent = 'Còn lại';
    $('#hClock').textContent = fmt(left);
    $('#hBarI').style.transform = `scaleX(${Math.max(0, left / dur)})`;
    $('#hBar').classList.toggle('low', left < 30000);
  }
  // Banner đếm ngược khi chưa live
  const w = $('#wait');
  let target = null, lbl = '', sub = '';
  if (p.phase === 'lobby'){ target = p.session.start; lbl = 'Live bắt đầu sau'; sub = 'Ngồi yên trên nệm, hộp quà sắp rơi!'; }
  else if (p.phase !== 'live' && p.next){ target = p.next.start; lbl = 'Phiên kế tiếp sau'; sub = `${p.next.title} · <a href="luyen-tay.html">Luyện tay trong lúc chờ</a>`; }
  w.hidden = !joined || live || !target;
  if (!w.hidden){
    $('#wLbl').textContent = lbl; $('#wClock').textContent = fmt(target - now); $('#wSub').innerHTML = sub;
  }
  // 3-2-1 ngay trước giờ live
  if (p.phase === 'lobby' && joined){
    const s = Math.ceil((p.session.start - now) / 1000);
    if (s <= 3 && s >= 1 && s !== lastCount){ lastCount = s; showCount(String(s)); sfx.tick(); }
  }
  // Hết đơ / hết khiên
  stage.classList.toggle('stunned', S.stunUntil > Date.now());
  stage.classList.toggle('shielded', S.shieldUntil > Date.now());
}
function showCount(txt){
  const c = $('#count'); c.hidden = false; c.innerHTML = `<span>${esc(txt)}</span>`;
  clearTimeout(showCount.t); showCount.t = setTimeout(() => { c.hidden = true; }, 800);
}
function countdownGo(){ lastCount = null; showCount('Săn!'); sfx.super(); }

/* ---------- Hộp quà ---------- */
const SYM = { gift:'i-gift', super:'i-gold', bug:'i-bug', shield:'i-shield' };
function onDrop(m){
  if (!hall) return;
  const seat = hall.seatById[m.seat];
  if (!seat) return;
  if (seat.drop) clearSeat(seat);
  const d = { id:m.id, seat:m.seat, kind:m.kind, slots:m.slots, left:m.slots, until: Date.now() + m.ttl, mine:false };
  drops.set(d.id, d);
  seat.drop = d;
  const it = $('.item', seat.el);
  it.innerHTML = `<svg aria-hidden="true"><use href="#${SYM[m.kind]}"/></svg>` + (m.kind === 'bug' ? '' : `<span class="slots">${m.slots}</span>`);
  seat.el.classList.remove('taken-mine');
  seat.el.classList.add('has-item', 't-' + m.kind);
  d.timer = setTimeout(() => { if (seat.drop === d) clearSeat(seat); drops.delete(d.id); }, m.ttl);
  if (m.kind === 'super') sfx.super(); else sfx.drop();
}
function setSlots(id, left){
  const d = drops.get(id); if (!d) return;
  d.left = left;
  const seat = hall.seatById[d.seat];
  const b = seat && seat.drop === d && $('.item .slots', seat.el);
  if (b){ b.textContent = left; b.classList.toggle('low', left <= 3); }
  if (left <= 0 && seat && seat.drop === d && !d.mine) setTimeout(() => { if (seat.drop === d) clearSeat(seat); }, 250);
}
function clearSeat(seat){
  seat.el.classList.remove('has-item', 't-gift', 't-super', 't-bug', 't-shield', 'taken-mine');
  if (seat.drop) clearTimeout(seat.drop.timer);
  seat.drop = null;
}
function clearDrops(){ if (hall) hall.seats.forEach(clearSeat); drops.clear(); }

function tapSeat(seat){
  if (!joined || phase.phase !== 'live') return;
  const d = seat.drop;
  if (!d || d.mine) return;
  if (S.stunUntil > Date.now()){ fx('Đang đơ…', seat.el, 'bad'); return; }
  d.mine = true;                                  // chặn chạm lặp; kết quả chờ máy chủ
  seat.el.classList.add('taken-mine');
  send({ t:'tap', d:d.id });
}
function onTapResult(m){
  const d = drops.get(m.id);
  const seat = d ? hall.seatById[d.seat] : null;
  const el = seat ? seat.el : stage;
  if (!m.ok){
    const txt = { full:'Hết suất!', late:'Chậm mất rồi', stunned:'Đang đơ…' }[m.reason] || 'Trượt';
    fx(txt, el, 'info'); sfx.miss();
    if (seat && seat.drop === d) clearSeat(seat);
    if (m.reason === 'stunned' && m.ms) S.stunUntil = Date.now() + m.ms;
    return;
  }
  if (typeof m.score === 'number') S.score = m.score;
  if (typeof m.streak === 'number') S.streak = m.streak;
  if (m.kind === 'bug'){
    if (m.blocked){ fx('Khiên chặn! +5', el, 'info'); sfx.shield(); }
    else { S.stunUntil = Date.now() + m.stun; S.streak = 0; fx('Dính DDoS!', el, 'bad'); sfx.bug(); shake(); }
  } else if (m.kind === 'shield'){
    S.shieldUntil = Date.now() + m.ms; fx('Khiên!', el, 'info'); sfx.shield();
  } else if (m.kind === 'gift'){
    if (!m.done) S.pieces[m.seat] = m.pieces;
    fx(m.done ? '+điểm' : `+1 mảnh ${SVC[m.seat] ? SVC[m.seat].short : ''}`, el); sfx.gift();
  } else if (m.kind === 'super'){
    fx('+50', el); sfx.super();
  }
  if (m.code) gotCode(m.code);
  else if (m.blocked) blockedMsg(m.blocked, m.kind === 'super' ? 'super' : m.seat);
  if (seat && seat.drop === d) setTimeout(() => { if (seat.drop === d) clearSeat(seat); }, 200);
  updateScore(); renderChips();
}
function blockedMsg(reason, svc){
  const name = svc === 'super' ? 'Siêu Deal' : (SVC[svc] ? SVC[svc].short : '');
  const txt = { stockout:`Kho ${name} vừa hết mã`, limit_session:'Em đã nhận đủ mã của phiên này', limit_day:`Hôm nay em đã nhận mã ${name} rồi`,
                limit:`Hôm nay em đã nhận ${name} rồi` }[reason];
  if (txt) toast(txt, 'warn');
  if (reason !== 'stockout' && svc !== 'super') S.claimed.add(svc);
}
function gotCode(code){
  S.codes.push(code); S.claimed.add(code.service);
  const name = code.service === 'super' ? 'Siêu Deal' : (SVC[code.service] ? SVC[code.service].short : code.service);
  toast(`Em nhận được mã ${name}!`);
  sfx.code(); renderCodes(); track('code', { service: code.service });
  const btn = $('#panelBtn'); btn.textContent = `Mã của em (${S.codes.length}) ✨`;
}

stage.addEventListener('pointerdown', e => {
  const el = e.target.closest('.seat:not(.decor)');
  if (!el || !hall) return;
  e.preventDefault(); tapSeat(hall.seatById[el.dataset.id]);
});
stage.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('.seat:not(.decor)');
  if (el && hall){ e.preventDefault(); tapSeat(hall.seatById[el.dataset.id]); }
});

/* ---------- Hiển thị ---------- */
function updateScore(){
  $('#hScore').textContent = S.score;
  const m = S.streak >= 5 ? 2 : 1;
  $('#hCombo').textContent = 'x' + m; $('#hCombo').classList.toggle('hot', m > 1);
}
function buildChips(){
  chipsEl.innerHTML = services.map(s => `<div class="chip" id="chip-${s.id}"><span>${esc(s.short)}</span><div class="pips">${'<i></i>'.repeat(need)}</div><small class="stock"></small></div>`).join('') +
    '<div class="chip super" id="chip-super"><span>Siêu Deal</span><small class="stock"></small></div>';
}
function renderChips(){
  services.forEach(s => {
    const c = document.getElementById('chip-' + s.id); if (!c) return;
    const n = Math.min(need, S.pieces[s.id] || 0), st = S.stock[s.id] || [0, 0];
    const got = S.codes.some(x => x.service === s.id), done = got || S.claimed.has(s.id);
    c.classList.toggle('done', done);
    c.classList.toggle('out', !done && st[0] <= 0);
    c.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', done || i < n));
    $('.stock', c).textContent = got ? '✓ Có mã' : (st[0] > 0 ? `còn ${st[0]}` : 'hết mã');
    if (hall) hall.seatById[s.id].el.classList.toggle('unlocked', got);
  });
  const sc = document.getElementById('chip-super');
  if (sc){ const st = S.stock.super || [0, 0]; $('.stock', sc).textContent = st[0] > 0 ? `còn ${st[0]}` : 'hết mã'; }
}
function codeCard(c){
  const name = c.service === 'super' ? 'Siêu Deal' : (SVC[c.service] ? SVC[c.service].name : c.service);
  return `<div class="code hit">
    <div class="row1"><span class="svc">${esc(name)}</span><span class="off">${esc(c.offer || '')}</span></div>
    <div class="row2"><code>${esc(c.code)}</code><button type="button" class="copy" data-code="${esc(c.code)}">Sao chép</button></div>
    <div class="cond">${esc(c.cond || '')}${c.expires ? ' · HSD: ' + esc(c.expires) : ''}</div>
    ${c.url ? `<a class="use" href="${esc(c.url)}" target="_blank" rel="noopener" data-use="${esc(c.code)}">Dùng mã ngay →</a>` : ''}
  </div>`;
}
function renderCodes(){
  $('#myCodes').innerHTML = S.codes.length
    ? S.codes.map(c => `<div class="mycode"><div style="flex:1"><small>${esc(c.service === 'super' ? 'Siêu Deal' : (SVC[c.service] || {}).short || c.service)} · ${esc(c.offer || '')}</small><code>${esc(c.code)}</code></div><button type="button" class="copy" data-code="${esc(c.code)}">Chép</button></div>`).join('')
    : `<p class="empty">Gom đủ ${need} mảnh một dịch vụ để nhận mã.</p>`;
}
function renderTop(){
  const list = S.top || [];
  $('#top').innerHTML = list.map(([n, s]) => `<li class="${n === me.nick ? 'me' : ''}">${esc(n)} <span>${s}</span></li>`).join('');
  $('#topEmpty').hidden = list.length > 0;
}
function onRoom(m){
  const o = $('#online'); o.hidden = false;
  o.textContent = `${m.online.toLocaleString('vi-VN')} người online · Sảnh ${m.room}${m.rooms > 1 ? '/' + m.rooms : ''}`;
  if (hall) hall.setDecorNames(m.nicks.filter(n => n !== me.nick).slice(0, hall.decorCount()));
}
const tickerQ = [];
let tickerBusy = false;
function pushTicker(txt){
  if (!txt) return;
  tickerQ.push(txt); if (tickerQ.length > 6) tickerQ.splice(0, tickerQ.length - 6);
  if (!tickerBusy) nextTicker();
}
function nextTicker(){
  const t = $('#ticker'), txt = tickerQ.shift();
  if (!txt){ tickerBusy = false; t.classList.remove('show'); return; }
  tickerBusy = true;
  t.innerHTML = esc(txt).replace(/^(.+?) vừa/, '<b>$1</b> vừa');
  t.classList.add('show');
  setTimeout(nextTicker, 2200);
}
function superWarn(ms){
  const w = document.createElement('div'); w.className = 'superwarn';
  w.textContent = `Siêu Deal sau ${Math.round(ms / 1000)} giây! Canh bé giữa!`;
  stage.appendChild(w); setTimeout(() => w.remove(), 1900); sfx.warn();
}
function onResult(m){
  clearDrops();
  if (!joined) return;
  S.codes = m.codes || S.codes; renderCodes();
  $('#rScore').textContent = m.score;
  $('#rRank').textContent = m.rank ? `Hạng ${m.rank}/${m.of.toLocaleString('vi-VN')} người` : 'Chưa có điểm phiên này';
  $('#rCodes').innerHTML = S.codes.length ? S.codes.map(codeCard).join('')
    : '<p class="sub">Phiên này em chưa nhận được mã. Phiên sau nhanh tay hơn nhé!</p>';
  $('#rTop').innerHTML = (m.top || []).map(([n, s]) => `<li class="${n === me.nick ? 'me' : ''}">${esc(n)} <span>${s}</span></li>`).join('');
  renderNextInfo();
  $('#screenResult').hidden = false;
  track('result', { score:m.score, codes:S.codes.length });
}
$('#rClose').addEventListener('click', () => { $('#screenResult').hidden = true; });

function fx(text, el, cls = ''){
  const sr = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
  const d = document.createElement('div'); d.className = 'pop ' + cls; d.textContent = text;
  d.style.left = (r.left - sr.left + r.width / 2) + 'px'; d.style.top = (r.top - sr.top + r.height * .25) + 'px';
  fxEl.appendChild(d); setTimeout(() => d.remove(), 1000);
}
function toast(text, kind){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  if (kind === 'warn') t.style.background = 'var(--warn)';
  stage.appendChild(t); setTimeout(() => t.remove(), 1700);
}
function shake(){ stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); }

/* ---------- Bảng (điện thoại), sao chép, chia sẻ, âm thanh ---------- */
$('#panelBtn').addEventListener('click', () => {
  const p = $('#panel'), open = !p.classList.contains('open');
  p.classList.toggle('open', open); $('#panelBtn').setAttribute('aria-expanded', open);
  $('#panelBtn').textContent = open ? 'Đóng' : (S.codes.length ? `Mã của em (${S.codes.length})` : 'Top · Mã của em');
});
async function copyText(t){
  try { await navigator.clipboard.writeText(t); return true; }
  catch(e){
    try {
      const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;opacity:0'; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch(e2){ return false; }
  }
}
document.addEventListener('click', async e => {
  const cp = e.target.closest('.copy');
  if (cp){
    const ok = await copyText(cp.dataset.code);
    const old = cp.textContent;
    cp.textContent = ok ? 'Đã chép ✓' : 'Chọn mã & Ctrl+C'; cp.classList.toggle('ok', ok);
    setTimeout(() => { cp.textContent = old; cp.classList.remove('ok'); }, 1600);
    track('copy', {});
    return;
  }
  const use = e.target.closest('[data-use]');
  if (use) track('use_code', {});
});
$('#btnShare').addEventListener('click', async () => {
  const text = `Mình vừa săn ${S.score} điểm${S.codes.length ? ` và nhận ${S.codes.length} mã giảm giá` : ''} ở Live Săn Mã Black Friday – Đại Sảnh Nét của iNET! Vào săn cùng nhé:`;
  const url = new URL('./', location.href).href;
  try { if (navigator.share){ await navigator.share({ title:'Live Săn Mã – Đại Sảnh Nét', text, url }); return; } } catch(e){ return; }
  const ok = await copyText(text + ' ' + url);
  const b = $('#btnShare'), old = b.textContent; b.textContent = ok ? 'Đã chép ✓' : 'Chia sẻ'; setTimeout(() => b.textContent = old, 1800);
});
const muteBtn = $('#mute');
function paintMute(){ muteBtn.classList.toggle('off', muted); muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false'); }
muteBtn.addEventListener('click', () => { muted = !muted; store.set('netDeal.mute', muted ? '1' : '0'); paintMute(); if (!muted) sfx.tick(); });
paintMute();
})();
