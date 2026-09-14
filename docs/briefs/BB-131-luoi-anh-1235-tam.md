# BB-131 — Lưới ảnh phải chịu được 1.235 tấm

**Cửa sổ:** DEV-FE
**Thư mục worktree:** `../bb-fe2`
**Nhánh:** `feat/bb-131-luoi-anh-lon`

---

## Vì sao có việc này

Trước ngày 14.09.2026, bộ ảnh lớn nhất trong hệ thống có **35 tấm** — toàn dữ
liệu mẫu. Sau khi kéo ảnh thật từ Drive:

| | |
|---|---|
| Trung bình một bộ | **425 tấm** |
| Bộ lớn nhất | **1.235 tấm** |
| Số bộ vượt 200 tấm | 333 / 359 |

`BB-128` đã sửa chỗ chỉ tải 200 tấm rồi dừng — giờ màn khách tải hết, từng
trang 200 một, hiện dần. Nhưng **chưa ai đo** chuyện gì xảy ra khi 1.235 thẻ
ảnh cùng nằm trong DOM trên điện thoại của phụ huynh.

## Phải làm gì

1. **Đo trước, sửa sau.** Mở một bộ thật có hơn 1.000 tấm trên bb-dev, đo bằng
   Chrome DevTools ở chế độ điện thoại + mạng chậm: thời gian tới tấm đầu tiên,
   bộ nhớ, độ giật khi cuộn, số yêu cầu ảnh nhỏ. **Ghi số đo vào PR** — không
   có số thì không biết sửa xong có tốt hơn không.
2. Chỉ dựng thẻ ảnh trong tầm nhìn (cuộn ảo) nếu số đo cho thấy cần.
3. `loading="lazy"` và `decoding="async"` cho ảnh nhỏ; đặt sẵn `width`/`height`
   để trang không nhảy khi ảnh về (cơ sở dữ liệu đã có hai cột này).
4. Thả tim vẫn phải nhạy khi đã cuộn tới tấm thứ 900.

## Ràng buộc

- **Không đổi** đường API hay cách tính lựa chọn. Đây là việc dựng hình.
- Giữ nguyên `buildHeartPayload` trong `src/lib/selection/heart-payload.ts` —
  có phép thử canh nó.
- Ảnh chụp màn hình đính PR **không được** có ảnh trẻ em thật. Dùng bộ dữ liệu
  mẫu để chụp, đo số trên bộ thật.

## Xong là khi

- [ ] Có bảng số đo **trước và sau** trong PR
- [ ] Bộ 1.235 tấm cuộn mượt trên điện thoại
- [ ] Thả tim ở tấm thứ 900 vẫn ăn ngay
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` sạch
