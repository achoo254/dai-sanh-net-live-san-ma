/* =============================================================================
 * Kiểm duyệt CHAT trong văn phòng (sự kiện công khai, hàng nghìn người)
 * - Lọc từ thô tục tiếng Việt/Anh (che bằng ***) theo NGUYÊN TỪ: "lồng đèn", "Dickson", "du mạch" không bị che nhầm
 * - Bắt kiểu lách: chữ lặp (đụuuu), chèn dấu chấm/gạch giữa chữ (đ.m), ký tự vô hình (zero-width)
 * - Chặn đường link / tên miền lạ (tránh spam, lừa đảo) và số điện thoại
 * - Giới hạn tần suất: 1 tin / 1,5 giây, tối đa 6 tin / 20 giây, chặn tin lặp lại
 * - Khoá chat: tự động khi bị báo cáo (do hub quyết) hoặc quản trị khoá tay; lưu SQLite
 * - Dùng chung cho BIỆT DANH: cleanNick() + isBadNick()
 * ============================================================================= */
'use strict';

const MAX_LEN = 120;

// Ký tự điều khiển + ký tự vô hình (zero-width, đảo chiều chữ, BOM) → bỏ hết trước khi kiểm tra
const INVISIBLE_RE = /[\u0000-\u001f\u007f­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;

// Cụm thô tục CÓ DẤU (so đúng dấu → "đeo" khác "đéo")
const BAD_WITH_DIACRITICS = ['đéo', 'địt', 'đụ', 'lồn', 'cặc', 'buồi', 'đĩ', 'óc chó', 'chó đẻ', 'mẹ mày', 'má mày', 'đm', 'đmm', 'đcm', 'đù má', 'vãi lồn', 'vãi lìn', 'thằng chó', 'ngu như bò', 'đồ ngu'];
// Cụm KHÔNG DẤU (người gõ không dấu để lách), chỉ những cụm không trùng câu bình thường
const BAD_ASCII = ['dit me', 'ditme', 'dit con', 'du ma', 'dume', 'dmm', 'dcm', 'dkm', 'vcl', 'vkl', 'clgt', 'cmm', 'cmnr', 'lon me', 'oc cho', 'cho de',
  'fuck', 'fck', 'shit', 'bitch', 'dick', 'pussy', 'cunt', 'asshole', 'motherfucker'];
// Từ tiếng Anh cho phép bắt cả dạng có đuôi (fucking, shitty, bitches); các từ khác phải đúng nguyên từ
const EN_STEMS = ['fuck', 'shit', 'bitch', 'motherfuck'];
const BAD_TOKENS = new Set(['dm', 'đm', 'cc', 'cl', 'vl', 'loz', 'cak', 'buoi', 'lon', 'cac']);   // chỉ khi đứng riêng thành 1 từ

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|vn|info|xyz|top|io|me|ly|gg|link|site|online|shop|club|cc|tk)\b|t\.me\/|zalo\.me|bit\.ly)/i;
const PHONE_RE = /(\+?84|0)[\s.-]?\d(?:[\s.-]?\d){7,9}/;

const stripMarks = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd');
// Chuẩn hoá 1 từ để so: chữ thường, gộp chữ lặp ≥3 (đụuuu → đụu), bỏ ký tự chèn (đ.m → đm)
const normTok = s => s.toLowerCase().replace(/[.\-_*'"`~^]+/g, '').replace(/(.)\1{2,}/g, '$1$1');
const plainTok = s => stripMarks(normTok(s)).replace(/[^a-z0-9]/g, '');
const mask = w => '*'.repeat(Math.min(6, Math.max(3, w.length)));

/** Che từ thô tục theo nguyên từ. Trả về { text, hit }. */
function maskAll(text){
  const parts = String(text).split(/(\s+)/);                    // giữ nguyên khoảng trắng
  const words = []; parts.forEach((t, i) => { if (t && !/^\s+$/.test(t)) words.push(i); });
  const marked = new Set();
  const markRun = (start, len) => { for (let k = 0; k < len; k++) marked.add(words[start + k]); };
  const seq = (arr, i, n) => arr.slice(i, i + n).join(' ');
  const dia = words.map(i => normTok(parts[i]).replace(/[^\p{L}\p{N}]/gu, ''));     // có dấu
  const asc = words.map(i => plainTok(parts[i]));                                  // không dấu
  const one = asc.map(t => t.replace(/(.)\1+/g, '$1'));                         // gộp mọi chữ lặp: duuuu → du
  for (let i = 0; i < words.length; i++){
    for (const w of BAD_WITH_DIACRITICS){ const n = w.split(' ').length; if (seq(dia, i, n) === w) markRun(i, n); }
    for (const w of BAD_ASCII){ const n = w.split(' ').length; if (seq(asc, i, n) === w || seq(one, i, n) === w) markRun(i, n); }
    if (EN_STEMS.some(st => asc[i].startsWith(st))) markRun(i, 1);
    if (BAD_TOKENS.has(dia[i]) || BAD_TOKENS.has(asc[i]) || BAD_TOKENS.has(one[i])) markRun(i, 1);
  }
  if (!marked.size) return { text: String(text), hit:false };
  return { text: parts.map((t, i) => marked.has(i) ? mask(t) : t).join(''), hit:true };
}

/** Biệt danh: bỏ ký tự vô hình/điều khiển, gộp khoảng trắng, tối đa 16 ký tự. */
const cleanNick = s => String(s || '').replace(INVISIBLE_RE, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
/** Biệt danh có từ thô tục / link / số điện thoại → không cho dùng (hiện công khai trên bảng xếp hạng, dòng tin). */
const isBadNick = raw => { const nick = String(raw || '').replace(INVISIBLE_RE, ''); return maskAll(nick).hit || LINK_RE.test(stripMarks(nick)) || PHONE_RE.test(nick); };

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
    let text = String(raw || '').replace(INVISIBLE_RE, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
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
  /** Bỏ bộ đếm tần suất đã cũ (>1 phút không chat) để bộ nhớ không phình. */
  pruneRate(now = Date.now()){ for (const [pid, r] of this.rate) if (now - r.last > 60000) this.rate.delete(pid); }
}

module.exports = { ChatModerator, maskAll, cleanNick, isBadNick, MAX_LEN };
