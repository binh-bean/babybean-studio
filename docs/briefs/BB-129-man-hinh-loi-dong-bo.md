# BB-129 — Màn hình 77 bộ ảnh lỗi đồng bộ

**Cửa sổ:** DEV-FE
**Thư mục worktree:** `../bb-fe`
**Nhánh:** `feat/bb-129-loi-dong-bo`

---

## Vì sao có việc này

Ngày 14.09.2026 kéo ảnh thật từ Drive về: **350 bộ đồng bộ được, 77 bộ lỗi**,
tất cả cùng một lý do — thư mục chưa chia sẻ công khai.

Lỗi đã ghi vào `galleries.sync_error`, nhưng **không màn hình nào hiện nó**.
Hôm nay muốn biết bộ nào hỏng thì phải hỏi người chạy script. Khi CSKH đi sửa
quyền chia sẻ bên Drive, họ cũng không có cách nào bảo hệ thống thử lại.

## Phải làm gì

Một màn hình dưới `/admin/reports/loi-dong-bo`:

1. Danh sách bộ ảnh có `sync_error is not null`, **gom theo lý do lỗi** — một
   vấn đề lặp 77 lần khác hẳn 77 vấn đề khác nhau, và danh sách phẳng không
   phân biệt được hai chuyện đó.
2. Mỗi dòng: tên bộ, mã hợp đồng, chi nhánh, lý do, lần thử gần nhất, và link
   mở thư mục Drive (`galleries.drive_folder_url`) để CSKH bấm sang sửa quyền.
3. Nút **Thử lại** từng bộ, gọi `POST /api/admin/galleries/[id]/sync` (đã có).
4. Nút **Thử lại tất cả** trong nhóm cùng lý do — sửa quyền hàng loạt xong thì
   không ai muốn bấm 77 lần.

## Ràng buộc

- Lọc theo chi nhánh của nhân viên. Route chạy bằng service_role nên **đi vòng
  qua RLS** — phải tự lọc theo `staff.branchIds`, giống
  `src/app/api/admin/reports/over-quota/route.ts` đã làm.
- **Không** hiện tên khách hàng thật trên ảnh chụp màn hình đính PR. Kho mã
  nguồn là kho công khai.
- Người chỉnh ảnh (`photoshop_ctv`) không được vào màn này.

## Xong là khi

- [ ] Màn hình chạy được với dữ liệu thật trên bb-dev (đang có đúng 77 bộ lỗi)
- [ ] Bấm thử lại một bộ đã sửa quyền thì bộ đó biến khỏi danh sách
- [ ] Có phép thử cho đường lọc chi nhánh: nhân viên chi nhánh A không thấy bộ
      lỗi của chi nhánh B
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` sạch
