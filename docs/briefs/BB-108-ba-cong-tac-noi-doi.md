# BB-108 — Ba công tắc trong màn tạo bộ ảnh đang nói dối

**Cửa sổ: DEV-FE.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-fe` — nhánh `agent/dev-fe`.

Đọc kỹ dòng trên trước khi gõ phím đầu tiên. Nhầm cửa sổ là sửa vào worktree
của agent khác, và người phát hiện ra sẽ là người phải gỡ.

Tệp chính: `src/components/features/admin/create-gallery-wizard.tsx`.

---

## Chuyện gì đang xảy ra

Màn tạo bộ ảnh có ba lựa chọn. Cả ba đều **không khớp với điều hệ thống thật sự
làm**, và cả ba sai theo cùng một kiểu: màn hình nói một đằng, máy chủ làm một
nẻo.

| Lựa chọn | Màn hình đang nói | Hệ thống thật sự làm | Chủ studio đã chốt |
|---|---|---|---|
| Đóng dấu mờ | ô tick, **bật sẵn** | `route.ts:106` luôn gửi `false` | Bỏ đóng dấu mờ (BB-066 huỷ) |
| Cho tải ảnh | không có ô, ghi cứng `false` | tạo ra bộ **không cho tải** | Bật cho mọi bộ (BB-158) |
| Mã PIN | ô tick, **bật sẵn** | gửi đúng cái nó nhận | Mặc định **tắt** (12/09) |

Ba con số làm rõ mức lệch: trên bb-prod, **cả 457 bộ ảnh** đều
`download_enabled = true` và `requires_pin = false`. Bộ nào tạo từ màn này sẽ ra
khác 457 bộ kia — mà không ai chủ ý muốn thế.

Đây không phải lỗi làm mất dữ liệu. Nó tệ theo kiểu khác: nhân viên tick vào ô
"đóng dấu mờ" rồi yên tâm là ảnh có dấu mờ. Không có. Một màn hình nói dối một
lần thì lần sau không ai tin nó nữa, kể cả những chỗ nó nói thật.

## Phải làm gì

1. **Bỏ hẳn ô "đóng dấu mờ".** Không phải bỏ tick mặc định — bỏ cả ô.
   - Gỡ `watermark` khỏi `useState` và khỏi `options` trong thân yêu cầu.
   - Gỡ khối `<label>` chứa ô tick đó.
   - Gỡ khoá i18n `watermark` ở `src/i18n/vi.ts` và `src/i18n/en.ts`.
   - Quét `watermarkEnabled` trong `src/types/domain.ts`: còn chỗ nào đọc nó
     thì để nguyên và ghi vào phần bàn giao; không chỗ nào đọc thì gỡ luôn.
2. **`download` thành `true`.** Đặt thành một ô tick **bật sẵn**, nhất quán với
   457 bộ đang có — đừng đổi từ ghi cứng `false` sang ghi cứng `true`, vì rồi
   sẽ có ngày cần tắt cho một bộ.
3. **`requirePin` mặc định `false`.** Giữ nguyên ô tick, chỉ đổi giá trị khởi
   tạo. Mặc định của cột trong cơ sở dữ liệu đã là `false` — màn hình đang là
   chỗ duy nhất lệch.

**Không đụng** `src/app/api/admin/galleries/route.ts`. Đường đó thuộc DEV-BE và
đang làm đúng. Việc này chỉ ở lớp màn hình.

## Tiêu chí xong — tự kiểm ngược trước khi báo

Ba lần trước có agent báo xong khi chưa đạt. Nên đừng báo xong dựa trên "tôi đã
sửa"; báo xong dựa trên "tôi đã chạy lại và đây là kết quả". Dán kết quả thật
vào phần bàn giao, không mô tả lại.

- [ ] `npm run typecheck` sạch.
- [ ] `npm run lint` sạch.
- [ ] `npm run test` — **315/315 đạt**. Con số đó là mốc hôm nay; thấp hơn nghĩa
      là bạn làm hỏng một phép thử đang xanh, đừng sửa phép thử cho nó xanh lại.
- [ ] `grep -rn "watermark" src/` — chỉ còn những chỗ bạn cố ý giữ, và mỗi chỗ
      giữ lại có một câu giải thích trong phần bàn giao.
- [ ] **Kiểm ngược, bắt buộc:** tạo một bộ ảnh thật qua màn hình rồi đọc thẳng
      cơ sở dữ liệu:
      ```sql
      select title, watermark_enabled, download_enabled,
             (select requires_pin from share_links where gallery_id = galleries.id limit 1)
        from galleries order by created_at desc limit 1;
      ```
      Phải ra `download_enabled = true`, và PIN không bật trừ khi bạn chủ động
      tick. Dán đúng kết quả câu này vào phần bàn giao.
- [ ] Thêm một phép thử canh lựa chọn mặc định của màn tạo bộ ảnh, để lần sau
      ai đổi là biết ngay. Không có phép thử thì ba tháng nữa lệch lại.

## Hai điều phải biết trước khi chạy

**bb-dev giờ chứa dữ liệu khách THẬT** — 447 nhà, tên và số điện thoại thật.
Chủ studio chốt ngày 16/09, xem `AGENTS.md §6`. Ảnh chụp màn hình, kết quả truy
vấn, log: thay tên trước khi commit hoặc dán vào bất kỳ đâu. Kho này public.

**Bộ ảnh bạn tạo ra để kiểm là rác.** Dọn sau khi xong:
```bash
npm run db:cleanup
```
Nó chỉ nhận ra bộ mang tiền tố `Fixture ` hoặc thư mục Drive giả `mock-*`. Nên
đặt tên bộ thử bắt đầu bằng `Fixture BB-108` — không thì bạn phải tự xoá tay.

## Ngoài phạm vi, nhưng ghi lại để không mất

`db/schema.sql:218` vẫn để `watermark_enabled boolean not null default true`.
Đường API ghi đè thành `false` nên hôm nay không ai gặp, nhưng bất kỳ lối tạo
bộ ảnh nào không đi qua đường đó sẽ nhận mặc định sai. Sửa chỗ này cần một
migration nên thuộc ARCH — **đừng tự sửa**, chỉ nhắc lại trong phần bàn giao.
