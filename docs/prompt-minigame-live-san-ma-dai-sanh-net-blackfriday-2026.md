# Prompt v4 (LIVE): "Đại Sảnh Nét – Live Săn Mã Black Friday 2026"

> Đổi từ chơi một mình sang **phiên live**: nhiều người vào cùng một sảnh, cùng một giờ, giành hộp quà và kho mã có hạn theo thời gian thực.
> Giữ nguyên giao diện đã dựng (sảnh gỗ, đàn Nét, nhãn "Thích ...", bộ ViUI). Chỉ thay luật chơi và thêm máy chủ.
> Duyệt xong (hoặc sửa mục ❓) mới code. Black Friday 2026 = thứ Sáu **27/11/2026** (còn ~22 ngày).

---

## 1. Kịch bản một phiên live

Ví dụ phiên **20:00** (lịch cụ thể ❓):

| Mốc | Người chơi thấy gì |
|---|---|
| **19:50 – Mở sảnh chờ** | Vào sảnh, đặt biệt danh, thấy bé Nét của mình ngồi xuống nệm. Đồng hồ đếm ngược, bộ đếm "1.284 người đang chờ", bảng kho mã sắp phát (Hosting 100 mã, SSL 200 mã...). |
| **20:00 – Live 5 phút** | Hộp quà rơi **cùng lúc trên màn hình của tất cả mọi người**. Ai chạm nhanh thì giành được. Dòng tin chạy: "Minh vừa giành hộp SSL", "Kho Hosting còn 37 mã". |
| **Phút 1, 3, 5 – Siêu Deal** | Hộp vàng của bé giữa xuất hiện, kèm thông báo trước 5 giây. Mã giảm sâu, số lượng rất ít (vd. 5 mã/lần). |
| **20:05 – Kết thúc** | Bảng xếp hạng phiên, mã đã nhận, giờ phiên tiếp theo, nút chia sẻ "Mình vừa săn được mã Hosting". |

Ngoài giờ live, trang hiện đếm ngược tới phiên sau. Có thể giữ bản chơi một mình đã dựng làm chế độ **"Luyện tay"**: không phát mã, chỉ để quen tay (❓).

## 2. Luật chơi live

- **Hộp quà có nhiều suất:** mỗi lần rơi, một hộp có **K suất** (vd. 20). K người chạm đầu tiên (theo thứ tự máy chủ nhận được) thì giành được. Trên hộp hiện "còn 12/20". Có nhiều suất để không chỉ vài người nhanh nhất ẵm hết.
- **Gom mảnh → nhận mã:** mỗi hộp = 1 mảnh của dịch vụ đó. Đủ **5 mảnh** thì nhận ngay 1 mã của dịch vụ đó, **nếu kho còn**. Kho hết thì mảnh quy ra điểm xếp hạng.
- **Giới hạn mỗi người:** tối đa 2 mã/phiên và 1 mã/dịch vụ/ngày (❓).
- **DDoS đỏ:** rơi lẫn trong hộp quà. Chạm vào bị "đơ" 3 giây, không bắt được gì.
- **Khiên OneShield:** hiếm, 5 giây miễn nhiễm DDoS.
- **Siêu Deal (hộp vàng):** chỉ 1 suất cho mỗi mã còn lại, người nhanh nhất nhận thẳng mã giảm sâu, không cần gom mảnh.
- **Xếp hạng:** điểm theo số hộp giành được + combo. Top 10 mỗi phiên hiện trực tiếp. Có thể tặng thêm quà top 3 (❓).

## 3. Trong sảnh hiển thị gì

- **6 bé Nét chính** (Tên miền, Hosting, VPS, SSL, Email, Săn Deal) vẫn là nơi hộp quà rơi.
- **Người chơi khác = các bé Nét ngồi phía sau**, có biệt danh nhỏ trên đầu. Màn hình chỉ vẽ khoảng 30–40 bé (người mới vào, người đang dẫn đầu), số còn lại gộp thành "+1.2k người".
- **Bảng kho mã live** ở cạnh màn hình: mỗi dịch vụ một thanh "còn x/y mã", tụt dần theo thời gian thực.
- **Dòng tin** (ticker) chạy những lượt giành hộp và nhận mã.
- **Bảng xếp hạng top 10** cập nhật liên tục.
- Mã nhận được chỉ hiện trên máy người nhận, có nút Sao chép, không bao giờ hiện cho người khác.

## 4. Công bằng & chống gian lận (bắt buộc với kho mã thật)

- **Máy chủ quyết định mọi thứ:** máy chủ thả hộp, đếm suất, xếp thứ tự ai chạm trước, cấp mã. Trình duyệt chỉ hiển thị. **Mã thật không bao giờ nằm trong mã nguồn trang.**
- **Kho mã cấp nguyên tử:** mỗi mã chỉ cấp cho đúng một người, kể cả khi hàng nghìn người chạm cùng lúc. Mọi lần cấp được ghi lại để đối soát.
- **Chống bot:** Cloudflare Turnstile (miễn phí) khi vào sảnh; giới hạn tốc độ chạm (vd. tối đa 8 lần/giây); mỗi người chỉ một kết nối; chạm trước khi hộp xuất hiện bị bỏ qua.
- **Định danh người chơi** (❓, quyết định độ chặt):
  - Mức 1: biệt danh + mã thiết bị. Dễ vào nhất, nhưng một người có thể mở nhiều trình duyệt để săn nhiều mã.
  - Mức 2: số điện thoại + OTP. Chặt, nhưng tốn phí SMS/Zalo ZNS.
  - Mức 3: đăng nhập tài khoản iNET. Chặt nhất, mã gắn luôn vào tài khoản, cần đội kỹ thuật iNET mở cổng đăng nhập.
- **Chia sảnh:** tối đa ~300 người/sảnh để màn hình không quá tải và mỗi người đều có cơ hội. Các sảnh dùng **chung một kho mã**.

## 5. Kiến trúc kỹ thuật

**Phương án A (22 đề xuất): chạy trên Cloud Server của iNET**
- Node.js + WebSocket, dữ liệu kho mã và lượt cấp lưu SQLite (cấp mã kiểu nguyên tử, có sao lưu).
- Nginx + SSL trên tên miền iNET (vd. `live-sandeal.inet.vn` ❓).
- Ưu điểm: máy chủ đặt tại Việt Nam nên độ trễ thấp, công bằng hơn khi giành hộp; dữ liệu khách nằm ở hạ tầng iNET; và có thể truyền thông luôn "game chạy trên Cloud Server iNET".
- Một máy 4 vCPU / 8GB dự kiến chịu được vài nghìn người cùng lúc. **Con số này phải kiểm chứng bằng load test**, chưa phải cam kết.

**Phương án B: Cloudflare Workers + Durable Objects**
- Không phải quản trị máy chủ, tự giãn khi đông. Nhưng máy chủ có thể đặt ở Singapore/Hồng Kông (độ trễ cao hơn), tốn phí theo lượng tin nhắn khi rất đông, và dữ liệu nằm ngoài iNET.

**Phía trình duyệt:** dùng lại giao diện đã dựng ở `02-web/game/dai-sanh-net-san-deal-blackfriday/`, thêm sảnh chờ, dòng tin, bảng kho mã, bảng xếp hạng, và tự kết nối lại khi rớt mạng.

**Trang quản trị nhỏ** (có mật khẩu): nạp kho mã bằng file CSV theo từng dịch vụ và phiên, đặt lịch phiên, xem số người online, xuất danh sách người nhận mã để đối soát.

## 6. Kiểm thử trước ngày chạy

- **Load test** mô phỏng 3.000 người cùng chạm trong 5 phút (k6/Artillery), đo độ trễ và kiểm tra **không mã nào bị cấp trùng**.
- **Phiên chạy thử nội bộ** với nhân viên iNET khoảng 3–4 ngày trước 27/11.
- Kịch bản sự cố: máy chủ khởi động lại giữa phiên thì kho mã và mảnh đã gom không mất.

## 7. Tiến độ ước tính

| Việc | Thời gian |
|---|---|
| Máy chủ live (sảnh, thả hộp, kho mã, chống bot) | 3–4 ngày |
| Giao diện live (sảnh chờ, ticker, kho mã, bảng xếp hạng) | 2–3 ngày |
| Trang quản trị + triển khai lên Cloud Server | 1–2 ngày |
| Load test + chạy thử nội bộ + sửa lỗi | 2–3 ngày |
| **Tổng** | **~8–12 ngày**, kịp trước 27/11 nếu chốt trong tuần này |

## 8. Nghiệm thu

1. Hai máy trở lên vào cùng sảnh thấy hộp quà rơi cùng lúc; chỉ đúng K người đầu giành được suất.
2. Load test 3.000 kết nối: không lỗi, không mã nào cấp trùng, độ trễ chạm → phản hồi < 300ms tại Việt Nam.
3. Kho mã trên màn hình khớp với dữ liệu máy chủ; hết kho thì báo ngay cho mọi người.
4. Mã thật không xuất hiện trong mã nguồn trang hay trong tin gửi cho người khác.
5. Rớt mạng rồi vào lại vẫn giữ mảnh và mã đã nhận.
6. Xuất được danh sách người nhận mã để đối soát với hệ thống bán hàng.

---

## ❓ Anh chốt giúp 22

1. **Quy mô:** mỗi phiên dự kiến bao nhiêu người cùng lúc (vài trăm, vài nghìn, hay hơn 10 nghìn)?
2. **Lịch phiên:** mấy phiên, giờ nào, những ngày nào (chỉ 27/11, hay cả tuần 24–30/11)?
3. **Kho mã:** mỗi phiên bao nhiêu mã cho từng dịch vụ và cho Siêu Deal, mức giảm bao nhiêu?
4. **Định danh:** mức 1 (biệt danh), mức 2 (SĐT + OTP) hay mức 3 (đăng nhập tài khoản iNET)?
5. **Hạ tầng:** chạy trên Cloud Server iNET (phương án A) hay Cloudflare (phương án B)? Nếu A, ai cấp máy và tên miền con?
6. **Bản chơi một mình** đã dựng: giữ làm chế độ "Luyện tay" ngoài giờ live, hay bỏ?
