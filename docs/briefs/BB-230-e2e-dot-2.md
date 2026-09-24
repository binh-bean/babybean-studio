```
DÁN VÀO CỬA SỔ: GIAO DIỆN  (agent DEV-FE)
Thư mục:        C:\Users\binh\Downloads\claude code\babybean-dev-fe
Model:          Gemini (bản mạnh nhất cửa sổ đang có)
```

# BB-230 — Kịch bản thử trình duyệt đợt 2 (E-2, E-3, E-7, E-9, E-10, E-12)

## Trước khi bắt đầu — bắt buộc

```
git fetch origin
git checkout -B feat/BB-230-e2e-dot-2 origin/main
npm ci
```

Thư mục của bạn đang chậm hơn `main` nhiều ngày. Làm trên nền cũ là viết phép
thử cho một giao diện đã không còn.

## Luật riêng của việc này

1. **Chỉ THÊM phép thử** trong `tests/e2e/` (và hàm dùng chung trong
   `tests/e2e/helpers/`). KHÔNG sửa mã trong `src/`. Phép thử đỏ vì lỗi thật
   của app → dừng, ghi vào báo cáo (tệp, bước, ảnh chụp lỗi), không tự sửa app.
2. **Luôn chạy với cổng riêng:** `set PW_PORT=3170` (PowerShell:
   `$env:PW_PORT=3170`) trước mọi lệnh `npx playwright test`. Cổng 3099 và 3100
   là của người khác; cùng cổng thì Playwright dùng lại máy chủ của họ và phép
   thử chạy trên MÃ KHÁC mà vẫn báo xanh.
3. **Cơ sở dữ liệu là dữ liệu THẬT.** Chỉ tạo dữ liệu tên bắt đầu bằng
   `Fixture BB-230` và tài khoản nhân viên thử; xoá sạch trong `afterAll`.
   KHÔNG đăng nhập bằng tài khoản thật, KHÔNG đoán mật khẩu. Cách làm mẫu:
   `tests/e2e/bb-186-link-sap-het-han.spec.ts`, `tests/e2e/bb-060-screenshots.spec.ts`,
   `tests/e2e/e1-vong-doi-hanh-phuc.spec.ts`.
4. **Không lách khi bị chặn.** Lệnh nào bị từ chối quyền → dừng, dán nguyên
   văn thông báo vào báo cáo.
5. Ghi chú trong mã tiếng Việt, nói VÌ SAO.

## Giao diện hiện tại — dùng đúng những chỗ bám này

| Việc | Chỗ bám |
|---|---|
| Ô ảnh trong lưới | `getByTestId("the-anh")` |
| Nút thả tim | `button[aria-label="Chọn ảnh này"]` (đã chọn: "Bỏ chọn") |
| Bộ đếm đã chọn (thanh đáy) | `getByTestId("dem-da-chon")` |
| Mở hộp chốt | `getByRole("button", { name: "Chốt danh sách" })` |
| Tên người xác nhận | `#confirm-name-input` (điền sẵn tên khách) |
| Ô đồng ý | `getByRole("checkbox")` trong hộp chốt |
| Ghi chú chung | `#customer-note-input` |
| Xác nhận | `getByRole("button", { name: "Xác nhận" })` |
| Đầu trang khách | `#dau-luoi-anh` |

Mã PIN đã BỎ từ BB-169 — mọi dòng nói PIN trong docs/10 đã lỗi thời.

## Kịch bản (theo docs/10-testing-qa.md §5, sửa cho khớp app hôm nay)

| # | Làm gì | Khẳng định |
|---|---|---|
| **E-2 Vượt hạn mức** | Bộ ảnh thử hạn mức 5 (gắn dòng "Edit file" số lượng 5), chọn 7 tấm | Thanh đáy hiện "7 / 5 tấm" và phụ phí; chốt được; trong cơ sở dữ liệu `selections` của bộ có số ảnh thêm = 2 |
| **E-3 Ghi chú** | Ghi chú cho 3 tấm (màn xem lớn → "Ghi chú") + ghi chú chung khi chốt | Nhân viên tải tệp xuất (`/api/admin/galleries/<id>/export`) có đủ 3 ghi chú và ghi chú chung |
| **E-7 Bộ đã khoá** | Đặt trạng thái bộ thử là `in_retouch` | Không có nút thả tim nào bấm được; thanh đáy là "Yêu cầu sửa lại" |
| **E-9 Link hết hạn** | Link thử `status = revoked`, và một link `expires_at` đã qua | Trang báo hết hạn thân thiện, KHÔNG hiện ảnh nào |
| **E-10 Đa chi nhánh** | Nhân viên thử vai CSKH của chi nhánh A | Danh sách bộ ảnh không có bộ thử của chi nhánh B; mở thẳng địa chỉ bộ B bị chặn |
| **E-12 Điện thoại** | Khung 375×812, chạm: thả tim, mở màn xem lớn, vuốt sang tấm sau, chốt | Mọi bước chạy; bộ đếm đúng |

## Xong khi

1. Mỗi kịch bản một tệp `tests/e2e/e2-…spec.ts` … `e12-…spec.ts`.
2. `npx playwright test tests/e2e/e2-* tests/e2e/e3-* tests/e2e/e7-* tests/e2e/e9-* tests/e2e/e10-* tests/e2e/e12-*`
   với `PW_PORT=3170` — **dán nguyên phần kết quả và mã thoát**, không kể lại.
3. **Kiểm ngược từng kịch bản:** làm hỏng thứ nó canh bằng dữ liệu (ví dụ E-9:
   để link còn `active`) → phép thử phải ĐỎ. Ghi lại từng lần.
4. Sau khi chạy, kiểm cơ sở dữ liệu không còn dòng nào tên `Fixture BB-230`
   (dán câu truy vấn và kết quả).
5. Commit trên nhánh `feat/BB-230-e2e-dot-2`, KHÔNG gộp vào `main`, KHÔNG push
   — Claude soát và gộp.

Báo cáo: danh sách tệp, kết quả chạy có mã thoát, các lần kiểm ngược, lỗi
thật của app nếu gặp (kèm ảnh chụp).
