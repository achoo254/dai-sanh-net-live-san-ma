/* =============================================================================
 * Kiểm duyệt CHAT trong văn phòng (sự kiện công khai, hàng nghìn người)
 * - Lọc từ thô tục tiếng Việt/Anh (che bằng ***), có xét cả kiểu viết tách chữ, lặp chữ, không dấu
 * - Chặn đường link / tên miền lạ (tránh spam, lừa đảo) và số điện thoại
 * - Giới hạn tần suất: 1 tin / 1,5 giây, tối đa 6 tin / 20 giây, chặn tin lặp lại
 * - Khoá chat: tự động khi bị ≥3 người báo cáo (10 phút) hoặc quản trị khoá tay; lưu SQLite
 * ============================================================================= */
'use strict';

const MAX_LEN = 120;

// Từ/cụm thô tục: so trên chữ thường CÓ DẤU (tránh nhầm "đeo" với "đéo")…
const BAD_WITH_DIACRITICS = ['đéo', 'địt', 'đụ', 'lồn', 'cặc', 'buồi', 'đĩ', 'óc chó', 'chó đẻ', 'mẹ mày', 'má mày', 'đm', 'đmm', 'đcm', 'đù má', 'vãi lồn', 'vãi lìn', 'thằng chó', 'ngu như bò', 'đồ ngu'];
// …và trên dạng KHÔNG DẤU chỉ với những từ không trùng từ thường
const BAD_ASCII = ['dit me', 'ditme', 'dit con', 'du ma', 'dume', 'dmm', 'dcm', 'dkm', 'vcl', 'vkl', 'clgt', 'cmm', 'cmnr', 'lon me', 'oc cho', 'cho de',
  'fuck', 'fck', 'shit', 'bitch', 'dick', 'pussy', 'cunt', 'asshole', 'motherfucker'];
const BAD_TOKENS = new Set(['dm', 'đm', 'cc', 'cl', 'vl', 'lol', 'loz', 'cak', 'buoi', 'lon', 'cac']);   // chỉ khi đứng riêng thành 1 từ

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|vn|info|xyz|top|io|me|ly|gg|link|site|online|shop|club|cc|tk)\b|t\.me\/|zalo\.me|bit\.ly)/i;
const PHONE_RE = /(\+?84|0)[\s.-]?\d(?:[\s.-]?\d){7,9}/;

const stripMarks = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
// Gộp chữ lặp (ngggu → ngu), bỏ ký tự chèn giữa chữ (d.m, d-m-m)
const squash = s => s.replace(/(.)\1{2,}/g, '$1$1').replace(/([a-zđ])[\s.\-_*]+(?=[a-zđ]\b)/g, '$1');

function maskAll(text){
  let out = text, hit = false;
  const mask = w => '*'.repeat(Math.min(6, Math.max(3, w.length)));
  // 1) cụm có dấu
  for (const w of BAD_WITH_DIACRITICS){
    const re = new RegExp(w.replace(/\s+/g, '\\s*'), 'giu');
    if (re.test(out)){ hit = true; out = out.replace(re, m => mask(m)); }
  }
  // 2) cụm không dấu (dò trên bản bỏ dấu + gộp, nếu trúng thì che cả từ tương ứng trong câu gốc)
  const plain = squash(stripMarks(out.toLowerCase()));
  for (const w of BAD_ASCII){
    if (plain.replace(/\s+/g, ' ').includes(w) || plain.replace(/\s+/g, '').includes(w.replace(/\s+/g, ''))){
      hit = true;
      const parts = w.split(' ');
      out = out.split(/(\s+)/).map(tok => parts.some(pp => squash(stripMarks(tok.toLowerCase())).replace(/[^a-z]/g, '').includes(pp)) ? mask(tok) : tok).join('');
    }
  }
  // 3) từ viết tắt đứng riêng
  out = out.split(/(\s+)/).map(tok => {
    const t = tok.toLowerCase().replace(/[^a-zđ]/g, '');
    if (t && (BAD_TOKENS.has(t) || BAD_TOKENS.has(stripMarks(t)))){ hit = true; return mask(tok); }
    return tok;
  }).join('');
  return { text: out, hit };
}

class ChatModerator {
  constructor(store){
    this.store = store;
    this.mutes = new Map();                       // pid → { until, reason }
    this.rate = new Map();                        // pid → { last, times[], lastText }
    store.db.exec(`CREATE TABLE IF NOT EXISTS chat_mutes(pid TEXT PRIMARY KEY, until INTEGER NOT NULL, reason TEXT, nick TEXT, at INTEGER)`);
    this.qMute = store.db.prepare(`INSERT INTO chat_mutes(pid, until, reason, nick, at) VALUES(?,?,?,?,?) ON CONFLICT(pid) DO UPDATE SET until = excluded.until, reason = excluded.reason, nick = excluded.nick, at = excluded.at`);
    this.qUnmute = store.db.prepare(`DELETE FROM chat_mutes WHERE pid = ?`);
    for (const r of store.db.prepare(`SELECT pid, until, reason FROM chat_mutes WHERE until > ?`).all(Date.now())) this.mutes.set(r.pid, { until:r.until, reason:r.reason });
  }
  mutedUntil(pid){ const m = this.mutes.get(pid); return m && m.until > Date.now() ? m.until : 0; }
  mute(pid, ms, reason, nick){
    const until = Date.now() + ms;
    this.mutes.set(pid, { until, reason }); this.qMute.run(pid, until, reason || '', nick || '', Date.now());
    return until;
  }
  unmute(pid){ this.mutes.delete(pid); this.qUnmute.run(pid); }
  listMutes(){ const now = Date.now(); return [...this.mutes.entries()].filter(([, m]) => m.until > now).map(([pid, m]) => ({ pid, until:m.until, reason:m.reason })); }

  /** Kiểm tra 1 tin. Trả về { ok:true, text, masked } hoặc { ok:false, err }. */
  check(pid, raw){
    const now = Date.now();
    const until = this.mutedUntil(pid);
    if (until) return { ok:false, err:`Em đang bị tạm khoá chat tới ${new Date(until + 7 * 3600e3).toISOString().slice(11, 16)}.` };
    let text = String(raw || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
    if (!text) return { ok:false, err:null };
    if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN);
    const r = this.rate.get(pid) || { last:0, times:[], lastText:'' };
    r.times = r.times.filter(t => now - t < 20000);
    if (now - r.last < 1500 || r.times.length >= 6) return { ok:false, err:'Gửi chậm lại chút nhé.' };
    if (text.toLowerCase() === r.lastText) return { ok:false, err:'Tin này em vừa gửi rồi.' };
    if (LINK_RE.test(stripMarks(text))) return { ok:false, err:'Không gửi đường link trong chat để tránh lừa đảo nhé.' };
    if (PHONE_RE.test(text)) return { ok:false, err:'Không chia sẻ số điện thoại trong chat nhé.' };
    const m = maskAll(text);
    r.last = now; r.times.push(now); r.lastText = text.toLowerCase(); this.rate.set(pid, r);
    return { ok:true, text: m.text, masked: m.hit };
  }
  forget(pid){ this.rate.delete(pid); }
}

module.exports = { ChatModerator, maskAll, MAX_LEN };
