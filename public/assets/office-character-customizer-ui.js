/* =============================================================================
 * Màn PHỐI ĐỒ nhân vật người 3D (giới tính, màu da, kiểu + màu tóc, kiểu + màu áo, phụ kiện)
 * - Có khung xem trước 3D xoay tròn nếu máy hỗ trợ (avatarMod = module office3d-human-avatar-factory.js)
 * - Máy không hỗ trợ 3D vẫn chọn được (bản 2D dùng hình bé Nét đại diện)
 * Dùng: const cz = CharacterCustomizer.create({ root, previewCanvas, avatarMod, initial, onChange })
 * ============================================================================= */
window.CharacterCustomizer = (() => {
  'use strict';
  // Danh sách lựa chọn (trùng với LOOK_OPTIONS của bản 3D; giữ ở đây để bản 2D vẫn dùng được)
  const OPT = {
    s:  ['#f6d5bd', '#ecc19f', '#d8a47d', '#b67d56', '#8a5636'],
    hc: ['#1b1b1b', '#3d2a1e', '#7a4b28', '#d6b26c', '#2f5fa8'],
    tc: ['#024799', '#0582D4', '#f4f7fa', '#24303f', '#0E9F6E'],
    t:  [['polo', 'Polo'], ['hoodie', 'Hoodie'], ['shirt', 'Sơ mi'], ['tee', 'Áo thun']],
    a:  [['none', 'Không'], ['glasses', 'Kính'], ['headset', 'Tai nghe'], ['cap', 'Mũ']],
    hair: { m:['Ngắn gọn', 'Rẽ ngôi', 'Dựng chỉa', 'Cắt sát', 'Xoăn'], f:['Bob', 'Dài', 'Đuôi ngựa', 'Búi', 'Tém'] }
  };
  const parse = str => {
    const o = { g:'m', s:1, h:0, hc:0, t:'polo', tc:0, a:'none' };
    String(str || '').split('|').forEach(kv => { const [k, v] = kv.split(':');
      if (k === 'g' && (v === 'm' || v === 'f')) o.g = v;
      else if (['s', 'h', 'hc', 'tc'].includes(k) && /^[0-4]$/.test(v)) o[k] = +v;
      else if (k === 't' && OPT.t.some(x => x[0] === v)) o.t = v;
      else if (k === 'a' && OPT.a.some(x => x[0] === v)) o.a = v; });
    return o;
  };
  const str = o => `g:${o.g}|s:${o.s}|h:${o.h}|hc:${o.hc}|t:${o.t}|tc:${o.tc}|a:${o.a}`;
  const rnd = n => Math.floor(Math.random() * n);
  const random = () => ({ g: Math.random() < .5 ? 'm' : 'f', s:rnd(5), h:rnd(5), hc: rnd(10) < 8 ? rnd(4) : 4, t: OPT.t[rnd(4)][0], tc:rnd(5), a: OPT.a[rnd(4)][0] });

  function create({ root, previewCanvas, avatarMod, initial, onChange }){
    const look = initial ? parse(initial) : random();
    let preview = null;
    if (avatarMod && previewCanvas){ try { preview = avatarMod.createPreview(previewCanvas); } catch(e){ preview = null; } }
    if (!preview && previewCanvas) previewCanvas.closest('.cz-preview').classList.add('no3d');

    const swatches = (key, list) => list.map((c, i) => `<button type="button" class="sw${look[key] === i ? ' on' : ''}" data-k="${key}" data-v="${i}" style="--c:${c}" aria-label="Màu ${i + 1}"></button>`).join('');
    const chips = (key, list) => list.map(([v, label]) => `<button type="button" class="ch${look[key] === v ? ' on' : ''}" data-k="${key}" data-v="${v}">${label}</button>`).join('');
    function render(){
      root.innerHTML = `
        <div class="cz-row"><span>Nhân vật</span><div>${chips('g', [['m', 'Nam'], ['f', 'Nữ']])}<button type="button" class="ch dice" data-k="rand">🎲 Ngẫu nhiên</button></div></div>
        <div class="cz-row"><span>Màu da</span><div>${swatches('s', OPT.s)}</div></div>
        <div class="cz-row"><span>Kiểu tóc</span><div>${chips('h', OPT.hair[look.g].map((n, i) => [i, n]))}</div></div>
        <div class="cz-row"><span>Màu tóc</span><div>${swatches('hc', OPT.hc)}</div></div>
        <div class="cz-row"><span>Áo</span><div>${chips('t', OPT.t)}</div></div>
        <div class="cz-row"><span>Màu áo</span><div>${swatches('tc', OPT.tc)}</div></div>
        <div class="cz-row"><span>Phụ kiện</span><div>${chips('a', OPT.a)}</div></div>`;
    }
    function changed(){ render(); const s = str(look); if (preview) preview.setLook(s); onChange && onChange(s); }
    root.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const k = b.dataset.k;
      if (k === 'rand') Object.assign(look, random());
      else if (k === 'g' || k === 't' || k === 'a') look[k] = b.dataset.v;
      else look[k] = +b.dataset.v;
      changed();
    });
    changed();
    return { get value(){ return str(look); }, dispose(){ preview && preview.dispose(); } };
  }
  return { create, parse, str, random };
})();
