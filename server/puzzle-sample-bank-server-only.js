/* =============================================================================
 * Đề mật thư MẪU cho bản LIVE — CHỈ nằm trên máy chủ (không bao giờ gửi file này xuống trình duyệt)
 * - Dùng khi MKT chưa nạp đề thật. Kho đề lưu trong SQLite với source='sample'.
 * - Bản luyện tay trên trình duyệt dùng bộ đề KHÁC (PRACTICE_* trong puzzle-cipher-generator-shared.js),
 *   nên người chơi xem mã nguồn trang cũng không thấy đáp án đề live.
 * - LƯU Ý: repo GitHub công khai thì file này cũng công khai → khi chạy thật, MKT phải nạp đề riêng
 *   ở trang quản trị và tick "thay đề mẫu" (replaceSample=1). Máy chủ cảnh báo khi chưa làm.
 * Điểm manh mối hợp lệ: pantry, server, reception, meeting, lounge, atrium (xem CLUE_SPOTS).
 * ============================================================================= */
'use strict';

// Cấp 1: điền chỗ trống
const FILL = [
  { question:'Điền vào chỗ trống: "Tên miền .___.vn dành cho cá nhân người Việt."', answers:['ID'], hint1:'2 chữ cái', hint2:'I _' },
  { question:'Điền vào chỗ trống: "Tên miền .___.vn dành cho hộ kinh doanh, doanh nghiệp nhỏ."', answers:['BIZ'], hint1:'Viết tắt của "business"', hint2:'B _ Z' },
  { question:'Điền vào chỗ trống: "Địa chỉ web có ổ khoá bắt đầu bằng ___://"', answers:['HTTPS'], hint1:'5 chữ cái', hint2:'H T T _ _' },
  { question:'Điền vào chỗ trống: "Sao lưu dữ liệu, tiếng Anh gọi là ___."', answers:['BACKUP'], hint1:'6 chữ cái', hint2:'B _ _ K _ P' },
  { question:'Điền vào chỗ trống: "Hệ thống phân giải tên miền viết tắt là ___."', answers:['DNS'], hint1:'3 chữ cái', hint2:'D _ S' },
  { question:'Điền vào chỗ trống: "Lá chắn bảo vệ tên miền ở tầng DNS của iNET tên là One___."', answers:['SHIELD', 'ONESHIELD'], hint1:'"Cái khiên" tiếng Anh', hint2:'S _ _ _ L D' }
];

// Cấp 3: ghép 2 manh mối giấu ở 2 điểm trong văn phòng (phải đi tới đọc đủ mới được trả lời)
const CLUES = [
  { question:'Ghép [Mảnh 1][Mảnh 2] (viết liền, không dấu cách).', answers:['DNS2007'],
    clues:[{ spot:'server', text:'Mảnh 1: viết tắt "Hệ thống tên miền" (3 chữ)' }, { spot:'reception', text:'Mảnh 2: năm iNET thành lập (4 chữ số)' }],
    hint1:'Mảnh 1 bắt đầu bằng D', hint2:'Năm thành lập in ở chân trang iNET' },
  { question:'Ghép [Mảnh 1][Mảnh 2] (viết liền).', answers:['ONEPANELSSL'],
    clues:[{ spot:'meeting', text:'Mảnh 1: tên bảng điều khiển hosting của iNET (cũng là tên 1 phòng họp)' }, { spot:'server', text:'Mảnh 2: viết tắt chứng chỉ bảo mật website (3 chữ)' }],
    hint1:'Mảnh 1 bắt đầu bằng ONE', hint2:'Mảnh 2 là 3 chữ cái' },
  { question:'Ghép [Mảnh 1][Mảnh 2] (viết liền).', answers:['CLOUDVPS'],
    clues:[{ spot:'pantry', text:'Mảnh 1: "đám mây" tiếng Anh (5 chữ)' }, { spot:'atrium', text:'Mảnh 2: viết tắt máy chủ ảo riêng (3 chữ)' }],
    hint1:'Mảnh 1 bắt đầu bằng C', hint2:'Mảnh 2 bắt đầu bằng V' },
  { question:'Ghép [Mảnh 1][Mảnh 2] (viết liền).', answers:['EMAIL1232'],
    clues:[{ spot:'reception', text:'Mảnh 1: thư điện tử (tiếng Anh, 5 chữ)' }, { spot:'lounge', text:'Mảnh 2: 4 số cuối tổng đài kinh doanh iNET (1900 ____)' }],
    hint1:'Tổng đài ghi ở chân trang', hint2:'Mảnh 1 bắt đầu bằng E' },
  { question:'Ghép [Mảnh 1][Mảnh 2] (viết liền).', answers:['BACKUPDNS'],
    clues:[{ spot:'atrium', text:'Mảnh 1: sao lưu dữ liệu (tiếng Anh, 6 chữ)' }, { spot:'meeting', text:'Mảnh 2: hệ thống phân giải tên miền (3 chữ viết tắt)' }],
    hint1:'Mảnh 1 bắt đầu bằng B', hint2:'Mảnh 2 bắt đầu bằng D' },
  { question:'Ghép [Mảnh 1][Mảnh 2] (viết liền).', answers:['BIZVNHTTPS'],
    clues:[{ spot:'lounge', text:'Mảnh 1: đuôi tên miền cho hộ kinh doanh, viết liền bỏ dấu chấm (5 chữ, kết thúc bằng VN)' }, { spot:'pantry', text:'Mảnh 2: giao thức web có ổ khoá (5 chữ)' }],
    hint1:'Mảnh 1 có dạng ___VN', hint2:'Mảnh 2 bắt đầu bằng HTTP' }
];

module.exports = { FILL, CLUES };
