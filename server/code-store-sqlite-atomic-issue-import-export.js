/* =============================================================================
 * Kho mã giảm giá (SQLite, module node:sqlite có sẵn trong Node ≥ 22.13)
 * - Cấp mã NGUYÊN TỬ: 1 câu UPDATE ... RETURNING trên 1 kết nối duy nhất,
 *   Node chạy đơn luồng nên không bao giờ cấp trùng 1 mã cho 2 người.
 * - Lưu tiến độ người chơi (mảnh, điểm) để máy chủ khởi động lại không mất.
 * - Nhập kho bằng CSV, xuất danh sách đã cấp để đối soát.
 * ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

class CodeStore {
  constructor(file){
    fs.mkdirSync(path.dirname(file), { recursive:true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS codes(
        code TEXT PRIMARY KEY,
        service TEXT NOT NULL,          -- domain|hosting|vps|ssl|email|super
        pool TEXT NOT NULL DEFAULT '',  -- '' = dùng cho mọi phiên; hoặc id phiên cụ thể
        offer TEXT, cond TEXT, expires TEXT, url TEXT,
        issued_to TEXT, issued_nick TEXT, issued_session TEXT, issued_day TEXT, issued_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_codes_free ON codes(service, pool) WHERE issued_to IS NULL;
      CREATE INDEX IF NOT EXISTS idx_codes_owner ON codes(issued_to, issued_day);
      CREATE TABLE IF NOT EXISTS progress(
        session TEXT NOT NULL, pid TEXT NOT NULL, nick TEXT,
        score INTEGER NOT NULL DEFAULT 0, pieces TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER, PRIMARY KEY(session, pid)
      );
    `);
    this.q = {
      issue: this.db.prepare(`
        UPDATE codes SET issued_to = ?, issued_nick = ?, issued_session = ?, issued_day = ?, issued_at = ?
        WHERE code = (SELECT code FROM codes WHERE service = ? AND issued_to IS NULL AND (pool = ? OR pool = '')
                      ORDER BY pool DESC, rowid LIMIT 1)
        RETURNING code, service, offer, cond, expires, url`),
      countDayService: this.db.prepare(`SELECT COUNT(*) n FROM codes WHERE issued_to = ? AND service = ? AND issued_day = ?`),
      countSession: this.db.prepare(`SELECT COUNT(*) n FROM codes WHERE issued_to = ? AND issued_session = ? AND service <> 'super'`),
      mine: this.db.prepare(`SELECT code, service, offer, cond, expires, url FROM codes WHERE issued_to = ? AND issued_session = ? ORDER BY issued_at`),
      stock: this.db.prepare(`SELECT service, SUM(issued_to IS NULL AND (pool = '' OR pool = ?)) free,
                              SUM(issued_session IS NOT NULL AND issued_session = ?) used FROM codes GROUP BY service`),
      insert: this.db.prepare(`INSERT OR IGNORE INTO codes(code, service, pool, offer, cond, expires, url) VALUES(?,?,?,?,?,?,?)`),
      total: this.db.prepare(`SELECT COUNT(*) n FROM codes`),
      exportAll: this.db.prepare(`SELECT code, service, pool, offer, issued_to, issued_nick, issued_session, issued_day, issued_at
                                  FROM codes WHERE issued_to IS NOT NULL ORDER BY issued_at`),
      saveProg: this.db.prepare(`INSERT INTO progress(session, pid, nick, score, pieces, updated_at) VALUES(?,?,?,?,?,?)
                                 ON CONFLICT(session, pid) DO UPDATE SET nick = excluded.nick, score = excluded.score,
                                 pieces = excluded.pieces, updated_at = excluded.updated_at`),
      loadProg: this.db.prepare(`SELECT score, pieces FROM progress WHERE session = ? AND pid = ?`),
      topSession: this.db.prepare(`SELECT nick, score FROM progress WHERE session = ? ORDER BY score DESC LIMIT ?`)
    };
  }

  /** Cấp 1 mã của dịch vụ cho người chơi. Trả về null nếu hết kho. */
  issue(service, { pid, nick, session, day }){
    return this.q.issue.get(pid, nick, session, day, Date.now(), service, session) || null;
  }
  countDayService(pid, service, day){ return this.q.countDayService.get(pid, service, day).n; }
  countSession(pid, session){ return this.q.countSession.get(pid, session).n; }
  myCodes(pid, session){ return this.q.mine.all(pid, session); }

  /** Tồn kho cho phiên: { service: { free, total } } — total = còn lại + đã phát trong phiên này */
  stock(session){
    const out = {};
    for (const r of this.q.stock.all(session || '', session || '')){
      const free = r.free | 0, used = r.used | 0;
      out[r.service] = { free, total: free + used };
    }
    return out;
  }

  /** Nhập CSV: service,code,offer,cond,expires,url,pool (dòng đầu có thể là tiêu đề). */
  importCsv(text, validServices){
    const rows = parseCsv(text);
    if (rows.length && /^service$/i.test((rows[0][0] || '').trim())) rows.shift();
    let added = 0, skipped = 0;
    const errors = [];
    this.db.exec('BEGIN');
    try {
      rows.forEach((r, i) => {
        const [service, code, offer = '', cond = '', expires = '', url = '', pool = ''] = r.map(x => (x || '').trim());
        if (!service && !code) return;
        if (!validServices.includes(service)){ errors.push(`Dòng ${i + 1}: dịch vụ "${service}" không hợp lệ`); return; }
        if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)){ errors.push(`Dòng ${i + 1}: mã "${code}" không hợp lệ`); return; }
        const res = this.q.insert.run(code, service, pool, offer, cond, expires, url);
        res.changes ? added++ : skipped++;
      });
      this.db.exec('COMMIT');
    } catch(e){ this.db.exec('ROLLBACK'); throw e; }
    return { added, skipped, errors: errors.slice(0, 50) };
  }

  exportCsv(){
    const head = 'code,service,pool,offer,pid,nick,session,day,issued_at\n';
    return head + this.q.exportAll.all().map(r => [r.code, r.service, r.pool, r.offer, r.issued_to, r.issued_nick, r.issued_session, r.issued_day,
      new Date(r.issued_at).toISOString()].map(csvCell).join(',')).join('\n') + '\n';
  }

  /** Kho mã MẪU để chạy thử (chỉ khi kho trống). */
  seedDemo(services, perService, superCount){
    if (this.q.total.get().n > 0) return 0;
    let n = 0;
    this.db.exec('BEGIN');
    for (const s of services){
      for (let i = 1; i <= perService; i++){
        this.q.insert.run(`DEMO-${s.toUpperCase()}-${String(i).padStart(4, '0')}`, s, '', 'Giảm XX%',
          'MÃ MINH HỌA để chạy thử — chưa dùng được khi mua hàng.', '30/11/2026', 'https://inet.vn'); n++;
      }
    }
    for (let i = 1; i <= superCount; i++){
      this.q.insert.run(`DEMO-SUPER-${String(i).padStart(3, '0')}`, 'super', '', 'Giảm XX% (Siêu Deal)',
        'MÃ MINH HỌA để chạy thử — chưa dùng được khi mua hàng.', '30/11/2026', 'https://inet.vn'); n++;
    }
    this.db.exec('COMMIT');
    return n;
  }

  /** Ghi tiến độ hàng loạt (gọi định kỳ 1 giây/lần). */
  saveProgress(list){
    if (!list.length) return;
    this.db.exec('BEGIN');
    try {
      const now = Date.now();
      for (const p of list) this.q.saveProg.run(p.session, p.pid, p.nick, p.score, JSON.stringify(p.pieces), now);
      this.db.exec('COMMIT');
    } catch(e){ this.db.exec('ROLLBACK'); throw e; }
  }
  loadProgress(session, pid){
    const r = this.q.loadProg.get(session, pid);
    return r ? { score: r.score, pieces: JSON.parse(r.pieces || '{}') } : null;
  }
  topOfSession(session, n = 10){ return this.q.topSession.all(session, n); }
}

function csvCell(v){
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/** Bộ đọc CSV tối giản, hỗ trợ ô có ngoặc kép. */
function parseCsv(text){
  const rows = []; let row = [], cell = '', q = false;
  text = String(text).replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q){
      if (c === '"'){ if (text[i + 1] === '"'){ cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r'){
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length){ row.push(cell); rows.push(row); }
  return rows;
}

module.exports = { CodeStore };
