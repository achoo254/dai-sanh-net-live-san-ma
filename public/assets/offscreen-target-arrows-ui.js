/* =============================================================================
 * Mũi tên chỉ hướng tới mục tiêu NGOÀI màn hình (hộp quà gần nhất, Siêu Deal, điểm manh mối)
 * Văn phòng 4000×2600 rộng hơn màn hình nhiều lần → người chơi mới không biết đi đâu.
 * Mỗi mục tiêu ngoài khung nhìn hiện 1 nút tròn ở mép màn hình, mũi tên xoay về phía nó + khoảng cách.
 * Dùng: const ta = TargetArrows.create(stageEl)
 *       ta.update([{ key, x, y, color, label }], project(x,y) → {x,y} toạ độ màn hình, inset {l,r,t,b})
 *       ta.clear()
 * ============================================================================= */
window.TargetArrows = (() => {
  'use strict';
  const EDGE = 26;                                  // khoảng cách nút tới mép vùng an toàn

  function create(stage){
    const box = document.createElement('div');
    box.className = 'tarrows'; box.setAttribute('aria-hidden', 'true');
    stage.appendChild(box);
    const pool = new Map();                         // key → phần tử (tái sử dụng, không tạo lại mỗi khung)

    function update(list, project, inset){
      const W = stage.clientWidth, H = stage.clientHeight;
      const l = inset.l, r = W - inset.r, t = inset.t, b = H - inset.b;
      const cx = (l + r) / 2, cy = (t + b) / 2, hw = (r - l) / 2 - EDGE, hh = (b - t) / 2 - EDGE;
      const seen = new Set(), placed = [];
      for (const it of list){
        const p = project(it.x, it.y);
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (p.x > l && p.x < r && p.y > t && p.y < b) continue;          // đang thấy trên màn hình → khỏi chỉ
        const dx = p.x - cx, dy = p.y - cy;
        if (hw <= 0 || hh <= 0 || (!dx && !dy)) continue;
        const k = Math.min(hw / Math.max(Math.abs(dx), 1e-6), hh / Math.max(Math.abs(dy), 1e-6));
        let el = pool.get(it.key);
        if (!el){
          el = document.createElement('div'); el.className = 'tarrow';
          el.innerHTML = '<i></i><b></b>';
          box.appendChild(el); pool.set(it.key, el);
        }
        seen.add(it.key);
        // Đặt lên mép vùng an toàn; trùng chỗ nút khác thì trượt dọc theo mép (không chồng lên nhau)
        let x = cx + dx * k, y = cy + dy * k;
        const onSide = Math.abs(Math.abs(dx * k) - hw) < 1;            // nằm mép trái/phải → trượt theo chiều dọc
        for (let n = 0; n < 4 && placed.some(q => Math.abs(q[0] - x) < 48 && Math.abs(q[1] - y) < 48); n++){
          if (onSide) y = Math.min(b - EDGE, Math.max(t + EDGE, y + (y > cy ? -52 : 52)));
          else x = Math.min(r - EDGE, Math.max(l + EDGE, x + (x > cx ? -52 : 52)));
        }
        placed.push([x, y]);
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        el.style.setProperty('--c', it.color);
        el.classList.toggle('hot', !!it.hot);
        el.firstChild.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
        if (el.lastChild.textContent !== it.label) el.lastChild.textContent = it.label;
      }
      for (const [key, el] of pool) if (!seen.has(key)){ el.remove(); pool.delete(key); }
    }
    function clear(){ for (const el of pool.values()) el.remove(); pool.clear(); }
    return { update, clear };
  }
  return { create };
})();
