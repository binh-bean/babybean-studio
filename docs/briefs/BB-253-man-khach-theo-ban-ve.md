```
DÁN VÀO CỬA SỔ: GIAO DIỆN  (agent DEV-FE)
Thư mục:        C:\Users\binh\Downloads\claude code\babybean-dev-fe
Model:          Gemini 3.1 Pro
```

# BB-253 — Dựng lại màn khách cho khớp bộ bản vẽ chuẩn (banana BB-251)

## Trước khi bắt đầu — bắt buộc

```
git fetch origin
git checkout -B feat/BB-253-theo-ban-ve origin/main
npm ci
```

## Mục tiêu

Chủ studio: "dùng banana tối đa để có giao diện chuẩn thiết kế". Chủ studio đã
vẽ bằng Gemini một bộ bản vẽ chuẩn ở `docs/thiet-ke/` — mở từng tấm ra XEM KỸ
trước khi code:

| Bản vẽ | Màn trong app |
|---|---|
| `he-thiet-ke.webp` | Hệ màu, chữ, nút, ô nhập, chấm tiến độ — nguồn cho token |
| `man-bia.webp` | Bìa bộ ảnh điện thoại (`bia-bo-anh.tsx`) |
| `man-luoi-anh.webp` | Lưới ảnh + bộ lọc + thanh chọn dưới (`luoi-anh.tsx`, `thanh-chon.tsx`, header trong `gallery-app.tsx`) |
| `man-xem-lon.webp` | Xem lớn một tấm (`photo-lightbox.tsx`) |
| `man-hanh-trinh.webp` | Thẻ hành trình + thẻ mời mua (`the-hanh-trinh.tsx`, `moi-mua-lan-hai.tsx`) |
| `man-cua-hang.webp` | Cửa hàng (`cua-hang.tsx`) |
| `man-khach-may-tinh.webp` | Màn khách trên máy tính: bìa trái, lưới phải |

**Lấy từ bản vẽ:** bố cục, màu, cỡ và kiểu chữ, khoảng trắng, bo góc, độ dày
viền, kiểu nút viên tròn, cách đặt icon. **KHÔNG lấy:** chữ trong bản vẽ (Gemini
viết tiếng Anh/sai chính tả — giữ nguyên toàn bộ chữ tiếng Việt hiện có), giá
tiền đô la, tên album mẫu, nhãn bộ lọc tiếng Anh. Nút "Checkout" ở bản vẽ cửa
hàng bị vẽ màu navy — SAI hệ, dùng màu mực #2E2A27 như mọi nút chính khác.

## Việc cần làm

1. **Token trước** (`src/styles/tokens.css`, `src/styles/**` — chỉ thêm/chỉnh
   giá trị, không đổi tên biến đang dùng): nền kem #FBF7F2, mực #2E2A27, hồng
   đất #C4645A (tim đã chọn, điểm nhấn), hồng phấn #E8A598, rêu #4F5B45, sage
   #7FA99B. Nút chính = viên tròn nền mực chữ kem; nút phụ = viền mảnh. Tiêu đề
   serif (Playfair Display đã nạp trong `src/app/layout.tsx`), chữ thường Be
   Vietnam Pro. Chế độ tối giữ nguyên tinh thần hiện có.
2. Làm từng màn theo bảng trên, **mỗi màn một commit** (dễ soát, dễ hoàn lại):
   bìa → lưới + thanh chọn → xem lớn → hành trình + mời mua → cửa hàng → máy tính.
3. Chỉ đổi GIAO DIỆN. Giữ nguyên props, hành vi, `aria-*`, `role`, chuỗi
   `data-testid` và chữ mà phép thử đang bám — phép thử cũ PHẢI xanh.
4. Mọi thứ bấm được có con trỏ bàn tay; ảnh dùng đúng cỡ máy chủ nhận
   (`THUMBNAIL_WIDTHS` trong `src/types/domain.ts`: 200/400/800/1600/2048 —
   lần trước agent xin w=300 làm vỡ cả lưới ảnh).

## Luật bắt buộc

1. KHÔNG sửa `src/app/api/**`, KHÔNG migration, KHÔNG chạy SQL, KHÔNG sửa
   hàm/bảng trên bb-dev.
2. Không thêm thư viện. Không ảnh mới — dùng tranh có sẵn `public/hanh-trinh/`,
   `public/san-pham/`.
3. Playwright LUÔN `$env:PW_PORT=3170`. Không dùng 3099/3100/3164.
4. bb-dev là dữ liệu THẬT: chỉ chụp màn hình bộ ảnh `Fixture`, KHÔNG chụp bộ ảnh
   khách thật; ảnh chụp không commit.
5. Không đăng nhập tài khoản thật. Không lách khi bị chặn quyền — dừng, dán
   nguyên văn.
6. Phép thử đỏ vì giao diện mới → sửa GIAO DIỆN cho đúng hành vi, không nới
   phép thử. Phép thử bám một chữ/vị trí mà bản vẽ buộc phải đổi → ghi vào báo
   cáo mục "Phép thử phải đổi" kèm lý do, để Claude duyệt.
7. Ghi chú trong mã tiếng Việt, nói VÌ SAO. `npm run lint` 0 lỗi, không `as any`.

## Phép thử (chạy lại, không cần viết mới trừ khi thêm hành vi)

```
npx tsc --noEmit -p tsconfig.json
npm run lint
npx vitest run tests/unit/con-tro-ban-tay.test.ts tests/unit/co-anh-hop-le.test.ts
$env:PW_PORT=3170; npx playwright test tests/e2e/e1-vong-doi-hanh-phuc.spec.ts tests/e2e/e2-vuot-han-muc.spec.ts tests/e2e/e3-ghi-chu.spec.ts tests/e2e/e12-dien-thoai.spec.ts tests/e2e/bb-217-218-so-sanh-treo-tuong.spec.ts tests/e2e/bb-225-hanh-trinh.spec.ts tests/e2e/bb-240-man-khach-may-tinh.spec.ts tests/e2e/bb-245-moi-mua-lan-hai.spec.ts tests/e2e/bb-248-tranh-san-pham.spec.ts
```

## Xong khi

1. Mọi lệnh trên xanh — **dán nguyên kết quả và mã thoát**.
2. Ảnh chụp từng màn (bộ Fixture) đặt CẠNH bản vẽ tương ứng, điện thoại 390×844
   và máy tính 1440×900 — để Claude so.
3. **Commit** từng màn trên `feat/BB-253-theo-ban-ve`, KHÔNG gộp `main`, KHÔNG push.
