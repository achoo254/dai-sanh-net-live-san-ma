/* =============================================================================
 * iNET Tech Office — bản 2D DỰ PHÒNG (máy không hỗ trợ WebGL/3D), vẽ bằng Canvas 2D
 * - Nền sảnh (tường, cửa sổ, sàn gỗ, thảm xanh, bục Siêu Deal) vẽ sẵn 1 lần vào canvas ẩn
 * - Mỗi khung hình: quầy + bé Nét đứng quầy, nhân vật người chơi, hộp quà, bọ DDoS,
 *   sắp theo chiều sâu (y), camera bám theo nhân vật của mình
 * Dùng: const R = WorldRenderer.create(canvasEl); R.render(state, nowMs); R.toWorld(clientX, clientY)
 * ============================================================================= */
window.WorldRenderer = (() => {
  'use strict';
  const WR = window.WorldRules, SP = window.WorldSprites;
  const { W, H, WALL_Y, BOOTHS, STAGE, SPAWN, OBSTACLES } = WR;
  const BOOTH_POSE = { domain:'book', hosting:'wave', vps:'thumb', ssl:'shield', email:'support' };
  const FONT = '"Be Vietnam Pro", system-ui, Arial, sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ---------- Nền tĩnh (vẽ 1 lần) ---------- */
  function buildBackground(){
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    // Sàn gỗ: từng tấm ván dài, màu lệch nhẹ, có vân gỗ (giả ngẫu nhiên cố định để lần nào vẽ cũng giống nhau)
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ROW = 46;
    for (let y = WALL_Y, row = 0; y < H; y += ROW, row++){
      let x = -rnd() * 400;
      while (x < W){
        const w = 320 + rnd() * 260, k = 0.92 + rnd() * 0.14;
        g.fillStyle = SP.shade('#d9a462', k); g.fillRect(x, y, w, ROW);
        g.strokeStyle = 'rgba(120,70,30,.13)'; g.lineWidth = 1.5;
        for (let v = 0; v < 3; v++){ const yy = y + 8 + rnd() * (ROW - 16); g.beginPath(); g.moveTo(x + 10, yy); g.bezierCurveTo(x + w * .3, yy - 4, x + w * .6, yy + 4, x + w - 10, yy); g.stroke(); }
        g.fillStyle = 'rgba(80,45,15,.38)'; g.fillRect(x + w - 2, y, 2, ROW);
        x += w;
      }
      g.fillStyle = 'rgba(80,45,15,.32)'; g.fillRect(0, y + ROW - 2, W, 2);
      g.fillStyle = 'rgba(255,240,210,.14)'; g.fillRect(0, y, W, 2);
    }
    let gr = g.createRadialGradient(W / 2, 700, 100, W / 2, 700, 1300);
    gr.addColorStop(0, 'rgba(255,244,214,.45)'); gr.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = gr; g.fillRect(0, WALL_Y, W, H - WALL_Y);
    // Thảm xanh iNET từ cửa vào tới bục
    g.fillStyle = '#024799'; g.fillRect(SPAWN.x - 120, STAGE.y, 240, H - STAGE.y);
    g.strokeStyle = '#ffcf3a'; g.lineWidth = 6; g.strokeRect(SPAWN.x - 112, STAGE.y, 224, H - STAGE.y + 10);
    g.fillStyle = 'rgba(255,255,255,.08)';
    for (let y = STAGE.y + 40; y < H; y += 80) g.fillRect(SPAWN.x - 100, y, 200, 8);
    // Thảm cửa vào
    roundRect(g, SPAWN.x - 170, H - 70, 340, 56, 12); g.fillStyle = '#5a3416'; g.fill();
    g.fillStyle = '#ffe9a6'; g.font = `900 26px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('CỬA VÀO · ĐẠI SẢNH NÉT', SPAWN.x, H - 42);
    // Bục Siêu Deal
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(STAGE.x, STAGE.y + 22, STAGE.r + 10, STAGE.r * .62 + 8, 0, 0, 7); g.fill();
    g.fillStyle = '#a86a00'; g.beginPath(); g.ellipse(STAGE.x, STAGE.y + 12, STAGE.r, STAGE.r * .62, 0, 0, 7); g.fill();
    gr = g.createRadialGradient(STAGE.x, STAGE.y - 20, 10, STAGE.x, STAGE.y, STAGE.r);
    gr.addColorStop(0, '#fff3c2'); gr.addColorStop(1, '#ffcf3a');
    g.fillStyle = gr; g.beginPath(); g.ellipse(STAGE.x, STAGE.y, STAGE.r, STAGE.r * .62, 0, 0, 7); g.fill();
    g.strokeStyle = '#a86a00'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#7a4a00'; g.font = `900 30px ${FONT}`; g.fillText('BỤC SIÊU DEAL', STAGE.x, STAGE.y + 4);
    // Tường + cửa sổ + cột
    gr = g.createLinearGradient(0, 0, 0, WALL_Y); gr.addColorStop(0, '#5e351a'); gr.addColorStop(1, '#9a6239');
    g.fillStyle = gr; g.fillRect(0, 0, W, WALL_Y);
    g.fillStyle = 'rgba(0,0,0,.14)'; for (let x = 0; x < W; x += 58) g.fillRect(x, 0, 2, WALL_Y);
    const wins = [140, 560, 1640, 2060];
    wins.forEach(x => {
      const wy = 14, ww = 240, wh = 86;
      const sky = g.createLinearGradient(0, wy, 0, wy + wh); sky.addColorStop(0, '#dff3ff'); sky.addColorStop(.55, '#bfe6a8'); sky.addColorStop(1, '#8fcf74');
      g.fillStyle = sky; g.fillRect(x, wy, ww, wh);
      g.fillStyle = '#3f8a39'; [[.2, .85, 50], [.55, .8, 62], [.88, .9, 48]].forEach(([fx, fy, r]) => { g.beginPath(); g.arc(x + fx * ww, wy + fy * wh, r, 0, 7); g.fill(); });
      g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.moveTo(x, wy); g.lineTo(x + ww * .55, wy); g.lineTo(x, wy + wh * .8); g.fill();
      g.strokeStyle = '#3b1f0c'; g.lineWidth = 8; g.strokeRect(x, wy, ww, wh);
      g.lineWidth = 5; g.beginPath(); g.moveTo(x + ww / 3, wy); g.lineTo(x + ww / 3, wy + wh); g.moveTo(x + ww * 2 / 3, wy); g.lineTo(x + ww * 2 / 3, wy + wh);
      g.moveTo(x, wy + wh / 2); g.lineTo(x + ww, wy + wh / 2); g.stroke();
    });
    [0, 470, 940, 1460, 1930, W - 30].forEach(x => {
      g.fillStyle = '#45260f'; g.fillRect(x, 0, 30, WALL_Y);
      g.fillStyle = '#6b3d1c'; g.fillRect(x + 6, 0, 10, WALL_Y);
    });
    g.fillStyle = '#2d170a'; g.fillRect(0, 0, W, 34);
    g.fillStyle = '#4a2a12'; g.fillRect(0, WALL_Y - 14, W, 14);
    g.fillStyle = 'rgba(255,220,170,.25)'; g.fillRect(0, WALL_Y - 14, W, 2);
    // Băng rôn + đèn
    if (WALL_Y >= 250 && SP.img.banner.naturalWidth) g.drawImage(SP.img.banner, W / 2 - 230, 26, 460, 187);
    // Bóng chân tường
    gr = g.createLinearGradient(0, WALL_Y, 0, WALL_Y + 60); gr.addColorStop(0, 'rgba(40,20,5,.35)'); gr.addColorStop(1, 'rgba(40,20,5,0)');
    g.fillStyle = gr; g.fillRect(0, WALL_Y, W, 60);
    return c;
  }

  function create(canvas){
    const ctx = canvas.getContext('2d');
    let bg = null, dpr = 1, cw = 0, ch = 0, scale = 1, camX = 0, camY = 0;
    SP.ready.then(() => { bg = buildBackground(); });

    function resize(){
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cw = canvas.clientWidth; ch = canvas.clientHeight;
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      scale = clamp(Math.min(cw / 1500, ch / 950), 0.42, 0.95);   // máy tính thấy ~1/2 sảnh, điện thoại ~900 đơn vị bề ngang
    }
    resize();

    function camera(me){
      const vw = cw / scale, vh = ch / scale;
      camX = vw >= W ? (W - vw) / 2 : clamp(me.x - vw / 2, 0, W - vw);
      camY = vh >= H ? (H - vh) / 2 : clamp(me.y - vh * 0.56, 0, H - vh);
    }
    const toWorld = (sx, sy) => {
      const r = canvas.getBoundingClientRect();
      return { x: camX + (sx - r.left) / scale, y: camY + (sy - r.top) / scale };
    };
    const inView = (x, y, m = 200) => x > camX - m && x < camX + cw / scale + m && y > camY - m && y < camY + ch / scale + m;

    /* ---------- Vẽ từng loại ---------- */
    function drawTag(text, x, y, bgc, fg, size = 15){
      ctx.font = `800 ${size}px ${FONT}`;
      const w = ctx.measureText(text).width + 16, h = size + 9;
      roundRect(ctx, x - w / 2, y - h, w, h, h / 2); ctx.fillStyle = bgc; ctx.fill();
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - h / 2 + 1);
      return h;
    }
    function drawAvatar(a, t, isMe){
      // Bản 3D gửi chuỗi phối đồ → bản 2D đổi sang 1 trong 6 hình bé Nét (cố định theo chuỗi)
      let hsh = 0; for (const ch of String(a.avatar)) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
      const im = SP.mascot[a.avatar] || SP.mascot[SP.AVATARS[hsh % SP.AVATARS.length]] || SP.mascot.wave;
      if (!im.naturalWidth) return;
      const hgt = 118, wid = hgt * im.naturalWidth / im.naturalHeight;
      const stunned = a.stunUntil > t, bob = a.moving && !stunned ? -Math.abs(Math.sin(t / 85)) * 6 : 0;
      ctx.fillStyle = 'rgba(40,20,5,.32)'; ctx.beginPath(); ctx.ellipse(a.x, a.y, 30, 10, 0, 0, 7); ctx.fill();
      if (a.shieldUntil > t){
        ctx.strokeStyle = 'rgba(5,130,212,.85)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(a.x, a.y - 55, 52, 70, 0, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(97,158,233,.18)'; ctx.fill();
      }
      ctx.save();
      if (stunned) ctx.globalAlpha = .65;
      ctx.translate(a.x, a.y + bob);
      if (a.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(im, -wid / 2, -hgt, wid, hgt);
      ctx.restore();
      if (stunned){
        for (let k = 0; k < 3; k++){
          const ang = t / 220 + k * 2.09;
          ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(a.x + Math.cos(ang) * 30, a.y - 128 + Math.sin(ang) * 8, 6, 0, 7); ctx.fill();
        }
      }
      let top = a.y - hgt - 8 + bob;
      top -= drawTag(a.nick, a.x, top, isMe ? '#ffcf3a' : 'rgba(15,30,45,.8)', isMe ? '#3a2400' : '#fff', isMe ? 16 : 14) + 4;
      if (a.emote && a.emoteUntil > t){
        ctx.font = `800 16px ${FONT}`;
        const w = ctx.measureText(a.emote).width + 22, h = 32;
        roundRect(ctx, a.x - w / 2, top - h, w, h, 14); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a.x - 7, top - 1); ctx.lineTo(a.x, top + 8); ctx.lineTo(a.x + 7, top - 1); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.fillStyle = '#0F1E2D'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(a.emote, a.x, top - h / 2);
      }
    }
    function drawDrop(d, t){
      const left = d.until - t;
      if (left < 1500 && Math.floor(t / 120) % 2) return;           // nhấp nháy khi sắp biến mất
      const im = d.kind === 'shield' ? SP.img.shield : SP.img['gift_' + (d.kind === 'super' ? 'super' : d.svc)];
      const s = d.kind === 'super' ? 92 : 62, bob = Math.sin(t / 180 + d.x) * 5;
      if (d.kind === 'super' || d.kind === 'gift'){
        const gl = ctx.createRadialGradient(d.x, d.y - s / 2, 4, d.x, d.y - s / 2, s);
        gl.addColorStop(0, d.kind === 'super' ? 'rgba(255,207,58,.75)' : 'rgba(255,240,180,.55)'); gl.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(d.x, d.y - s / 2, s, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = d.mine ? .35 : 1;
      if (im && im.naturalWidth) ctx.drawImage(im, d.x - s / 2, d.y - s + bob, s, s);
      ctx.globalAlpha = 1;
      if (d.kind !== 'shield' && !d.mine){
        const bx = d.x + s / 2 - 6, by = d.y - s + bob + 4;
        ctx.fillStyle = d.left <= 2 ? '#cc0e0e' : '#024799'; ctx.beginPath(); ctx.arc(bx, by, 14, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.left, bx, by + 1);
      }
    }
    function drawBug(b, t){
      const s = 58;
      ctx.save(); ctx.translate(b.x, b.y - s / 2); ctx.rotate(Math.sin(t / 140 + b.id) * .25);
      if (SP.img.bug.naturalWidth) ctx.drawImage(SP.img.bug, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    function drawCounter(id, o, st, names){
      const c = SP.SVC_COLORS[id];
      ctx.fillStyle = 'rgba(40,20,5,.3)'; ctx.fillRect(o.x + 6, o.y + o.h - 4, o.w, 12);
      ctx.fillStyle = SP.shade(c, .7); roundRect(ctx, o.x, o.y + 14, o.w, o.h - 10, 8); ctx.fill();
      ctx.fillStyle = c; roundRect(ctx, o.x + 6, o.y + 20, o.w - 12, o.h - 22, 6); ctx.fill();
      ctx.fillStyle = '#e8c48c'; roundRect(ctx, o.x - 6, o.y, o.w + 12, 20, 6); ctx.fill();
      ctx.fillStyle = '#b98544'; ctx.fillRect(o.x - 6, o.y + 16, o.w + 12, 4);
      ctx.fillStyle = '#fff'; ctx.font = `900 20px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((names[id] || id).toUpperCase(), o.x + o.w / 2, o.y + 40);
      // Biển quầy + tồn kho
      const b = BOOTHS[id], sy = b.y - 205;
      const v = st && st[id] ? st[id][0] : null;
      ctx.font = `800 17px ${FONT}`;
      const line2 = v == null ? '' : v > 0 ? `còn ${v} mã` : 'hết mã';
      const w = Math.max(170, ctx.measureText(line2).width + 30), h = line2 ? 56 : 34;
      roundRect(ctx, b.x - w / 2, sy - h, w, h, 12); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = c; ctx.stroke();
      ctx.fillStyle = c; ctx.font = `900 18px ${FONT}`; ctx.fillText('Quầy ' + (names[id] || id), b.x, sy - h + 18);
      if (line2){ ctx.fillStyle = v > 0 ? '#0F1E2D' : '#cc0e0e'; ctx.font = `800 16px ${FONT}`; ctx.fillText(line2, b.x, sy - 16); }
    }
    function drawNpc(id){
      const b = BOOTHS[id], im = SP.mascot[BOOTH_POSE[id]];
      if (!im.naturalWidth) return;
      const hgt = 180, wid = hgt * im.naturalWidth / im.naturalHeight;
      ctx.drawImage(im, b.x - wid / 2, b.y + 40 - hgt, wid, hgt);
    }
    function drawScreen(text, sub, live){
      const x = W / 2, y = Math.max(40, WALL_Y / 2), w = 300, h = 58;
      roundRect(ctx, x - w / 2, y - h / 2, w, h, 10); ctx.fillStyle = '#0d1117'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = live ? '#ff4d4d' : '#ffcf3a'; ctx.stroke();
      ctx.fillStyle = live ? '#ff6b64' : '#ffe27a'; ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sub, x, y - 14);
      ctx.fillStyle = '#fff'; ctx.font = `900 24px "JetBrains Mono", monospace`; ctx.fillText(text, x, y + 10);
    }

    /* ---------- 1 khung hình ---------- */
    function render(S, t){
      if (!cw) resize();
      camera(S.me);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#3b1f0c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const k = dpr * scale;
      ctx.setTransform(k, 0, 0, k, -camX * k, -camY * k);
      if (bg) ctx.drawImage(bg, 0, 0);
      drawScreen(S.screenText || '--:--', S.screenSub || '', S.live);

      // Gom thực thể rồi sắp theo y để có chiều sâu
      const ents = [];
      for (const id in BOOTHS){
        const o = OBSTACLES.find(x => x.id === id && x.kind === 'counter');
        ents.push({ y: BOOTHS[id].y - 1, f: () => drawNpc(id) });
        if (o) ents.push({ y: o.y + o.h, f: () => drawCounter(id, o, S.stock, S.names) });
      }
      // Nội thất văn phòng khác (bản 2D vẽ dạng khối có nhãn)
      const KIND = { serverroom:['#24303f', 'PHÒNG MÁY CHỦ · CLOUD'], reception:['#f7f9fc', 'LỄ TÂN'], logowall:['#1d2b3f', 'iNET'],
                     desks:['#e8d6b8', 'Khu làm việc'], meeting:['#cfe8ff', ''], pantry:['#f2f4f7', 'Pantry'], sofa:['#5b6b8c', 'Sofa'] };
      OBSTACLES.filter(o => KIND[o.kind]).forEach(o => ents.push({ y: o.y + o.h, f: () => {
        const [c, label] = KIND[o.kind];
        roundRect(ctx, o.x, o.y, o.w, o.h, 10); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 3; ctx.stroke();
        const t = o.name || label; if (!t) return;
        ctx.fillStyle = ['serverroom', 'logowall', 'sofa'].includes(o.kind) ? '#ffffff' : '#24303f';
        ctx.font = `800 18px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, o.x + o.w / 2, o.y + o.h / 2);
      } }));
      OBSTACLES.filter(o => o.kind === 'plant').forEach(o => ents.push({ y: o.y + o.h, f: () => {
        if (SP.img.plant.naturalWidth) ctx.drawImage(SP.img.plant, o.x - 20, o.y + o.h - 150, 120, 160);
      } }));
      for (const d of S.drops.values()) if (inView(d.x, d.y)) ents.push({ y: d.y, f: () => drawDrop(d, t) });
      for (const b of S.bugs.values()) if (inView(b.x, b.y)) ents.push({ y: b.y, f: () => drawBug(b, t) });
      for (const a of S.others.values()) if (inView(a.x, a.y)) ents.push({ y: a.y, f: () => drawAvatar(a, t, false) });
      ents.push({ y: S.me.y + .01, f: () => drawAvatar(S.me, t, true) });
      ents.sort((a, b) => a.y - b.y).forEach(e => e.f());

      // Điểm đến khi chạm sàn
      if (S.target){
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3;
        const r = 14 + Math.sin(t / 120) * 3;
        ctx.beginPath(); ctx.ellipse(S.target.x, S.target.y, r * 1.6, r * .7, 0, 0, 7); ctx.stroke();
      }
    }

    /* ---------- Bản đồ nhỏ ---------- */
    function drawMinimap(mc, S){
      const g = mc.getContext('2d'), mw = mc.width, mh = mc.height, sx = mw / W, sy = mh / H;
      g.clearRect(0, 0, mw, mh);
      g.fillStyle = '#d9a35f'; g.fillRect(0, 0, mw, mh);
      g.fillStyle = '#6b3d1c'; g.fillRect(0, 0, mw, WALL_Y * sy);
      g.fillStyle = '#024799'; g.fillRect((SPAWN.x - 120) * sx, STAGE.y * sy, 240 * sx, (H - STAGE.y) * sy);
      g.fillStyle = '#ffcf3a'; g.beginPath(); g.ellipse(STAGE.x * sx, STAGE.y * sy, STAGE.r * sx, STAGE.r * .62 * sy, 0, 0, 7); g.fill();
      for (const id in BOOTHS){ g.fillStyle = SP.SVC_COLORS[id]; g.fillRect(BOOTHS[id].x * sx - 7, BOOTHS[id].y * sy - 3, 14, 6); }
      g.fillStyle = 'rgba(15,30,45,.55)';
      for (const a of S.others.values()) g.fillRect(a.x * sx - 1, a.y * sy - 1, 3, 3);
      for (const d of S.drops.values()){
        if (d.mine) continue;
        g.fillStyle = d.kind === 'super' ? '#ffcf3a' : d.kind === 'shield' ? '#619ee9' : SP.SVC_COLORS[d.svc];
        g.beginPath(); g.arc(d.x * sx, d.y * sy, d.kind === 'super' ? 5 : 3.5, 0, 7); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
      }
      g.fillStyle = '#cc0e0e'; for (const b of S.bugs.values()){ g.beginPath(); g.arc(b.x * sx, b.y * sy, 3, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5;
      g.strokeRect(camX * sx, camY * sy, (cw / scale) * sx, (ch / scale) * sy);
      g.fillStyle = '#fff'; g.strokeStyle = '#0F1E2D'; g.lineWidth = 2;
      g.beginPath(); g.arc(S.me.x * sx, S.me.y * sy, 4.5, 0, 7); g.fill(); g.stroke();
    }

    const toScreen = (wx, wy) => ({ x: (wx - camX) * scale, y: (wy - camY) * scale });
    return { resize, render, toWorld, toScreen, drawMinimap, get scale(){ return scale; } };
  }
  return { create };
})();
