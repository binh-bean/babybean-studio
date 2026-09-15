# BB-138 — Dựng `bb-prod`, tách dữ liệu khách khỏi máy móc thử nghiệm

**Cửa sổ:** ARCH
**Thư mục worktree:** `../bb-arch-138`
**Nhánh:** `feat/bb-138-bb-prod`

---

## Vì sao có việc này

`docs/16` mục 7.3 chốt che tên khách và số điện thoại, vì `bb-dev` là cơ sở dữ
liệu **dùng chung cho PM và toàn bộ agent**, phép thử xoá dòng trong đó, và kho
mã nguồn là kho **công khai**. Cùng tài liệu ghi sẵn điều kiện mở lại: **khi
dựng `bb-prod`**.

Ngày 15.09.2026 chủ studio chốt đi đường đó. Lý do từ phía vận hành: màn quản lý
đang hiện `KH · HD_20260912#5096` trong khi Lark có sẵn tên khách, số điện thoại,
chi nhánh, ngày chụp, tên bé — nhân viên phải tra ngược sang Lark mới biết là nhà
nào, hoặc nhập tay lại.

## Phải làm gì

Việc này **agent không chạy được lệnh cuối** — xem phần ràng buộc. Việc của ARCH
là làm sao để PM chạy được một lệnh duy nhất và kiểm chứng được kết quả.

1. Một script dựng nền cho một cơ sở dữ liệu trống: `db/schema.sql`, toàn bộ
   `db/migrations/**` theo đúng thứ tự, rồi `db/policies.sql`. Chạy được nhiều
   lần mà không hỏng.
2. Một script gieo dữ liệu nền: chi nhánh, sản phẩm, thiết lập — lấy từ
   `db/seed.sql`, mang đủ 7 quyết định vận hành ở `docs/13`. **Không** chép dữ
   liệu khách từ `bb-dev` sang: bên đó tên đã bị che, chép sang là chép rác.
   Dữ liệu khách sẽ do BB-139 kéo thẳng từ Lark.
3. Một bảng kiểm PM làm theo được, ghi rõ từng bước bấm ở Supabase và từng biến
   phải đổi bên Vercel.
4. Cách chứng minh đã xong: `npm run verify:db` và 14 ca RBAC ở `docs/05-rbac.md`
   mục 6 phải chạy được **trỏ vào bb-prod** bằng biến môi trường, không sửa mã.

## Ràng buộc

- **Agent không được cấp khoá `bb-prod`.** Đây là điều kiện đã ghi trong
  `docs/16` mục 7.3 và là lý do duy nhất khiến việc mở tên thật trở nên chấp
  nhận được. Mọi lệnh chạm `bb-prod` do PM chạy, agent viết script và bảng kiểm.
- `bb-dev` **giữ nguyên** và giữ nguyên dữ liệu đã che: đó vẫn là nơi agent chạy
  `npm test`. Không có chuyện dời phép thử sang `bb-prod`.
- `db/policies.sql` thuộc SEC-ARCH. Cần đổi thì mở việc cho SEC-ARCH, đừng tự sửa.
- Đổi biến Supabase bên Vercel là đổi cơ sở dữ liệu của bản đang chạy thật. Bảng
  kiểm phải nói rõ thứ tự để không có khoảng thời gian app trỏ vào nơi trống.

## Xong là khi

- [ ] PM chạy được bảng kiểm từ đầu tới cuối trên một project Supabase trống
- [ ] `npm run verify:db` xanh khi trỏ vào `bb-prod`
- [ ] 14 ca RBAC đạt khi trỏ vào `bb-prod`
- [ ] `bb-dev` không bị đụng tới: `npm test` vẫn xanh như cũ
- [ ] `npm run verify:own -- ARCH --base main`, `npm test`, `tsc`, `lint` sạch
