/* =============================================================================
 * Tính pha hiện tại của sự kiện live từ lịch phiên
 *   idle   : chưa tới giờ mở sảnh của phiên kế tiếp (hoặc đã hết lịch)
 *   lobby  : sảnh chờ, đếm ngược tới giờ live
 *   live   : đang phát hộp quà
 *   ended  : phiên vừa kết thúc (hiện kết quả) cho tới khi phiên sau mở sảnh
 * ============================================================================= */
'use strict';

/** Phiên lặp liên tục để chạy thử (DEMO_LOOP=1): mỗi chu kỳ = sảnh chờ + live + nghỉ. */
function demoSessionsAround(now, cfg){
  const cycle = (cfg.demoLobbySec + cfg.demoLiveSec + cfg.demoBreakSec) * 1000;
  const k = Math.floor(now / cycle);
  const out = [];
  for (let i = k - 1; i <= k + 1; i++){
    const start = i * cycle + cfg.demoLobbySec * 1000;
    const d = new Date(start + 7 * 3600e3); // hiển thị giờ VN
    const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
    out.push({ id:`demo-${i}`, title:`Phiên thử ${hh}:${mm}`, start, end: start + cfg.demoLiveSec * 1000,
               lobbyAt: start - cfg.demoLobbySec * 1000 });
  }
  return out;
}

function scheduledSessions(cfg){
  return cfg.schedule.map(s => {
    const start = Date.parse(s.start);
    if (isNaN(start)) throw new Error('Giờ phiên không hợp lệ: ' + s.start);
    return { id: s.id, title: s.title || s.id, start, end: start + cfg.liveSec * 1000, lobbyAt: start - cfg.lobbySec * 1000 };
  }).sort((a, b) => a.start - b.start);
}

/** Trả về { phase, session (phiên đang/vừa diễn ra), next (phiên kế tiếp) }. */
function phaseAt(now, cfg){
  const list = cfg.demoLoop ? demoSessionsAround(now, cfg) : scheduledSessions(cfg);
  const cur = list.find(s => now >= s.lobbyAt && now < s.end);
  const next = list.find(s => s.start > now && s !== cur) || null;
  if (cur) return { phase: now < cur.start ? 'lobby' : 'live', session: cur, next };
  const last = list.filter(s => s.end <= now).pop() || null;
  return { phase: last ? 'ended' : 'idle', session: last, next };
}

module.exports = { phaseAt };
