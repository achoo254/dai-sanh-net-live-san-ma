# Hướng dẫn triển khai: Live Săn Mã – Đại Sảnh Nét (Black Friday 2026)

Mã nguồn: `02-web/game/dai-sanh-net-san-deal-blackfriday/` · GitHub (riêng tư): `achoo254/dai-sanh-net-live-san-ma`

**Bản v6 "iNET Tech Office 3D":** nhân vật người 3D (phối đồ) đi lại trong văn phòng công nghệ 3D (Three.js), nhặt hộp quà, gom 5 mảnh → **giải mật thư** mới nhận mã. Máy không hỗ trợ WebGL tự chuyển bản 2D (thêm `?2d` để ép).

```
package.json                     ← npm install / npm start ở thư mục gốc
public/
  index.html                     ← trang chính. ?mode=practice = Luyện tay · ?2d = ép bản 2D
  admin.html                     ← quản trị: kho mã, MẬT THƯ (nạp đề + thống kê), đối soát
  vendor/three.module.min.js     ← Three.js 0.170 (MIT, đóng gói sẵn, không phụ thuộc CDN)
  assets/office3d-office-scene-renderer.js   ← dựng văn phòng 3D + vẽ thế giới, camera, tối ưu theo khoảng cách
  assets/office3d-human-avatar-factory.js    ← nhân vật người 3D dựng bằng code, phối đồ, hoạt cảnh, xem trước
  assets/world-map-rules-shared.js           ← mặt bằng văn phòng, vật cản, 5 khu, 6 điểm manh mối (máy chủ + trình duyệt)
  assets/puzzle-cipher-generator-shared.js   ← bộ sinh đề + chấm đáp án (máy chủ + Luyện tay)
  assets/puzzle-panel-secret-letter-ui.js    ← bảng mật thư (terminal)
  assets/office-character-customizer-ui.js   ← màn phối đồ
  assets/world-client-net-input-ui.js        ← điều khiển, kết nối, giao diện
  assets/world-practice-local-simulation.js  ← máy chủ giả cho Luyện tay (8 bot, có mật thư, không phát mã)
  assets/world-renderer-canvas-hall-avatars.js ← bản 2D dự phòng
server/
  live-hub-sessions-players-stock-leaderboard.js ← phiên, người chơi, kho, BXH, MẬT THƯ (giữ mã, chấm, hết giờ)
  live-room-world-movement-drops-bugs.js         ← 1 sảnh: vị trí, chống tốc biến, hộp quà, virus, đọc manh mối
  code-store-sqlite-atomic-issue-import-export.js← kho mã (giữ chỗ/cấp nguyên tử) + ngân hàng đề + thống kê
  (các file còn lại như v5)
docs/mau-de-mat-thu-cho-mkt.csv  ← file mẫu để MKT soạn đề
```

## 1. Chạy thử tại máy

```bash
cd 02-web/game/dai-sanh-net-san-deal-blackfriday
npm install
npm run demo
```

Mở `http://localhost:8790`. Phiên lặp liên tục: sảnh chờ 45 giây → live 2 phút → nghỉ 45 giây. Kho tự nạp **mã minh họa** `DEMO-...`. Trang quản trị: `http://localhost:8790/admin.html`, mã quản trị `demo-admin`.

Thêm người chơi ảo cho sảnh đông: `node server/load-test-simulate-many-players-websocket.js 60`.

## 2. Yêu cầu máy chủ thật

- Cloud Server iNET, Ubuntu 22.04/24.04, **khuyến nghị 4 vCPU / 8 GB** cho vài nghìn người cùng lúc (xem mục 6).
- **Node.js ≥ 22.13** (dùng SQLite có sẵn của Node, không cần cài thêm CSDL).
- Nginx + chứng chỉ SSL cho tên miền con, ví dụ `live-sandeal.inet.vn`.

## 3. Biến môi trường (file `/etc/live-san-ma.env`)

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `PORT` | Cổng Node | `8790` |
| `HOST` | Địa chỉ lắng nghe (sau Nginx nên để `127.0.0.1`) | `0.0.0.0` |
| `ADMIN_TOKEN` | **Bắt buộc**: mã quản trị, chuỗi ngẫu nhiên dài | tự sinh mỗi lần chạy |
| `DB_FILE` | Đường dẫn file SQLite | `server/data/live-san-ma.db` |
| `TRUST_PROXY` | `1` khi chạy sau Nginx (lấy IP thật) | tắt |
| `DEMO_SEED` | **Đặt `0` khi chạy thật** để không nạp mã minh họa | bật |
| `SCHEDULE` | Lịch phiên dạng JSON (xem dưới) | 24–30/11, 12:00 và 20:00 |
| `LOBBY_SEC` / `LIVE_SEC` | Mở sảnh trước bao lâu / mỗi phiên dài bao lâu | `600` / `480` (8 phút, đủ giải mật thư) |
| `PUZZLE_TIERS` | Cấp mật thư theo dịch vụ (JSON) | `{"domain":1,"email":1,"hosting":2,"ssl":2,"vps":3,"super":3}` |
| `PUZZLE_HOLD_SEC` / `PUZZLE_ATTEMPTS` | Giữ mã khi đang giải / số lần thử | `90` / `3` |
| `LOADTEST_REVEAL_ANSWERS` | **Chỉ để load test** (chỉ có tác dụng khi `DEMO_LOOP=1`): gửi kèm đáp án cho bot. KHÔNG bật khi chạy thật | tắt |
| `ROOM_CAP` | Số người tối đa mỗi sảnh (đồng bộ theo vùng quan tâm) | `150` |
| `PIECES` | Số mảnh để nhận 1 mã | `5` |
| `MAX_CODES_SESSION` | Mã tối đa mỗi người mỗi phiên (không tính Siêu Deal) | `2` |
| `SLOT_RATIO` / `SLOT_MAX` | Số suất mỗi hộp = số người trong sảnh × tỉ lệ, tối đa | `0.15` / `10` |
| `SUPER_SLOTS` | Số suất mỗi lần Siêu Deal | `5` |
| `MAX_CONN_PER_IP` | Kết nối tối đa mỗi IP (1 IP nhà mạng di động có thể là hàng nghìn người thật; load test từ 1 máy cũng cần cao) | `3000` |
| `TURNSTILE_SITEKEY` / `TURNSTILE_SECRET` | Bật chống bot Cloudflare Turnstile (miễn phí) | tắt |

Ví dụ lịch:

```
SCHEDULE=[{"id":"bf-2711-12","title":"Phiên 12:00 · 27/11","start":"2026-11-27T12:00:00+07:00"},{"id":"bf-2711-20","title":"Phiên 20:00 · 27/11","start":"2026-11-27T20:00:00+07:00"}]
```

## 4. Chạy như dịch vụ (systemd)

`/etc/systemd/system/live-san-ma.service`:

```ini
[Unit]
Description=Live San Ma - Dai Sanh Net
After=network.target

[Service]
WorkingDirectory=/opt/live-san-ma
EnvironmentFile=/etc/live-san-ma.env
ExecStart=/usr/bin/node server/server-entry-http-static-admin-websocket.js
Restart=always
RestartSec=2
User=www-data
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now live-san-ma
```

Máy chủ khởi động lại giữa phiên vẫn giữ điểm, mảnh và mã đã cấp (lưu SQLite mỗi giây); người chơi tự kết nối lại.

## 5. Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name live-sandeal.inet.vn;
  # ssl_certificate ...; ssl_certificate_key ...;

  location /ws {
    proxy_pass http://127.0.0.1:8790;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
  }
  location /admin/ {
    # nên giới hạn IP văn phòng iNET
    # allow x.x.x.x; deny all;
    proxy_pass http://127.0.0.1:8790;
  }
  location / {
    proxy_pass http://127.0.0.1:8790;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Nâng giới hạn kết nối hệ điều hành: `worker_connections 20000;` trong `nginx.conf`, `ulimit -n 65535`.

## 6. Trước ngày chạy (bắt buộc)

1. **Nạp kho mã thật** ở `admin.html` (CSV: `service,code,offer,cond,expires,url,pool`), kiểm tra bảng kho.
2. **Load test trên chính máy chủ thật**, bot chạy từ **máy khác** (không chạy chung máy):
   `node server/load-test-simulate-many-players-websocket.js 1000 wss://sandeal.22.id.vn/ws`
   Đạt khi: không mã trùng, không ai vượt giới hạn, độ trễ p95 < 300 ms. Trong lúc chạy, xem "Trễ vòng lặp p99" ở trang quản trị (< 50 ms là khoẻ).
3. **Chạy thử nội bộ** 1 phiên với nhân viên iNET trên điện thoại thật (4G + wifi).
4. Sau mỗi phiên: tải CSV đối soát ở trang quản trị, chuyển cho Kinh doanh.

## 6b. Mật thư cho MKT

1. Soạn đề theo `docs/mau-de-mat-thu-cho-mkt.csv` (mở bằng Excel, lưu CSV UTF-8).
2. Vào `admin.html` → mục **Mật thư** → chọn file → (tuỳ chọn) tick "Tắt đề mẫu khi nạp" → **Nạp đề**. Dòng lỗi được báo rõ (cấp sai, thiếu đáp án, điểm manh mối không tồn tại).
3. Bấm **Xem thống kê** sau mỗi phiên: số lượt mở, giải đúng, sai/hết giờ, thời gian giải trung bình của từng đề → chỉnh độ khó.
4. Quy tắc: đáp án chỉ nằm trên máy chủ; chấm không phân biệt hoa/thường, có dấu/không dấu, khoảng trắng; mã được giữ 90 giây khi đang giải; sai 3 lần hoặc hết giờ → mã trả lại kho, dịch vụ đó về 0 mảnh.
5. Điểm giấu manh mối cấp 3: `pantry` (bảng ghim pantry), `server` (vách kính phòng máy chủ), `reception` (quầy lễ tân), `meeting` (cửa phòng họp OneShield), `lounge` (góc sofa), `atrium` (dưới màn LED).

## 6b2. Chat trong văn phòng

- Chat theo **sảnh** (≤100 người cùng sảnh thấy nhau): khung chat (máy tính ghim góc trái, bấm **Enter** để gõ; điện thoại mở bằng nút 💬) + **bong bóng lời nhắn trên đầu nhân vật** 5 giây.
- Kiểm duyệt tự động (`server/chat-moderation-filter-rate-limit-mute.js`): che từ thô tục tiếng Việt/Anh (cả kiểu viết tách chữ, không dấu, lặp chữ), **chặn link và số điện thoại** (chống lừa đảo), tối đa 1 tin/1,5 giây và 6 tin/20 giây, chặn tin lặp. Danh sách từ cấm sửa trực tiếp trong file này.
- Người chơi bấm ⚑ để báo cáo; tin bị **3 người khác nhau** báo cáo → ẩn tin đó + khoá chat người gửi 10 phút.
- Trang quản trị → mục **Chat văn phòng**: xem 200 tin gần nhất (cả tin đã ẩn), số lượt báo cáo, bấm **Khoá 24h** (ẩn mọi tin gần đây của người đó). Danh sách khoá lưu SQLite, khởi động lại vẫn giữ.
- Nên có người trực kiểm duyệt trong giờ live.

## 6c. Hiệu năng bản 3D (đo 05/11/2026, laptop Intel UHD 620)

**Mặt bằng mở rộng 4000 × 2600** (gấp 2,7 lần), mục tiêu **1.000 người cùng lúc = 7 sảnh × 150 người**. Mỗi người chỉ nhận vị trí của người/virus trong bán kính 1.700 quanh mình (5–6 lần/giây), cứ ~2 giây nhận toàn bộ 1 lần để bản đồ nhỏ không lệch → băng thông mỗi sảnh giảm ~5 lần so với gửi tất cả.

Đồ hoạ: tone mapping ACES, **bóng đổ thật trên máy tính** (điện thoại dùng bóng tròn), sàn gỗ bóng nhẹ, thảm màu từng khu dịch vụ, 8 cụm bàn có màn hình + vách ngăn, 2 phòng họp kính có TV, phòng máy chủ sàn xanh, lounge (sofa, kệ sách, bean bag), pantry, cây nước, cột tròn, poster 5 dịch vụ trên tường kính, bảng trắng, đèn thả trần, neon BLACK FRIDAY ở lễ tân, vòng sáng + tia lấp lánh quanh hộp quà.

Thời gian vẽ 1 khung hình khi 101 nhân vật cùng trên màn hình (bản cũ): ≈ 5,7 ms. **Chưa đo lại với bóng đổ** và **chưa đo trên điện thoại thật** — cần thử Android tầm trung trước ngày chạy; nếu chậm, tắt bóng đổ (biến `shadows` trong `office3d-office-scene-renderer.js`) hoặc giảm `NEAR_N`.

## 7. Kết quả load test đã chạy (05/11/2026, laptop Windows, bot chạy CHUNG máy với máy chủ)

**Bản v5 (đi bộ), 300 người ảo / 3 sảnh, 1 phiên live 2 phút:**
- Kết nối 300/300, không rớt. Độ trễ gửi vị trí → "nhặt được": p50 ≈ 27 ms, p95 ≈ 78 ms.
- 217 mã cấp ra: **không mã trùng**, không ai vượt 2 mã/phiên hay nhận 2 mã cùng dịch vụ.
- Bot đi đúng luật bị máy chủ kéo lùi ~16 lần/bot/phiên (mạng/máy bận), bot gian lận ~295 lần.

**Chống gian lận di chuyển (đã sửa qua 4 vòng đo):**
- Máy chủ cấp "quãng đường" đúng bằng tốc độ đi bộ theo đồng hồ máy chủ, quỹ dự phòng 0,15 giây (42 đơn vị), kiểm tra va chạm trên cả đường đi (không nhảy xuyên quầy).
- Thử cô lập 200 cuộc đua 1 suất (1 bot đúng luật vs 1 bot tốc biến): không jitter 78/104, có jitter mạng 65/52 → gần ngang nhau.
- Trong sảnh đông 300 bot, bot tốc biến vẫn nhặt ~2,5× hộp so với bot đúng luật; phần chênh này **chưa tách được nguyên nhân** (có thể do hành vi bot test). Thiệt hại bị chặn bởi giới hạn 2 mã/phiên, 1 mã/dịch vụ/ngày.
- Bot tự động (phản xạ tức thì) luôn nhanh hơn người: lớp chặn chính là Turnstile + giới hạn tần suất + rà soát danh sách đối soát sau phiên.

**Bản v4 (chạm tại chỗ, đã thay thế):** 1.000 người ảo đạt, p99 ≈ 190 ms.

**Bắt buộc đo lại trên VM thật**, bot chạy từ máy khác (mục 6).

## 8. Giới hạn hiện tại

- Định danh mức 1 (biệt danh + mã thiết bị): một người mở nhiều trình duyệt vẫn săn được nhiều mã. Muốn chặt hơn cần SĐT + OTP hoặc đăng nhập tài khoản iNET.
- Một tiến trình Node, sảnh 100 người, gửi vị trí ~6 lần/giây: ước tính 1.000–2.000 người cùng lúc trên VM 4 vCPU (chưa đo trên VM thật). Đông hơn cần tách nhiều tiến trình (chưa làm).
- Mức giảm, điều kiện, link "Dùng mã ngay" lấy theo từng mã trong CSV; mã minh họa đang trỏ `https://inet.vn`.
