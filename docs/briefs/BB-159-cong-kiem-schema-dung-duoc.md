# BB-159 — Cổng kiểm: `schema.sql` phải dựng nổi một cơ sở dữ liệu trống

**Cửa sổ:** KIẾN TRÚC
**Thư mục worktree:** `../bb-arch-159`
**Nhánh:** `feat/bb-159-cong-kiem-schema`

---

## Vì sao có việc này

Ngày 15.09.2026, dựng `bb-prod` từ một cơ sở dữ liệu trống làm lộ ra rằng
`db/schema.sql` — tệp được cả dự án coi là **hợp đồng chung** — **không dựng nổi
một cơ sở dữ liệu trống**. Bốn chỗ đã trôi, không chỗ nào thấy được từ `bb-dev`:

1. tham chiếu bảng `products` và `gallery_items` ở khoá ngoại nhưng không tạo
   chúng — hai bảng chỉ có trong `migrations/0014`;
2. gọi `app.gallery_quota()` trong ba khung nhìn mà không định nghĩa;
3. không tệp nào tạo `schema app` — `bb-dev` có nó vì ai đó từng gõ tay;
4. `policies.sql` còn một chính sách mà `migrations/0037` đã cố ý xoá — hai
   chính sách PERMISSIVE thì OR với nhau, **cái lỏng thắng**.

BB-138 đã vá cả bốn. Nhưng không có gì ngăn chuyện đó xảy ra lại: lần sau ai đó
thêm một hàm trong migration rồi dùng nó trong `schema.sql` là trôi tiếp, và chỉ
lộ ra vào lần dựng cơ sở dữ liệu tiếp theo — có thể là một năm sau, lúc cần dựng
gấp vì sự cố.

## Phải làm gì

Một cổng chạy được bằng `npm run verify:schema`, và **phải chạy với một cơ sở dữ
liệu trống thật**, không phải đọc tệp đoán mò:

1. Dựng một schema tạm trong chính cơ sở dữ liệu thử (`create schema <tên ngẫu
   nhiên>`), đặt `search_path` vào đó, rồi nạp `db/schema.sql` + `db/policies.sql`
   + toàn bộ `db/migrations/**` theo đúng thứ tự `scripts/setup-prod.mjs` dùng.
2. Xong thì **xoá sạch schema tạm**, kể cả khi giữa chừng hỏng.
3. Hỏng ở đâu thì in ra ĐÚNG câu lệnh và ĐÚNG tệp, rồi thoát khác 0.
4. Kiểm luôn hai thứ mà BB-138 phải kiểm bằng tay: `get_admin_galleries` và
   `patch_selection_batch` có tồn tại sau khi dựng không.
5. Nối vào `npm run verify` để không ai phải nhớ chạy nó.

## Ràng buộc

- **Không được đụng vào dữ liệu của `bb-dev`.** Mọi thứ nằm trong schema tạm và
  bị xoá sau. Nếu không chắc xoá sạch được thì dừng lại và báo, đừng thử.
- Dùng lại bộ nạp tự hội tụ đã có trong `scripts/setup-prod.mjs`, đừng viết bản
  thứ hai — hai bản nạp khác nhau là hai kết quả khác nhau sau một tháng.
- Vùng được ghi: `scripts/**`, `package.json` (khối `scripts`), `docs/**`.

## Xong là khi

- [ ] `npm run verify:schema` xanh trên `main` hiện tại
- [ ] **Kiểm chứng ngược**: bỏ dòng `create schema app` khỏi `schema.sql` thì cổng
      phải ĐỎ và in ra đúng câu lệnh hỏng. Hoàn nguyên sau khi kiểm.
- [ ] Chạy xong, `bb-dev` không còn schema tạm nào: đếm và ghi số vào báo cáo
- [ ] `npm run verify:own -- ARCH --base main`, `npm test`, `tsc`, `lint` sạch
