# Prompt v5: "Đại Sảnh Nét Online" – mỗi người một bé Nét, đi lại trong sảnh săn mã

> Đổi kịch bản từ v4 (chạm hộp quà tại chỗ) sang kiểu **thế giới online như game "đi chùa online"**: mỗi người tham gia điều khiển **một nhân vật di chuyển được**, thấy nhân vật của người khác đi lại cùng lúc.
> Chỉ mượn **cơ chế** (nhân vật đi lại, gặp người khác, ghé từng điểm). Bối cảnh vẫn là **sảnh gỗ của iNET**, không có hương, chùa hay tâm linh (theo yêu cầu trước của anh, ❓ câu 1).
> Giữ lại từ v4: máy chủ live, lịch phiên, kho mã SQLite cấp nguyên tử, giới hạn mã/người, trang quản trị, load test, hướng dẫn triển khai.
> Black Friday 2026 = thứ Sáu **27/11/2026** (còn ~22 ngày).

---

## 1. Trải nghiệm trong 1 câu

Vào **Đại Sảnh Nét** bằng bé Nét của mình, đi dạo giữa hàng trăm bé Nét khác, ghé **5 quầy dịch vụ**; đến giờ live thì **hộp quà rơi khắp sảnh**, ai **chạy tới trước** thì nhặt được, gom đủ mảnh là nhận mã.

## 2. Nhân vật

- Vào sảnh: đặt **biệt danh** + chọn **1 trong 6 bé Nét** làm nhân vật (vẫy tay, ôm khiên, like, ý tưởng, sách, tai nghe hỗ trợ: đúng 6 pose có sẵn).
- Trên đầu nhân vật: biệt danh. Có hiệu ứng đi bộ (nhún nhảy, quay mặt theo hướng đi, bóng đổ).
- **Biểu cảm nhanh** (không chat tự do, để khỏi phải kiểm duyệt): 6 bong bóng soạn sẵn, vd. "Săn deal thôi!", "Chờ Siêu Deal!", "Hết mã rồi 😭", "Được mã rồi 🎉", "Ai đi Hosting?", "Cảm ơn iNET!" (❓ câu 3).

## 3. Điều khiển

- **Điện thoại:** chạm vào sàn → nhân vật tự đi tới chỗ đó. Có thêm cần điều khiển ảo (joystick) ở góc trái nếu thích kéo.
- **Máy tính:** phím mũi tên / WASD, hoặc click chuột vào sàn.
- Camera đi theo nhân vật; bản đồ sảnh rộng hơn màn hình (khoảng 3×2 màn hình), có bản đồ nhỏ góc phải.

## 4. Bản đồ Đại Sảnh Nét

| Khu vực | Nội dung |
|---|---|
| **5 quầy dịch vụ** quanh sảnh | Tên miền, Hosting, VPS, SSL, Email. Mỗi quầy có 1 bé Nét to đứng quầy (pose tương ứng) + bảng "còn x mã". Đi vào quầy xem ưu đãi của dịch vụ đó. |
| **Bục Siêu Deal** giữa sảnh | Màn hình lớn đếm ngược giờ live; nơi Siêu Deal xuất hiện. |
| **Cửa vào** | Nơi nhân vật mới xuất hiện. |
| Trang trí | Cửa sổ vườn, đèn treo, cây cảnh, băng rôn Black Friday (giữ phong cách đã duyệt). Bàn ghế/cây là vật cản, không đi xuyên. |

## 5. Luật phiên live (5 phút)

- **Sảnh chờ (10 phút trước):** đi dạo, thả biểu cảm, xem quầy. Chưa có hộp quà.
- **Hộp quà rơi khắp sảnh:** mỗi hộp mang màu một dịch vụ và rơi **gần quầy dịch vụ đó**. Nhân vật đi chạm vào hộp là nhặt. Mỗi hộp có **K suất** (K người tới trước), trên hộp hiện "còn x".
- **Gom 5 mảnh** một dịch vụ → nhận mã dịch vụ đó ngay (nếu kho còn). Giới hạn giữ như v4: tối đa 2 mã/phiên, 1 mã/dịch vụ/ngày.
- **Siêu Deal:** báo trước 5 giây, hộp vàng hiện ở **bục giữa**: cả sảnh đổ dồn về, N người tới trước nhận thẳng mã.
- **Bọ DDoS đỏ:** vài con bò lang thang trong sảnh, đụng phải thì nhân vật **đứng hình 3 giây**. **Khiên OneShield** rơi ngẫu nhiên: nhặt được thì 5 giây miễn nhiễm.
- Kết thúc: bảng xếp hạng, mã đã nhận, giờ phiên sau. Nhân vật vẫn ở lại sảnh đi dạo được.

## 6. Công bằng & chống gian lận

- **Máy chủ quyết định:** vị trí nhân vật do trình duyệt gửi lên nhưng máy chủ **kiểm tra tốc độ tối đa** (không cho "dịch chuyển tức thời"), **kiểm tra khoảng cách** khi nhặt hộp, và xếp thứ tự ai tới trước.
- Giữ các lớp chống bot của v4 (Turnstile, giới hạn tần suất gửi, 1 kết nối/người). Mã thật không bao giờ nằm trong mã nguồn trang.

## 7. Kỹ thuật & sức chịu tải

- Vẽ thế giới bằng **Canvas 2D** (mượt trên điện thoại tầm trung), nhân vật dùng 6 ảnh Nét có sẵn; nền sảnh vẽ lại thành bản đồ lớn.
- Đồng bộ vị trí ~8 lần/giây, chỉ gửi người **đang di chuyển** và **ở gần mình**, trình duyệt nội suy cho mượt.
- **Mỗi sảnh tối đa ~100 người** (ít hơn v4 vì phải gửi vị trí liên tục); đông hơn thì mở sảnh mới, các sảnh dùng chung kho mã.
- Ước tính 1 VM 4 vCPU/8GB chịu khoảng **1.000–2.000 người cùng lúc**. Con số này phải đo bằng load test trên VM thật. Đông hơn cần nhiều tiến trình/máy (❓ câu 4).
- **Luyện tay:** bản chơi một mình trong sảnh trống với hộp quà giả lập, không phát mã.

## 8. Tiến độ ước tính

| Việc | Thời gian |
|---|---|
| Bản đồ sảnh + nhân vật + điều khiển (chạm/phím/joystick) | 2–3 ngày |
| Máy chủ đồng bộ vị trí, chống tốc biến, hộp quà theo bản đồ, bọ DDoS | 2–3 ngày |
| Biểu cảm, bản đồ nhỏ, quầy dịch vụ, Luyện tay | 1–2 ngày |
| Load test + deploy VM 103.216.118.92 + chạy thử nội bộ | 2 ngày |
| **Tổng** | **~7–10 ngày**, kịp trước 27/11 nếu chốt trong tuần này |

## 9. Nghiệm thu

1. Hai máy trở lên vào cùng sảnh thấy nhân vật của nhau đi lại mượt (độ trễ cảm nhận < 300ms tại Việt Nam).
2. Đi tới hộp quà thì nhặt được; chỉ K người tới trước có suất; không ai nhặt từ xa hay "tốc biến" được.
3. Chơi tốt trên điện thoại 360px (chạm để đi) và máy tính (phím/chuột).
4. Load test 1.000 người ảo di chuyển liên tục trên VM thật: không mã trùng, không vượt giới hạn.
5. Rớt mạng vào lại: nhân vật, mảnh và mã vẫn còn.

---

## ❓ Anh chốt giúp 22

1. **Bối cảnh:** giữ **sảnh gỗ iNET** (không yếu tố chùa) như đã chốt, hay anh muốn quay lại không khí chùa/đi lễ?
2. **Nhân vật:** chọn 1 trong 6 bé Nét có sẵn là đủ, hay muốn thay đồ/phụ kiện (mũ, kính, màu áo)? Thay đồ thêm ~2 ngày.
3. **Giao tiếp:** chỉ biểu cảm soạn sẵn (khuyên dùng), hay cho chat tự do (phải có lọc từ ngữ và người trực kiểm duyệt)?
4. **Quy mô:** mỗi phiên dự kiến bao nhiêu người cùng lúc?
5. **Bản v4 (chạm hộp tại chỗ)** đã xong: bỏ hẳn, hay giữ làm bản dự phòng cho máy yếu?
