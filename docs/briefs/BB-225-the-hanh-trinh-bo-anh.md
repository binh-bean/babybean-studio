```
DÁN VÀO CỬA SỔ: GIAO DIỆN  (agent DEV-FE)
Thư mục:        C:\Users\binh\Downloads\claude code\babybean-dev-fe
Model:          Gemini 3.1 Pro
```

# BB-225 — Thẻ "Hành trình bộ ảnh" trên màn khách (dùng tranh banana BB-224)

## Trước khi bắt đầu — bắt buộc

```
git fetch origin
git checkout -B feat/BB-225-hanh-trinh origin/main
npm ci
```

## Mục tiêu

Sau khi ba mẹ chốt ảnh, màn khách hiện nay chỉ có một dòng chữ trạng thái. Chủ
studio muốn ba mẹ "wow" hơn: một **thẻ hành trình** có tranh minh hoạ màu nước,
cho biết bộ ảnh đang ở đâu trong chặng chỉnh → duyệt → in → giao.

## Tài nguyên đã có (Claude đã chuẩn bị, KHÔNG sinh thêm ảnh)

`public/hanh-trinh/<ten>-320.webp` và `<ten>-640.webp` (vuông, nền kem #f5efe6),
dùng `srcSet` 320w/640w:

| Tên tranh | Khi nào hiện |
|---|---|
| `tien-do-chon-anh` | đang chọn (status `ready`/`in_review`) — CHỈ dùng trong danh sách bước, không hiện thẻ |
| `chot-thanh-cong` | vừa chốt: status `submitted` |
| `tien-do-ghi-nhan` | `giaiDoanTienDo` = 2 |
| `tien-do-chinh-sua` | 3, 4, 6 |
| `tien-do-duyet` | 5, 7 — và status `awaiting_approval` (bất kể giai đoạn) |
| `tien-do-in` | 8 |
| `tien-do-da-ve` | 9 |
| `tien-do-da-giao` | 10, 11 — và status `delivered` |
| `chua-co-anh` | bộ ảnh chưa có tấm nào (`photoCount === 0`) — thay trạng thái rỗng hiện nay |
| `link-het-han` | trang link hết hạn / bị thu hồi trong `src/app/(customer)/g/[token]/page.tsx` |

API `/api/g/gallery` đã trả `status`, `nhanTienDo` (chuỗi cho khách) và
**`giaiDoanTienDo`** (số 2–11 hoặc null). Dùng đúng `nhanTienDo` làm dòng chữ
chính; `null` thì giữ câu hiện có theo `status` (xem `review-panel.tsx`).

## Việc cần làm

1. **Hàm thuần** `src/lib/gallery/hanh-trinh.ts`:
   `tranhHanhTrinh(status, giaiDoan) → ten | null` theo bảng trên, và
   `buocHanhTrinh(status, giaiDoan) → { buoc: 5 bước, hienTai: 0–4 }` với 5 bước:
   **Chọn ảnh · Chỉnh sửa · Duyệt · In · Nhận ảnh**. Không in → sau duyệt nhảy
   thẳng "Nhận ảnh" là CHẤP NHẬN được (chưa có cờ "có in"); ghi chú rõ điều đó.
2. **Component** `src/components/features/gallery/the-hanh-trinh.tsx`: tranh
   (tối đa 160px điện thoại / 200px máy tính), `nhanTienDo`, và dải 5 chấm/bước
   (bước đã qua đậm, bước hiện tại có vòng nhẹ, bước chưa tới nhạt). Hiện ở màn
   khách **khi status từ `submitted` trở đi**, đặt ngay trên `ReviewPanel` (hoặc
   đúng chỗ dòng trạng thái đang nằm khi không có review). Ảnh `alt=""`
   (trang trí), `loading="lazy"`, có `width/height` để không nhảy bố cục.
   Chuyển động: tranh mờ dần vào 300ms, TẮT khi `prefers-reduced-motion`.
3. Trạng thái rỗng (0 ảnh) và trang link hết hạn: thay biểu tượng/khối trống hiện
   có bằng tranh tương ứng, GIỮ NGUYÊN chữ và nút đang có.
4. Phong cách: đồng bộ BB-212 (Fraunces cho chữ lớn, nền kem, viền mảnh). Không
   thêm thư viện. Chuỗi hiển thị trong `src/i18n/vi.ts`.

## Luật bắt buộc

1. **Chỉ sửa giao diện.** KHÔNG sửa `src/app/api/**`, KHÔNG viết migration,
   KHÔNG chạy SQL hay sửa hàm/bảng trên bb-dev.
2. **Cơ sở dữ liệu là dữ liệu THẬT.** Phép thử chỉ tạo dòng tên bắt đầu
   `Fixture BB-225`, xoá sạch trong `afterAll`. Muốn giả `lark_trang_thai` thì
   ghi thẳng mã (vd `optmhzW4sL` = "Đang làm") vào bộ ảnh Fixture — KHÔNG đụng
   bộ ảnh thật.
3. Playwright LUÔN `$env:PW_PORT=3170`. Không dùng 3099/3100.
4. Số điện thoại giả MỚI mỗi lượt (biến `soGia` như `tests/e2e/bb-217-218-so-sanh-treo-tuong.spec.ts`).
5. Không đăng nhập tài khoản thật. Không lách khi bị chặn quyền — dừng, dán nguyên văn.
6. Phép thử đỏ vì lỗi thật → ghi mục "Lỗi thật" kèm ảnh chụp; không nới phép thử.
7. Ghi chú trong mã tiếng Việt, nói VÌ SAO. `npm run lint` 0 lỗi, không `as any`.
8. Ảnh chụp chỉ dùng bộ ảnh Fixture — KHÔNG chụp bộ ảnh khách thật.

## Phép thử

- **Vitest** `tests/unit/bb-225-hanh-trinh.test.ts`: mọi dòng của bảng trên
  (kể cả `awaiting_approval` thắng giai đoạn, `delivered` thắng giai đoạn thấp,
  giai đoạn null khi `in_retouch` → `tien-do-ghi-nhan`, `ready` → không thẻ).
- **E2E** `tests/e2e/bb-225-hanh-trinh.spec.ts`: bộ Fixture status `in_retouch`
  + `lark_trang_thai = 'optmhzW4sL'` → thẻ hiện, `img` có `src` chứa
  `tien-do-chinh-sua`, chữ "Đang chỉnh sửa", bước "Chỉnh sửa" là bước hiện tại
  (`aria-current="step"`). Đổi sang `optxMAdtNX` (Đã gửi in), tải lại → tranh
  `tien-do-in`. Bộ status `ready` → KHÔNG có thẻ. Chạy ở 390×844 và 1440×900.
- KIỂM NGƯỢC: làm hỏng hàm ánh xạ (vd đổi 8 → chinh-sua) → e2e + vitest phải
  ĐỎ → hoàn lại. Dán cả hai kết quả.

## Xong khi

1. `npx tsc --noEmit -p tsconfig.json`, `npm run lint` (0 lỗi), vitest tệp mới,
   `npx playwright test tests/e2e/bb-225-hanh-trinh.spec.ts` với PW_PORT=3170 —
   **dán nguyên kết quả và mã thoát**.
2. Ảnh chụp thẻ ở 3 giai đoạn (chỉnh sửa / in / đã giao), điện thoại + máy tính.
3. Truy vấn chứng minh không còn dòng `Fixture BB-225`.
4. **Commit** trên `feat/BB-225-hanh-trinh` (lần trước agent quên commit), KHÔNG
   gộp `main`, KHÔNG push.
