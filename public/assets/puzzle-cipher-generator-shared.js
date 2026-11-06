/* =============================================================================
 * Mật thư — bộ sinh đề + chấm đáp án DÙNG CHUNG (máy chủ Node + bản Luyện tay trên trình duyệt)
 * Cấp 1 (dễ):  đảo chữ, điền chữ còn thiếu
 * Cấp 2 (vừa): dịch chữ cái (Caesar, có nói số bước), số → chữ (A=1…Z=26)
 * Cấp 3 (khó hơn chút): ghép 2 manh mối giấu ở các điểm trong văn phòng 3D
 * Đề tự sinh chọn ngẫu nhiên từ danh sách từ khoá dịch vụ iNET → mỗi người một đề, khó "xin đáp án".
 * ĐỀ LUYỆN TAY bên dưới chỉ dùng cho bản luyện tay (file này tải xuống trình duyệt → ai cũng đọc được).
 * Bản live KHÔNG dùng các đề này: máy chủ truyền ngân hàng đề riêng (server/puzzle-sample-bank-server-only.js
 * hoặc đề MKT nạp ở trang quản trị) vào generate(tier, rand, bank).
 * ============================================================================= */
(function (root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PuzzleKit = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  /** Chuẩn hoá đáp án: bỏ dấu, đ→d, viết hoa, chỉ giữ chữ + số. "Tên miền .id.vn" → "TENMIENIDVN" */
  function normalize(s){
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'D')
      .toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  // Từ khoá dịch vụ / khái niệm iNET dùng để tự sinh đề (chữ không dấu, không khoảng trắng)
  const WORDS = [
    { w:'HOSTING',   show:'HOSTING',   hint:'Nơi "thuê nhà" để đặt website' },
    { w:'TENMIEN',   show:'TÊN MIỀN',  hint:'Địa chỉ của website trên Internet' },
    { w:'EMAIL',     show:'EMAIL',     hint:'Thư điện tử theo tên miền doanh nghiệp' },
    { w:'CLOUD',     show:'CLOUD',     hint:'"Đám mây" chạy máy chủ của bạn' },
    { w:'ONEPANEL',  show:'ONEPANEL',  hint:'Bảng điều khiển hosting của iNET' },
    { w:'ONESHIELD', show:'ONESHIELD', hint:'Lá chắn bảo vệ tên miền ở tầng DNS của iNET' },
    { w:'SERVER',    show:'SERVER',    hint:'Máy chủ (tiếng Anh)' },
    { w:'DOMAIN',    show:'DOMAIN',    hint:'Tên miền (tiếng Anh)' },
    { w:'WEBSITE',   show:'WEBSITE',   hint:'Trang web của doanh nghiệp' },
    { w:'BACKUP',    show:'BACKUP',    hint:'Sao lưu dữ liệu' },
    { w:'BAOMAT',    show:'BẢO MẬT',   hint:'Giữ an toàn cho website' },
    { w:'BLACKFRIDAY', show:'BLACK FRIDAY', hint:'Mùa săn deal cuối tháng 11' }
  ];

  // Đề LUYỆN TAY cấp 1 (điền khuyết)
  const PRACTICE_FILL = [
    { question:'Điền vào chỗ trống: "Chứng chỉ ___ giúp website hiện ổ khóa và chạy https."', answers:['SSL'], hint1:'Viết tắt 3 chữ cái', hint2:'Bắt đầu bằng chữ S' },
    { question:'Điền vào chỗ trống: "Muốn có địa chỉ như inet.vn, bạn cần đăng ký một ___."', answers:['TEN MIEN', 'DOMAIN'], hint1:'Địa chỉ của website', hint2:'T _ N   M _ _ N' },
    { question:'Điền vào chỗ trống: "Website cần một nơi để đặt dữ liệu, gọi là ___."', answers:['HOSTING'], hint1:'Thuê "nhà" cho website', hint2:'Bắt đầu bằng chữ H' },
    { question:'Điền vào chỗ trống: "Máy chủ ảo riêng viết tắt là ___."', answers:['VPS'], hint1:'3 chữ cái', hint2:'V _ S' },
    { question:'Điền vào chỗ trống: "Hộp thư theo tên miền riêng gọi là ___ doanh nghiệp."', answers:['EMAIL'], hint1:'Thư điện tử', hint2:'E _ _ _ L' },
    { question:'Điền vào chỗ trống: "Bảng điều khiển hosting của iNET tên là One___."', answers:['PANEL', 'ONEPANEL'], hint1:'Bảng điều khiển (tiếng Anh)', hint2:'P _ _ _ L' }
  ];
  // Đề LUYỆN TAY cấp 3 (ghép manh mối ở các điểm trong văn phòng: pantry, server, reception, meeting, lounge, atrium)
  const PRACTICE_CLUES = [
    { question:'Ghép [Mảnh 1][Mảnh 2] (viết liền, không dấu chấm). Ví dụ: 80COM', answers:['443IDVN'],
      clues:[{ spot:'server', text:'Mảnh 1: số cổng mặc định của HTTPS' }, { spot:'pantry', text:'Mảnh 2: đuôi tên miền dành cho cá nhân của Việt Nam' }],
      hint1:'Mảnh 2 có dạng .__.vn', hint2:'Mảnh 1 là 3 chữ số, bắt đầu bằng 4' },
    { question:'Ghép [Mảnh 1][Mảnh 2]. Ví dụ: 1999ABC', answers:['2007ONESHIELD'],
      clues:[{ spot:'reception', text:'Mảnh 1: năm iNET thành lập (4 chữ số)' }, { spot:'meeting', text:'Mảnh 2: tên sản phẩm bảo vệ DNS của iNET (cũng là tên phòng họp này)' }],
      hint1:'Năm thành lập in ở chân trang web iNET', hint2:'Mảnh 2 bắt đầu bằng ONE' },
    { question:'Ghép [Mảnh 1][Mảnh 2] (viết liền).', answers:['SSLVPS'],
      clues:[{ spot:'atrium', text:'Mảnh 1: viết tắt của chứng chỉ bảo mật website (3 chữ)' }, { spot:'server', text:'Mảnh 2: viết tắt của máy chủ ảo riêng (3 chữ)' }],
      hint1:'Cả 2 mảnh đều 3 chữ cái', hint2:'Bắt đầu bằng SSL' },
    { question:'Ghép [Mảnh 1][Mảnh 2] (viết liền).', answers:['1900ONEPANEL'],
      clues:[{ spot:'pantry', text:'Mảnh 1: 4 số đầu tổng đài kinh doanh iNET' }, { spot:'reception', text:'Mảnh 2: tên bảng điều khiển hosting của iNET' }],
      hint1:'Tổng đài có dạng ____ 1232', hint2:'Mảnh 2 bắt đầu bằng ONE' },
    { question:'Ghép [Mảnh 1][Mảnh 2] (viết liền).', answers:['HTTPS443'],
      clues:[{ spot:'lounge', text:'Mảnh 1: giao thức web an toàn (5 chữ cái)' }, { spot:'meeting', text:'Mảnh 2: số cổng mặc định của giao thức đó' }],
      hint1:'Mảnh 1 xuất hiện đầu mọi địa chỉ web có ổ khóa', hint2:'Mảnh 2 là 3 chữ số' },
    { question:'Ghép [Mảnh 1][Mảnh 2] (viết liền).', answers:['DNSVN'],
      clues:[{ spot:'server', text:'Mảnh 1: viết tắt "Hệ thống tên miền" (3 chữ)' }, { spot:'atrium', text:'Mảnh 2: đuôi tên miền quốc gia Việt Nam (2 chữ)' }],
      hint1:'Mảnh 1 bắt đầu bằng D', hint2:'Mảnh 2 là 2 chữ cái' }
  ];

  const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
  function shuffleWord(w, rand){
    const a = w.split('');
    for (let k = 0; k < 20; k++){
      for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      if (a.join('') !== w) break;
    }
    return a.join(' ');
  }
  const caesar = (w, k) => w.replace(/[A-Z]/g, c => String.fromCharCode((c.charCodeAt(0) - 65 + k) % 26 + 65));

  /** Sinh 1 đề theo cấp. bank = { fill:[], clues:[] } (máy chủ truyền đề riêng; bỏ trống = đề luyện tay).
   *  Trả về { type, question, answers[], hint1, hint2, clues? } */
  function generate(tier, rand = Math.random, bank){
    const fill = bank && bank.fill && bank.fill.length ? bank.fill : PRACTICE_FILL;
    const clueSet = bank && bank.clues && bank.clues.length ? bank.clues : PRACTICE_CLUES;
    if (tier >= 3) return Object.assign({ type:'clues' }, JSON.parse(JSON.stringify(pick(clueSet, rand))));
    if (tier === 1){
      if (rand() < 0.6){
        const x = pick(WORDS.filter(v => v.w.length <= 9), rand);
        return { type:'anagram', question:`Sắp xếp lại các chữ cái thành từ khoá dịch vụ iNET:  ${shuffleWord(x.w, rand)}`,
                 answers:[x.w], hint1:x.hint, hint2:`Có ${x.w.length} chữ cái, bắt đầu bằng "${x.w[0]}"` };
      }
      return Object.assign({ type:'fill' }, JSON.parse(JSON.stringify(pick(fill, rand))));
    }
    const x = pick(WORDS, rand);
    if (rand() < 0.5){
      const k = 1 + Math.floor(rand() * 3);
      return { type:'caesar', question:`Mỗi chữ cái đã bị dịch tiến ${k} bước trong bảng chữ cái (vd. A→${String.fromCharCode(65 + k)}). Giải mã:  ${caesar(x.w, k)}`,
               answers:[x.w], hint1:`Lùi mỗi chữ cái ${k} bước. Gợi ý nghĩa: ${x.hint}`, hint2:`Bắt đầu bằng "${x.w.slice(0, 2)}"` };
    }
    return { type:'a1z26', question:`Mỗi số là một chữ cái: A=1, B=2, … Z=26. Giải mã:  ${x.w.split('').map(c => c.charCodeAt(0) - 64).join('-')}`,
             answers:[x.w], hint1:`Gợi ý nghĩa: ${x.hint}`, hint2:`Bắt đầu bằng "${x.w.slice(0, 2)}"` };
  }
  function check(answerList, input){
    const n = normalize(input);
    return !!n && answerList.some(a => normalize(a) === n);
  }
  return { normalize, generate, check, WORDS, PRACTICE_FILL, PRACTICE_CLUES };
});
