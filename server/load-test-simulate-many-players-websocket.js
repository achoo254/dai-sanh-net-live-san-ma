/* =============================================================================
 * Load test: mô phỏng N người chơi cùng vào phiên live và tranh nhau chạm hộp
 *   node load-test-simulate-many-players-websocket.js [N=500] [ws://localhost:8790/ws] [timeoutSec=600]
 * Chạy máy chủ ở chế độ thử (DEMO_LOOP=1) rồi chạy file này. Script đợi hết 1 phiên live rồi báo:
 *   - số kết nối thành công, số lần chạm, độ trễ chạm → phản hồi (p50/p95/p99)
 *   - số mã nhận được, có mã nào bị cấp trùng không, có ai vượt giới hạn không
 * ============================================================================= */
'use strict';
const WebSocket = require('ws');

const N = +(process.argv[2] || 500);
const URL = process.argv[3] || 'ws://localhost:8790/ws';
const TIMEOUT = +(process.argv[4] || 600) * 1000;
const runId = Math.random().toString(36).slice(2, 8);

const stats = { connected:0, closed:0, closeCodes:{}, errors:{},taps:0, ok:0, full:0, late:0, stunned:0, bugHits:0, lat:[], codes:[], results:0, maxDrops:0 };
let sawLive = false, sawEndAfterLive = false;
const bots = [];

function bot(i){
  const ws = new WebSocket(URL);
  const pid = `lt${runId}${String(i).padStart(5, '0')}`;
  const sent = new Map();
  const mine = [];
  ws.on('open', () => { stats.connected++; ws.send(JSON.stringify({ t:'hello', pid, nick:`Bot ${i}` })); });
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'phase'){
      if (m.phase === 'live') sawLive = true;
      if (sawLive && m.phase !== 'live') sawEndAfterLive = true;
    } else if (m.t === 'drop'){
      // 85% người thấy hộp và chạm, phản xạ 150–900ms; DDoS chỉ 10% người lỡ tay
      const p = m.kind === 'bug' ? 0.1 : 0.85;
      if (Math.random() < p){
        setTimeout(() => {
          if (ws.readyState !== 1) return;
          sent.set(m.id, process.hrtime.bigint());
          ws.send(JSON.stringify({ t:'tap', d:m.id })); stats.taps++;
        }, 150 + Math.random() * 750);
      }
    } else if (m.t === 'tapr'){
      const t0 = sent.get(m.id);
      if (t0){ stats.lat.push(Number(process.hrtime.bigint() - t0) / 1e6); sent.delete(m.id); }
      if (m.ok){ stats.ok++; if (m.kind === 'bug' && m.stun) stats.bugHits++; if (m.code){ stats.codes.push({ pid, ...m.code }); mine.push(m.code); } }
      else stats[m.reason] = (stats[m.reason] || 0) + 1;
    } else if (m.t === 'result'){
      stats.results++;
    }
  });
  ws.on('close', code => { stats.closed++; stats.closeCodes[code] = (stats.closeCodes[code] || 0) + 1; });
  ws.on('error', e => { const k = e.code || e.message; stats.errors[k] = (stats.errors[k] || 0) + 1; });
  bots.push({ ws, pid, mine });
}

const pct = (arr, q) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

function report(){
  const codes = stats.codes.map(c => c.code);
  const dupCodes = codes.length - new Set(codes).size;
  const perPid = {};
  stats.codes.forEach(c => { (perPid[c.pid] = perPid[c.pid] || []).push(c.service); });
  const overSession = Object.values(perPid).filter(l => l.filter(s => s !== 'super').length > 2).length;
  const overService = Object.values(perPid).filter(l => l.length !== new Set(l).size).length;
  console.log('\n===== KẾT QUẢ LOAD TEST =====');
  console.log(`Người chơi ảo: ${N} · kết nối thành công: ${stats.connected} · bị ngắt: ${stats.closed}`, stats.closeCodes, 'lỗi:', stats.errors);
  console.log(`Lần chạm: ${stats.taps} · giành được: ${stats.ok} · hết suất: ${stats.full || 0} · trễ: ${stats.late || 0} · đang đơ: ${stats.stunned || 0} · dính DDoS: ${stats.bugHits}`);
  console.log(`Độ trễ chạm→phản hồi (ms): p50=${pct(stats.lat, .5).toFixed(1)} p95=${pct(stats.lat, .95).toFixed(1)} p99=${pct(stats.lat, .99).toFixed(1)} max=${Math.max(0, ...stats.lat).toFixed(1)}`);
  console.log(`Mã đã nhận: ${codes.length} · MÃ TRÙNG: ${dupCodes} · người vượt 2 mã/phiên: ${overSession} · người nhận 2 mã cùng dịch vụ: ${overService}`);
  console.log(`Nhận màn kết quả: ${stats.results}/${stats.connected}`);
  const pass = stats.connected === N && dupCodes === 0 && overSession === 0 && overService === 0;
  console.log(pass ? '✅ ĐẠT' : '❌ CHƯA ĐẠT');
  bots.forEach(b => { try { b.ws.close(); } catch(e){} });
  setTimeout(() => process.exit(pass ? 0 : 1), 300);
}

console.log(`Mở ${N} kết nối tới ${URL} …`);
let i = 0;
const opener = setInterval(() => {               // mở dần 50 kết nối/100ms như người vào sảnh thật
  for (let k = 0; k < 50 && i < N; k++) bot(i++);
  if (i >= N) clearInterval(opener);
}, 100);
const watch = setInterval(() => {
  process.stdout.write(`\r  kết nối ${stats.connected}/${N} · chạm ${stats.taps} · mã ${stats.codes.length} · ${sawLive ? (sawEndAfterLive ? 'đã hết phiên' : 'ĐANG LIVE') : 'chờ live'}   `);
  if (sawEndAfterLive){ clearInterval(watch); setTimeout(report, 1500); }
}, 1000);
setTimeout(() => { clearInterval(watch); console.log('\nHết thời gian chờ'); report(); }, TIMEOUT);
