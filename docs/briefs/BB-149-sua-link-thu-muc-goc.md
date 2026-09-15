# BB-149 — Sửa được link thư mục ảnh gốc khi nó sai

**Cửa sổ:** HẬU CẦN DỮ LIỆU (DEV-BE)
**Thư mục worktree:** `../bb-be-149`
**Nhánh:** `feat/bb-149-sua-link-thu-muc-goc`

---

## Vì sao có việc này

Chủ studio mở màn chi tiết một bộ ảnh ngày 15.09.2026 và hỏi: *"giao diện này
không có phần gán link Google Drive, luồng tự động hay gán tay"*.

Soát lại thì đúng. Thư mục ảnh gốc chỉ được đặt ở hai chỗ:

- **Wizard tạo bộ ảnh mới** — nhân viên dán link một lần lúc tạo.
- **Lệnh đồng bộ từ Lark** — lấy từ cột `Link ảnh gửi khách`.

Sau đó **không có đường nào sửa**. Ô nhập link duy nhất trên màn chi tiết tên là
"Link thư mục ảnh đã chỉnh", chỉ hiện khi trạng thái `in_retouch`, và đó là ảnh
**đã chỉnh** gửi khách ở cuối quy trình — không phải ảnh gốc.

Hậu quả thật, đo trong bb-dev: **77 bộ đang ở `sync_error`**. Nếu nguyên nhân là
link sai — thư mục bị đổi tên, bị xoá, hay Lark ghi nhầm ô — thì hôm nay nhân
viên chỉ bấm được "đồng bộ lại" đúng cái link sai đó, mãi mãi.

## Phải làm gì

Một đường ghi để **thay link thư mục gốc** của một bộ ảnh:

```
PATCH /api/admin/galleries/<id>/drive     body: { "driveUrl": "https://drive.google.com/drive/folders/..." }
```

1. Nhận link ở mọi dạng người ta hay dán: link thư mục thường, link có `?usp=sharing`,
   link bị Facebook bọc lại. Đã có sẵn `parseDriveFolderId` trong
   `src/lib/drive/parse-link` — **dùng lại, đừng viết mới**.
2. Link không bóc được mã thư mục thì trả `INVALID_INPUT` kèm câu tiếng Việt nói
   rõ sai ở đâu. Không bao giờ ghi một mã rỗng xuống.
3. Ghi `drive_folder_id` và `drive_folder_url`, rồi ghi một dòng `activity_logs`:
   ai đổi, từ thư mục nào sang thư mục nào. Đây là thao tác đổi **nguồn ảnh của
   một khách** — phải truy được.
4. Cùng một mã thư mục đã có ở bộ ảnh KHÁC thì **từ chối**, kèm mã hợp đồng của
   bộ kia. `uq_galleries_drive_folder` sẽ chặn ở tầng cơ sở dữ liệu, nhưng lỗi
   khoá trùng thì nhân viên đọc không hiểu.
5. Trả về đủ để màn hình hiện lại ngay: `{ driveFolderId, driveFolderUrl }`.

**Không làm trong task này**: phần giao diện (BB-150 của DEV-FE), và việc đồng bộ
lại — route `POST /api/admin/galleries/<id>/sync` đã có rồi, màn hình gọi tiếp.

## Ràng buộc

- Vùng được ghi: `src/app/api/admin/**`, `src/lib/selection/**`, `src/lib/supabase/**`.
  **Không sửa `src/lib/drive/**`** — đó là của DEV-INT, chỉ được gọi.
- Ai được đổi: theo `docs/05-rbac.md`. Cộng tác viên photoshop và kế toán thì
  không. Viết rõ vai nào được phép và vì sao.
- Bộ ảnh khách **đã chốt** (`submitted` trở đi) thì đổi nguồn ảnh là đổi thứ khách
  đã chọn xong. Quyết cho phép hay chặn, và ghi lý do vào mã.

## Xong là khi

- [ ] Phép thử: dán link đủ ba dạng (thường, `?usp=sharing`, link Facebook bọc)
      → đều bóc ra đúng mã thư mục
- [ ] Phép thử: link rác → `INVALID_INPUT`, và cơ sở dữ liệu **không đổi gì**
- [ ] Phép thử: mã thư mục trùng bộ khác → từ chối, câu báo có mã hợp đồng bộ kia
- [ ] Phép thử: vai không được phép → bị chặn
- [ ] **Kiểm chứng ngược**: bỏ phần ghi xuống thì các phép thử trên phải ĐỎ
- [ ] `npm run verify:own -- DEV-BE --base main`, `npm test`, `tsc`, `lint` sạch
