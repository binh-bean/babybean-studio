# 17. Những dòng TODO đang giấu chức năng thiếu

**Soát ngày 15/09/2026.** Quét `src/` và `db/` tìm `TODO`, `FIXME`, `HACK`,
`tạm thời`, `for now`, `chưa làm`, `sẽ làm sau`, `chưa triển khai`.

Việc này sinh ra vì một lỗi chặn toàn bộ dự án nấp sau đúng hai dòng TODO: khách
không xem được một tấm ảnh nào, mà 270 phép thử vẫn xanh. Câu hỏi của lần soát
này là **còn bao nhiêu dòng như thế nữa**.

## Câu trả lời ngắn cho người không lập trình

**Không còn chỗ nào giấu lỗi kiểu đó nữa.** Bảy dòng tìm được thì:

- **Không dòng nào làm khách hàng gặp trục trặc.** Đường đi của ba mẹ — mở link,
  xem ảnh, thả tim, chốt — không còn chỗ nào bỏ dở.
- Hai dòng là **màn hình chưa làm**, và menu đã tự khoá lại, ghi "sắp có". Nhân
  viên nhìn là biết chưa có, không tưởng hệ thống hỏng.
- **Một chỗ đáng sửa sớm**: đăng nhập xong, nhân viên rơi vào đúng cái màn chưa
  làm. Không hỏng gì, nhưng là ấn tượng đầu tiên mỗi ngày.
- Một dòng là **cái bẫy cho người sau**, chưa hại ai hôm nay.
- Ba dòng còn lại là ghi chú dọn dẹp, không tắt chức năng nào.

## Bảng đầy đủ

Xếp theo tiêu chí duy nhất: **khách có gặp không, và có im lặng không.**

| # | Chỗ | Đang tắt cái gì | Có phép thử canh? | Ai gặp trước |
|---|---|---|---|---|
| 1 | `src/lib/lark/notify.ts:39` | `enqueueLarkNotification` **ném lỗi "Not implemented"** thay vì xếp hàng thông báo | **KHÔNG** — và cũng **không ai gọi** (đã quét toàn bộ `src/`, `tests/`, `scripts/`) | Chưa ai. Nhưng người đầu tiên gọi hàm này sẽ làm 500 ngay lối gọi của mình |
| 2 | `src/app/(admin)/admin/page.tsx` | Bảng điều khiển: chỉ có dòng chữ "Chưa triển khai (BB-060)" | **KHÔNG** | **Nhân viên, mỗi lần đăng nhập** — xem mục dưới |
| 3 | `src/components/.../admin-sidebar.tsx:90` | Ba mục menu khoá lại: Bảng điều khiển, Khách hàng, Cài đặt | **KHÔNG** | Nhân viên, nhưng **thấy rõ** — menu xám và ghi "sắp có" |
| 4 | `db/migrations/0038:36` | Bảng `settings` chưa màn hình nào đọc (màn Cài đặt chưa làm) | **CÓ** — `tests/security/cai-dat-nhay-cam.test.ts` canh luật quyền của bảng đó | Chưa ai |
| 5 | `src/app/api/g/buoi-chup/route.ts:17` | Ghi chú lịch sử: "nửa còn lại chưa làm" — **nửa đó chính là tệp này**, BB-130 đã làm xong | **CÓ** — `tests/unit/cong-khach-nhieu-buoi-chup.test.ts` | Không ai |
| 6 | `src/app/api/img/[photoId]/route.ts:76` | Ghi chú lịch sử về `TODO(BB-030)` cũ — **đã vá ở BB-133** | **CÓ** — `tests/security/khach-xem-duoc-anh.test.ts`, 6 ca | Không ai |
| 7 | `db/migrations/0007:15` | Giá trị `favorite` còn trong kiểu `selection_mark`, chưa xoá | Không cần | Không ai |

## Chỗ đáng sửa sớm nhất: đăng nhập xong rơi vào màn trống

`src/app/(auth)/login/page.tsx:59` đưa người vừa đăng nhập về `/admin` khi không
có đích nào khác. Mà `/admin` chính là mục 2 — một trang chỉ có dòng "Chưa triển
khai (BB-060)".

Nghĩa là **mỗi sáng, thứ đầu tiên nhân viên nhìn thấy sau khi đăng nhập là một
trang trống**, trong khi mục menu dẫn tới nó thì đang xám. Hai chỗ nói hai điều
khác nhau về cùng một màn hình.

Không hỏng gì, không ai mất dữ liệu. Nhưng sửa thì rẻ: cho đăng nhập xong về
thẳng **Quản lý bộ ảnh** — màn hình nhân viên thật sự dùng — cho tới khi BB-060
làm xong Bảng điều khiển.

## Cái bẫy ở mục 1, nói rõ để người sau khỏi vấp

`enqueueLarkNotification` trông như một hàm dùng được: có kiểu dữ liệu đầy đủ,
có ghi chú dài về việc không được nhét địa chỉ ảnh vào, phải che số điện thoại.
Đọc qua thì tưởng chỉ việc gọi. Thân hàm thì **ném lỗi**.

Hôm nay vô hại vì chưa ai gọi. Nhưng đây đúng là hình dạng của cái lỗi ngày
14/09: một chỗ trông như đã làm, thật ra chưa. Người viết tính năng thông báo
sang Lark sẽ gọi nó, thấy 500, rồi mất thời gian dò — trừ khi tên hàm nói thẳng
ra điều đó.

## Cách soát này được làm

- Quét bằng máy toàn bộ `src/` và `db/`, không chọn lọc tay.
- Cột "có phép thử canh" **không suy đoán**: với mục 4, 5, 6 là mở đúng tệp phép
  thử ra đối chiếu; với mục 1, 2, 3 là quét toàn bộ `tests/` không thấy tệp nào
  chạm tới, và riêng mục 1 quét thêm cả `src/` lẫn `scripts/` để chắc không có
  lối gọi nào.
- Không xoá dòng TODO nào. Chúng là bằng chứng.
