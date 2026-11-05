/* =============================================================================
 * Cấu hình máy chủ Live Săn Mã — Đại Sảnh Nét (Black Friday 2026)
 * Mọi giá trị có thể ghi đè bằng biến môi trường (xem docs/huong-dan-trien-khai-live-san-ma-dai-sanh-net.md)
 * ============================================================================= */
'use strict';
const path = require('path');

const env = process.env;
const num = (v, d) => (v === undefined || v === '' || isNaN(+v) ? d : +v);

// Dịch vụ: id phải khớp 6 ghế trong public/assets/hall-scene.js ("deal" là ghế Siêu Deal)
const SERVICES = [
  { id:'domain',  name:'Tên miền',           short:'Tên miền', label:'Thích Tên miền', pose:'book' },
  { id:'hosting', name:'Hosting OnePanel',   short:'Hosting',  label:'Thích Hosting',  pose:'wave' },
  { id:'vps',     name:'Cloud Server / VPS', short:'VPS',      label:'Thích VPS',      pose:'thumb' },
  { id:'ssl',     name:'Chứng chỉ SSL',      short:'SSL',      label:'Thích SSL',      pose:'shield' },
  { id:'email',   name:'Email doanh nghiệp', short:'Email',    label:'Thích Email',    pose:'support' }
];
const SUPER = { id:'super', name:'Siêu Deal', short:'Siêu Deal' };

/** Lịch mặc định: 24–30/11/2026, mỗi ngày 2 phiên 12:00 và 20:00 (giờ VN). Ghi đè bằng SCHEDULE (JSON). */
function defaultSchedule(){
  const out = [];
  for (let d = 24; d <= 30; d++){
    for (const h of [12, 20]){
      const dd = String(d).padStart(2, '0'), hh = String(h).padStart(2, '0');
      out.push({ id:`bf-${dd}11-${hh}`, title:`Phiên ${hh}:00 · ${dd}/11`, start:`2026-11-${dd}T${hh}:00:00+07:00` });
    }
  }
  return out;
}

const config = {
  port: num(env.PORT, 8790),
  host: env.HOST || '0.0.0.0',
  publicDir: path.join(__dirname, '..', 'public'),
  dbFile: env.DB_FILE || path.join(__dirname, 'data', 'live-san-ma.db'),
  adminToken: env.ADMIN_TOKEN || '',            // bắt buộc đặt khi chạy thật
  turnstileSecret: env.TURNSTILE_SECRET || '',  // để trống = không bật chống bot Turnstile
  turnstileSiteKey: env.TURNSTILE_SITEKEY || '',
  trustProxy: env.TRUST_PROXY === '1',          // bật khi chạy sau Nginx (lấy IP thật từ X-Forwarded-For)

  // Lịch phiên
  demoLoop: env.DEMO_LOOP === '1',              // chạy thử: phiên lặp liên tục (sảnh chờ → live → nghỉ)
  demoLobbySec: num(env.DEMO_LOBBY_SEC, 45),
  demoLiveSec: num(env.DEMO_LIVE_SEC, 120),
  demoBreakSec: num(env.DEMO_BREAK_SEC, 45),
  schedule: env.SCHEDULE ? JSON.parse(env.SCHEDULE) : defaultSchedule(),
  lobbySec: num(env.LOBBY_SEC, 600),            // mở sảnh chờ trước giờ live 10 phút
  liveSec: num(env.LIVE_SEC, 300),              // mỗi phiên live 5 phút

  // Luật chơi
  roomCap: num(env.ROOM_CAP, 300),              // tối đa người/sảnh, đông hơn thì mở sảnh mới
  piecesToUnlock: num(env.PIECES, 5),           // gom đủ N mảnh của 1 dịch vụ → nhận mã
  maxCodesPerSession: num(env.MAX_CODES_SESSION, 2),
  maxCodesPerServicePerDay: 1,
  maxSuperPerDay: 1,
  slotRatio: num(env.SLOT_RATIO, 0.2),          // mỗi hộp quà có K = ceil(số người trong sảnh × 20%) suất
  slotMax: num(env.SLOT_MAX, 20),
  superSlotsPerDrop: num(env.SUPER_SLOTS, 5),
  superAtFractions: [0.18, 0.58, 0.93],         // Siêu Deal xuất hiện ở ~phút 1, 3, 5 của phiên 5 phút
  superWarnMs: 5000,
  dropTtlMs: 2300,                              // hộp tồn tại 2,3 giây (dư cho độ trễ mạng)
  dropEveryMs: [1100, 650],                     // nhịp thả hộp: đầu phiên → cuối phiên
  maxActiveDrops: 4,
  stunMs: 3000,                                 // chạm DDoS bị "đơ" 3 giây
  shieldMs: 5000,
  points: { gift:10, super:50, shieldBlock:5 },
  comboAt: 5,                                   // giành liên tiếp ≥5 hộp thì điểm ×2

  // Chống lạm dụng
  tapRatePerSec: 8,                             // tối đa 8 lần chạm/giây/người
  maxMsgPerSec: 20,                             // quá ngưỡng này liên tục thì ngắt kết nối
  // Nhà mạng di động VN dùng chung 1 IP cho rất nhiều thuê bao (CGNAT) → để rộng, chống bot bằng Turnstile + giới hạn chạm
  maxConnPerIp: num(env.MAX_CONN_PER_IP, 200),

  // Kho mã mẫu cho chạy thử (bỏ qua khi kho đã có mã)
  demoSeed: env.DEMO_SEED !== '0',
  demoSeedPerService: num(env.DEMO_SEED_PER_SERVICE, 80),
  demoSeedSuper: num(env.DEMO_SEED_SUPER, 12),

  services: SERVICES,
  superService: SUPER
};

module.exports = config;
