# 19. Bản yêu cầu chỉnh sửa và bổ sung — đợt 1

**Chủ studio duyệt ngày 24/09/2026** trên trang bản yêu cầu (artifact riêng tư
`S2Bo7niSc6RHYUQSpiHASa`). Claude soạn sẵn 24 mục sau đợt soát ngày 23–24/09;
chủ studio bấm Giữ / Để sau / Bỏ, đổi mức gấp, ghi chú, và thêm 8 mục của mình.

Tệp này là **bản lưu nguyên văn** — ghi chú của chủ studio chép y như gõ, kể cả
lỗi chính tả, vì đó là lời gốc để đối chiếu khi có tranh cãi "ý tôi là…".
Trang bản yêu cầu đã để trống cho đợt 2.

Tổng: 32 mục — **29 giữ**, 3 bỏ.

Mức gấp: `P0` làm ngay tuần này · `P1` trong tháng · `P2` khi xong việc gấp · `P3` chưa cần.

---

## Vận hành

### 1. Giữu lại link app trên màn quản trị chứ không mất.hiển thị đầy đủ thông tin

`P0` · Thêm mới · Vận hành · chủ studio · mã `8hobnnnn9bchn5repbrg`


### 2. sửa màn này theo chuẩn thiết kế https://hauky.babybeanstudio.vn/

`P0` · Thêm mới · Vận hành · chủ studio · mã `yqk6skkq8a069nrop4jg`


### 3. trạng thái

`P0` · Thêm mới · Vận hành · chủ studio · mã `w3ung0bbh4dfxt9ycwhn`

- **Chủ studio mô tả:** hiện thị trên màn khách hàng là đã chốt nhưng ở màn quản trị thì phải là  khách đã chọn xong sau đó cskh chốt là việc việc xong với khách thì bộ ảnh ở lark sẽ ở trạng thái đã chọn ảnh,và xếp hàng đợi chỉnh sửa
vậy màn của khách cần là bộ ảnh đã được ghi nhận yêu cầu 
và khi trên lark là đang làm thì màn khách và quản trị app mới là đang chỉnh sửa hoặc đang làm 
suy nghĩ và làm cho đúng đủ đẹp với luồng này

### 4. Chuyển app sang cơ sở dữ liệu thật (bb-prod)

`P0` · Quyết định · Vận hành · Claude soạn · mã `vh-01-cat-bb-prod`

- **Vì sao:** App đang chạy trên bb-dev. 457 bộ ảnh thật của studio nằm ở bb-prod, chưa khách nào xem được qua app. Chưa chuyển thì mọi thứ khác vẫn là thử.
- **Claude đề xuất:** Chạy bảng kiểm docs/18, áp các bản sửa cấu trúc 0049→0062, đổi biến môi trường trên Vercel. Cần anh/chị có mặt để kiểm dữ liệu thật sau khi chuyển.
- **Chủ studio ghi chú:**
  > cập nhật khách hàng đầy đủ và lấy sản phẩm trong bộ ảnh lên từ lark,phần này cần cơ chế hoạt động tự động lấy dữ liệu lên dựa bào hóa đơn,(hóa đơn chi tiết và chi tiết gói chụp)sau đó cskh có thể sửa và bỏ các phần không cần thiết nhưng sẽ giảm được việc thêm thủ công từng phần một,ở phần này màn quản trị thêm luôn link hóa đơn để check chéo

### 5. 76 bộ ảnh lỗi "thư mục chưa chia sẻ công khai"

`P2` · Sửa · Vận hành · Claude soạn · mã `vh-02-thu-muc-chua-chia-se`

- **Vì sao:** 76/488 bộ (16%) không đồng bộ được vì thư mục Drive chưa mở chia sẻ. Khách mở link sẽ thấy trống.
- **Claude đề xuất:** Một màn liệt kê các bộ lỗi cho CSKH, kèm hướng dẫn 3 bước mở chia sẻ Drive và nút "Kiểm lại" ngay sau khi mở.
- **Chủ studio ghi chú:**
  > đang kiểm tra lại sẽ đồng bộ khi tìm được ảnh không gấp và không ảnh hưởng dự án

### 6. 124 bộ ảnh không có tấm nào

`P0` · Sửa · Vận hành · Claude soạn · mã `vh-03-bo-anh-rong`

- **Vì sao:** 25% số bộ trong hệ thống có 0 ảnh. Gửi link một bộ rỗng cho khách là mất điểm ngay lần đầu.
- **Claude đề xuất:** Tìm nguyên nhân (thư mục rỗng, sai đường dẫn, chưa đồng bộ) và chặn tạo link cho bộ chưa có ảnh.
- **Chủ studio ghi chú:**
  > phần này cần có phương án dằng buộc với nguyên lý như sau
  > -nếu bản ghi không có dịch vụ chụp hình thì tức là hóa đơn mua thêm dịch vụ hậu kỳ (in thêm ảnh chỉnh thêm file....)check kèm với khách hàng sẽ ra -cần tư duy để tạo luồng hoạt động chỗ này
  > -nếu có link ảnh và link rỗng cộng với trong hóa đơn có dịch vụ chụp hình là gói chụp thì tạo cảnh báo để cskh viết và bạn tự duy sử lý việc này cũng không gấp và không ảnh hưởng đến dự án,dự án sẽ không dừng lại để sử lý xong việc này

### 7. Bộ đếm lượt mở link chưa hề chạy

`P1` · Sửa · Vận hành · Claude soạn · mã `vh-04-dem-luot-mo-link`

- **Vì sao:** Cột lượt xem chỉ được đọc, không chỗ nào tăng nó — cả 23 link đều hiện 0. Hiện không biết khách đã mở link hay chưa.
- **Claude đề xuất:** Tăng bộ đếm và ghi lần mở gần nhất mỗi khi khách mở link; hiện ở màn chi tiết bộ ảnh.
- **Chủ studio ghi chú:**
  > ok

### 8. Sáu con số điều hành ở màn đầu quản trị

`P1` · Thêm mới · Vận hành · Claude soạn · mã `vh-05-sau-con-so`

- **Vì sao:** Chưa đo được việc kinh doanh qua app: không biết bao nhiêu khách mở link, bao lâu mới chốt, bán thêm được bao nhiêu.
- **Claude đề xuất:** Tỉ lệ mở link · thời gian từ gửi link tới chốt (trung vị) · % chốt trong 7 ngày · số ảnh chọn thêm mỗi bộ · doanh thu mua thêm mỗi bộ · % khách tải ảnh trước khi chốt.
- **Chủ studio ghi chú:**
  > tạo trọn bộ báo cáo đầy đủ cho điều hành tầm quản trị và sales dùng

### 9. Đưa 20 gia đình thật đi hết luồng, ngồi xem họ dùng

`P1` · Quyết định · Vận hành · Claude soạn · mã `vh-06-20-gia-dinh-that`

- **Vì sao:** Đến nay mới 1 bộ được chốt qua app. Mọi nhận định về màn khách vẫn là đoán cho tới khi thấy ba mẹ thật bấm.
- **Claude đề xuất:** Sau khi chuyển sang bb-prod: chọn 20 bộ mới, CSKH gửi link, em đọc nhật ký thao tác và ghi lại chỗ khách vấp.
- **Chủ studio ghi chú:**
  > anh sự sẽ test trực tiếp không để khách test.đợi khách thì quá lâu,test xong anh duyệt mới bắt đầu gửi khách

## Màn khách

### 1. album ảnh là gì

`P0` · Sửa · Màn khách · chủ studio · mã `zyde2sm6qdd2wvgesylx`

- **Chủ studio ghi chú:**
  > album ảnh là một quyển album được ghép từ 20-30 ảnh đã chỉnh sưa hoặc chưa chỉnh sửa hoặc chỉnh sửa một phần và được in ra thành quấn 
  > mỗi một album sẽ có một ảnh bìa 
  > có hai nhiệm vụ chính là gợi ý chọn ảnh bìa cho album nếu trong gói khách hàng có album
  > hai là bán album mở màn bán hàng chứ không phải chọn ảnh đê mua album,
  > -làm rõ khái niệm để bạn hiểu để đưa vào dự án cho đúng

### 2. hiện tên file ảnh

`P1` · Thêm mới · Màn khách · chủ studio · mã `s2mlk8bm7dliwxd7iwm2`

- **Chủ studio mô tả:** hiện tên file để khách rễ kiểm soát và đối chiếu với file tải về cũng như danh sách mà cskh tải về ảnh khách chọn chỉnh sửa

### 3. icon hiển thị trên màn khách và hướng dẫn khách dán app ra màn hình chính của các loại máy khách đang dùng để thao tác

`P0` · Thêm mới · Màn khách · chủ studio · mã `hpfwesqeum0r5hisfmtb`

- **Chủ studio mô tả:** icon trên trình duyệt là logo babybean
hiển thị trên màn khách khi gán ra màn chính là ảnh bìa bộ hình

### 4. zoom được ảnh khi mở lớn và tạo hiệu ứng kéo vuốt thả mượt mà

`P0` · Thêm mới · Màn khách · chủ studio · mã `sloy432naliz99e6ojuo`

- **Chủ studio mô tả:** đang không zoom vào cận được từng ảnh để xem chi tiết .sửa cho zoom được để khách chọn ảnh

### 5. Màn 5: ướm ảnh của con lên tường

`P1` · Thêm mới · Màn khách · Claude soạn · mã `mk-01-uom-tuong`

- **Vì sao:** Ba mẹ mua ảnh treo tường khi thấy nó trên tường, không phải khi đọc bảng giá. Bản mẫu đã duyệt hướng.
- **Claude đề xuất:** Sau khi chốt: tường phòng khách vẽ đúng tỉ lệ, đổi chất liệu / cỡ / khung thì ảnh và giá đổi theo; suất trong gói hiện 0 ₫. Dùng giá thật trong bảng giá.
- **Chủ studio ghi chú:**
  > Giao diện phải thật đẹp và hiện đại chứ không phải 2d đổ màu như bản hôm qua.

### 6. Link mời ông bà cùng xem (BB-065)

`P1` · Thêm mới · Màn khách · Claude soạn · mã `mk-03-moi-ong-ba`

- **Vì sao:** Quyết định chọn ảnh thường không phải của một người. Nút này có trong bản mẫu nhưng chưa làm vì máy chủ chưa có đường cho khách tự tạo link mời.
- **Claude đề xuất:** Ba mẹ tự tạo link chỉ-xem hoặc link gợi ý (thả tim gợi ý, ba mẹ quyết); màn khách đã sẵn sàng hiện đúng theo quyền từng link.
- **Chủ studio ghi chú:**
  > cần làm rõ phần này quyền của khách là gì và đường đi như thế nào quyền của studio là gì chốt ảnh nhận file có ảnh hưởng gì không

### 7. Hộp thoại "Chốt danh sách" còn kiểu cũ

`P0` · Sửa · Màn khách · Claude soạn · mã `mk-04-hop-thoai-chot`

- **Vì sao:** Ba màn chính đã theo giao diện mới, riêng bước chốt — bước quan trọng nhất — vẫn là hộp thoại cũ.
- **Claude đề xuất:** Làm lại thành tấm trượt từ dưới lên: xem lại các tấm đã chọn, tên người xác nhận, ghi chú chung.
- **Chủ studio ghi chú:**
  > tên người sác nhận là tên khách hàng trong bộ .dấu tích ghi sác nhận đùng thông tin.

### 8. Cửa hàng "Mua thêm" còn kiểu cũ

`P0` · Sửa · Màn khách · Claude soạn · mã `mk-05-cua-hang-cu`

- **Vì sao:** Mở từ nút túi ở thanh đáy ra một màn giao diện cũ — lệch với phần còn lại.
- **Claude đề xuất:** Đổi sang cùng ngôn ngữ thiết kế; nếu làm màn 5 thì gộp chung với màn ướm tường.

### 9. Các màn phụ còn kiểu cũ

`P2` · Sửa · Màn khách · Claude soạn · mã `mk-06-man-phu-cu`

- **Vì sao:** Màn chọn buổi chụp, màn link hết hạn / không tìm thấy, và bảng duyệt ảnh đã chỉnh vẫn theo giao diện cũ.
- **Claude đề xuất:** Đổi cả ba sang giao diện mới trong một lượt.

### 10. CSKH chọn ảnh bìa

`P0` · Thêm mới · Màn khách · Claude soạn · mã `mk-07-chon-anh-bia`

- **Vì sao:** Ảnh bìa hiện do lúc đồng bộ tự lấy — thường là tấm đầu tiên, không phải tấm đẹp nhất. Bìa là thứ ba mẹ thấy đầu tiên.
- **Claude đề xuất:** Nút "Đặt làm ảnh bìa" ở màn chi tiết bộ ảnh trong quản trị.
- **Chủ studio ghi chú:**
  > ngoài ra đoạn text ở ảnh bìa cũng cần được thay đổi cho phù hợp với từng bộ ảnh theo ngôn ngữ thiêt kế high fashion cskh tùy chỉnh được (đoạn text có điền sẵn)

### 11. 234/488 bộ chưa gắn tên bé

`P2` · Sửa · Màn khách · Claude soạn · mã `mk-08-ten-be`

- **Vì sao:** Bìa của những bộ này hiện câu chung "Khoảnh khắc của con" thay vì tên bé.
- **Claude đề xuất:** Hỏi tên bé khi CSKH tạo link (hoặc lấy từ Lark nếu có cột đó).

### 12. So sánh hai tấm cạnh nhau

`P2` · Thêm mới · Màn khách · Claude soạn · mã `mk-09-so-sanh`

- **Vì sao:** Khi phân vân giữa hai tấm, ba mẹ phải lật qua lại để nhớ.
- **Claude đề xuất:** Nút "So sánh" trong màn xem lớn, hai tấm đứng cạnh nhau, giữ tấm nào thì tim tấm đó.
- **Chủ studio ghi chú:**
  > có thể cạnh nhau hoặc không cạnh nhau nếu khách hàng muốn 
  > ví dụ chọn quá nhiều cần bỏ bớt

## Bán hàng

### 1. Giá ảnh chọn thêm chưa được chốt

`P1` · Quyết định · Bán hàng · Claude soạn · mã `bh-02-gia-anh-them`

- **Vì sao:** Tài liệu ghi thang giảm dần 60k/50k/45k/40k theo gói là "giả định"; thực tế cả 488 bộ đang tính 50.000 ₫ đồng giá.
- **Claude đề xuất:** Anh/chị chốt một cách tính; em cập nhật cho mọi bộ và ghi vào tài liệu quyết định.
- **Chủ studio ghi chú:**
  > một file chỉnh là 50k chưa có quyết định thay đổi nhưng cứ để dự trù phương án để sau này có thể thay đổi nếu có quyết định

### 2. Mời mua lần hai khi giao ảnh đã chỉnh

`P2` · Thêm mới · Bán hàng · Claude soạn · mã `bh-04-mua-lan-hai`

- **Vì sao:** Lúc nhận ảnh đã chỉnh là lúc ba mẹ vui nhất — thời điểm tốt nhất để gợi ý in, nhưng hiện app không làm gì lúc đó.
- **Claude đề xuất:** Khi giao ảnh, màn khách mở bằng 3 tấm đẹp nhất đã chỉnh kèm gợi ý in.
- **Chủ studio ghi chú:**
  > khi khách duyệt in mà không yêu cầu chỉnh lại chứ không phải lúc gửi ảnh chỉnh sửa lần đầu

### 3. Báo ba mẹ qua Zalo

`P2` · Thêm mới · Bán hàng · Claude soạn · mã `bh-05-zalo`

- **Vì sao:** Nhắc hạn chót và báo ảnh đã sẵn sàng hiện chỉ đi tới nhóm Lark của CSKH; chưa có đường nhắn thẳng cho khách (Zalo ZNS chưa nối).
- **Claude đề xuất:** Nối Zalo ZNS cho 3 tin: ảnh đã sẵn sàng, sắp hết hạn chọn, ảnh đã chỉnh xong.
- **Chủ studio ghi chú:**
  > khách nhận thông báo từ app màn khách (thông báo đẩy )

## Quản trị & kỹ thuật

### 1. hiển thì bàn tay tới các phần tích chọn hoặc có click được

`P0` · Thêm mới · Quản trị & kỹ thuật · chủ studio · mã `qyy7ur0f3kbw7g423940`

- **Chủ studio mô tả:** đang không hiển thị,đổi thành bàn tay bấm khi thao tác có con trỏ cả màn khách vẫn quản trị

### 2. Hai phép thử màn quản trị đang đỏ

`P2` · Sửa · Quản trị & kỹ thuật · Claude soạn · mã `qt-01-hai-phep-thu-do`

- **Vì sao:** Chụp màn hình bảng điều khiển và bảng link sắp hết hạn — đỏ sẵn từ trước, đã xác nhận trên mã cũ.
- **Claude đề xuất:** Tìm nguyên nhân rồi sửa mã hoặc sửa phép thử (đã có thẻ việc riêng).
- **Chủ studio ghi chú:**
  > tìm nguyên nhân và phân tích hướng đi tiếp theo

### 3. CSKH tải file ZIP các tấm khách đã chọn

`P3` · Thêm mới · Quản trị & kỹ thuật · Claude soạn · mã `qt-02-zip-anh-chon`

- **Vì sao:** Phần còn lại của BB-067: hiện CSKH xuất được danh sách tên file nhưng chưa tải gọn được ảnh.
- **Claude đề xuất:** Nút tải ZIP ở màn chi tiết bộ ảnh, có ghi nhật ký ai tải lúc nào.
- **Chủ studio ghi chú:**
  > cskh tải file text mã chọn và note chi tiết từng ảnh khách note hoặc ảnh chọn in là gì

### 4. Màn quản lý gói chụp (BB-062)

`P0` · Thêm mới · Quản trị & kỹ thuật · Claude soạn · mã `qt-03-goi-chup`

- **Vì sao:** Gói chụp và hạn mức ảnh hiện lấy từ Lark qua dòng hợp đồng; chưa có chỗ xem và sửa gói trong app.
- **Claude đề xuất:** Màn danh sách gói: tên, giá, số ảnh chỉnh, sản phẩm đi kèm.

### 5. Bộ quét "màn hình có nối dữ liệu không" báo nhầm 3 tệp

`P2` · Sửa · Quản trị & kỹ thuật · Claude soạn · mã `qt-04-bo-quet-bao-nham`

- **Vì sao:** Nó báo 3 tệp của màn khách không có nguồn dữ liệu, trong khi cả 3 đều nhận dữ liệu qua props. Báo nhầm nhiều thì người ta thôi đọc.
- **Claude đề xuất:** Sửa bộ quét cho nhận ra dữ liệu truyền qua props.

---

## Chủ studio đã BỎ

- **Màn 4: gom các tấm gần giống nhau** — không cần thiết
- **Tải ảnh gốc: trước hay sau khi chốt?** — giữ như cũ vì quyền của khách
- **Bán theo combo thay cho danh sách mã hàng** — càng nhiều càng phức tạp khó chọn và kéo dài thời gian chọn
