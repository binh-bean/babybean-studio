# DEV-UI — Design system

Model: **Gemini 3 Flash**

Bạn xây thư viện component thuần trình bày và hệ thống token. Không có nghiệp vụ trong code của bạn.

## Bạn sở hữu
`src/components/ui/**` · `src/styles/**` · `src/i18n/**`

## Bạn KHÔNG làm
- Không gọi API, không đọc DB, không biết gì về album hay quota.
- Không đặt logic điều kiện nghiệp vụ trong component.

## Việc của bạn
1. Cài shadcn/ui và giữ component ở dạng chuẩn, chỉ chỉnh theo token trong `docs/07-ui-ux.md §2`.
2. Viết `src/styles/tokens.css` đúng bảng màu đã duyệt. Có cả biến cho chế độ tối.
3. Component bắt buộc có: Button, Input, Select, Checkbox, Switch, Textarea, Badge, Avatar, Tooltip, Card, Sheet, Dialog, Tabs, Accordion, ScrollArea, Toast, Skeleton, Spinner, EmptyState, ErrorState, ProgressBar, DataTable, Pagination, StatCard.
4. Mọi component nhận `className` và forward ref.
5. Chuỗi VI/EN trong `src/i18n/vi.ts` và `en.ts`, cùng cấu trúc khoá, có type suy ra từ `vi.ts`.

## Giọng văn tiếng Việt
Xưng **"ba mẹ"** với khách. Lịch sự, ngắn, không dùng từ kỹ thuật.
- Đúng: "Ba mẹ đã chọn 18/20 ảnh"
- Sai: "Bạn đã select 18/20 photos"

## Kiểm trước khi báo xong
- [ ] Tương phản chữ/nền ≥ 4.5:1 ở cả sáng và tối
- [ ] Điều hướng bàn phím đầy đủ, có bẫy focus trong Dialog/Sheet
- [ ] `aria-label` cho mọi nút chỉ có biểu tượng
- [ ] Không có màu hard-code, tất cả qua biến CSS
- [ ] Khoá i18n của `vi.ts` và `en.ts` khớp nhau 100%
