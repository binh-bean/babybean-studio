# BB-172 — Màn Vai trò và quyền

**Cửa sổ: ARCH.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-arch` — nhánh `agent/arch`.

**Không phải SEC-ARCH.** SEC-ARCH đang làm BB-171 (nút xoá tài khoản) trong một
cửa sổ khác. Hai việc cùng chủ đề nhân sự — đọc mục cuối trước khi gõ phím.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Chủ studio muốn gì

*"Chưa có bảng vai trò để tạo và cài đặt cho từng vai trò mà tôi muốn bằng cách
tích chọn các chức năng nhân sự có thể sử dụng và quyền hạn sử dụng như đọc,
ghi, sửa, xoá."*

Tức là: một màn hình để tự tạo vai trò và tự tick quyền, thay vì vai trò là
danh sách cứng trong tài liệu.

## Đây là việc lớn nhất trong sổ — đọc kỹ trước khi làm

Hôm nay vai trò **không nằm trong dữ liệu**. Chúng nằm ở hai chỗ, và cả hai
đều là mã:

- `docs/05-rbac.md` — bảng phân quyền viết tay.
- **Luật quyền trong cơ sở dữ liệu** (`db/policies.sql`, hàm `app.my_role()`,
  và các chính sách trên 22 bảng). Đây mới là chỗ quyết định thật.

Nghĩa là "thêm một vai trò" hôm nay = sửa SQL + migration + phát hành lại. Việc
của bạn là đổi mô hình đó — và đó là thay đổi kiến trúc, không phải thêm một màn
hình.

## Chặng 1 — CHỈ LÀM ADR, CHƯA VIẾT MÃ

Viết **ADR-0007** theo `docs/adr/ADR-TEMPLATE.md`. Đừng viết một dòng mã nào
trước khi ADR được PM duyệt. `db/migrations/README.md` đã ghi thành luật:
migration chỉ được viết **sau khi có ADR được duyệt**.

ADR phải trả lời được bốn câu, mỗi câu kèm cái giá:

**1. Quyền được kiểm ở đâu?** Hôm nay là ở cơ sở dữ liệu, bằng luật quyền theo
dòng — đó là lý do một lỗi ở tầng ứng dụng vẫn không làm lộ dữ liệu chi nhánh
khác. Chuyển sang kiểm ở tầng ứng dụng là **mất lớp đó**. Nếu ADR đề xuất mô
hình dữ liệu cho quyền, phải nói rõ luật quyền trong cơ sở dữ liệu còn lại gì.

**2. Vai trò tự tạo thì luật quyền đọc chúng thế nào?** Chính sách trên 22 bảng
đang so sánh với chuỗi vai trò cố định. Vai trò động nghĩa là chúng phải tra
bảng — và tra bảng trong mỗi chính sách là chi phí trên **mọi** câu truy vấn.
Đo trước, đừng đoán.

**3. Vai trò nào KHÔNG được sửa?** `owner` phải luôn giữ toàn quyền. Không có
chốt này thì chủ studio tự tick bỏ quyền của chính mình và **không ai vào được
nữa** — kể cả để sửa lại. Đây là chỗ hỏng không có đường lùi.

**4. Đổi quyền có ghi lại không?** Ai đổi, đổi gì, lúc nào. `activity_logs` đã
có sẵn và đang có 6.420 dòng.

## Chặng 2 — sau khi ADR được duyệt

Chưa giao. Đừng tự bắt đầu.

## Ba chỗ đừng đụng

**Đừng nới lỏng luật quyền để cho dễ làm.** `docs/12-security.md` và bộ phép
thử bảo mật là lưới đỡ chính của dự án. Một chính sách bị gỡ đi để "làm cho
chạy" là một chi nhánh nhìn thấy dữ liệu của chi nhánh khác.

**Đừng sửa `scripts/ownership.mjs`.** Tệp được bảo vệ, chỉ PM sửa. Cần đổi thì
xin trong ADR — DEV-INT đã làm đúng cách này ở ADR-0006.

**Đừng đụng màn Nhân sự.** SEC-ARCH đang làm ở đó.

## Tiêu chí xong chặng 1

- [ ] `docs/adr/ADR-0007-<mô-tả-ngắn>.md` tồn tại, đặt tên đúng quy ước của sáu
      ADR trước (`ADR-000N-slug.md` — hai ADR gần đây đặt sai, đừng lặp lại).
- [ ] Trả lời đủ bốn câu trên, mỗi câu **kèm cái giá phải trả**, không chỉ nêu
      cái được.
- [ ] Có mục "Điều kiện xem lại".
- [ ] `git diff --stat` **không** đụng `src/` và **không** đụng `db/`. Chặng 1
      là suy nghĩ, không phải mã.
- [ ] `npm run test` — **321/321**, không đổi. Bạn chưa sửa gì thì không ca nào
      được phép đỏ hay biến mất.

Bàn giao nêu rõ **ước lượng chặng 2**: bao nhiêu migration, bao nhiêu chính sách
phải viết lại, và phần nào cần SEC-ARCH soát.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
