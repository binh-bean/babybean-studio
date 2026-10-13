# Chuyển DNS babybeanstudio.vn sang Cloudflare và mở đường hầm (BB-411)

Tài liệu này là **bước E** trong `docs/31-may-chu-mac.md`.
Làm xong bước C, D trước (app đã chạy trên Mac, mở được `http://localhost:3000/login`).

**Mục tiêu:** khách gõ `https://hauky.babybeanstudio.vn` thì vào app trên Mac của anh.
Website chính và email của studio **chạy y như cũ**.

**Thời gian:** làm tay khoảng 30–45 phút. Chờ nameserver có hiệu lực: vài phút đến 48 giờ.

---

## Bức tranh trước và sau

| | Trước | Sau |
|---|---|---|
| Ai giữ danh bạ DNS | Tenten (`ns-b1/b2/b3.tenten.vn`) | Cloudflare (2 nameserver Cloudflare đưa) |
| Website chính, email | Như hiện tại | **Như hiện tại** (chép y nguyên bản ghi) |
| `hauky` | CNAME về Vercel (đã bị khoá) | CNAME về đường hầm → Mac |
| Tên miền vẫn mua ở | Tenten | **Tenten** (không chuyển nhà đăng ký, chỉ đổi nơi giữ DNS) |

Cloudflare gói Free: **0 đồng**. Không cần thẻ.

---

## E1. Tạo tài khoản Cloudflare (5 phút)

1. Mở https://dash.cloudflare.com/sign-up
2. Dùng email của studio (email anh giữ lâu dài). Đặt mật khẩu mạnh.
3. Xác nhận email.
4. **Bật xác thực 2 lớp:** góc phải trên → My Profile → Authentication → Two-Factor Authentication.
   Ai vào được tài khoản này là đổi được đường vào app.

## E2. Chụp lại danh bạ DNS đang có ở Tenten (10 phút) — BẮT BUỘC

Đây là bước giữ cho website và email không đứt.

1. Đăng nhập https://tenten.vn → **Quản lý tên miền** → bấm `babybeanstudio.vn`.
2. Tìm mục **Quản lý DNS** / **Cấu hình bản ghi** (tên có thể hơi khác).
3. **Chụp màn hình TOÀN BỘ danh sách** (cuộn hết, nhiều trang thì chụp đủ). Lưu vào máy anh.
   Không gửi ảnh này vào nhóm chat.
4. Đánh dấu trên ảnh những dòng quan trọng:

| Loại | Tên (Host) | Để làm gì | Ví dụ giá trị |
|---|---|---|---|
| **MX** | `@` | Nhận email | `aspmx.l.google.com`, `mx.zoho.com`, `mx1.larksuite.com`, máy chủ mail Tenten… |
| **TXT** | `@` | SPF — chống email giả | bắt đầu bằng `v=spf1` |
| **TXT** | `xxx._domainkey` | DKIM — chữ ký email | bắt đầu bằng `v=DKIM1` |
| **TXT** | `_dmarc` | DMARC | bắt đầu bằng `v=DMARC1` |
| **TXT** | `@` | Xác minh Google/Facebook/Lark… | `google-site-verification=…` |
| **A** hoặc **CNAME** | `@`, `www` | Website chính | một địa chỉ IP, hoặc tên máy chủ |
| **CNAME** | `hauky` | App (đang trỏ Vercel) | `cname.vercel-dns.com` hoặc tương tự |
| **A/CNAME** | `mail`, `webmail`, `smtp`, `imap`, `autodiscover` | Email (nếu có) | |

5. Xem có mục **DNSSEC** không. Nếu đang **BẬT** → tắt nó trước (E4).

## E3. Thêm tên miền vào Cloudflare (10 phút)

1. Cloudflare → **Add a domain** (hoặc "Add site").
2. Gõ `babybeanstudio.vn` → chọn **Quick scan for DNS records** → Continue.
3. Chọn gói **Free** → Continue.
4. Cloudflare hiện danh sách bản ghi nó tự tìm được.
   **Đối chiếu TỪNG DÒNG với ảnh chụp ở E2:**
   - Dòng nào ở Tenten có mà Cloudflare **thiếu** → bấm **Add record** và chép y nguyên
     (Loại, Tên, Giá trị, với MX thì cả số **Priority**).
     Cloudflare hay sót: bản ghi `…._domainkey` (DKIM), `_dmarc`, các tên phụ ít gặp.
   - Dòng nào Cloudflare có mà Tenten **không** có → xoá.
5. Cột **Proxy status** (đám mây) — đặt như sau:
   - **Mọi bản ghi liên quan email** (`mail`, `webmail`, `smtp`, `imap`, `pop`, `autodiscover`): **DNS only** (mây xám). Bật mây cam là email hỏng.
   - `@` và `www` (website chính): **DNS only** (mây xám) — giữ y như cũ cho chắc. Sau này muốn bật cam thì hỏi em.
   - `hauky`: **DNS only** (mây xám), giữ trỏ Vercel. Bước E7 sẽ thay nó.
   - MX, TXT: không có đám mây — để nguyên.
6. Bấm Continue. Cloudflare đưa **2 nameserver**, dạng `ten1.ns.cloudflare.com`, `ten2.ns.cloudflare.com`.
   Chép lại đúng 2 tên này.
7. Nếu Cloudflare hỏi các tuỳ chọn "Quick Start" → bỏ qua (Skip / Finish later).

## E4. Tắt DNSSEC ở Tenten (chỉ khi đang bật)

DNSSEC đang bật mà đổi nameserver thì tên miền **mất hẳn** (website + email + app) cho tới khi sửa.

1. Tenten → tên miền → mục DNSSEC → **Tắt** / xoá bản ghi DS.
2. Đợi **24 giờ** rồi mới làm E5.
3. Không thấy mục DNSSEC = chưa bật = bỏ qua bước này.

## E5. Đổi nameserver ở Tenten (5 phút) — website và email KHÔNG đứt nếu E3 đã chép đủ

1. Tenten → **Quản lý tên miền** → `babybeanstudio.vn` → **Đổi Nameserver** / **Cấu hình DNS**.
2. Chọn kiểu "dùng nameserver riêng / DNS khác" (không dùng DNS Tenten).
3. Xoá `ns-b1.tenten.vn`, `ns-b2.tenten.vn`, `ns-b3.tenten.vn`.
4. Dán **2 nameserver Cloudflare** (E3 bước 6). Lưu.
5. Tên miền `.vn` đổi qua VNNIC — có thể Tenten bắt xác nhận qua email/OTP, hoặc mất vài giờ.
   Giao diện không cho đổi → gọi hỗ trợ Tenten, nói:
   *"Đổi nameserver tên miền babybeanstudio.vn sang hai nameserver Cloudflare: …"*
6. **Không xoá** bản ghi DNS bên Tenten. Giữ ít nhất 1 tuần làm đường lùi.

## E6. Chờ Cloudflare báo "Active"

- Cloudflare gửi email *"babybeanstudio.vn is now active on a Cloudflare Free plan"*.
  Thường vài giờ, lâu nhất 48 giờ.
- Kiểm trên Mac (Terminal):
  ```bash
  dig NS babybeanstudio.vn +short
  ```
  Ra 2 tên `…ns.cloudflare.com` là xong.
- **Kiểm website và email ngay khi Active:**
  - Mở website chính trên điện thoại (dùng 4G).
  - Gửi một email từ Gmail cá nhân tới email studio → phải nhận được.
  - Email studio gửi đi một thư → phải tới.
  - `dig MX babybeanstudio.vn +short` ra giống ảnh chụp E2.
  Có gì sai → so lại bản ghi trong Cloudflare → DNS → Records với ảnh chụp, thêm dòng thiếu.

### Ba cài đặt Cloudflare nên chỉnh (cho app chạy đúng)

Cloudflare → chọn `babybeanstudio.vn`:

1. **Scrape Shield → Email Address Obfuscation → Off.**
   Bật thì Cloudflare sửa HTML có địa chỉ email → trang React của app có thể báo lỗi.
2. **Security → Bots → Bot Fight Mode → Off.**
   Bật thì Cloudflare có thể chặn lượt gọi từ **Automation Lark** (`/api/lark/hook`) và từ UptimeRobot.
3. **Speed → Optimization → Rocket Loader → Off** (mặc định đã tắt — chỉ kiểm lại).
   Không bật **Cache Everything** (Caching → Cache Rules): app có trang riêng cho từng gia đình.

---

## E7. Đường hầm (Cloudflare Tunnel) — làm trên Mac

Đường hầm: Mac **tự gọi ra** Cloudflare và giữ kết nối. Không mở cổng modem, không cần IP tĩnh.

Mở Terminal trên Mac, làm lần lượt:

```bash
# 1. Đăng nhập — trình duyệt mở ra, chọn babybeanstudio.vn, bấm Authorize.
#    Tạo tệp ~/.cloudflared/cert.pem (giữ bí mật, không gửi ai).
cloudflared tunnel login

# 2. Tạo đường hầm tên "babybean". In ra một mã dạng 6f1c…-…-…
#    Tạo tệp ~/.cloudflared/<mã>.json (chìa khoá của đường hầm — giữ bí mật).
cloudflared tunnel create babybean

# 3. Chạy lại bộ cài: nó tự viết ~/.cloudflared/config.yml và bật đường hầm chạy nền.
bash ~/babybean/repo/ops/may-chu-mac/cai-dat.sh

# 4. Kiểm: phải thấy "CONNECTOR ID" và vài kết nối (ví dụ sin, hkg).
cloudflared tunnel info babybean
```

Tệp `~/.cloudflared/config.yml` bộ cài viết ra trông như sau (mã là ví dụ):

```yaml
tunnel: 6f1c0000-0000-0000-0000-000000000000
credentials-file: /Users/<tên-anh>/.cloudflared/6f1c0000-0000-0000-0000-000000000000.json
ingress:
  - hostname: hauky.babybeanstudio.vn
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Nghĩa là: chỉ `hauky.babybeanstudio.vn` được đưa vào app ở cổng 3000. Mọi tên khác gõ vào đường hầm → trang 404.
Bộ cài chỉ tự viết khi `~/.cloudflared/` có **đúng một** tệp `<mã>.json`. Có nhiều hơn (từng tạo đường hầm khác) → tự chép mẫu trên, thay mã.

## E8. ⚠️ THỜI ĐIỂM CHUYỂN: app từ Vercel sang Mac

**Lệnh dưới đây là lúc app chuyển nhà.** Trước lệnh này, `hauky` vẫn trỏ Vercel. Sau lệnh này (1–5 phút), mọi người vào `hauky` là vào Mac.

Làm khi: E6 đã Active, E7 `tunnel info` thấy kết nối, và `bash ~/babybean/bin/trang-thai.sh` báo app trả lời ở cổng 3000.

```bash
cloudflared tunnel route dns --overwrite-dns babybean hauky.babybeanstudio.vn
```

Giải thích:
- Lệnh này sửa bản ghi `hauky` trong Cloudflare: **xoá CNAME cũ về Vercel**, thay bằng CNAME về `<mã>.cfargotunnel.com`, mây cam.
- `--overwrite-dns` là để cho phép **thay** bản ghi đang có. Thiếu cờ này thì lệnh báo lỗi "record already exists" và không đổi gì.
- Không thích dùng lệnh: vào Cloudflare → DNS → Records → xoá dòng `hauky` cũ → rồi chạy lệnh trên mà không có `--overwrite-dns`.
- Chứng chỉ HTTPS cho `hauky` do Cloudflare tự cấp (gói Free có sẵn). Không cần làm gì.

Kiểm ngay (dùng điện thoại **4G**, không dùng wifi studio):
1. Mở `https://hauky.babybeanstudio.vn/login` → thấy màn đăng nhập.
2. Đăng nhập bằng tài khoản Admin → mở một bộ ảnh.
3. Trên Mac: `bash ~/babybean/bin/trang-thai.sh` → dòng "Qua tên miền" phải ra **200**.

## Đường lùi (khi cần trả `hauky` về Vercel)

Chỉ dùng khi Vercel đã mở lại (ví dụ nâng gói Pro — xem `docs/31` mục Rủi ro):
1. Cloudflare → DNS → Records → sửa dòng `hauky`:
   Loại **CNAME**, Giá trị `cname.vercel-dns.com`, Proxy **DNS only** (mây xám). Lưu.
2. Vài phút sau `hauky` về Vercel. Đường hầm vẫn chạy nhưng không ai vào.

Muốn trả cả DNS về Tenten: đổi nameserver ở Tenten về `ns-b1/b2/b3.tenten.vn` (bản ghi cũ bên Tenten vẫn còn vì E5 bước 6 đã dặn không xoá).
