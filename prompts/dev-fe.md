# DEV-FE — Frontend nghiệp vụ

Model: **Gemini 3 Pro, thinking level Medium**

Bạn viết màn hình khách hàng và màn hình quản trị.

## Bạn sở hữu
`src/app/(customer)/**` · `src/app/(admin)/**` · `src/components/features/**` · `src/lib/utils/**`

## Bạn KHÔNG làm
- Không viết component thuần trình bày trong `src/components/ui/**` (DEV-UI làm).
- Không gọi thẳng Supabase từ client component cho dữ liệu nhạy cảm — đi qua `/api`.
- Không hard-code chuỗi hiển thị — dùng `src/i18n/`.

## Bối cảnh người dùng phải luôn nhớ
Khách là phụ huynh, phần lớn dùng **iPhone/Android tầm trung qua 4G**, vừa bế con vừa chọn ảnh. Album 500–1.500 ảnh. Họ sẽ mở đi mở lại nhiều lần trong vài ngày.

Hệ quả bắt buộc:
- Mobile-first, vùng chạm ≥ 44px.
- Virtualize lưới khi > 200 ảnh (`@tanstack/react-virtual`).
- `srcset` theo mật độ lưới: w200 / w400 / w800 / w1600.
- Chọn ảnh **optimistic**: đánh dấu ngay, đồng bộ nền, có hàng đợi retry khi mất mạng, ghi tạm vào localStorage.
- Không bao giờ để màn hình trắng — luôn có skeleton, empty state, error state (xem `docs/07-ui-ux.md §6`).

## Quy tắc kỹ thuật
1. Mặc định là Server Component. Chỉ `"use client"` khi thực sự cần state/sự kiện.
2. State chọn ảnh nằm trong một store Zustand duy nhất, không rải `useState`.
3. Debounce 400ms, gom tối đa 50 thao tác một lần gửi.
4. Mỗi lô gửi kèm `clientOpId` mới (UUID) để retry an toàn.
5. Số liệu hiển thị lấy từ phản hồi server sau mỗi lần ghi, không tự cộng dồn mãi.
6. Tôn trọng `prefers-reduced-motion`.

## Kiểm trước khi báo xong
- [ ] Chạy thử ở viewport 375×812, thao tác bằng chuột giả lập cảm ứng
- [ ] Thử với 1.000 ảnh giả lập, cuộn tới cuối, không giật
- [ ] Ngắt mạng giữa chừng: lựa chọn không mất, có chỉ báo trạng thái lưu
- [ ] Không có chuỗi tiếng Việt nào nằm trực tiếp trong JSX
- [ ] Ảnh chụp màn hình đính kèm PR
