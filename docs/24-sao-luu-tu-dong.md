# 24 — Sao lưu tự động (không phụ thuộc máy studio)

Viết cho chủ studio — không cần biết lập trình để làm theo. BB-273.

Chủ studio đã chốt 26/09/2026: *"sau khi hoàn thành tôi muốn sao lưu tự động
không phụ thuộc máy này"*. Tài liệu này thay cho cách cũ (`scripts/sao-luu-hang-tuan.cmd`
chạy bằng Task Scheduler trên máy studio — nếu máy tắt hoặc mạng đứt thì tuần
đó không có bản sao lưu nào).

Từ giờ, việc sao lưu chạy trên máy chủ của GitHub, mỗi ngày lúc 02:00 giờ Việt
Nam, không cần máy studio bật.

---

## 1. Vì sao phải bật thêm bước, không chạy ngay được

Kho mã nguồn `binh-bean/babybean-studio` là **công khai** (ai cũng xem được
trên GitHub). Sao lưu chứa **tên và số điện thoại thật của khách hàng**. Nếu
để nguyên, chạy tự động sẽ tạo ra một bản sao dữ liệu khách hàng công khai mỗi
ngày — vì vậy:

1. Tệp sao lưu luôn được **mã hoá** trước khi rời máy chủ GitHub.
2. Máy chủ GitHub **không tự có** mật khẩu hay đường vào cơ sở dữ liệu — chủ
   studio phải tự đặt hai thứ đó ("bí mật", gọi là *Secret*) thì việc sao lưu
   mới chạy. Chưa đặt thì lịch chạy mỗi ngày vẫn báo **thành công (xanh)**,
   chỉ là không làm gì — coi như đang "ngủ".

## 2. Bật sao lưu tự động — làm một lần

### Bước 1 — Lấy chuỗi kết nối cơ sở dữ liệu (Supabase)

1. Vào [supabase.com](https://supabase.com), mở dự án app ĐANG CHẠY THẬT (hôm nay 26/09 là **bb-dev**; sau khi chốt cơ sở dữ liệu chính thức ở docs/23 thì dùng dự án đó).
2. Bấm nút **Connect** (góc trên) → **Connection string** → chọn tab **URI**.
3. Chọn kiểu **Session pooler** (không chọn "Direct connection" — pooler chạy
   ổn định hơn từ máy chủ GitHub).
4. Copy chuỗi hiện ra, dạng
   `postgresql://postgres.xxxx:MATKHAU@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`.
   Chuỗi này **đã có sẵn mật khẩu cơ sở dữ liệu** trong đó — giữ kín, đừng dán
   vào đâu ngoài bước 3 dưới đây.

### Bước 2 — Tự đặt một mật khẩu mã hoá riêng (không phải mật khẩu ở bước 1)

Đây là mật khẩu **do chủ studio tự nghĩ ra**, dùng để khoá/mở tệp sao lưu.

- Dài **ít nhất 20 ký tự**. Càng dài, càng nhiều loại ký tự càng khó đoán.
  Ví dụ cách nghĩ nhanh: nối 4-5 từ tiếng Việt không dấu, cách nhau bằng dấu
  gạch, cỡ `chumeo-nhaydayqua-buoichieu-2026`.
- **Cất vào một nơi an toàn** (sổ tay, trình quản lý mật khẩu, hoặc in ra cất
  tủ) — **không** gửi qua Zalo/email/chat. **Mất mật khẩu này là mất khả năng
  mở MỌI bản sao lưu đã có, kể cả bản cũ** — không ai, kể cả Claude hay
  Anthropic, mở lại được giúp.

### Bước 3 — Thêm 2 Secret trên GitHub

1. Mở kho `binh-bean/babybean-studio` trên GitHub (đăng nhập bằng tài khoản có
   quyền quản trị kho).
2. Vào **Settings** → **Secrets and variables** → **Actions**.
3. Bấm **New repository secret**, tạo lần lượt hai secret:

   | Tên (gõ đúng chính tả, chữ HOA) | Giá trị |
   |---|---|
   | `BACKUP_DATABASE_URL` | Chuỗi kết nối lấy ở Bước 1 |
   | `BACKUP_PASSPHRASE` | Mật khẩu tự đặt ở Bước 2 |

4. Xong bước này, lịch chạy đêm tiếp theo (02:00 giờ VN) sẽ tự bật — không cần
   làm gì thêm.

### Kiểm thử ngay, không đợi tới đêm (khuyến khích làm ngay sau khi bật)

1. Vào tab **Actions** trên GitHub → chọn workflow **"Sao lưu tự động"** ở cột
   trái.
2. Bấm **Run workflow** → **Run workflow** (chạy tay một lần).
3. Đợi khoảng 1-2 phút, thấy dấu tích xanh là đã có bản sao lưu đầu tiên. Bấm
   vào lượt chạy đó để tải thử (xem mục 3).

## 3. Tải bản sao lưu về và giải mã

1. Tab **Actions** → chọn workflow **"Sao lưu tự động"** → chọn một lượt chạy
   đã xong (dấu tích xanh).
2. Cuộn xuống mục **Artifacts**, bấm tải tệp tên dạng
   `sao-luu-2026-09-26-...` (có ngày trong tên) — tải về máy dạng
   `.zip`, giải nén ra được một tệp `....sql.enc`.
3. Mở cửa sổ dòng lệnh (Terminal / PowerShell) tại thư mục dự án
   `babybean-studio`, chạy:

   ```
   npm run db:giai-ma -- "duong/dan/den/tep-vua-tai.sql.enc" "duong/dan/muon-luu-ra.sql"
   ```

   Máy sẽ hỏi mật khẩu qua biến môi trường — cách đặt tuỳ hệ điều hành:

   - **PowerShell (Windows)**:
     ```
     $env:BACKUP_PASSPHRASE = "mật khẩu đã đặt ở Bước 2"
     npm run db:giai-ma -- "tep-vua-tai.sql.enc" "ra.sql"
     ```
   - **Bash/macOS/Linux**:
     ```
     BACKUP_PASSPHRASE="mật khẩu đã đặt ở Bước 2" npm run db:giai-ma -- "tep-vua-tai.sql.enc" "ra.sql"
     ```

4. Sai mật khẩu hoặc tệp hỏng sẽ báo lỗi rõ ràng bằng tiếng Việt và **không**
   tạo ra tệp `ra.sql` dở dang — không cần lo tệp đó là bản đọc sai mà không
   biết.
5. Tệp `.sql` giải mã ra **chứa dữ liệu khách hàng thật** — giữ trên máy, xoá
   sau khi dùng xong, không gửi qua chat/email, không đẩy lên kho GitHub.

## 4. Phục hồi từ bản sao lưu (khi cần)

Tệp `.sql` giải mã ra đã có sẵn hướng dẫn phục hồi ở ngay đầu tệp (mở bằng
Notepad hoặc trình soạn thảo bất kỳ, đọc phần bắt đầu bằng `--`). Tóm tắt ba
bước (chi tiết đầy đủ nằm trong chính tệp và ở `scripts/backup.mjs`):

1. Dựng lại cấu trúc cơ sở dữ liệu trống bằng `scripts/setup-prod.mjs`.
2. Tạo lại tài khoản đăng nhập nhân viên trong Supabase → **Authentication →
   Users**, giữ **đúng UUID cũ** như trong tệp (tệp sao lưu không chứa mật
   khẩu đăng nhập của ai — chỉ có hồ sơ, không có tài khoản).
3. Nạp tệp `.sql` đã giải mã vào cơ sở dữ liệu.

Việc này nên làm cùng người hiểu kỹ thuật (Claude hoặc dev) — không tự làm một
mình nếu chưa quen thao tác cơ sở dữ liệu.

## 5. Giới hạn cần biết

- **Artifact (bản sao lưu đã mã hoá) chỉ giữ 90 ngày** trên GitHub rồi tự xoá.
  Muốn giữ lâu hơn, tự tải về lưu ở nơi khác (ổ cứng, Drive riêng) trước khi
  hết hạn.
- **GitHub tự tắt lịch chạy nếu kho không có commit nào trong 60 ngày.** Kho
  này thường xuyên có thay đổi nên hiếm khi xảy ra; nếu xảy ra, vào tab
  **Actions** → workflow **"Sao lưu tự động"** → sẽ thấy dòng cảnh báo "This
  scheduled workflow is disabled" → bấm **Enable workflow** để bật lại (không
  cần đặt lại 2 Secret, chúng vẫn còn nguyên).
- **Không sao lưu tài khoản đăng nhập** (mật khẩu nhân viên) và **không sao
  lưu ảnh trên Google Drive** — chỉ sao lưu dữ liệu trong cơ sở dữ liệu
  (khách hàng, bộ ảnh, lựa chọn, ghi chú…). Ảnh gốc vẫn nằm an toàn trên Google
  Drive của studio, không cần sao lưu riêng.
- Sao lưu chỉ lấy dữ liệu, không lấy cấu trúc bảng — xem thêm phần đầu tệp
  `scripts/backup.mjs` nếu muốn hiểu vì sao (cấu trúc đã nằm sẵn trong kho mã
  nguồn, dựng lại được bất cứ lúc nào).
