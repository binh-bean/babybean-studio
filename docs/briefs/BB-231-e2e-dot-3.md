```
DÁN VÀO CỬA SỔ: GIAO DIỆN  (agent DEV-FE)
Thư mục:        C:\Users\binh\Downloads\claude code\babybean-dev-fe
Model:          Gemini (bản mạnh nhất cửa sổ đang có)
```

# BB-231 — Kịch bản thử trình duyệt đợt 3 (E-8 mở lại, E-11 bộ 1.000 ảnh)

## Trước khi bắt đầu — bắt buộc

```
git fetch origin
git checkout -B feat/BB-231-e2e-dot-3 origin/main
npm ci
```

Nhánh BB-230 của bạn đã được gộp (có sửa). Đọc bản ĐÃ GỘP của
`tests/e2e/e3-ghi-chu.spec.ts`, `e10-da-chi-nhanh.spec.ts`, `e12-dien-thoai.spec.ts`
trên `main` trước — đó là khuôn mẫu cho việc này.

## Bài học từ BB-230 — đừng lặp lại

Lượt trước báo "xong" nhưng chạy lại thì 2/7 ĐỎ:

1. **Vai nhân viên đoán sai tên.** Kiểu `staff_role` chỉ có: `owner`, `admin`,
   `branch_manager`, `cs`, `photographer`, `retoucher`, `accountant`, `viewer`,
   `photoshop_ctv` (xem `db/schema.sql`). CSKH là `cs`, không phải `cskh`.
2. **Phép thử đỏ vì lỗi THẬT của app mà báo cáo không nhắc.** E-3 đỏ vì ghi chú
   của khách chưa từng lưu được — đó là phát hiện quý nhất của cả đợt. Phép thử
   đỏ thì MỞ ẢNH CHỤP LỖI, đọc nhật ký máy chủ (`PATCH … 400`), rồi ghi vào báo
   cáo mục "Lỗi thật của app". KHÔNG sửa `src/`, KHÔNG nới phép thử cho xanh.
3. **Không thay thao tác bằng đường tắt.** Đề bài nói "vuốt" thì phải vuốt; lượt
   trước dùng phím mũi tên. Cách vuốt đúng xem `e12-dien-thoai.spec.ts`
   (phát `TouchEvent` lên vùng ảnh).
4. **Dọn dữ liệu đúng thứ tự.** Xoá `selections` TRƯỚC `galleries`; xoá
   `staff_branches` TRƯỚC `staff_profiles`. Thiếu là bộ thử nằm lại trong cơ sở
   dữ liệu thật.
5. **Dán kết quả và mã thoát thật**, không kể lại.

## Luật riêng của việc này

1. **Chỉ THÊM phép thử** trong `tests/e2e/` (và `tests/e2e/helpers/`). KHÔNG sửa
   `src/`.
2. **Luôn chạy với cổng riêng:** PowerShell `$env:PW_PORT=3170` trước mọi lệnh
   `npx playwright test`. Cổng 3099/3100 là của người khác.
3. **Cơ sở dữ liệu là dữ liệu THẬT.** Chỉ tạo dữ liệu tên bắt đầu bằng
   `Fixture BB-231` và nhân viên thử (email `test_bb231_…@demo.babybean.vn`); xoá
   sạch trong `afterAll`. KHÔNG đăng nhập bằng tài khoản thật, KHÔNG đoán mật khẩu.
4. **Không lách khi bị chặn.** Lệnh bị từ chối quyền → dừng, dán nguyên văn.
5. Ghi chú trong mã tiếng Việt, nói VÌ SAO.

## Kịch bản

### E-8 Mở lại (`tests/e2e/e8-mo-lai.spec.ts`)

Quyết định 25/09/2026: **CSKH (vai `cs`) được mở lại**, luôn phải ghi lý do.

| Bước | Khẳng định |
|---|---|
| Bộ ảnh thử của chi nhánh A, 3 ảnh, khách đã chọn 2 và **chốt** (trạng thái `submitted`) — dựng bằng giao diện khách như `e2-vuot-han-muc.spec.ts`, không chèn thẳng trạng thái | `galleries.status = 'submitted'` |
| Nhân viên thử vai `cs` của chi nhánh A đăng nhập, mở `/admin/galleries/<id>` | Thấy mục "Mở lại cho khách chọn tiếp" |
| Để trống lý do | Nút "Mở lại cho khách chọn" bị khoá (`disabled`) |
| Gõ lý do "Fixture BB-231 khách xin đổi 1 tấm" → bấm nút | `galleries.status` về `in_review`; `reopened_at` có giá trị; `reopen_reason` đúng câu đã gõ |
| Nhật ký | Có dòng `activity_logs` với `action = 'gallery.reopen'`, `entity_id` = bộ ảnh |
| Khách mở lại link | Nút tim bấm được; bỏ chọn 1 tấm, chọn tấm thứ 3, chốt lại → `submitted` |
| Bộ `expired` (quá hạn) | Làm lại bước mở lại với một bộ thứ hai đặt `status='expired'`, `due_at` đã qua → mở lại xong thì `due_at` phải được DỜI ra sau hiện tại (không thì cron đóng lại ngay trong ngày) |

### E-11 Bộ ảnh lớn (`tests/e2e/e11-bo-anh-lon.spec.ts`)

| Bước | Khẳng định |
|---|---|
| Bộ ảnh thử **1.000 ảnh** (chèn lô bằng một câu `insert … select generate_series(1,1000)`, tên `BB231_0001.jpg`…) | 1.000 dòng `photos` |
| Khách mở link, khung 1280×720 | Lưới hiện |
| Cuộn tới CUỐI trang (lặp `mouse.wheel` từng bước, chờ giữa các bước) | Thấy thẻ ảnh có tên `BB231_1000.jpg` |
| Số thẻ ảnh đang dựng trong DOM (`getByTestId("the-anh")`) ở mọi thời điểm | **Luôn dưới 200** — lưới là lưới ảo, chỉ dựng phần đang nhìn. Đo ở đầu, giữa, cuối |
| Bộ nhớ JS (`performance.memory.usedJSHeapSize`, Chromium có) sau khi cuộn xuống rồi lên lại 3 lượt | Không tăng quá 2 lần so với lúc vừa tải xong |
| Mở màn xem lớn ở tấm cuối, vuốt/phím sang trái 5 tấm | Không lỗi trang (`page.on("pageerror")` rỗng) |

Chèn 1.000 dòng phải xong trong `beforeAll` dưới 30 giây; `afterAll` xoá sạch.

## KHÔNG làm trong việc này

- E-4 (PIN) — mã PIN đã bỏ từ BB-169.
- E-5 (mời người thân) — chờ chủ studio chốt quyền của ông bà.
- E-6 (ngắt mạng) — app **chưa có** hàng chờ khi mất mạng; không viết phép thử
  cho tính năng chưa có.

## Xong khi

1. Hai tệp `e8-mo-lai.spec.ts`, `e11-bo-anh-lon.spec.ts`.
2. `npx playwright test tests/e2e/e8-mo-lai.spec.ts tests/e2e/e11-bo-anh-lon.spec.ts`
   với `PW_PORT=3170` — **dán nguyên phần kết quả và mã thoát**.
3. **Kiểm ngược từng kịch bản** bằng DỮ LIỆU (không sửa `src/`): E-8 — cho nhân
   viên thử vai `photographer` thay vì `cs` → phải ĐỎ (không có mục mở lại / 403);
   E-11 — chèn 150 ảnh thay vì 1.000 → khẳng định "thấy `BB231_1000.jpg`" phải ĐỎ.
   Ghi lại từng lần kèm dòng báo đỏ.
4. Truy vấn và kết quả chứng minh không còn dòng nào tên `Fixture BB-231`.
5. Commit trên nhánh `feat/BB-231-e2e-dot-3`, KHÔNG gộp `main`, KHÔNG push.

Báo cáo: danh sách tệp, kết quả chạy có mã thoát, các lần kiểm ngược, **lỗi thật
của app** (kèm ảnh chụp + dòng nhật ký máy chủ).
