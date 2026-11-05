# Hướng dẫn triển khai: Live Săn Mã – Đại Sảnh Nét (Black Friday 2026)

Mã nguồn: `02-web/game/dai-sanh-net-san-deal-blackfriday/` · GitHub (riêng tư): `achoo254/dai-sanh-net-live-san-ma`

**Bản v5 "Đại Sảnh Nét Online":** mỗi người chơi điều khiển 1 bé Nét đi lại trong sảnh, chạy tới nhặt hộp quà.

```
package.json               ← npm install / npm start ở thư mục gốc
public/
  index.html               ← trang chính (vào sảnh, đi lại, săn mã). ?mode=practice = Luyện tay
  luyen-tay.html           ← chuyển hướng sang ./?mode=practice
  admin.html               ← quản trị (nạp kho mã, theo dõi, xuất đối soát)
  assets/world-map-rules-shared.js         ← luật bản đồ DÙNG CHUNG máy chủ + trình duyệt
  assets/world-renderer-canvas-hall-avatars.js ← vẽ sảnh + nhân vật (Canvas 2D)
  assets/world-client-net-input-ui.js      ← điều khiển, kết nối, giao diện
  assets/world-practice-local-simulation.js← máy chủ giả cho Luyện tay (8 bot, không phát mã)
  assets/world-sprites-svg-and-mascots.js  ← hình vẽ + 6 ảnh bé Nét
server/
  server-entry-http-static-admin-websocket.js   ← file chạy chính
  live-config-schedule-services-and-limits.js   ← cấu hình, lịch phiên, luật
  live-hub-sessions-players-stock-leaderboard.js← điều phối phiên, người chơi, kho, BXH
  live-room-world-movement-drops-bugs.js        ← 1 sảnh: vị trí, chống tốc biến, hộp quà, bọ DDoS
  code-store-sqlite-atomic-issue-import-export.js ← kho mã SQLite (cấp nguyên tử)
  session-schedule-phase-calculator.js
  load-test-simulate-many-players-websocket.js  ← load test (bot đi bộ + 5% bot gian lận)
  run-demo-loop-local.js                        ← chạy thử tại máy
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
| `LOBBY_SEC` / `LIVE_SEC` | Mở sảnh trước bao lâu / mỗi phiên dài bao lâu | `600` / `300` |
| `ROOM_CAP` | Số người tối đa mỗi sảnh (gửi vị trí liên tục nên để ~100) | `100` |
| `PIECES` | Số mảnh để nhận 1 mã | `5` |
| `MAX_CODES_SESSION` | Mã tối đa mỗi người mỗi phiên (không tính Siêu Deal) | `2` |
| `SLOT_RATIO` / `SLOT_MAX` | Số suất mỗi hộp = số người trong sảnh × tỉ lệ, tối đa | `0.15` / `10` |
| `SUPER_SLOTS` | Số suất mỗi lần Siêu Deal | `5` |
| `MAX_CONN_PER_IP` | Kết nối tối đa mỗi IP (nhà mạng dùng chung IP nên để rộng) | `200` |
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
