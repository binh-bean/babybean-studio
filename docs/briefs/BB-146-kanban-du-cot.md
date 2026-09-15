# BB-146 — Kanban đang giấu mất 77 bộ ảnh

**Cửa sổ:** GIAO DIỆN
**Thư mục worktree:** `../bb-fe-146`
**Nhánh:** `feat/bb-146-kanban-du-cot`

---

## Vì sao có việc này

Chủ studio nói ngày 15.09.2026: *"kanban đang không hiển thị hết các trạng thái"*.

Cơ sở dữ liệu có **10 trạng thái** trong `gallery_status`. Bảng Kanban ở
`gallery-list.tsx` dựng **5 cột**: `ready`, `in_review`, `submitted`,
`in_retouch`, `delivered`.

Đếm dữ liệu thật trong bb-dev lúc soát:

| Trạng thái | Số bộ | Có cột trên Kanban? |
|---|---|---|
| `ready` | 356 | có |
| **`sync_error`** | **77** | **KHÔNG** |
| `in_review` | 2 | có |
| `submitted` | 1 | có |

**77 bộ ảnh lỗi tải đang biến mất khỏi bảng** — đúng 77 bộ mà màn "Bộ ảnh lỗi
tải" sinh ra để xử lý. Một phần năm số bộ ảnh không thấy đâu, mà nhân viên không
có cách nào biết là mình đang nhìn thiếu.

## Phải làm gì

1. Thêm ba cột: **Mới nhập** (`draft`), **Lỗi tải ảnh** (`sync_error`),
   **Quá hạn** (`expired`).
2. Không thêm `syncing` (chỉ sống vài giây trong lúc đọc Drive) và `archived`
   (đã cất đi). Nhưng **phải có lối thấy chúng**: một dòng đếm nhỏ, hoặc bộ lọc
   trạng thái vẫn liệt kê đủ 10 giá trị. Cấm để bộ ảnh biến mất không dấu vết.
3. Cột `sync_error` bấm vào đi thẳng sang màn "Bộ ảnh lỗi tải" đã có sẵn.
4. Kanban 8 cột trên màn hình 1280px sẽ chật: cuộn ngang, đừng bóp cột đến mức
   không đọc được tên khách.

## Ràng buộc

- Chỉ đụng phần hiển thị. **Không đổi `gallery_status`** — đó là hợp đồng chung
  ở `db/schema.sql` và `src/types/domain.ts`, thuộc ARCH.
- Đếm số trên mỗi cột phải lấy từ `counts` mà API trả về, không tự đếm trên phần
  đã tải — danh sách có phân trang, đếm tay là ra số sai.
- Vùng được ghi: `src/components/features/**`, `src/app/(admin)/**`.

## Xong là khi

- [ ] Đủ 8 cột, mỗi cột có số đếm đúng
- [ ] Mở Kanban trên bb-dev: **77 bộ `sync_error` hiện ra**, không còn mất tích
- [ ] Không bộ ảnh nào ở 10 trạng thái mà không có đường nào nhìn thấy được
- [ ] `npm run verify:own -- DEV-FE --base main`, `npm run verify:wired`,
      `npm test`, `tsc`, `lint` sạch
