# BB-183 — Link phải thật sự hết hạn sau 2 tháng

**Cửa sổ: DEV-BE.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-be` — nhánh `agent/dev-be`.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Việc

Chủ studio chốt 17/09/2026 (`docs/13 §11`): **link xem ảnh có hiệu lực hai
tháng, tính từ ngày cấp link**.

Đo cùng ngày trên bb-dev: **0/15 link có `expires_at`**, **0 bộ ảnh có
`due_at`**, và không có đường nào tự cho link hết hạn. **Mọi link đang sống
vĩnh viễn.**

Màn khách đã có chỗ hiện con số này nhưng **cố ý chưa bật** (xem chú thích ở
chân `gallery-app.tsx`). In "2 tháng" lên trong khi link sống mãi là dạy khách
đừng tin những gì app nói. Việc của bạn là làm cho nó thành thật.

## Ba phần

**1. Đặt `expires_at` lúc cấp link.** Mốc là `share_links.created_at` cộng số
ngày lấy từ cấu hình. Áp cho cả đường tạo bộ ảnh lẫn đường cấp lại link
(BB-148).

**2. Số ngày nằm trong `settings`, không ghi cứng.** Bảng `settings` đã có sẵn
và đã có cột `branch_id`. Thêm khoá kiểu `gallery.link_ttl_days = 60`. Chủ
studio đổi chính sách thì sửa một dòng dữ liệu, không phải dựng lại bản web.

Đọc khoá này theo đúng cách BB-166 đã làm ở `/api/g/gallery`: lấy **đúng một
khoá**, kiểm kiểu, sai thì dùng giá trị mặc định. `settings` là bảng nhạy cảm
(`db/migrations/0038`) — đừng trả cả hàng, đừng trả cả bảng.

**3. Một đường chạy định kỳ đổi trạng thái link quá hạn.** Gộp BB-068. Hạ tầng
đã có: `/api/cron/sync-lark` là mẫu sẵn cho xác thực bằng `SYNC_CRON_SECRET` và
khoá chống chạy chồng.

## Ba chỗ dễ làm hỏng

**Link cũ đang sống vĩnh viễn thì xử thế nào?** 15 link hiện có đều không có
hạn. **Đừng lẳng lặng đặt hạn cho chúng** — có thể có khách đang xem dở. Đặt
hạn cho link **cấp từ nay trở đi**, và ghi vào bàn giao rằng 15 link cũ vẫn vô
hạn, để PM quyết riêng.

**Đường khách vào đã kiểm hạn nhưng chỉ cho link kiểu cũ.**
`/api/auth/gallery` có `const isLegacy = !link?.customer_id;` rồi mới xét
`expires_at`. Link gắn theo khách **bỏ qua phần kiểm hạn**. Mở rộng cho cả hai
kiểu, nhưng đọc kỹ ghi chú ở đó trước — nó có lý do lịch sử.

**Hết hạn thì chặn đúng cách.** Khách mở link quá hạn phải thấy một câu tiếng
Việt nói rõ phải làm gì (gọi studio xin link mới), **không phải** trang lỗi
trắng. Trang 404/500 tiếng Việt đã có từ BB-181 — dùng lại giọng đó.

## Tiêu chí xong

- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — **321/321** cộng ca bạn thêm.
- [ ] Phép thử theo `AGENTS.md §5a`: **hoàn nguyên bản vá thì phép thử phải
      ĐỎ**. Làm thật, dán cả hai kết quả vào bàn giao.
- [ ] Ít nhất bốn ca: link mới cấp có `expires_at` đúng 60 ngày; link quá hạn
      bị chặn; link chưa quá hạn vào được; đổi `gallery.link_ttl_days` thì số
      ngày đổi theo (đây là ca chứng minh không ghi cứng).
- [ ] Phép thử ghi vào cơ sở dữ liệu thì **trả lại giá trị cũ**.

**Kiểm ngược, bắt buộc:** `npm run dev`, tạo một bộ ảnh `Fixture BB-183`, cấp
link, rồi đọc thẳng cơ sở dữ liệu xem `expires_at` có đúng không. Sau đó lùi
`expires_at` về quá khứ và mở lại link — **phải bị chặn**. Dán cả hai kết quả
truy vấn, che tên khách.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
Dọn rác sau khi xong: `npm run db:cleanup`.
