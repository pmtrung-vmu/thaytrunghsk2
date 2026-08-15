# Bật đăng nhập & theo dõi tiến độ học viên (Firebase) — khoảng 10-15 phút

**Bước này KHÔNG bắt buộc để trang có nội dung xem được** — ai cũng xem được danh sách từ vựng và lật thẻ (flashcard) của mọi trình độ ngay cả khi chưa cấu hình Firebase. Nhưng các chế độ luyện tập có chấm điểm (trắc nghiệm, điền pinyin, điền từ, dịch câu, viết chữ) LUÔN yêu cầu đăng nhập, dù đã cấu hình Firebase hay chưa — nên bước này thực ra **cần làm nếu bạn muốn học viên luyện tập được đầy đủ và lưu tiến độ**, không chỉ để xem từ vựng. Nếu bạn bỏ qua phần này, trang vẫn hoạt động ở chế độ "chỉ xem": ai cũng xem danh sách từ + lật thẻ được, nhưng không ai luyện tập/lưu được tiến độ và không có trang giáo viên. Làm theo các bước dưới đây để bật đăng nhập, tạo tài khoản giáo viên, phân lớp và tạo tài khoản học viên.

Firebase là dịch vụ của Google — miễn phí ở quy mô một lớp học/trung tâm nhỏ (gói **Spark**, không cần thẻ tín dụng).

## Bước 1 — Tạo dự án Firebase

1. Vào https://console.firebase.google.com, đăng nhập bằng tài khoản Google của bạn.
2. Bấm **"Add project" / "Thêm dự án"**, đặt tên tuỳ ý (ví dụ `hsk-on-tu`), bỏ qua Google Analytics nếu không cần (không bắt buộc).
3. Đợi vài giây để dự án được tạo.

## Bước 2 — Tạo "Web app" để lấy đoạn cấu hình

1. Trong trang tổng quan dự án, bấm biểu tượng **`</>`** (Web) để thêm một ứng dụng web.
2. Đặt tên app tuỳ ý (ví dụ `hsk-web`), **không cần** tick "Firebase Hosting".
3. Firebase sẽ hiện một đoạn code `firebaseConfig = { apiKey: "...", authDomain: "...", ... }` — **giữ nguyên trang này**, bạn sẽ copy các giá trị ở bước 6.

## Bước 3 — Bật đăng nhập bằng Email/Mật khẩu

1. Menu bên trái → **Build → Authentication** → **Get started**.
2. Tab **Sign-in method** → chọn **Email/Password** → bật (Enable) → **Save**.

## Bước 4 — Tạo cơ sở dữ liệu Firestore

1. Menu bên trái → **Build → Firestore Database** → **Create database**.
2. Chọn vị trí máy chủ gần bạn (ví dụ `asia-southeast1`), chọn chế độ **Production mode** → **Enable**.

## Bước 5 — Dán luật bảo mật (Firestore Rules)

1. Trong Firestore Database → tab **Rules**.
2. Mở file `firestore.rules` đi kèm trong thư mục `site/`, copy toàn bộ nội dung.
3. Dán đè vào ô luật trên Firebase Console → bấm **Publish**.

Luật này đảm bảo: mỗi học viên chỉ đọc/sửa được dữ liệu của chính mình; **chỉ tài khoản có vai trò "teacher" mới xem được dữ liệu của tất cả học viên**; và không ai có thể tự phong mình làm giáo viên từ trình duyệt.

## Bước 6 — Dán cấu hình vào trang web

Mở file `site/js/firebase-config.js`, thay các dòng `"DÁN_..."` bằng giá trị thật lấy từ Bước 2, ví dụ:

```js
const firebaseConfig = {
  apiKey: "AIzaSyD...",
  authDomain: "hsk-on-tu.firebaseapp.com",
  projectId: "hsk-on-tu",
  storageBucket: "hsk-on-tu.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890",
};
```

Lưu file. Các giá trị này **không phải bí mật** (chúng vốn công khai trong mã nguồn trình duyệt) — mức độ bảo mật thật sự nằm ở Firestore Rules đã dán ở Bước 5.

## Bước 7 — Cho phép domain khi đưa lên GitHub Pages

Sau khi đưa trang lên GitHub Pages (theo hướng dẫn trong `README.md`), vào **Authentication → Settings → Authorized domains** trên Firebase Console → **Add domain** → nhập domain GitHub Pages của bạn (dạng `<tên-bạn>.github.io`). Nếu thiếu bước này, đăng nhập từ domain đó sẽ báo lỗi.

## Bước 8 — Tạo tài khoản giáo viên đầu tiên (thủ công qua Console)

**Không còn trang tự đăng ký nữa** — toàn bộ tài khoản (kể cả giáo viên) phải được tạo qua Firebase Console hoặc (với học viên) qua Trang giáo viên trong app. Để tạo tài khoản giáo viên đầu tiên cho chính bạn:

1. Vào Firebase Console → **Authentication → Users** → bấm **Add user**.
2. Nhập email và mật khẩu của bạn → **Add user**. Sao chép lại **User UID** vừa được tạo (cột UID trong bảng danh sách).
3. Vào **Firestore Database → Data** → bấm **Start collection** (nếu collection `users` chưa có) → Collection ID nhập `users`.
4. Ở bước tạo document: **Document ID** dán đúng UID vừa copy ở bước 2 (không để Firestore tự sinh ID). Thêm các trường sau:
   - `name` (string) — tên hiển thị, ví dụ `Cô Hương`
   - `email` (string) — đúng email vừa tạo ở bước 2
   - `role` (string) — nhập đúng `teacher`
5. Bấm **Save**.
6. Quay lại trang web → **Đăng nhập** bằng email/mật khẩu vừa tạo — mục **"📊 Trang giáo viên"** sẽ xuất hiện trên thanh đăng nhập.

Từ giờ, **mọi tài khoản học viên đều được tạo từ Trang giáo viên trong app** (không cần vào Console nữa) — xem mục tiếp theo. Chỉ khi cần thêm một giáo viên khác thì mới lặp lại các bước thủ công ở trên.

## Quản lý lớp học & tài khoản học viên (từ Trang giáo viên)

Sau khi đăng nhập bằng tài khoản giáo viên, vào **"📊 Trang giáo viên"**:

1. **Tạo lớp mới**: đặt tên lớp (ví dụ "HSK1 - Tối 2/4/6") và chọn đúng trình độ HSK của lớp đó.
2. **Tạo tài khoản học viên**: nhập họ tên + email học viên, tick chọn **một hoặc nhiều lớp cùng lúc** (mật khẩu có thể để trống để hệ thống tự sinh). Sau khi tạo, trang sẽ hiện email + mật khẩu tạm — gửi thông tin này cho học viên để họ tự đăng nhập.
3. Học viên đăng nhập bằng thông tin được cấp sẽ **chỉ ôn tập được đúng (các) trình độ của (các) lớp mình đang thuộc** — trình độ nào không có lớp tương ứng sẽ bị khoá (hiện biểu tượng 🔒), kể cả khi họ cố vào thẳng bằng đường dẫn. Một học viên thuộc đồng thời lớp HSK1 và lớp HSK2 sẽ ôn được cả hai trình độ đó.
4. Muốn đổi (các) lớp của một học viên (thêm lớp, bớt lớp, hoặc chuyển hẳn sang lớp khác): trong bảng danh sách học viên, bấm **"✏️ Sửa lớp"** ở cột "Lớp" → tick/bỏ tick các lớp cần → **Lưu**.

**Lưu ý quan trọng:** việc giới hạn trình độ này hoạt động ở tầng ứng dụng (ẩn menu, chặn điều hướng) chứ **không phải khoá dữ liệu tuyệt đối** — vì các file từ vựng (`data/hsk*.json`) vẫn là file tĩnh công khai trên GitHub Pages, ai có đường dẫn trực tiếp vẫn tải được. Mức độ này phù hợp cho một lớp học bình thường (ngăn học viên vô tình lạc sang bài chưa học), không phải một hệ thống bảo mật thi cử nghiêm ngặt.

**Tiến độ ôn tập được lưu riêng theo từng lớp:** nếu một học viên thuộc nhiều lớp, điểm trắc nghiệm/điền pinyin/bài đã ôn của họ được cộng dồn riêng cho từng lớp (theo đúng trình độ đang ôn thuộc lớp nào). Trang chi tiết một lớp (mục dưới đây) chỉ hiện đúng số liệu của lớp đó; bảng "Danh sách học viên" chung ở trang giáo viên hiện **tổng số liệu của tất cả các lớp** học viên đang tham gia, để dễ nhìn tổng quan.

## Sửa/xóa lớp & học viên

Trang giáo viên có 2 bảng riêng: **"📚 Danh sách lớp"** và **"👥 Danh sách học viên"**.

- **Sửa lớp**: bấm **"✏️ Sửa"** ở dòng lớp cần sửa → đổi tên và/hoặc trình độ → **Lưu**. Việc đổi tên/trình độ được áp dụng ngay cho **tất cả học viên đang thuộc lớp đó** (không cần sửa từng học viên) — kể cả những học viên đang thuộc thêm lớp khác nữa (chỉ mục ứng với lớp này của họ được cập nhật, các lớp khác của họ giữ nguyên).
- **Xóa lớp**: bấm **"🗑 Xóa"**. Hệ thống chỉ cho xóa khi lớp **không còn học viên nào** (kể cả học viên đang thuộc lớp này cùng lúc với lớp khác) — nếu còn, hãy bấm "✏️ Sửa lớp" ở từng học viên đó và bỏ tick lớp này trước, rồi xóa lớp sau.
- **Xem chi tiết một lớp**: bấm **"Xem chi tiết →"** để mở trang riêng của lớp đó — tổng số học viên, điểm trung bình cả lớp, và bảng chỉ hiển thị học viên đang thuộc lớp này, với điểm/hoạt động **chỉ tính riêng cho lớp này** (không gộp các lớp khác của cùng học viên).
- **Sửa tên học viên**: bấm **"✏️ Sửa tên"** ở dòng học viên → đổi tên → **Lưu**.
- **Xóa học viên**: bấm **"🗑 Xóa"** ở dòng học viên → xác nhận. Thao tác này **xóa ngay hồ sơ học viên trong Firestore**, nghĩa là học viên đó **mất quyền truy cập nội dung ngay lập tức** (không đăng nhập/xem bài được nữa) và biến mất khỏi mọi danh sách/thống kê, kể cả khi họ đang thuộc nhiều lớp.

  ⚠️ **Giới hạn quan trọng cần biết**: do trang này chỉ chạy hoàn toàn trên trình duyệt (không có máy chủ riêng), nút "Xóa học viên" **không xóa được tài khoản đăng nhập gốc** trong Firebase Authentication — chỉ nền tảng Firebase mới cho phép xóa tài khoản đăng nhập của người khác từ phía máy chủ (Admin SDK), việc này không làm được từ trình duyệt. Sau khi xóa, tài khoản đăng nhập đó vẫn tồn tại (ở dạng "mồ côi", không có hồ sơ/quyền gì) nhưng **không đăng nhập vào được nội dung nào** vì hồ sơ Firestore đã mất. Nếu muốn dọn sạch hoàn toàn (ví dụ để dùng lại đúng email đó cho học viên khác), vào **Firebase Console → Authentication → Users**, tìm đúng email, bấm menu **⋮ → Delete account**.

**Sau khi cập nhật lên bản có tính năng xóa học viên / nhiều lớp cùng lúc, bạn cần dán lại `firestore.rules`:** file luật bảo mật đã đổi (thêm quyền cho giáo viên xóa hồ sơ học viên, và đổi tên trường `classId` → `classIds`). Hãy làm lại **Bước 5** ở trên — mở `firestore.rules` mới, copy toàn bộ, dán đè vào Firebase Console → Firestore Database → Rules → **Publish**. Nếu bỏ qua bước này, nút "Xóa học viên"/"Sửa lớp" sẽ báo lỗi quyền truy cập (permission-denied).

⚠️ **Nếu bạn đã có học viên thật từ trước khi nâng cấp lên bản "nhiều lớp cùng lúc":** đây là một thay đổi lớn về cách lưu dữ liệu — học viên cũ dùng trường `classId` (1 lớp duy nhất), bản mới dùng `classIds`/`classes` (nhiều lớp). Sau khi đưa bản mới lên, **các học viên đã tạo từ trước sẽ hiện "— chưa có lớp —"** (mất quyền ôn tập tạm thời) cho tới khi bạn vào Trang giáo viên, bấm **"✏️ Sửa lớp"** ở từng học viên đó và tick lại đúng lớp của họ (chỉ mất vài giây mỗi học viên). Tiến độ ôn tập cũ (điểm số, từ hay sai...) của họ vẫn còn nguyên trong Firestore nhưng sẽ không hiển thị ở đâu nữa (dữ liệu cũ không tự chuyển sang định dạng mới) — hoạt động ôn tập mới sau khi gán lại lớp sẽ được ghi nhận bình thường.

## Trang giáo viên hiển thị gì?

Với mỗi học viên: lớp đang học, hoạt động gần nhất, số bài đã ôn qua, điểm trung bình **trắc nghiệm, điền pinyin, điền từ, và viết chữ** (4 chế độ được tính riêng), danh sách từ hay điền/chọn sai nhất, và số phút học hôm nay / 7 ngày qua (tự động cộng dồn khi học viên mở một bài học và ở lại trang). Bảng **"📚 Danh sách lớp"** cho xem nhanh sĩ số + điểm trung bình từng lớp, và trang chi tiết từng lớp (bấm "Xem chi tiết →") gom đúng các số liệu đó cho riêng lớp đang xem.

**Xem chi tiết một học viên — kể cả lịch sử từng lần làm bài:** bấm **vào tên học viên** (hoặc nút "📖 Chi tiết") ở dòng học viên (trong bảng "Danh sách học viên") để mở trang riêng của học viên đó — liệt kê từng bài học viên đã làm (ví dụ "HSK1 · Bài 1"), kèm điểm số/tỉ lệ đúng của cả 4 chế độ (trắc nghiệm, điền pinyin, điền từ, viết chữ) và thời điểm làm gần nhất, tách riêng theo từng lớp nếu học viên thuộc nhiều lớp.

Mỗi ô điểm ở đây không chỉ hiện điểm lần gần nhất — mà hiện **toàn bộ lịch sử các lần làm bài đó**: số lần đã làm (ví dụ "3 lần") và điểm chi tiết của từng lần theo đúng thứ tự thời gian (ví dụ "6/10 (60%), 8/10 (80%), 9/10 (90%)"). Nhờ vậy giáo viên thấy được cả quá trình học viên tiến bộ qua từng lần luyện, không chỉ kết quả cuối cùng.

⚠️ **Về điểm "Điền từ" (điền từ vào chỗ trống):** trước bản cập nhật thêm chế độ này, điểm của chế độ "📝 Điền từ" từng bị gộp chung vào điểm "Trắc nghiệm" (một sơ suất trong bản cũ). Từ bản đó trở đi, hai chế độ được tính hoàn toàn tách biệt — nhưng các con số "Điểm TB trắc nghiệm" đã ghi nhận **trước** khi cập nhật vẫn giữ nguyên phần đã bị gộp trước đó (không tự tách lại được); chỉ có hoạt động ôn tập **mới, sau khi cập nhật** mới được tính đúng riêng theo từng chế độ.

⚠️ **Về lịch sử từng lần làm bài:** tính năng này (lưu mọi lần làm thay vì chỉ lần gần nhất) chỉ bắt đầu ghi nhận từ bản cập nhật thêm chế độ "🖌️ Viết chữ". Điểm đã ghi nhận **trước đó** (kể cả trắc nghiệm/điền pinyin/điền từ) vẫn hiển thị được bình thường, nhưng chỉ tính là **"1 lần"** trong bảng chi tiết (vì dữ liệu cũ chỉ lưu snapshot lần gần nhất, không có lịch sử đầy đủ hơn để hiển thị lại).

## Chế độ luyện tập mới: "🖌️ Viết chữ"

Mỗi bài học (HSK1-3) giờ có thêm tab **"🖌️ Viết chữ"** bên cạnh 5 chế độ cũ. Hệ thống đưa ra nghĩa tiếng Việt của một từ ngẫu nhiên trong bài, học viên phải **viết tay từng chữ Hán** của từ đó lên khung vẽ trên màn hình — sai nét sẽ được báo ngay để viết lại, viết đúng ngay từ lần đầu (không sai nét nào) mới được tính đúng câu đó. Có nút gợi ý pinyin và nút bỏ qua nếu cần.

Tính năng này dùng API `.quiz()` có sẵn của thư viện HanziWriter (cùng thư viện đang dùng cho "✏️ Cách viết") để tự động chấm đúng/sai từng nét vẽ — không cần xây dựng công cụ nhận diện chữ viết tay riêng. Vì cùng phụ thuộc vào dữ liệu nét bút của HanziWriter, "Viết chữ" **chỉ áp dụng cho HSK1-3** giống "Cách viết" (xem mục `STROKE_ORDER_LEVELS` trong `js/app.js` nếu muốn mở rộng).

## Trang "Tiến độ của tôi" (dành cho học viên)

Học viên đăng nhập sẽ thấy mục **"📈 Tiến độ của tôi"** trên thanh đăng nhập (cạnh nút Đăng xuất). Trang này để học viên **tự theo dõi kết quả luyện tập của chính mình** — không cần hỏi giáo viên: tổng số bài đã ôn, điểm trung bình cả 4 chế độ (trắc nghiệm/điền pinyin/điền từ/viết chữ), số phút học hôm nay/7 ngày qua, danh sách từ hay sai nhất, và bảng chi tiết điểm theo từng bài học kèm lịch sử từng lần làm (giống hệt trang chi tiết mà giáo viên xem, chỉ khác là học viên chỉ xem được của chính mình). Nếu học viên thuộc nhiều lớp, dữ liệu được chia rõ theo từng lớp.

## Giới hạn cần biết

- Gói Firebase miễn phí (Spark) đủ dùng cho quy mô vài chục–vài trăm học viên hoạt động bình thường; nếu lớp rất lớn, xem thêm gói trả phí "Blaze" (vẫn có hạn mức miễn phí hào phóng ở đầu mỗi tháng).
- Thời gian học hiện được đo bằng cách kiểm tra mỗi 30 giây khi trình duyệt đang mở và ở tab đó (tab ẩn/máy khoá sẽ không tính) — là số gần đúng, không phải đồng hồ bấm giờ chính xác tuyệt đối.
- "Bài đã ôn" tính khi học viên mở bất kỳ chế độ nào (danh sách/lật thẻ/trắc nghiệm/điền từ/viết chữ) của bài đó — chưa phân biệt mức độ thành thạo.
- Học viên được tạo trước khi cập nhật tính năng phân lớp/nhiều lớp (nếu có) sẽ chưa có lớp — vào Trang giáo viên, bấm "✏️ Sửa lớp" cho học viên đó để gán lại (xem lưu ý ⚠️ ở mục "Sửa/xóa lớp & học viên" phía trên).
- Lịch sử từng lần làm bài được lưu dưới dạng mảng trong Firestore (mỗi lần làm thêm một phần tử) — với quy mô dùng thực tế của một trang ôn từ vựng (nhiều nhất vài trăm lần làm/bài/năm), mảng này vẫn rất nhỏ so với giới hạn dung lượng một tài liệu Firestore (1MB), nên không cần lo về hiệu năng hay chi phí.
