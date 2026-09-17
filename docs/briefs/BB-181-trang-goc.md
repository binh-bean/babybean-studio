# BB-181 — Trang gốc: thôi trả 404

**Cửa sổ: DEV-UI.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-ui` — nhánh `agent/dev-ui`.

**Không phải DEV-FE.** DEV-FE đang làm BB-170 rồi BB-180, cùng lúc, trong một
worktree khác. Việc này là một trang mới đứng riêng, không chạm màn nào đang có.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Việc

`https://hauky.babybeanstudio.vn/` đang trả **404**. Không phải hỏng — trong mã
nguồn **không có tệp nào cho đường dẫn gốc**. Mọi màn của app đều ở đường dẫn
con.

Hai người gặp trang này, và cả hai đều nghĩ studio sập:

- **Nhân viên** gõ tên miền theo trí nhớ thay vì mở dấu trang.
- **Ba mẹ** bị Zalo cắt cụt link, hoặc tò mò xoá bớt phần đuôi. Họ thấy thông
  báo lỗi **bằng tiếng Anh** của hệ thống, không tên studio, không hotline —
  ngay sau khi vừa được giao ảnh của con mình.

## Phạm vi — chủ studio chốt ngày 17/09

**Làm:**

1. Một trang gốc gọn: tên studio, giới thiệu ngắn, ba chi nhánh kèm địa chỉ và
   hotline, nút nhắn cho studio.
2. Một dòng rõ ràng cho ba mẹ đang lạc:
   > Ảnh của bé được gửi qua **link riêng**. Chưa nhận được hoặc link không mở
   > được, gọi giúp bên mình theo số ở dưới.
3. Nút **Nhân viên đăng nhập** — nhỏ, kín đáo, dẫn sang `/login`. Khách không
   cần thấy nó to.
4. Trang báo lỗi **404 và 500 bằng tiếng Việt**, mang tên studio và hotline.
   Đây là BB-072 đã nằm sẵn trong sổ, gộp vào đây vì cùng một vấn đề.

**KHÔNG làm, chủ studio chốt để lại:**

- **Ba nhân vật Cục Tẩy, Bút Chì, Hạt Đậu** — sẽ làm ở `babybeanstudio.vn` sau,
  không phải ở đây. Đừng vẽ tạm, đừng để chỗ trống chờ.
- **Khách tra bộ ảnh bằng số điện thoại** — bỏ khỏi đợt này.

## Chừa cửa cho phần tra cứu, nhưng đừng làm

Chủ studio nói rõ: *"bỏ luôn phần khách đăng nhập nhưng để mở sau này muốn làm
là làm được ngay."*

Nghĩa là **bố cục phải có sẵn chỗ** cho một khối tra cứu — giữa phần giới thiệu
và phần chi nhánh — để sau này thêm vào mà không phải xếp lại cả trang. Không
phải viết mã chết rồi ẩn đi; là chia bố cục sao cho một khối mới chen vào được.

Ghi một dòng trong mã tại đúng chỗ đó, nói rõ chỗ này để dành cho việc gì.

**Và khi làm, sẽ KHÔNG phải là "gõ số điện thoại rồi vào".** Số điện thoại nằm
trên đơn giao hàng, trong danh bạ họ hàng, trong nhóm Zalo gia đình — nó không
phải bí mật. Đường đúng là gõ số rồi **nhận mã 6 số qua Zalo**; ô cấu hình
`ZALO_ZNS_TEMPLATE_ID` đã khai sẵn trong `.env.example` từ trước. Ghi câu này
vào chú thích, để người làm tiếp không chọn đường tắt.

## Ba ràng buộc

**Trang phải nhẹ.** Ba mẹ đang sốt ruột tìm ảnh con. Dự án này đã tự host phông
chữ chỉ để không gửi địa chỉ IP của khách sang Google (BB-074) — đừng phá điều
đó. Không nạp mã của bên thứ ba, không phông chữ từ máy chủ ngoài, không thư
viện hoạt hình.

**Chữ đi qua i18n.** `src/i18n/vi.ts` và `en.ts`. BB-069 đã dọn hết chuỗi cứng,
đừng thêm lại.

**Thông tin chi nhánh lấy từ cơ sở dữ liệu**, bảng `branches` (tên, địa chỉ,
hotline). Đừng ghi cứng — studio đổi hotline là phải dựng lại bản web.

Trang gốc là trang công khai, không có phiên đăng nhập. Chỉ lấy đúng ba cột
`name`, `address`, `hotline` của chi nhánh **đang hoạt động**. Đừng trả cả
bảng, đừng trả `settings`.

## Tiêu chí xong

- [ ] `curl -o /dev/null -w "%{http_code}" http://localhost:3000/` → **200**,
      không còn 404.
- [ ] Gõ một địa chỉ bịa → trang 404 **tiếng Việt**, có tên studio và hotline.
- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — không ca nào đang xanh bị đỏ.
- [ ] `npm run verify:wired` sạch.
- [ ] `grep -rniE "connect\.facebook|fbevents|googleapis\.com/css" src/` →
      không kết quả nào.
- [ ] Ở cỡ điện thoại (rộng 375px) trang không bị tràn ngang.

**Kiểm ngược, bắt buộc:** `npm run dev`, chụp màn hình trang gốc ở **cỡ điện
thoại** và cỡ máy tính, cộng ảnh trang 404 tiếng Việt. Dán cả ba vào bàn giao.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
Trang gốc không hiện dữ liệu khách, nhưng ảnh chụp màn hình vẫn phải soát trước
khi đưa vào bàn giao.
