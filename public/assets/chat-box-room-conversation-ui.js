/* =============================================================================
 * Khung CHAT trong sảnh (văn phòng) — dùng chung bản Live và Luyện tay
 * - Danh sách tin (tối đa 80 dòng), ô nhập (Enter để gửi, máy tính bấm Enter để mở nhanh)
 * - Nút ⚑ báo cáo tin của người khác; tin bị ẩn khi bị báo cáo/khoá
 * - Điện thoại: mở/đóng bằng nút 💬, có huy hiệu số tin chưa đọc
 * Dùng: const cb = ChatBox.create({ root, btn, badge, onSend(text), onReport(id) })
 *       cb.add(msg, mine) · cb.hide(id) · cb.sys(text, kind) · cb.load(list, myRid) · cb.setMuted(until)
 * ============================================================================= */
window.ChatBox = (() => {
  'use strict';
  const fmtTime = ts => { const d = new Date(ts + 7 * 3600e3); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };

  function create({ root, btn, badge, onSend, onReport }){
    const log = root.querySelector('.chat-log'), form = root.querySelector('form'), input = root.querySelector('input');
    let unread = 0, mutedUntil = 0;
    function setUnread(n){ unread = n; badge.textContent = n > 9 ? '9+' : n; badge.hidden = !n; }
    function open(v){
      root.classList.toggle('open', v); btn.setAttribute('aria-expanded', v);
      if (v){ setUnread(0); log.scrollTop = log.scrollHeight; setTimeout(() => input.focus({ preventScroll:true }), 50); }
    }
    btn.addEventListener('click', () => open(!root.classList.contains('open')));
    root.querySelector('.chat-x').addEventListener('click', () => { open(false); input.blur(); });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = input.value.trim(); if (!v) return;
      if (mutedUntil > Date.now()){ sys('Em đang bị tạm khoá chat.', 'warn'); return; }
      onSend(v); input.value = '';
    });
    input.addEventListener('keydown', e => { if (e.key === 'Escape'){ input.blur(); if (btn.offsetParent) open(false); } e.stopPropagation(); });
    // Máy tính: bấm Enter khi đang chơi để gõ chat nhanh
    addEventListener('keydown', e => {
      if (e.key !== 'Enter' || (e.target.closest && e.target.closest('input, textarea, button')) || !root.closest('.stage.joined')) return;
      e.preventDefault(); if (btn.offsetParent) open(true); else input.focus({ preventScroll:true });
    });
    log.addEventListener('click', e => {
      const b = e.target.closest('.rep'); if (!b || b.disabled) return;
      b.disabled = true; b.textContent = '✓'; onReport(+b.dataset.id);
    });

    function line(m, mine){
      const li = document.createElement('li');
      li.dataset.id = m.id; if (mine) li.className = 'me';
      const t = document.createElement('time'); t.textContent = fmtTime(m.ts);
      const n = document.createElement('b'); n.textContent = m.nick;
      const s = document.createElement('span'); s.textContent = m.m;
      li.append(t, n, s);
      if (!mine){ const r = document.createElement('button'); r.type = 'button'; r.className = 'rep'; r.dataset.id = m.id; r.title = 'Báo cáo tin nhắn không phù hợp'; r.setAttribute('aria-label', 'Báo cáo tin nhắn của ' + m.nick); r.textContent = '⚑'; li.append(r); }
      return li;
    }
    function push(li){
      const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      log.append(li); while (log.children.length > 80) log.firstChild.remove();
      if (stick) log.scrollTop = log.scrollHeight;
    }
    function add(m, mine){
      push(line(m, mine));
      if (!mine && btn.offsetParent && !root.classList.contains('open')) setUnread(unread + 1);
    }
    function sys(text, kind){
      const li = document.createElement('li'); li.className = 'sys ' + (kind || ''); li.textContent = text; push(li);
    }
    return {
      add, sys,
      hide(id){ const li = log.querySelector(`li[data-id="${id}"]`); if (li){ li.classList.add('hidden'); li.querySelector('span').textContent = 'Tin nhắn đã bị ẩn.'; const r = li.querySelector('.rep'); if (r) r.remove(); } },
      load(list, myRid){ log.innerHTML = ''; list.forEach(m => push(line(m, m.rid === myRid))); sys('Chào mừng tới văn phòng! Chat văn minh, không gửi link/số điện thoại.', 'info'); },
      setMuted(until){ mutedUntil = until || 0; input.placeholder = mutedUntil > Date.now() ? 'Đang bị tạm khoá chat' : 'Nhắn cho mọi người… (Enter)'; },
      open
    };
  }
  return { create };
})();
