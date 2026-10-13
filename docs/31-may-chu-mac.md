# 31 — Chạy app BabyBean trên MacBook (thay Vercel) — BB-411

**Dành cho:** anh (chủ studio). Không cần biết lập trình: mỗi bước là một lệnh để chép, dán vào Terminal, bấm Enter.

**Vì sao:** Vercel gói Hobby khoá tài khoản vì vượt hạn mức "Fluid Active CPU". Từ nay app chạy trên MacBook Pro i9 của anh (máy đang chạy OpenClaw "Trợ lý Bean"), ra Internet qua Cloudflare Tunnel. Tên miền giữ nguyên: `https://hauky.babybeanstudio.vn`.

**Bộ cài nằm ở:** `ops/may-chu-mac/` trong repo.

---

## 1. Kiến trúc — Mac chỉ chạy phần web

```
  Khách / nhân viên / Lark Automation
              │  https://hauky.babybeanstudio.vn
              ▼
        Cloudflare (DNS + HTTPS, gói Free)
              │  đường hầm — Mac tự gọi ra, không mở cổng modem
              ▼
  ┌──────── MacBook Pro i9 ────────────────────────┐
  │ cloudflared ──► app Next.js (127.0.0.1:3000)    │
  │ launchd: tự bật lại, lịch 01:00 & 08:00,        │
  │          tự cập nhật 5 phút/lần, canh gác 1 phút│
  └─────────────┬───────────────────────────────────┘
                │
     ┌──────────┼──────────────┬───────────────┐
     ▼          ▼              ▼               ▼
  Supabase   Google Drive     Lark          GitHub (mã nguồn)
  (bb-prod)  (ảnh gốc)        (chat, Base)
```

**Điều quan trọng nhất:** dữ liệu **không** nằm trên Mac.
- Khách, bộ ảnh, lượt chọn, hậu kỳ → Supabase (bb-prod).
- Ảnh → Google Drive.
- Mã nguồn → GitHub.

Mac hỏng, mất, cháy → **không mất dữ liệu**. Chỉ mất chỗ chạy web, dựng lại trên máy khác khoảng 1 giờ (mục 5).

Trên Mac, mọi thứ nằm trong một thư mục `~/babybean/`:

| Đường dẫn | Là gì |
|---|---|
| `~/babybean/.env.production.local` | Tệp khoá (chỉ anh đọc được) |
| `~/babybean/repo/` | Bản sao mã nguồn từ GitHub |
| `~/babybean/releases/<mã>/` | Các bản đã dựng (giữ 3 bản gần nhất) |
| `~/babybean/current` | Lối tắt trỏ vào bản đang chạy |
| `~/babybean/bin/` | Các lệnh vận hành (`trang-thai.sh`, `cap-nhat.sh`, `quay-lai.sh`…) |
| `~/babybean/logs/` | Nhật ký (tự xoay vòng, mỗi tệp tối đa ~5 MB × 4) |

Bảy dịch vụ chạy nền (launchd, trong tài khoản của anh, không cần sudo):

| Nhãn | Việc | Khi nào |
|---|---|---|
| `vn.babybean.app` | Chạy app (`next start`, cổng 3000, chỉ nghe trong máy) | Luôn luôn; chết là tự bật lại |
| `vn.babybean.tunnel` | Đường hầm Cloudflare | Luôn luôn |
| `vn.babybean.cron-het-han` | Gọi `/api/cron/expire-galleries` | 01:00 hằng ngày (giờ VN) |
| `vn.babybean.cron-hau-ky` | Gọi `/api/cron/hau-ky` | 08:00 hằng ngày (giờ VN) |
| `vn.babybean.tu-cap-nhat` | Có bản mới trên GitHub → dựng, chạy thử, chuyển | 5 phút một lần |
| `vn.babybean.canh-gac` | Kiểm app; hỏng 3 lần liền → khởi động lại + báo Lark | 1 phút một lần |
| `vn.babybean.don-log` | Xoay vòng nhật ký | 03:30 hằng ngày |

Hai giờ chạy lịch giống hệt `vercel.json` (18:00 và 01:00 giờ UTC = 01:00 và 08:00 giờ VN).
Máy **phải** đặt múi giờ Việt Nam — bộ cài kiểm và dừng lại nếu sai.
Nếu Mac đang ngủ/tắt đúng giờ lịch, macOS chạy bù ngay khi máy thức.

---

## 2. Thứ tự làm — A đến G

Mở **Terminal**: bấm `Cmd + Space`, gõ `Terminal`, Enter.
Dán lệnh: `Cmd + V`, rồi Enter. Lệnh hỏi mật khẩu thì gõ mật khẩu đăng nhập Mac (gõ không hiện chữ là bình thường).

### A. Chuẩn bị Mac (30 phút)

1. **Cắm sạc** suốt. Nên cắm qua **bộ lưu điện (UPS)** loại nhỏ (≥ 600VA), cắm luôn modem/router vào UPS.
2. **Mạng:** cắm **dây LAN** nếu được (ổn định hơn wifi). Chuẩn bị **4G dự phòng** (mục 4).
3. **Nắp:** để **mở nắp**, hoặc cắm màn hình ngoài + bàn phím. **Gập nắp là máy ngủ, app tắt.**
4. **Cập nhật macOS một lần cho xong** (System Settings → General → Software Update), rồi **tắt tự cài**:
   Software Update → (i) Automatic updates → tắt "Install macOS updates". Giữ bật "Install Security Responses".
   Lý do: tự cài là tự khởi động lại máy lúc nửa đêm.
5. **Giờ:** System Settings → General → Date & Time → bật "Set time and date automatically", múi giờ **Ho Chi Minh City**.
6. **Đăng nhập & FileVault — anh chọn 1 trong 2** (đọc mục 4, dòng "Mất điện"):
   - **Cách 1 (em khuyên):** FileVault **BẬT**. Khoá trên ổ được mã hoá. Đổi lại: mất điện lâu hơn UPS → máy bật lại nhưng **dừng ở màn hình nhập mật khẩu**; phải có người gõ mật khẩu, app mới chạy.
   - **Cách 2:** FileVault **TẮT** + bật **Automatic login** (Users & Groups). Mất điện xong máy tự vào, app tự chạy. Đổi lại: ai lấy được máy là đọc được tệp khoá.
7. **Cài Homebrew** (trình cài phần mềm chính thức cho Mac). Mở https://brew.sh, chép đúng lệnh trên trang đó, dán vào Terminal. Hỏi mật khẩu thì gõ. Mất 5–15 phút.
   Cài xong, **đóng Terminal và mở lại**.
8. **Tải mã nguồn:**
   ```bash
   mkdir -p ~/babybean && git clone https://github.com/binh-bean/babybean-studio.git ~/babybean/repo
   ```

### B. Điền khoá (15 phút)

1. Chạy bộ cài lần đầu — nó tạo tệp khoá mẫu rồi dừng:
   ```bash
   bash ~/babybean/repo/ops/may-chu-mac/cai-dat.sh
   ```
2. Mở tệp khoá:
   ```bash
   open -e ~/babybean/.env.production.local
   ```
3. Điền từng dòng theo chú thích trong tệp. Nguồn nhanh nhất: Vercel → project → Settings → Environment Variables → **Production** (bấm con mắt để xem).
   - `APP_SECRET`, cặp `VAPID`, `SYNC_CRON_SECRET`: **phải giữ đúng giá trị cũ** (đổi là khách bị văng, thông báo đẩy hỏng, Lark nhận 401).
   - `NEXT_PUBLIC_APP_URL` để nguyên `https://hauky.babybeanstudio.vn`.
4. `Cmd + S`, đóng TextEdit.
5. **Cất một bản sao** tệp này vào trình quản lý mật khẩu (1Password, Bitwarden, hoặc Ghi chú khoá của iCloud Keychain). Đây là thứ cần nhất khi dựng lại trên máy khác. **Không** để trong Lark, Drive, Zalo, email.

### C. Cài (10–15 phút, phần lớn là chờ)

```bash
bash ~/babybean/repo/ops/may-chu-mac/cai-dat.sh
```

Bộ cài làm 10 bước, in tiếng Việt từng bước: kiểm Mac và múi giờ → cài `node@22`, `git`, `cloudflared` → cập nhật mã → kiểm khoá (chỉ kiểm tên và dạng, không in giá trị) → dựng bản phát hành → cài 7 dịch vụ nền → đợi app trả lời.

Lỗi ở đâu, nó **dừng ngay** và nói cách sửa. Sửa xong, chạy lại **đúng lệnh trên** — bước nào xong rồi thì nó bỏ qua.

Cuối cùng nó in 6 lệnh `sudo pmset …`. **Dán từng lệnh** (cần mật khẩu máy): máy không ngủ, có điện lại thì tự bật.

### D. Kiểm trong máy (5 phút)

1. Trên Mac, mở Safari: `http://localhost:3000/login` → thấy màn đăng nhập.
2. Đăng nhập Admin, mở thử một bộ ảnh.
3. Terminal:
   ```bash
   bash ~/babybean/bin/trang-thai.sh
   ```
   Phải thấy: app trả lời; 7 dịch vụ "đã nạp" (trừ tunnel — chưa làm bước E).
   Dòng "Qua tên miền" lúc này **chưa** ra 200 — bình thường.

### E. Cloudflare + đường hầm (45 phút làm + chờ)

Làm theo **`ops/may-chu-mac/cloudflare-dns.md`**, mục E1 → E8.

**⚠️ Đúng lúc chạy lệnh ở E8 (`cloudflared tunnel route dns --overwrite-dns …`) là app chuyển từ Vercel sang Mac.**
Trước đó, đổi nameserver (E5) **không** làm `hauky` đổi chỗ — nó vẫn trỏ Vercel.

### F. Kiểm qua tên miền, lịch và Lark (15 phút + hôm sau)

1. Điện thoại dùng **4G**: mở `https://hauky.babybeanstudio.vn/login` → đăng nhập → mở bộ ảnh.
2. Mở thử một link gia đình cũ (link khách đang dùng) → vẫn vào được.
3. `bash ~/babybean/bin/trang-thai.sh` → "Qua tên miền" ra **200**; dịch vụ `vn.babybean.tunnel` đã nạp.
4. **Hook Lark:** sửa một dòng Hậu Kỳ bên Lark (việc vẫn làm hằng ngày, kích hoạt Automation) → vài giây sau app cập nhật theo. Hai Automation Lark **không cần sửa gì** (vẫn gọi `https://hauky.babybeanstudio.vn/api/lark/hook`).
5. **Lịch:** sáng hôm sau, sau 08:00:
   ```bash
   tail -n 6 ~/babybean/logs/cron.log
   ```
   Phải có hai dòng `HTTP 200`: một lúc 01:00 (`expire-galleries`), một lúc 08:00 (`hau-ky`).
   Muốn thử ngay không đợi (làm đúng việc của lịch hằng ngày, không có hại):
   ```bash
   bash ~/babybean/bin/goi-cron.sh /api/cron/hau-ky
   ```

### G. Theo dõi hằng ngày

1. **UptimeRobot (miễn phí) — canh từ bên ngoài.** Canh gác trên Mac không báo được khi chính Mac tắt; UptimeRobot thì báo được.
   - Đăng ký https://uptimerobot.com (gói Free).
   - **Add New Monitor** → Monitor Type **HTTP(s)** → URL `https://hauky.babybeanstudio.vn/login` → Interval **5 minutes**.
   - Alert contacts: email của anh; thêm **Telegram** nếu dùng (Integrations → Telegram).
   - Ra "Down" là: Mac tắt, mất mạng, hoặc đường hầm đứt.
2. **Báo trong Lark (tuỳ chọn):** điền `LARK_WEBHOOK_CANH_GAC` trong tệp khoá (cách lấy ghi trong tệp). Máy sẽ nhắn vào nhóm khi: app hỏng phải khởi động lại, bản mới dựng hỏng, lịch chạy hỏng.
3. Mỗi tuần một lần: `bash ~/babybean/bin/trang-thai.sh` — xem ổ đĩa còn trống, lỗi gần nhất.

---

## 3. Phát hành từ nay (em — Claude — làm thế nào)

- Em đẩy mã lên nhánh `main` trên GitHub như cũ (theo luật phát hành `reset --soft`).
- Mac **tự thấy trong ≤ 5 phút**, rồi dựng bản mới thêm **khoảng 3–8 phút**. App cũ vẫn phục vụ khách suốt lúc dựng.
- Dựng xong, máy **chạy thử bản mới ở cổng 3001** và mở `/login`. Đạt mới chuyển. Chuyển xong mà cổng 3000 không lên → **tự quay về bản cũ**.
- Bản hỏng bị ghi "bỏ qua" (không dựng lại mỗi 5 phút) và báo Lark nếu có webhook. Em sửa, đẩy commit mới là máy thử lại.
- App chỉ gián đoạn vài giây lúc chuyển (khởi động lại `next start`).

Lệnh anh có thể cần (em sẽ nói khi nào dùng):

| Việc | Lệnh |
|---|---|
| Xem tình trạng | `bash ~/babybean/bin/trang-thai.sh` |
| Cập nhật ngay, không đợi 5 phút | `bash ~/babybean/bin/cap-nhat.sh` |
| Bản mới chạy sai → về bản trước | `bash ~/babybean/bin/quay-lai.sh` |
| Khởi động lại app | `launchctl kickstart -k gui/$(id -u)/vn.babybean.app` |
| Xem nhật ký app | `tail -n 50 ~/babybean/logs/app.log` |
| Cài lại / sửa dịch vụ nền | `bash ~/babybean/repo/ops/may-chu-mac/cai-dat.sh` |

Ghi chú cho em (Claude) khi sửa bộ cài:
- Sửa script trong `ops/may-chu-mac/` → bản tự cập nhật thành công sẽ tự chép script mới vào `~/babybean/bin/` (chỉ khi qua `bash -n`).
- Sửa lịch, nhãn, plist (`lib/plist.sh`) → anh phải **chạy lại `cai-dat.sh`**, vì plist chỉ được nạp lại ở đó.
- Đổi `vercel.json` (thêm/đổi lịch) → phải sửa `lib/plist.sh` theo; `bash ops/may-chu-mac/kiem-tra-tinh.sh` sẽ đỏ nếu lệch.
- Biến `NEXT_PUBLIC_*` được nướng vào bản dựng: đổi trong tệp khoá xong phải chạy `bash ~/babybean/bin/cap-nhat.sh --dung-lai` (dựng lại chính bản đang chạy vào thư mục mới, chạy thử rồi mới chuyển).
- Biến khác (không `NEXT_PUBLIC_`): đổi xong chỉ cần khởi động lại app.

---

## 4. Rủi ro và cách phòng

| Rủi ro | Hậu quả | Cách phòng / xử lý |
|---|---|---|
| **Mất điện** | App tắt tới khi máy bật lại | UPS cho Mac + modem. `sudo pmset -a autorestart 1` → có điện lại máy tự bật. **Lưu ý FileVault (mục A6):** bật FileVault thì máy dừng ở màn mật khẩu → cần người gõ; tắt FileVault + Automatic login thì tự chạy hết. UptimeRobot báo để anh biết. |
| **Mất mạng / nhà mạng lỗi** | Khách không vào được; dữ liệu không mất | Cắm dây LAN. Chuẩn bị **4G dự phòng**: điện thoại phát wifi hoặc router 4G. Đường hầm tự nối lại khi có mạng, **không phải cấu hình gì** (không cần IP tĩnh). |
| **macOS tự cập nhật, khởi động lại** | Tắt vài phút | Tắt tự cài macOS (mục A4), cập nhật tay khi có người ở máy. Sau khởi động lại + đăng nhập, launchd **tự bật** app, tunnel, lịch. |
| **Máy ngủ** | App tắt | `sudo pmset -a sleep 0 disksleep 0`. Kiểm: `pmset -g`. |
| **Gập nắp** | Máy ngủ dù đã đặt pmset | Mở nắp, hoặc dùng màn hình ngoài + sạc + bàn phím (chế độ clamshell). |
| **Hết ổ đĩa** | Không dựng được bản mới; app có thể lỗi | Tự giữ 3 bản gần nhất, log tự xoay vòng. Bộ cài không dựng khi ổ còn < 5 GB. `trang-thai.sh` in dung lượng còn trống. Dọn tay: xoá thư mục cũ trong `~/babybean/releases/` (không xoá bản `current` đang trỏ). |
| **Lộ khoá** | Người khác đọc được dữ liệu khách | Tệp khoá `chmod 600` (chỉ tài khoản anh đọc). FileVault. Không gửi tệp khoá qua chat. App chỉ nghe `127.0.0.1` — người ngoài chỉ vào được qua Cloudflare. Nghi lộ: đổi khoá theo `docs/26` mục A2. |
| **Mac hỏng / mất** | App tắt; **dữ liệu còn nguyên** | **Cách 1 — dựng lại trên Mac khác (~1 giờ):** làm lại A → D trên máy mới, dán tệp khoá từ trình quản lý mật khẩu (mục B5). Rồi `cloudflared tunnel login`, `cloudflared tunnel create babybean2`, chạy lại `cai-dat.sh`, và `cloudflared tunnel route dns --overwrite-dns babybean2 hauky.babybeanstudio.vn`. **Cách 2 — về Vercel tạm:** nâng Vercel lên gói **Pro** (trả phí theo tháng, hạn mức cao hơn nhiều, vượt thì tính thêm tiền thay vì khoá) → Redeploy → trong Cloudflare sửa bản ghi `hauky` thành CNAME `cname.vercel-dns.com`, **DNS only** (xem `cloudflare-dns.md` mục Đường lùi). Nếu Mac còn sống mà về Vercel → tắt hai lịch trên Mac kẻo chạy đôi: `launchctl bootout gui/$(id -u)/vn.babybean.cron-het-han` và `… /vn.babybean.cron-hau-ky`. |
| **Supabase gói Free tạm dừng** sau 7 ngày không ai dùng | App mở ra lỗi dữ liệu | App dùng hằng ngày + 2 lịch mỗi ngày gọi Supabase → **không** rơi vào cảnh này. Nếu có: Supabase Dashboard → project bb-prod → **Restore project** → đợi vài phút. |
| **Đồng hồ máy lệch** | Đăng nhập lỗi, lịch chạy sai giờ, chữ ký Lark bị từ chối | Bật "Set time and date automatically" (mục A5, máy dùng NTP của Apple). Kiểm: `sntp time.apple.com` (lệch vài giây là được). |
| **Bản mới hỏng** | Không ảnh hưởng — app giữ bản cũ | Tự cập nhật chạy thử trước khi chuyển, tự quay lại nếu hỏng. Phát hiện muộn: `quay-lai.sh`. |
| **App treo** | Khách thấy trang lỗi | Canh gác 1 phút/lần, hỏng 3 lần liền tự khởi động lại; launchd tự bật lại nếu app chết. |
| **Cloudflare cắt yêu cầu dài > 100 giây** | Một thao tác rất dài báo lỗi 524 | Hai lịch chạy **trong máy** (127.0.0.1), không qua Cloudflare nên không bị cắt. Thao tác của người dùng hiện không có cái nào dài như vậy. |
| **Máy chạy chung OpenClaw** | Tranh RAM/CPU lúc dựng bản mới | App chạy ~0,5 GB RAM; dựng bản mới cần thêm ~2 GB trong vài phút. Cổng 3000/3001 phải trống — bộ cài kiểm. |

---

## 5. Dựng lại từ đầu trên máy khác — tóm tắt 1 trang

1. Mục A (Homebrew, tải mã).
2. Tạo `~/babybean/.env.production.local` từ bản cất trong trình quản lý mật khẩu (`chmod 600`).
3. `bash ~/babybean/repo/ops/may-chu-mac/cai-dat.sh` → dán 6 lệnh `sudo pmset`.
4. `cloudflared tunnel login` → `cloudflared tunnel create babybean2` → chạy lại `cai-dat.sh`.
5. `cloudflared tunnel route dns --overwrite-dns babybean2 hauky.babybeanstudio.vn` ← **lúc này app chuyển sang máy mới.**
6. Máy cũ (nếu còn): `cloudflared tunnel delete babybean` sau khi máy mới chạy ổn.

---

## 6. Điều em chưa chắc (kiểm khi làm thật)

- Tenten có cho tự đổi nameserver tên miền `.vn` trên giao diện không, hay phải gọi hỗ trợ (VNNIC xử lý `.vn`).
- Email studio đang chạy ở đâu (Google, Zoho, Lark Mail, Tenten) — phải nhìn danh bạ DNS ở Tenten (cloudflare-dns.md E2).
- Mac i9 có bao nhiêu RAM, OpenClaw có dùng cổng 3000/3001 không — bộ cài kiểm cổng 3000, `chay-thu` kiểm 3001.
- Khi FileVault bật, bản cập nhật macOS **tự cài** có tự mở khoá sau khởi động lại hay không tuỳ phiên bản — vì vậy khuyên tắt tự cài.
- Bộ cài được viết và kiểm tĩnh trên Windows (cú pháp, plist, giờ lịch, đọc khoá, gọi lịch thử với máy chủ giả). **Chưa chạy thật trên Mac** — lần chạy đầu anh gửi em ảnh chụp chỗ dừng (che khoá) nếu có lỗi.
