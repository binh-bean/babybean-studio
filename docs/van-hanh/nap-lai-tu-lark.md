# Xoá sạch và nạp lại từ Lark — hướng dẫn cho admin

Việc này chỉ làm MỘT LẦN, trước khi mở app cho khách (BB-300). Mục đích: xoá
hết dữ liệu cũ đang có trong app, rồi nạp lại từ đầu theo đúng Lark. Làm vậy
để không ai còn phải nghi ngờ dữ liệu app có khớp Lark hay không.

**Cập nhật 28/09/2026 (BB-311 mục B):** admin chốt thu hẹp danh sách "giữ
nguyên" — xem chi tiết ngay dưới đây, đổi so với bản trước.

Việc này KHÔNG đụng vào: chi nhánh (`branches`), tài khoản nhân sự
(`staff_profiles`, `staff_branches`), vai trò (`roles`), tài khoản đăng nhập
(`auth.users` — nằm ngoài schema `public`, ngoài phạm vi xoá của công cụ này),
cài đặt vận hành (`settings`), và gói chụp (`packages`). Lý do giữ từng nhóm:

- `staff_profiles`, `staff_branches`, `roles`, tài khoản Auth — phân quyền
  đăng nhập; xoá là khoá tài khoản nhân viên, không đồng bộ lại được từ Lark.
- `branches` — phân quyền của nhân viên BÁM vào chi nhánh (`staff_branches`
  trỏ vào `branches.id`); xoá chi nhánh trước sẽ kéo đổ toàn bộ phân quyền.
- `settings` — cấu hình riêng của app (link nhắn tin Zalo, bật/tắt thông báo…)
  — không có trên Lark, xoá xong không có gì nạp lại được.
- `packages` (gói chụp) — **ĐÃ KIỂM TRA**: không có script đồng bộ Lark nào
  ghi vào bảng này (`sync-lark-catalog.mjs` chỉ ghi `products`). Xoá bảng này
  mà không có bước --nap nào nạp lại sẽ để app thiếu vĩnh viễn toàn bộ gói
  chụp. Admin có nhắc muốn xoá cả `packages` — công cụ CHƯA làm theo, vì chưa
  có đường nạp lại. Cần admin quyết trước: viết script đồng bộ packages mới,
  hay chấp nhận nhập tay lại sau khi xoá?

Việc này XOÁ SẠCH: toàn bộ khách, bé, buổi chụp, bộ ảnh, ảnh, link chia sẻ,
lượt chọn của khách, thanh toán phát sinh, **và từ 28/09/2026 cả danh mục sản
phẩm (`products`) cùng lịch sử thao tác (`activity_logs`, `notifications`)**.
`products` chuyển từ "giữ" sang "xoá" vì báo cáo vận hành vòng 4 phát hiện
sản phẩm "Fixture …" của phép thử lọt vào cửa hàng khách thật — xoá sạch rồi
nạp lại từ Lark (bước "danh mục sản phẩm") là cách chắc chắn dọn hết, không
chỉ tắt `is_active` từng dòng. Xoá xong sẽ nạp lại từ Lark.

---

## Trước khi bắt đầu

Chỉ chạy khi:
- Admin đã xem qua số đếm ở bước 1 và đồng ý xoá.
- Đã có bản sao lưu (bước 2) trong vòng 24 giờ gần nhất.
- **Đã diễn tập trọn 4 bước này trên bb-test trước** (xem mục "Diễn tập trước
  khi chạy thật" bên dưới). Chưa diễn tập thì chưa chạy trên dữ liệu thật.

Không có ai khác nên chạy các lệnh dưới đây ngoài admin hoặc người admin nhờ,
vì bước 3 xoá thật, không lấy lại được nếu không có bản sao lưu.

---

## Diễn tập trước khi chạy thật (bắt buộc trước lần đầu)

Đừng chạy bốn bước dưới đây lần đầu tiên nhắm thẳng vào dữ liệu thật của
studio (bb-dev). Trước đó, diễn tập trọn vẹn 1 → 2 → 3 → 4 trên một cơ sở dữ
liệu thử (bb-test hoặc một project Supabase tạm), theo đúng lệnh, để chắc
chắn: mã xác nhận đúng quy trình, bản sao lưu ghi ra đọc lại được, và bước
nạp lại từ Lark chạy hết bốn script mà không dừng giữa chừng.

Cách diễn tập:
1. Trỏ `SUPABASE_DB_URL` (và các biến `NEXT_PUBLIC_SUPABASE_*`,
   `SUPABASE_SERVICE_ROLE_KEY`) sang project thử — KHÔNG phải bb-dev, KHÔNG
   phải bb-prod. Cách đơn giản nhất: tạo một `.env.local` tạm chỉ dùng cho
   lượt diễn tập, hoặc dùng biến môi trường trên dòng lệnh cho riêng lượt đó.
2. Chạy đủ bốn bước (1 → 2 → 3 → 4) như hướng dẫn bên dưới.
3. Vì đích diễn tập không phải bb-dev nên KHÔNG cần cờ `--that-su-la-bb-dev`
   ở bước 3.
4. Ghi lại: mất bao lâu, bước nào (nếu có) phải chạy lại, số dòng nạp về sau
   bước 4 có khớp số dòng đã xoá không.

Chưa có project bb-test thì đây là việc cần làm trước — xem lộ trình mở app,
mục quyết định Q2 (dùng lại một project cũ làm bb-test, hoặc tạo project
mới). Ghi vào `tasks/BLOCKERS.md` nếu bị chặn ở bước này.

---

## Bước 1 — Xem số đếm (an toàn, chỉ đọc)

Mở cửa sổ dòng lệnh trong thư mục dự án, gõ:

```
npm run db:nap-lai
```

Lệnh này KHÔNG xoá gì cả, chỉ đọc và in ra:

- Những bảng được GIỮ NGUYÊN, kèm lý do (chi nhánh, nhân sự, sản phẩm, cài đặt).
- Những bảng SẼ BỊ XOÁ, kèm số dòng hiện có của từng bảng.
- Tổng số dòng sẽ mất.
- Một MÃ XÁC NHẬN 6 ký tự — dùng ở bước 3.

Đọc kỹ số đếm. Nếu số lạ, dừng lại, hỏi kỹ thuật trước khi đi tiếp.

Mã xác nhận chỉ dùng được cho ĐÚNG bộ số vừa in, trong ĐÚNG ngày hôm nay. Nếu
có ai đó chạy đồng bộ Lark sau khi in mã, số đếm đổi, mã cũ sẽ không dùng
được nữa — phải chạy lại bước 1 để lấy mã mới.

---

## Bước 2 — Sao lưu trước khi xoá (bắt buộc)

```
npm run db:nap-lai -- --sao-luu "D:\BabyBean-sao-luu"
```

Thay `D:\BabyBean-sao-luu` bằng nơi admin muốn lưu — miễn KHÔNG nằm trong thư
mục dự án (thư mục dự án là công khai trên internet). Có thể chọn một thư mục
khác nhau mỗi lần, không bắt buộc phải luôn dùng đúng một chỗ.

Lệnh này xuất toàn bộ dữ liệu SẮP BỊ XOÁ ra các tệp JSON NGAY TRONG thư mục
vừa chọn, kèm một tệp ghi tổng số dòng và thời điểm sao lưu
(`tong-so-dong.json`). Nó cũng ghi thêm một tệp mốc nhỏ tên
`sao-luu-gan-nhat.json` vào thư mục mặc định của máy (không phải thư mục vừa
chọn) — tệp mốc này là cách bước 3 TỰ TÌM RA bản sao lưu vừa tạo, dù admin
chọn thư mục nào ở bước 2. Không cần nhớ hay gõ lại đường dẫn ở bước 3.

Không đặt lại tên hay xoá thư mục này cho tới khi chắc chắn app chạy tốt sau
khi nạp lại.

Muốn chỉ đích danh một bản sao lưu cụ thể (ví dụ có nhiều bản cũ và muốn dùng
đúng một bản), thêm `--tu "đường dẫn thư mục đó"` vào lệnh ở bước 3 — xem chi
tiết trong bước 3.

---

## Bước 3 — Xoá thật

```
npm run db:nap-lai -- --xoa --xac-nhan <MÃ_TỪ_BƯỚC_1> --that-su-la-bb-dev
```

Thay `<MÃ_TỪ_BƯỚC_1>` bằng đúng mã 6 ký tự bước 1 vừa in ra.

**Vì sao có cờ `--that-su-la-bb-dev`:** lệnh này nối thẳng vào cơ sở dữ liệu
mà `SUPABASE_DB_URL` trong `.env.local` đang trỏ tới. Khi việc mở app tới gần,
đó chính là bb-dev — dữ liệu THẬT của studio, có tên và số điện thoại thật của
khách. Cờ này là một bước xác nhận riêng, tách khỏi mã xác nhận 6 ký tự: mã
xác nhận canh việc "số đếm đúng, không ai vừa đồng bộ Lark thêm", còn cờ này
canh việc "người gõ lệnh BIẾT mình đang chạy trên môi trường thật, không phải
gõ nhầm sau khi vừa diễn tập trên bb-test". Thiếu cờ này khi đích là bb-dev,
lệnh từ chối chạy và không xoá gì — đây là chặn AN TOÀN, không phải lỗi. Diễn
tập trên bb-test (xem mục ở trên) thì KHÔNG cần cờ này, vì bb-test không nằm
trong danh sách được coi là "dữ liệu thật".

Muốn dùng một bản sao lưu cụ thể thay vì bản mới nhất máy tự tìm ra, thêm
`--tu "đường dẫn thư mục bản sao lưu đó"`:

```
npm run db:nap-lai -- --xoa --xac-nhan <MÃ_TỪ_BƯỚC_1> --that-su-la-bb-dev --tu "D:\BabyBean-sao-luu\2026-09-28T..."
```

Lệnh sẽ TỪ CHỐI chạy nếu:

- Mã không khớp (gõ sai, hoặc số đếm đã đổi từ lúc in mã) — chạy lại bước 1.
- Chưa có bản sao lưu nào trong 24 giờ gần nhất — chạy lại bước 2.
- Đang trỏ vào bb-dev mà thiếu cờ `--that-su-la-bb-dev` — thêm cờ đó vào lệnh.

Nếu bị từ chối, đọc dòng chữ đỏ trên màn hình — nó nói rõ vì sao, và bước nào
cần làm lại.

Xoá xong, lệnh in ra danh sách đã xoá bao nhiêu dòng ở mỗi bảng.

**Dọn bộ đệm ảnh cùng lúc (tuỳ chọn, khuyến nghị):** thêm cờ
`--cung-don-dem-anh` vào lệnh --xoa ở trên. Sau khi database nghiệp vụ đã
rỗng, mọi ảnh đang nằm trong bộ đệm Storage (bucket `thumbnails`) đều MỒ CÔI
(photoId không còn tồn tại) — cờ này tự gọi `npm run anh:don-dem-hong --
--tat-ca --write` ngay sau bước xoá để dọn sạch luôn, không phải chạy tay một
lệnh riêng. Không thêm cờ thì lệnh chỉ nhắc, không tự xoá gì thêm.

```
npm run db:nap-lai -- --xoa --xac-nhan <MÃ_TỪ_BƯỚC_1> --that-su-la-bb-dev --cung-don-dem-anh
```

---

## Bước 4 — Nạp lại từ Lark

```
npm run db:nap-lai -- --nap
```

Lệnh chạy lần lượt NĂM bước: danh mục sản phẩm, khách và bộ ảnh, hợp đồng,
trạng thái chỉnh sửa, và **đồng bộ ảnh Drive cho mọi bộ** (bước mới từ
28/09/2026 — BB-311). Mỗi bước in ra số dòng/số ảnh nạp được.

Trước bản vá BB-311, `--nap` dừng lại ở bốn bước đầu — bộ ảnh có đủ khách, hợp
đồng, trạng thái, nhưng KHÔNG có lấy một tấm ảnh nào (`photo_count = 0` cho
mọi bộ). Bước năm gọi `npm run drive:sync -- --tat-ca --luong 1 --nghi-ms
300` — tuần tự (một bộ một lúc) và nghỉ 300ms giữa hai bộ, để không dồn cục
vào hạn mức Google Drive (10.000 lượt/100 giây) khi nạp lại hàng trăm bộ liên
tiếp. Bước này CHẬM (có thể nhiều phút với vài trăm bộ) — đây là đánh đổi có
chủ ý, ưu tiên an toàn quota hơn tốc độ.

Nếu một bước lỗi giữa chừng, lệnh DỪNG NGAY — các bước sau chưa chạy. Đọc
dòng lỗi, báo kỹ thuật, đừng tự chạy lại nhiều lần. Bước năm (đồng bộ Drive)
tự bỏ qua bộ lỗi và chạy tiếp các bộ khác (không dừng cả mẻ vì một thư mục
Drive hỏng) — xem `npm run drive:sync -- --tat-ca --lam-lai` để thử lại riêng
các bộ lỗi sau khi đã sửa bên Lark.

Nạp xong cả năm bước, mở thử app, kiểm vài bộ ảnh quen thuộc xem đúng chưa,
kiểm ảnh đã hiện (không chỉ kiểm tên/thông tin) rồi mới báo "đã mở cho
khách".

---

## Khôi phục từ bản sao lưu (khi bước 4 hỏng, hoặc xoá nhầm)

Nếu sau bước 3 mà bước 4 (nạp lại từ Lark) hỏng nặng, hoặc muốn quay lại đúng
dữ liệu trước khi xoá thay vì nạp lại từ Lark, dùng chính bản sao lưu đã tạo
ở bước 2:

```
npm run db:nap-lai -- --khoi-phuc "D:\BabyBean-sao-luu\2026-09-28T..."
```

Thay đường dẫn bằng đúng thư mục bản sao lưu muốn dùng (thư mục có tệp
`tong-so-dong.json` bên trong — chính là thư mục bước 2 đã tạo).

Lệnh đọc lại các tệp JSON của bản sao lưu và chèn từng dòng trở lại đúng bảng,
theo thứ tự an toàn với khoá ngoại, trong một giao dịch (hỏng giữa chừng thì
tự hoàn tác, không để lại nửa vời).

**Lệnh sẽ TỪ CHỐI** nếu các bảng đích ĐANG có dữ liệu (để không trùng khoá
chính hoặc trộn hai bộ dữ liệu khác thời điểm). Đường dùng bình thường: chạy
sau bước 3 (--xoa), khi các bảng đó đã rỗng. Muốn ghi đè dù đang có dữ liệu —
chỉ làm khi chắc chắn — thêm `--buoc-khoi-phuc` vào cuối lệnh.

Khôi phục xong, mở thử app kiểm lại như sau bước 4.

---

## Tóm tắt các lệnh

| Bước | Lệnh | Xoá dữ liệu? |
|---|---|---|
| 1. Đếm | `npm run db:nap-lai` | Không |
| 2. Sao lưu | `npm run db:nap-lai -- --sao-luu "..."` | Không |
| 3. Xoá | `npm run db:nap-lai -- --xoa --xac-nhan ... --that-su-la-bb-dev [--cung-don-dem-anh]` | **Có** |
| 4. Nạp lại (5 bước, kể cả ảnh Drive) | `npm run db:nap-lai -- --nap` | Không (chỉ ghi thêm) |
| (khi cần) Khôi phục | `npm run db:nap-lai -- --khoi-phuc "..."` | Không (chỉ ghi thêm) |

Làm đúng thứ tự 1 → 2 → 3 → 4. Không bỏ bước 2. Đã diễn tập trên bb-test
trước lần chạy thật đầu tiên (xem mục "Diễn tập" ở trên).
