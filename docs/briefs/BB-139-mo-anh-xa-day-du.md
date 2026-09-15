# BB-139 — Mở lại ánh xạ đầy đủ, nhưng chỉ khi đích không phải `bb-dev`

**Cửa sổ:** TÍCH HỢP
**Thư mục worktree:** `../bb-int-139`
**Nhánh:** `feat/bb-139-mo-anh-xa-day-du`

---

## Vì sao có việc này

`scripts/sync-lark-hauky.mjs` đang cố ý bỏ qua `Tên KH`, `SDT KH`, tên bé và
`Ghi Chú` — xem chính dòng ghi chú trong tệp và `docs/16` mục 7.3. Hệ quả: màn
quản lý hiện `KH · HD_20260912#5096` thay vì tên khách, nhân viên phải tra ngược
sang Lark.

Sau BB-138 sẽ có `bb-prod` — cơ sở dữ liệu thật mà agent không có khoá. Lúc đó
điều kiện mở lại đã đủ.

Nhưng **không được mở bằng cách xoá dòng che đi**. `bb-dev` vẫn còn đó, vẫn dùng
chung, và ai đó sẽ chạy nhầm lệnh đồng bộ vào nó — đó là chuyện khi nào chứ không
phải có hay không.

## Phải làm gì

1. Ánh xạ đầy đủ: `Tên KH` → `customers.full_name`, `SDT KH` → `customers.phone`
   và `phone_normalized`, `Ghi Chú` → `customers.note`, tên bé → bảng `babies`.
   Tên bé hiện **không có cột riêng bên Lark** — nói rõ trong báo cáo lấy từ đâu
   và độ tin tới đâu, đừng bóc từ tên thư mục rồi coi như chắc chắn.
2. Một **cái chốt cứng**: chỉ ghi dữ liệu thật khi đích **không phải** `bb-dev`.
   Chốt đọc từ chính chuỗi kết nối, không đọc từ một cờ người gõ tay — người gõ
   tay là người quên.
3. Chạy vào `bb-dev` thì vẫn che y như hôm nay, không cần ai nhớ gì.
4. Không xoá các dòng ghi chú giải thích vì sao che. Chúng là lý do, không phải rác.

## Ràng buộc

- Vùng được ghi: `scripts/sync-lark-*.mjs`, `src/lib/lark/**`. Ngoài vùng thì đề
  xuất, không tự sửa.
- Agent **không có khoá `bb-prod`** và sẽ không có. Nên phần chạy thật do PM chạy;
  việc của DEV-INT là chứng minh bằng `bb-dev` rằng cái chốt hoạt động.
- Kho công khai: báo cáo và ảnh chụp màn hình **không được mang tên khách thật,
  số điện thoại thật, tên bé thật**. Đây là lúc dễ vi phạm nhất, vì task này nói
  về đúng những dữ liệu đó.

## Xong là khi

- [ ] Chạy đồng bộ vào `bb-dev`: tên vẫn là `KH · <mã hợp đồng>`, `phone` vẫn trống
- [ ] **Kiểm chứng ngược**: một phép thử cho chuỗi kết nối giả dạng `bb-prod` và
      khẳng định ánh xạ đầy đủ được bật; đổi lại thành `bb-dev` thì phải tắt
- [ ] Báo cáo nói rõ tên bé lấy từ đâu, và trường hợp nào không lấy được
- [ ] `npm run verify:own -- DEV-INT --base main`, `npm test`, `tsc`, `lint` sạch
