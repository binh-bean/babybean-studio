# BB-177 · 178 — Màn chi tiết bộ ảnh: link app, và địa chỉ đọc được

**Cửa sổ: DEV-FE.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-fe` — nhánh `agent/dev-fe`.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## BB-177 · Luôn hiện link app và tình trạng của nó

Màn chi tiết bộ ảnh có một khối **Thư mục ảnh gốc** rất rõ ràng: hiện link
Drive, số ảnh đã kéo về, lần đồng bộ cuối, kèm hai nút Đồng bộ lại và Đổi thư
mục.

Ngay dưới nó, khối **Link gửi khách** chỉ có một dòng chữ *"Bộ ảnh đã có link
đang dùng"* và một nút bị khoá. **Không thấy link, không bấm chép được, không
biết link còn sống hay đã thu hồi.**

CSKH cần dán link đó cho khách mỗi ngày. Hiện họ phải mò sang chỗ khác.

Làm khối này **cùng dáng với khối Thư mục ảnh gốc**:

- Link đầy đủ, chép được bằng một nút.
- Tình trạng: đang dùng · đã thu hồi · đã hết hạn.
- Ngày cấp, và ngày hết hạn khi có (BB-183 đang làm phần đặt hạn — **đọc nếu
  có, để trống nếu chưa có**, đừng chờ nó xong).
- Số lượt khách đã mở, nếu cột đó có sẵn dữ liệu.

**Đừng hiện mã token trần ra nơi nào khác ngoài chính cái link.** Sau khi bỏ
PIN, chuỗi 22 ký tự đó là thứ **duy nhất** che ảnh của một nhà. Không ghi nó
vào nhật ký, không đưa vào thuộc tính `title`, không nhét vào tên tệp khi chép.

## BB-178 · Địa chỉ màn quản trị đang là chuỗi máy đọc

Hôm nay: `/admin/galleries/f2c8878a-02ba-4503-82d6-68f5d4abc213`.

Chủ studio muốn chuỗi đó đọc được. **Dùng MÃ HỢP ĐỒNG** (`HD_20260824#4884`),
và **tuyệt đối không dùng mã khách hàng** — mã khách bên Lark gộp cả tên lẫn số
điện thoại vào chuỗi, đặt nó lên thanh địa chỉ là rải dữ liệu cá nhân vào lịch
sử trình duyệt của mọi máy trong studio và vào nhật ký máy chủ.

Bốn ràng buộc:

1. **Chỉ đổi màn quản trị.** Link gửi khách (`/g/<token>`) giữ nguyên chuỗi
   ngẫu nhiên. Đó là lớp bảo vệ duy nhất còn lại.
2. **Địa chỉ cũ phải còn mở được.** Nhân viên có dấu trang, và có link dán
   trong nhóm Lark. Nhận cả hai dạng: gặp chuỗi dạng UUID thì tra theo `id`,
   gặp dạng khác thì tra theo mã hợp đồng.
3. **Mã hợp đồng không phải lúc nào cũng có, và không phải lúc nào cũng duy
   nhất.** Đo trên bb-dev: có bộ gom **nhiều** mã hợp đồng
   (`lark_contract_codes` là mảng), và có bộ **không có mã nào**. Không có mã
   thì giữ nguyên UUID — đừng bịa. Trùng mã thì phải chọn dứt khoát và ghi rõ
   cách chọn trong bàn giao.
4. **Dấu `#` trong mã hợp đồng phải mã hoá khi đưa lên địa chỉ.** `#` trong URL
   là dấu neo — để nguyên là phần sau nó không bao giờ tới máy chủ.

## Tiêu chí xong

- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — **321/321** cộng ca bạn thêm.
- [ ] `AGENTS.md §5a`: hoàn nguyên bản vá thì phép thử phải **ĐỎ**. Làm thật,
      dán cả hai kết quả vào bàn giao.
- [ ] Ca bắt buộc cho BB-178: mở bằng UUID cũ **vẫn vào được**; mở bằng mã hợp
      đồng vào được; bộ không có mã hợp đồng vẫn mở được bằng UUID; mã chứa `#`
      không làm gãy đường.
- [ ] `grep -rn "token" src/components/features/admin/gallery-detail.tsx` —
      soát lại từng chỗ, token không được lộ ra ngoài chính cái link.
- [ ] Chữ mới đi qua i18n, `vi.ts` và `en.ts` cùng bộ khoá.

**Kiểm ngược, bắt buộc:** `npm run dev`, mở một bộ ảnh thật, chụp khối Link gửi
khách. Rồi mở cùng bộ đó bằng **cả hai** dạng địa chỉ, dán lại cả hai địa chỉ
và kết quả. Che tên khách.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
Dọn rác sau khi xong: `npm run db:cleanup`.
