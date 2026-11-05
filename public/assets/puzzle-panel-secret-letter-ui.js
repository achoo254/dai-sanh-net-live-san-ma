/* =============================================================================
 * Bảng MẬT THƯ (giao diện kiểu terminal phòng công nghệ) — dùng cho cả bản Live và Luyện tay
 * - Hiện đề, đồng hồ giữ mã, danh sách manh mối (cấp 3: đi tới điểm trong văn phòng để mở), gợi ý
 * - Ô nhập đáp án + Gửi; thu nhỏ được để đi tìm manh mối
 * Dùng: const pp = PuzzlePanel.create({ root, onSubmit(id, text), names }) → pp.open(msg) / pp.clue(msg) /
 *       pp.result(msg) / pp.end(msg) / pp.active()
 * ============================================================================= */
window.PuzzlePanel = (() => {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TIER = { 1:'Cấp 1 · Dễ', 2:'Cấp 2 · Vừa', 3:'Cấp 3 · Khó hơn chút' };

  function create({ root, onSubmit, svcName, onCopy }){
    let z = null, timer = 0, collapsed = false;
    root.innerHTML = `
      <div class="pz-head">
        <span class="pz-badge" id="pzTier"></span>
        <b id="pzTitle">Mật thư</b>
        <button type="button" class="pz-min" id="pzMin" aria-label="Thu nhỏ / mở rộng mật thư">–</button>
      </div>
      <div class="pz-timer"><i id="pzBar"></i></div>
      <div class="pz-body" id="pzBody">
        <pre class="pz-q" id="pzQ"></pre>
        <ul class="pz-clues" id="pzClues" hidden></ul>
        <div class="pz-hints" id="pzHints"></div>
        <form class="pz-form" id="pzForm" autocomplete="off">
          <input class="pz-in" id="pzIn" maxlength="60" placeholder="Nhập đáp án…" aria-label="Đáp án mật thư" autocapitalize="characters" spellcheck="false">
          <button type="submit" class="pz-go" id="pzGo">Giải mã</button>
        </form>
        <p class="pz-meta" id="pzMeta"></p>
        <div class="pz-win" id="pzWin" hidden></div>
      </div>`;
    const $ = s => root.querySelector(s);
    $('#pzMin').addEventListener('click', () => { collapsed = !collapsed; root.classList.toggle('min', collapsed); $('#pzMin').textContent = collapsed ? '+' : '–'; });
    $('#pzForm').addEventListener('submit', e => {
      e.preventDefault();
      const v = $('#pzIn').value.trim(); if (!z || !v) return;
      $('#pzGo').disabled = true; setTimeout(() => { $('#pzGo').disabled = false; }, 1200);
      onSubmit(z.id, v);
    });

    function renderClues(){
      const ul = $('#pzClues');
      ul.hidden = !z.clues.length;
      ul.innerHTML = z.clues.map(c => c.text
        ? `<li class="ok"><span>✓ ${esc(c.name)}</span><b>${esc(c.text)}</b></li>`
        : `<li><span>📍 ${esc(c.name)}</span><em>Đi tới điểm này trong văn phòng để đọc manh mối</em></li>`).join('');
    }
    function renderHints(){ $('#pzHints').innerHTML = z.hints.map((h, i) => `<p>💡 Gợi ý ${i + 1}: ${esc(h)}</p>`).join(''); }
    function renderMeta(){ $('#pzMeta').textContent = `Còn ${z.attempts} lần thử · mã đang được giữ cho em`; }
    function tick(){
      if (!z) return;
      const left = Math.max(0, z.until - Date.now());
      $('#pzBar').style.transform = `scaleX(${left / z.total})`;
      root.classList.toggle('urgent', left < 15000);
    }

    return {
      active: () => z,
      open(m){
        z = { id:m.id, svc:m.svc, tier:m.tier, clues:m.clues || [], hints:m.hints || [], attempts:m.attempts, until: Date.now() + m.ms, total: Math.max(m.ms, 1) };
        root.hidden = false; root.classList.remove('win', 'min', 'shake'); collapsed = false; $('#pzMin').textContent = '–';
        $('#pzTier').textContent = TIER[m.tier] || ''; $('#pzTier').className = 'pz-badge t' + m.tier;
        $('#pzTitle').textContent = `Mật thư ${svcName(m.svc)}`;
        $('#pzQ').textContent = m.question;
        $('#pzWin').hidden = true; $('#pzForm').hidden = false;
        $('#pzIn').value = ''; renderClues(); renderHints(); renderMeta();
        clearInterval(timer); timer = setInterval(tick, 200); tick();
        if (!m.clues || !m.clues.length) setTimeout(() => $('#pzIn').focus({ preventScroll:true }), 100);
      },
      clue(m){
        if (!z || m.id !== z.id) return;
        const c = z.clues.find(x => x.spot === m.spot); if (c) c.text = m.text;
        renderClues(); root.classList.remove('min'); collapsed = false;
      },
      /** Kết quả chấm. Trả về true nếu giải đúng. */
      result(m){
        if (!z || m.id !== z.id) return false;
        if (m.ok){
          clearInterval(timer);
          root.classList.add('win'); $('#pzForm').hidden = true;
          const c = m.code;
          $('#pzWin').hidden = false;
          $('#pzWin').innerHTML = `<p class="pz-ok">🔓 Giải mã thành công! +${m.bonus || 0} điểm</p>
            ${c ? `<div class="pz-code"><code>${esc(c.code)}</code><button type="button" class="copy" data-code="${esc(c.code)}">Sao chép</button></div>
            <p class="pz-cond">${esc(c.offer || '')}${c.expires ? ' · HSD ' + esc(c.expires) : ''}</p>` : '<p class="pz-cond">Bản luyện tay không phát mã — vào phiên live để nhận mã thật!</p>'}
            <button type="button" class="btn primary pz-close">Săn tiếp</button>`;
          $('#pzWin .pz-close').addEventListener('click', () => { root.hidden = true; });
          z = null;
          return true;
        }
        if (m.slow) return false;
        z.attempts = m.left; if (m.hint) z.hints.push(m.hint);
        renderHints(); renderMeta();
        root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
        $('#pzIn').select();
        return false;
      },
      end(m){
        if (!z || m.id !== z.id) return;
        clearInterval(timer); z = null;
        root.classList.add('shake');
        $('#pzWin').hidden = false; $('#pzForm').hidden = true;
        $('#pzWin').innerHTML = `<p class="pz-fail">${m.reason === 'timeout' ? '⌛ Hết giờ giữ mã!' : '🔒 Hết lượt thử!'}</p>
          <p class="pz-cond">Mã đã trả lại kho. Gom lại ${svcName(m.svc)} để thử mật thư khác nhé.</p>
          <button type="button" class="btn ghost pz-close">Đóng</button>`;
        $('#pzWin .pz-close').addEventListener('click', () => { root.hidden = true; });
        setTimeout(() => { if (!z) root.hidden = true; }, 6000);
      },
      close(){ clearInterval(timer); z = null; root.hidden = true; }
    };
  }
  return { create };
})();
