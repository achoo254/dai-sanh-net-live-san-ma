/* =============================================================================
 * Kho mã giảm giá (SQLite, module node:sqlite có sẵn trong Node ≥ 22.13)
 * - Cấp mã NGUYÊN TỬ: 1 câu UPDATE ... RETURNING trên 1 kết nối duy nhất,
 *   Node chạy đơn luồng nên không bao giờ cấp trùng 1 mã cho 2 người.
 * - GIỮ CHỖ mã trong lúc người chơi giải mật thư (reserved_by/reserved_until), hết giờ tự trả lại kho.
 * - Ngân hàng đề mật thư (MKT nạp CSV) + thống kê tỉ lệ giải từng đề.
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
      CREATE TABLE IF NOT EXISTS puzzles(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tier INTEGER NOT NULL, type TEXT NOT NULL DEFAULT 'text', question TEXT NOT NULL,
        answers TEXT NOT NULL,            -- nhiều đáp án đúng cách nhau bằng |
        hint1 TEXT, hint2 TEXT, clues TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL DEFAULT 'mkt', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS puzzle_stats(
        key TEXT PRIMARY KEY, opened INTEGER NOT NULL DEFAULT 0, solved INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0, total_ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS progress(
        session TEXT NOT NULL, pid TEXT NOT NULL, nick TEXT,
        score INTEGER NOT NULL DEFAULT 0, pieces TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER, PRIMARY KEY(session, pid)
      );
    `);
    // Thêm cột giữ chỗ cho kho cũ (đã tạo từ bản trước)
    const cols = this.db.prepare(`PRAGMA table_info(codes)`).all().map(c => c.name);
    if (!cols.includes('reserved_by')) this.db.exec(`ALTER TABLE codes ADD COLUMN reserved_by TEXT; ALTER TABLE codes ADD COLUMN reserved_until INTEGER;`);
    const FREE = `issued_to IS NULL AND (reserved_until IS NULL OR reserved_until < ?)`;
    this.q = {
      // Giữ chỗ 1 mã còn trống (nguyên tử, đơn luồng → không 2 người giữ cùng 1 mã)
      reserve: this.db.prepare(`
        UPDATE codes SET reserved_by = ?, reserved_until = ?
        WHERE code = (SELECT code FROM codes WHERE service = ? AND ${FREE} AND (pool = ? OR pool = '')
                      ORDER BY pool DESC, rowid LIMIT 1)
        RETURNING code`),
      // Giải đúng → chuyển mã đang giữ thành đã cấp
      confirm: this.db.prepare(`
        UPDATE codes SET issued_to = ?, issued_nick = ?, issued_session = ?, issued_day = ?, issued_at = ?, reserved_by = NULL, reserved_until = NULL
        WHERE code = ? AND reserved_by = ? AND issued_to IS NULL
        RETURNING code, service, offer, cond, expires, url`),
      release: this.db.prepare(`UPDATE codes SET reserved_by = NULL, reserved_until = NULL WHERE code = ? AND reserved_by = ? AND issued_to IS NULL`),
      countDayService: this.db.prepare(`SELECT COUNT(*) n FROM codes WHERE issued_to = ? AND service = ? AND issued_day = ?`),
      countSession: this.db.prepare(`SELECT COUNT(*) n FROM codes WHERE issued_to = ? AND issued_session = ? AND service <> 'super'`),
      mine: this.db.prepare(`SELECT code, service, offer, cond, expires, url FROM codes WHERE issued_to = ? AND issued_session = ? ORDER BY issued_at`),
      stock: this.db.prepare(`SELECT service, SUM(${FREE} AND (pool = '' OR pool = ?)) free,
                              SUM(issued_session IS NOT NULL AND issued_session = ?) used FROM codes GROUP BY service`),
      insert: this.db.prepare(`INSERT OR IGNORE INTO codes(code, service, pool, offer, cond, expires, url) VALUES(?,?,?,?,?,?,?)`),
      total: this.db.prepare(`SELECT COUNT(*) n FROM codes`),
      exportAll: this.db.prepare(`SELECT code, service, pool, offer, issued_to, issued_nick, issued_session, issued_day, issued_at
                                  FROM codes WHERE issued_to IS NOT NULL ORDER BY issued_at`),
      saveProg: this.db.prepare(`INSERT INTO progress(session, pid, nick, score, pieces, updated_at) VALUES(?,?,?,?,?,?)
                                 ON CONFLICT(session, pid) DO UPDATE SET nick = excluded.nick, score = excluded.score,
                                 pieces = excluded.pieces, updated_at = excluded.updated_at`),
      loadProg: this.db.prepare(`SELECT score, pieces FROM progress WHERE session = ? AND pid = ?`),
      topSession: this.db.prepare(`SELECT nick, score FROM progress WHERE session = ? ORDER BY score DESC LIMIT ?`),
      pzCount: this.db.prepare(`SELECT COUNT(*) n FROM puzzles`),
      pzInsert: this.db.prepare(`INSERT INTO puzzles(tier, type, question, answers, hint1, hint2, clues, source, created_at) VALUES(?,?,?,?,?,?,?,?,?)`),
      pzRandom: this.db.prepare(`SELECT * FROM puzzles WHERE tier = ? AND active = 1 ORDER BY RANDOM() LIMIT 1`),
      pzCountTier: this.db.prepare(`SELECT COUNT(*) n FROM puzzles WHERE tier = ? AND active = 1`),
      pzOffSample: this.db.prepare(`UPDATE puzzles SET active = 0 WHERE source = 'sample'`),
      pzList: this.db.prepare(`SELECT p.id, p.tier, p.type, p.question, p.source, p.active, s.opened, s.solved, s.failed, s.total_ms
                               FROM puzzles p LEFT JOIN puzzle_stats s ON s.key = 'bank:' || p.id ORDER BY p.tier, p.id`),
      statOpen: this.db.prepare(`INSERT INTO puzzle_stats(key, opened) VALUES(?, 1) ON CONFLICT(key) DO UPDATE SET opened = opened + 1`),
      statSolved: this.db.prepare(`UPDATE puzzle_stats SET solved = solved + 1, total_ms = total_ms + ? WHERE key = ?`),
      statFailed: this.db.prepare(`UPDATE puzzle_stats SET failed = failed + 1 WHERE key = ?`),
      statGen: this.db.prepare(`SELECT * FROM puzzle_stats WHERE key LIKE 'gen:%'`)
    };
  }

  /** Giữ chỗ 1 mã của dịch vụ trong holdMs. Trả về mã (string) hoặc null nếu hết kho. */
  reserve(service, { pid, session, holdMs }){
    const now = Date.now(), r = this.q.reserve.get(pid, now + holdMs, service, now, session || '');
    return r ? r.code : null;
  }
  /** Xác nhận cấp mã đang giữ (giải đúng). Trả về thông tin mã hoặc null nếu không còn giữ. */
  confirm(code, { pid, nick, session, day }){
    return this.q.confirm.get(pid, nick, session, day, Date.now(), code, pid) || null;
  }
  /** Trả mã đang giữ về kho. Trả về true nếu thật sự có mã được nhả (để không cộng tồn kho 2 lần). */
  release(code, pid){ return this.q.release.run(code, pid).changes > 0; }
  countDayService(pid, service, day){ return this.q.countDayService.get(pid, service, day).n; }
  countSession(pid, session){ return this.q.countSession.get(pid, session).n; }
  myCodes(pid, session){ return this.q.mine.all(pid, session); }

  /** Tồn kho cho phiên: { service: { free, total } } — total = còn lại + đã phát trong phiên này */
  stock(session){
    const out = {};
    for (const r of this.q.stock.all(Date.now(), session || '', session || '')){
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

  /* ---------- Ngân hàng mật thư ---------- */
  /** Đồng bộ đề MẪU (source='sample') với bank chỉ-trên-máy-chủ. Đề mẫu cũ (từng lộ đáp án trong file trình duyệt)
   *  được thay hết; nếu MKT đã "thay đề mẫu" (mẫu đang tắt) thì đề mẫu mới cũng để tắt. Không đụng đề MKT. */
  syncSamplePuzzles(bank){
    const rows = this.db.prepare(`SELECT question, active FROM puzzles WHERE source = 'sample'`).all();
    const want = [...bank.FILL, ...bank.CLUES].map(x => x.question).sort();
    if (rows.length === want.length && rows.map(r => r.question).sort().every((q, i) => q === want[i])) return 0;
    const active = rows.length ? (rows.some(r => r.active) ? 1 : 0) : 1;
    const now = Date.now(); let n = 0;
    this.db.exec('BEGIN');
    try {
      this.db.prepare(`DELETE FROM puzzles WHERE source = 'sample'`).run();
      const ins = this.db.prepare(`INSERT INTO puzzles(tier, type, question, answers, hint1, hint2, clues, source, active, created_at) VALUES(?,?,?,?,?,?,?,'sample',?,?)`);
      for (const f of bank.FILL){ ins.run(1, 'fill', f.question, f.answers.join('|'), f.hint1, f.hint2, '[]', active, now); n++; }
      for (const c of bank.CLUES){ ins.run(3, 'clues', c.question, c.answers.join('|'), c.hint1, c.hint2, JSON.stringify(c.clues), active, now); n++; }
      this.db.exec('COMMIT');
    } catch(e){ this.db.exec('ROLLBACK'); throw e; }
    return n;
  }
  /** Số đề MKT (không phải đề mẫu) đang bật theo cấp — để cảnh báo khi chạy thật mà chưa nạp đề. */
  mktPuzzleCount(tier){ return this.db.prepare(`SELECT COUNT(*) n FROM puzzles WHERE tier = ? AND active = 1 AND source <> 'sample'`).get(tier).n; }
  bankCount(tier){ return this.q.pzCountTier.get(tier).n; }
  randomPuzzle(tier){
    const r = this.q.pzRandom.get(tier);
    if (!r) return null;
    return { key:'bank:' + r.id, type:r.type, question:r.question, answers:r.answers.split('|').map(x => x.trim()).filter(Boolean),
             hint1:r.hint1 || '', hint2:r.hint2 || '', clues: JSON.parse(r.clues || '[]') };
  }
  /** CSV đề: tier,type,question,answers,hint1,hint2,clue_spot1,clue1,clue_spot2,clue2,clue_spot3,clue3 */
  importPuzzlesCsv(text, { replaceSample, validSpots }){
    const rows = parseCsv(text);
    if (rows.length && /^tier$/i.test((rows[0][0] || '').trim())) rows.shift();
    let added = 0; const errors = []; const now = Date.now();
    this.db.exec('BEGIN');
    try {
      if (replaceSample) this.q.pzOffSample.run();
      rows.forEach((r, i) => {
        const c = r.map(x => (x || '').trim());
        if (!c.join('')) return;
        const tier = +c[0], type = c[1] || 'text', question = c[2], answers = c[3];
        if (![1, 2, 3].includes(tier)){ errors.push(`Dòng ${i + 1}: cấp phải là 1, 2 hoặc 3`); return; }
        if (!question || !answers){ errors.push(`Dòng ${i + 1}: thiếu đề hoặc đáp án`); return; }
        const clues = [];
        for (const k of [6, 8, 10]){
          if (!c[k] && !c[k + 1]) continue;
          if (!validSpots.includes(c[k])){ errors.push(`Dòng ${i + 1}: điểm manh mối "${c[k]}" không có (dùng: ${validSpots.join(', ')})`); return; }
          clues.push({ spot:c[k], text:c[k + 1] || '' });
        }
        if (tier === 3 && !clues.length){ errors.push(`Dòng ${i + 1}: đề cấp 3 cần ít nhất 1 manh mối`); return; }
        this.q.pzInsert.run(tier, type, question, answers, c[4] || '', c[5] || '', JSON.stringify(clues), 'mkt', now); added++;
      });
      this.db.exec('COMMIT');
    } catch(e){ this.db.exec('ROLLBACK'); throw e; }
    return { added, errors: errors.slice(0, 50) };
  }
  statOpen(key){ this.q.statOpen.run(key); }
  statResult(key, solved, ms){ solved ? this.q.statSolved.run(Math.round(ms), key) : this.q.statFailed.run(key); }
  puzzleReport(){ return { bank: this.q.pzList.all(), generated: this.q.statGen.all() }; }

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
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // chống "CSV injection": biệt danh =HYPERLINK(...) không chạy thành công thức Excel
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
