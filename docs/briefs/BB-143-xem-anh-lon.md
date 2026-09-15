# BB-143 — Ba mẹ mở ảnh lớn ra xem, và màn hình xoay theo thiết bị

**Cửa sổ:** GIAO DIỆN
**Thư mục worktree:** `../bb-fe-143`
**Nhánh:** `feat/bb-143-xem-anh-lon`

---

## Vì sao có việc này

Chủ studio dùng thật trang chọn ảnh ngày 15.09.2026 và nói đúng ba câu:

> không mở to được ảnh lên để xem chất lượng cao · trên màn hình xem ngang thì
> tôi muốn hiển thị full · thay đổi dọc ngang theo thiết bị

Hiện trong mã **không có bất kỳ màn xem ảnh lớn nào** — lưới ảnh là hết. Ba mẹ
đang phải chọn ảnh cho con bằng ô vuông 400px.

Chi tiết đáng chú ý: bảng màu đã khai sẵn biến `--bb-viewer-bg` — nền cho màn
xem ảnh — mà **không chỗ nào dùng**. Có người đã thiết kế màn này rồi không dựng.

## Phải làm gì

1. Chạm vào một tấm ảnh thì mở ảnh lớn, che kín màn hình, nền tối
   (`--bb-viewer-bg` đã có sẵn, dùng nó).
2. Vuốt trái phải sang ảnh kế, bấm ra ngoài hoặc nút X để đóng. Trên máy tính
   thì mũi tên trái phải và phím Esc.
3. **Xoay dọc ngang theo thiết bị**: ảnh luôn vừa khít màn hình, không cắt, không
   tràn. Điện thoại xoay ngang thì ảnh ngang chiếm hết bề rộng.
4. **Thả tim ngay trong màn xem lớn**, không bắt đóng ra rồi mới chọn. Đây là
   chỗ ba mẹ quyết định — bắt họ nhớ tấm nào vừa xem là bắt họ chọn sai.
5. Ảnh trong màn lớn xin cỡ `w=1600`: `/api/img/<id>?w=1600`.

## Ràng buộc

- `THUMBNAIL_WIDTHS` chỉ nhận **200, 400, 800, 1600**. Xin cỡ khác thì route trả
  lỗi. Muốn to hơn 1600 phải mở ADR với ARCH — đó là hợp đồng chung ở
  `src/types/domain.ts`, không phải của DEV-FE.
- Lưới ảnh vừa được BB-131 làm cho chịu nổi 1.235 tấm trên điện thoại ba mẹ bằng
  cuộn ảo. **Đừng phá nó**: màn xem lớn chỉ giữ trong bộ nhớ vài tấm quanh tấm
  đang xem, không nạp cả bộ.
- Vùng được ghi: `src/components/features/**`, `src/app/(customer)/**`. Cần thêm
  màu hay chữ dịch thì nhờ DEV-UI, đừng tự sửa `src/styles/**` hay `src/i18n/**`.
- Kho công khai: ảnh chụp màn hình trong báo cáo **không được có ảnh trẻ em thật**.

## Xong là khi

- [ ] Mở ảnh lớn, vuốt qua lại, đóng được — trên cả điện thoại lẫn máy tính
- [ ] Xoay ngang điện thoại: ảnh vừa khít, không cắt, không tràn ngang
- [ ] Thả tim được ngay trong màn xem lớn, số "Đã chọn" tăng đúng
- [ ] Mở bộ 1.235 ảnh rồi vuốt 50 tấm: trình duyệt không phình bộ nhớ
      (đo và ghi số vào báo cáo, đừng chỉ nói là mượt)
- [ ] `npm run verify:own -- DEV-FE --base main`, `npm test`, `tsc`, `lint` sạch
