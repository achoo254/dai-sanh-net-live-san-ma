/* =============================================================================
 * Load test Đại Sảnh Nét Online: N người chơi ảo cùng vào sảnh, ĐI BỘ tới hộp quà gần nhất
 *   node server/load-test-simulate-many-players-websocket.js [N=300] [ws://localhost:8790/ws] [timeoutSec=600]
 *   OPEN_RATE=8 (kết nối/100ms) khi test qua Internet; VERBOSE=1 in thêm thống kê bot thường/gian lận
 *   RESULT_FILE=/đường/dẫn.txt ghi báo cáo ra file; KEEP_ALIVE=1 giữ tiến trình sau khi xong (chạy như service trên máy chủ)
 * - 95% bot đi đúng tốc độ, gửi vị trí 10 lần/giây
 * - 5% bot GIAN LẬN: dịch chuyển tức thời tới hộp → máy chủ phải kéo về (đếm số lần bị chỉnh)
 * Báo cáo: kết nối, số hộp nhặt, độ trễ (gửi vị trí → nhận "nhặt được"), mã trùng, vượt giới hạn,
 * số lần nhặt của bot gian lận ngay sau khi tốc biến (phải ≈ 0).
 * ============================================================================= */
'use strict';
const WebSocket = require('ws');
const WR = require('../public/assets/world-map-rules-shared.js');
const outLines = [];
const origLog = console.log;
console.log = (...a) => { outLines.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); origLog(...a); };

const N = +(process.argv[2] || 300);
const URL = process.argv[3] || 'ws://localhost:8790/ws';
const TIMEOUT = +(process.argv[4] || 600) * 1000;
const runId = Math.random().toString(36).slice(2, 7);
const AV = ['wave', 'shield', 'thumb', 'idea', 'book', 'support'];

const st = { puzzles:0, solved:0, wrong:0, fails:0, timeouts:0, cluesSeen:0, ansNoReveal:0, connected:0, closed:0, closeCodes:{}, errors:{}, mv:0, picks:0, stuns:0, corrections:0, codes:[], results:0,
             lat:[], cheatTeleports:0, cheatPicksAfterTeleport:0 };
let sawLive = false, sawEnd = false;
const bots = [];

function bot(i){
  const cheater = i % 20 === 7;
  const ws = new WebSocket(URL);
  const b = { ws, pid:`lw${runId}${String(i).padStart(5, '0')}`, x:0, y:0, picks:0, corr:0, dist:0, idle:0, drops:new Map(), stunUntil:0, cheater, lastTeleport:0, lastMvAt:0 };
  ws.on('open', () => { st.connected++; ws.send(JSON.stringify({ t:'hello', pid:b.pid, nick:`Bot ${i}${cheater ? ' (gian lận)' : ''}`, avatar:AV[i % 6] })); });
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    switch (m.t){
      case 'welcome': b.x = m.you.x; b.y = m.you.y; (m.drops || []).forEach(d => b.drops.set(d.id, d)); break;
      case 'phase': if (m.phase === 'live') sawLive = true; if (sawLive && m.phase !== 'live') sawEnd = true; break;
      case 'drop': b.drops.set(m.id, m); break;
      case 'gone': b.drops.delete(m.id); break;
      case 'clear': b.drops.clear(); break;
      case 'pos': b.dist -= Math.hypot(m.x - b.x, m.y - b.y); b.x = m.x; b.y = m.y; st.corrections++; b.corr++; break;
      case 'stun': b.stunUntil = Date.now() + m.ms; st.stuns++; break;
      case 'pick':
        st.picks++; b.picks++; b.drops.delete(m.id);
        if (b.lastMvAt) st.lat.push(Date.now() - b.lastMvAt);
        if (b.cheater && Date.now() - b.lastTeleport < 400) st.cheatPicksAfterTeleport++;
        break;
      case 'result': st.results++; break;
      case 'puzzle': {
        st.puzzles++;
        // Máy chủ chạy thử với LOADTEST_REVEAL_ANSWERS=1 mới gửi kèm đáp án; 25% bot trả lời sai 1 lần trước, 10% bỏ mặc cho hết giờ
        if (!m._answer){ st.ansNoReveal++; break; }
        const r = Math.random();
        if (r < 0.10) break;
        const wrongFirst = r < 0.35;
        setTimeout(() => { if (ws.readyState !== 1) return;
          if (wrongFirst){ ws.send(JSON.stringify({ t:'ans', id:m.id, a:'SAIROI' })); setTimeout(() => ws.readyState === 1 && ws.send(JSON.stringify({ t:'ans', id:m.id, a:m._answer.toLowerCase() })), 1500); }
          else ws.send(JSON.stringify({ t:'ans', id:m.id, a:m._answer.toLowerCase() }));
        }, 1500 + Math.random() * 3000);
        break;
      }
      case 'ans_r':
        if (m.ok){ st.solved++; st.codes.push({ pid:b.pid, ...m.code }); }
        else if (!m.slow) st.wrong++;
        break;
      case 'puzzle_end': if (m.reason === 'timeout') st.timeouts++; else st.fails++; break;
      case 'clue': st.cluesSeen++; break;
    }
  });
  ws.on('close', code => { st.closed++; st.closeCodes[code] = (st.closeCodes[code] || 0) + 1; });
  ws.on('error', e => { const k = e.code || e.message; st.errors[k] = (st.errors[k] || 0) + 1; });
  bots.push(b);
}

// Mỗi 100ms: bot đi 1 bước tới hộp gần nhất (hoặc đi dạo), gửi vị trí
let lastLoop = Date.now();
setInterval(() => {
  const now = Date.now(), loopDt = Math.min(0.25, (now - lastLoop) / 1000); lastLoop = now;   // đi theo thời gian thật như trình duyệt
  for (const b of bots){
    if (b.ws.readyState !== 1 || !b.x || b.stunUntil > now) continue;
    let tgt = null, best = Infinity;
    for (const d of b.drops.values()){ const q = (d.x - b.x) ** 2 + (d.y - b.y) ** 2; if (q < best){ best = q; tgt = d; } }
    if (!tgt){ if (!b.wander || WR.dist2(b, b.wander) < 900) b.wander = WR.randomWalkable(); tgt = b.wander; }
    if (b.cheater && b.drops.size && Math.random() < 0.3){
      b.x = tgt.x; b.y = tgt.y; b.lastTeleport = now; st.cheatTeleports++;      // cố "tốc biến" tới hộp
    } else {
      // Đi thẳng tới đích; vướng quầy thì đi vòng sang ngang ~1 giây (như người thật)
      const step = WR.SPEED * loopDt;
      let dx = tgt.x - b.x, dy = tgt.y - b.y;
      if (b.detourUntil > now){ dx = b.detourDir * 100; dy = 0; }
      const L = Math.hypot(dx, dy) || 1, k = Math.min(L, step) / L;
      const n = WR.moveSteppedWithCollision(b.x, b.y, dx * k, dy * k);   // cùng hàm với máy chủ
      if (n.x === b.x && n.y === b.y && L > 2){ b.detourUntil = now + 1000; b.detourDir = Math.random() < .5 ? -1 : 1; }
      b.x = n.x; b.y = n.y;
    }
    if (!b.drops.size) b.idle++;
    b.lastMvAt = now;
    b.ws.send(JSON.stringify({ t:'mv', x: Math.round(b.x), y: Math.round(b.y) })); st.mv++;
  }
}, 100);

const pct = (arr, q) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
function report(){
  const codes = st.codes.map(c => c.code), dup = codes.length - new Set(codes).size;
  const per = {}; st.codes.forEach(c => (per[c.pid] = per[c.pid] || []).push(c.service));
  const overSession = Object.values(per).filter(l => l.filter(s => s !== 'super').length > 2).length;
  const overService = Object.values(per).filter(l => l.length !== new Set(l).size).length;
  console.log('\n===== KẾT QUẢ LOAD TEST (ĐI BỘ) =====');
  console.log(`Người chơi ảo: ${N} · kết nối thành công: ${st.connected} · bị ngắt: ${st.closed}`, st.closeCodes, 'lỗi:', st.errors);
  console.log(`Gói vị trí đã gửi: ${st.mv} · hộp nhặt được: ${st.picks} · dính DDoS: ${st.stuns}`);
  console.log(`Độ trễ gửi vị trí → nhận "nhặt được" (ms): p50=${pct(st.lat, .5)} p95=${pct(st.lat, .95)} p99=${pct(st.lat, .99)}`);
  const avg = l => l.length ? (l.reduce((a, b) => a + b.picks, 0) / l.length).toFixed(1) : '0';
  console.log(`Trung bình hộp/người: bot đi đúng luật ${avg(bots.filter(b => !b.cheater))} · bot gian lận ${avg(bots.filter(b => b.cheater))}`);
  console.log(`Bot gian lận: tốc biến ${st.cheatTeleports} lần · máy chủ kéo về ${st.corrections} lần · nhặt ngay sau tốc biến: ${st.cheatPicksAfterTeleport}`);
  console.log(`Mật thư: mở ${st.puzzles} · giải đúng ${st.solved} · trả lời sai ${st.wrong} · hết lượt ${st.fails} · hết giờ ${st.timeouts} · manh mối đã đọc ${st.cluesSeen}${st.ansNoReveal ? ' · (máy chủ không gửi đáp án → bot không giải: ' + st.ansNoReveal + ')' : ''}`);
  console.log(`Mã đã nhận: ${codes.length} · MÃ TRÙNG: ${dup} · vượt 2 mã/phiên: ${overSession} · 2 mã cùng dịch vụ: ${overService}`);
  console.log(`Nhận màn kết quả: ${st.results}/${st.connected}`);
  if (process.env.VERBOSE){ const grp = c => bots.filter(b => b.cheater === c); const f = (l, k) => (l.reduce((a, b) => a + b[k], 0) / l.length).toFixed(0);
    for (const c of [false, true]){ const l = grp(c); console.log(`${c ? 'GIAN LẬN' : 'ĐÚNG LUẬT'}: hộp ${f(l, 'picks')} · bị kéo về ${f(l, 'corr')} · nhịp không thấy hộp nào ${f(l, 'idle')}`); } }
  const pass = st.connected === N && dup === 0 && overSession === 0 && overService === 0 && st.picks > 0;
  console.log(pass ? '✅ ĐẠT' : '❌ CHƯA ĐẠT');
  bots.forEach(b => { try { b.ws.close(); } catch(e){} });
  // RESULT_FILE: ghi báo cáo ra file (dùng khi chạy bot trên máy chủ, đọc lại qua trình quản lý file)
  if (process.env.RESULT_FILE){ try { require('fs').writeFileSync(process.env.RESULT_FILE, outLines.join('\n') + '\n'); } catch(e){ origLog('không ghi được RESULT_FILE:', e.message); } }
  // KEEP_ALIVE=1: không thoát (khi chạy như service, tránh bị khởi động lại chạy test lặp)
  if (process.env.KEEP_ALIVE === '1'){ origLog('[xong] giữ tiến trình sống, dừng project để kết thúc'); setInterval(() => {}, 1 << 30); return; }
  setTimeout(() => process.exit(pass ? 0 : 1), 300);
}

// Chạy như service trên OneDash: cần mở 1 cổng để qua health check; cổng này trả về tiến độ/báo cáo dạng chữ
if (process.env.PORT) require('http').createServer((q, r) => { r.setHeader('Content-Type', 'text/plain; charset=utf-8'); r.end(outLines.join('\n') + '\n' + progressLine()); }).listen(+process.env.PORT, '127.0.0.1');
const progressLine = () => `tiến độ: kết nối ${st.connected}/${N} · nhặt ${st.picks} · mã ${st.codes.length} · ${sawLive ? (sawEnd ? 'đã hết phiên' : 'ĐANG LIVE') : 'chờ live'}`;
if (process.env.RESULT_FILE) setInterval(() => { try { require('fs').writeFileSync(process.env.RESULT_FILE, outLines.join('\n') + '\n' + progressLine() + '\n'); } catch(e){} }, 10000);
console.log(`Mở ${N} kết nối tới ${URL} …`);
let i = 0;
// OPEN_RATE = số kết nối mở mỗi 100ms (mặc định 50 = 500/giây; qua Internet/TLS nên để 5–10 cho giống người thật vào rải rác)
const RATE = +(process.env.OPEN_RATE || 50);
const opener = setInterval(() => { for (let k = 0; k < RATE && i < N; k++) bot(i++); if (i >= N) clearInterval(opener); }, 100);
const watch = setInterval(() => {
  process.stdout.write(`\r  kết nối ${st.connected}/${N} · nhặt ${st.picks} · mã ${st.codes.length} · ${sawLive ? (sawEnd ? 'đã hết phiên' : 'ĐANG LIVE') : 'chờ live'}   `);
  if (sawEnd){ clearInterval(watch); setTimeout(report, 1500); }
}, 1000);
setTimeout(() => { clearInterval(watch); console.log('\nHết thời gian chờ'); report(); }, TIMEOUT);
