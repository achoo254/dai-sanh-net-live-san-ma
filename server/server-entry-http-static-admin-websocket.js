/* =============================================================================
 * Máy chủ Live Săn Mã — Đại Sảnh Nét
 *   node server-entry-http-static-admin-websocket.js
 * - Phục vụ trang tĩnh trong ../public (bản Live, bản Luyện tay, trang quản trị)
 * - WebSocket /ws cho phiên live
 * - API quản trị /admin/api/* (Bearer ADMIN_TOKEN): trạng thái, nạp kho CSV, xuất danh sách đã cấp
 * ============================================================================= */
'use strict';
process.removeAllListeners('warning');   // ẩn cảnh báo "SQLite is experimental" của Node
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const cfg = require('./live-config-schedule-services-and-limits');
const { CodeStore } = require('./code-store-sqlite-atomic-issue-import-export');
const { Hub } = require('./live-hub-sessions-players-stock-leaderboard');

/* ---------- Khởi tạo ---------- */
const store = new CodeStore(cfg.dbFile);
const validServices = [...cfg.services.map(s => s.id), 'super'];
if (cfg.demoSeed){
  const n = store.seedDemo(cfg.services.map(s => s.id), cfg.demoSeedPerService, cfg.demoSeedSuper);
  if (n) console.log(`[kho] Kho trống → đã nạp ${n} mã MINH HỌA (DEMO-...). Đặt DEMO_SEED=0 khi chạy thật.`);
}
let adminToken = cfg.adminToken;
if (!adminToken){
  adminToken = crypto.randomBytes(12).toString('hex');
  console.log(`[quản trị] Chưa đặt ADMIN_TOKEN → mã tạm cho lần chạy này: ${adminToken}`);
}
const hub = new Hub(cfg, store);
hub.start();

/* ---------- Sức khoẻ máy chủ: độ trễ vòng lặp sự kiện (>50ms là đang quá tải) ---------- */
const { monitorEventLoopDelay } = require('perf_hooks');
const loopDelay = monitorEventLoopDelay({ resolution: 10 }); loopDelay.enable();
let lastCpu = process.cpuUsage(), lastCpuAt = Date.now();
function serverHealth(){
  const now = Date.now(), cpu = process.cpuUsage(lastCpu), dt = (now - lastCpuAt) * 1000;
  lastCpu = process.cpuUsage(); lastCpuAt = now;
  const out = { loopP50ms: +(loopDelay.percentile(50) / 1e6).toFixed(1), loopP99ms: +(loopDelay.percentile(99) / 1e6).toFixed(1),
    cpuPct: dt ? Math.round((cpu.user + cpu.system) / dt * 100) : 0, rssMB: Math.round(process.memoryUsage().rss / 1048576),
    connections: wss ? wss.clients.size : 0 };
  loopDelay.reset();
  return out;
}

/* ---------- Tiện ích HTTP ---------- */
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.json':'application/json', '.ico':'image/x-icon', '.csv':'text/csv; charset=utf-8' };
const SEC_HEADERS = { 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'X-Frame-Options':'SAMEORIGIN' };

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}){
  res.writeHead(code, { 'Content-Type': type, ...SEC_HEADERS, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function clientIp(req){
  if (cfg.trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}
function readBody(req, limit = 5 * 1024 * 1024){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit){ reject(new Error('Tệp quá lớn')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function isAdmin(req){
  const h = String(req.headers.authorization || '');
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const a = Buffer.from(tok), b = Buffer.from(adminToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function serveStatic(req, res, urlPath){
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(cfg.publicDir, rel));
  if (!file.startsWith(cfg.publicDir)) return send(res, 403, { error:'forbidden' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Không tìm thấy', 'text/plain; charset=utf-8');
    const ext = path.extname(file).toLowerCase();
    // HTML/CSS/JS: luôn hỏi lại (sửa gấp giữa chiến dịch là người chơi nhận ngay); ảnh/font: nhớ 1 ngày
    const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
    if (req.headers['if-none-match'] === etag){ res.writeHead(304, { ETag: etag }); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, ETag: etag,
      'Cache-Control': ['.html', '.css', '.js'].includes(ext) ? 'no-cache' : 'public, max-age=86400', ...SEC_HEADERS });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- Định tuyến HTTP ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/healthz') return send(res, 200, { ok:true, phase: hub.state.phase });
    if (p === '/api/config') return send(res, 200, {
      turnstileSiteKey: cfg.turnstileSiteKey, services: cfg.services, need: cfg.piecesToUnlock, maxCodes: cfg.maxCodesPerSession,
      phase: hub.phaseMsg(), stock: hub.stockMsg().s }, undefined, { 'Cache-Control':'no-store' });

    if (p.startsWith('/admin/api/')){
      if (!isAdmin(req)) return send(res, 401, { error:'Sai mã quản trị' });
      if (p === '/admin/api/status' && req.method === 'GET') return send(res, 200, { ...hub.status(), server: serverHealth() });
      if (p === '/admin/api/codes' && req.method === 'POST'){
        const text = await readBody(req);
        const r = store.importCsv(text, validServices);
        hub.refreshStock();
        return send(res, 200, r);
      }
      if (p === '/admin/api/export.csv' && req.method === 'GET')
        return send(res, 200, '﻿' + store.exportCsv(), 'text/csv; charset=utf-8',
          { 'Content-Disposition': `attachment; filename="ma-da-cap-${new Date().toISOString().slice(0, 10)}.csv"` });
      return send(res, 404, { error:'not found' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error:'method' });
    return serveStatic(req, res, p);
  } catch(e){
    console.error('[http]', e);
    return send(res, 500, { error: e.message });
  }
});

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({ noServer:true, maxPayload: 1024, perMessageDeflate:false });
const connPerIp = new Map();

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws') return socket.destroy();
  const ip = clientIp(req);
  if ((connPerIp.get(ip) || 0) >= cfg.maxConnPerIp){ socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, ip));
});

async function verifyTurnstile(token, ip){
  if (!cfg.turnstileSecret) return true;
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:'POST', body: new URLSearchParams({ secret: cfg.turnstileSecret, response: token, remoteip: ip }) });
    return !!(await r.json()).success;
  } catch(e){ console.error('[turnstile]', e.message); return false; }
}
const AVATARS = ['wave', 'shield', 'thumb', 'idea', 'book', 'support'];
const cleanNick = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

wss.on('connection', (ws, req, ip) => {
  connPerIp.set(ip, (connPerIp.get(ip) || 0) + 1);
  let player = null, joining = false;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const helloTimer = setTimeout(() => { if (!player) ws.close(4000, 'Hết thời gian chào'); }, 10000);

  // Giới hạn tốc độ: cửa sổ 1 giây
  let winStart = Date.now(), msgs = 0, moves = 0, strikes = 0;

  ws.on('message', async raw => {
    const now = Date.now();
    if (now - winStart >= 1000){
      if (msgs > cfg.maxMsgPerSec) strikes++; else strikes = Math.max(0, strikes - 1);
      winStart = now; msgs = 0; moves = 0;
    }
    if (++msgs > cfg.maxMsgPerSec * 3 || strikes >= 3) return ws.close(4008, 'Gửi quá nhanh');
    let m; try { m = JSON.parse(raw); } catch(e){ return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'hello'){
      if (player || joining) return;
      joining = true;
      const pid = String(m.pid || ''), nick = cleanNick(m.nick);
      const avatar = AVATARS.includes(m.avatar) ? m.avatar : 'wave';
      if (!/^[A-Za-z0-9_-]{8,40}$/.test(pid)) return ws.close(4002, 'Mã thiết bị không hợp lệ');
      if (nick.length < 2) return ws.close(4003, 'Biệt danh cần 2–16 ký tự');
      if (!(await verifyTurnstile(m.ts, ip))) return ws.close(4004, 'Xác minh chống bot không thành công');
      if (ws.readyState !== 1) return;
      clearTimeout(helloTimer);
      player = hub.join(ws, { pid, nick, avatar, ip });
      return;
    }
    if (!player || player.ws !== ws) return;
    if (!player.room) return;
    if (m.t === 'mv'){
      if (++moves > cfg.moveRatePerSec) return;             // gửi vị trí quá dày → bỏ qua
      player.room.move(player, +m.x, +m.y);
    } else if (m.t === 'emo'){
      player.room.emote(player, m.i);
    }
  });
  ws.on('close', () => {
    clearTimeout(helloTimer);
    const n = (connPerIp.get(ip) || 1) - 1; n ? connPerIp.set(ip, n) : connPerIp.delete(ip);
    if (player) hub.leave(player, ws);
  });
  ws.on('error', () => {});
});

// Nhịp tim: ngắt kết nối "chết" sau ~60 giây
const heartbeat = setInterval(() => {
  for (const ws of wss.clients){
    if (!ws.isAlive){ ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch(e){}
  }
}, 30000);

server.listen(cfg.port, cfg.host, () => {
  const st = hub.state;
  console.log(`[live] Đại Sảnh Nét chạy tại http://localhost:${cfg.port}  (pha: ${st.phase}${cfg.demoLoop ? ', DEMO_LOOP' : ''})`);
  if (st.next) console.log(`[live] Phiên kế tiếp: ${st.next.title} — ${new Date(st.next.start).toLocaleString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh' })}`);
});

function shutdown(){
  console.log('\n[live] Đang dừng: lưu tiến độ…');
  clearInterval(heartbeat);
  hub.stop();
  for (const ws of wss.clients) try { ws.close(1012, 'Máy chủ khởi động lại'); } catch(e){}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
