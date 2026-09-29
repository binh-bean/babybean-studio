# 26 — Runbook cắt app sang bb-prod

Viết cho chủ studio (anh) — mỗi bước ghi rõ **ai làm** (Claude/anh), **lệnh
chính xác** để copy, **cách kiểm** biết bước đã qua, và **đường lùi** nếu hỏng.
BB-315. Nối tiếp `docs/18-bang-kiem-bb-prod.md` (bảy cổng, phần lớn đã xong) và
`docs/23-ke-hoach-mo-cho-tat-ca.md`.

**Quyết định của anh, 28/09/2026** (xem đầu brief BB-315): trước khi mở, **nạp
dữ liệu sạch vào bb-prod rồi mới mở** — đây là luồng dev → prod chuẩn. Mục
tiêu mở: **06/10/2026**.

**Bản này (28/09/2026, tối) sửa theo soát của cố vấn CV-01**
(`scratchpad/co-van/4-soat-runbook.md`) — hai lỗi CHẶN (C1: migrate-prod bỏ
qua 0051-0075; C2: chep-cau-hinh có thể trùng khoá chính branches) và sáu lỗi
nên sửa (S1-S6). Chi tiết từng chỗ sửa ghi ngay tại bước liên quan.

---

## 0. Trước khi bắt đầu — hai chốt an toàn

1. **Claude chạy mọi lệnh chạm bb-prod.** Agent (Sonnet/Antigravity) không có
   khoá `.env.prod.local` — không ai được mở tệp đó ngoài Claude và anh.
2. **Mọi lệnh ghi lên bb-prod đều đòi cờ `--that-su-la-bb-prod`.** Đây không
   phải thủ tục thừa: mã dự án bb-prod đọc được thẳng từ chuỗi kết nối (phần
   công khai, không phải bí mật), và mọi công cụ ở BB-315 (`db:nap-lai`,
   `db:migrate:prod`, `db:chep-cau-hinh`) đều in ra **trước khi làm gì** rồi tự
   từ chối nếu mã đó không phải bb-dev/bb-prod, hoặc là bb-prod mà thiếu cờ
   trên. Xem `scripts/lib/moi-truong.mjs`.
3. **Từ lúc gửi link đầu tiên cho một khách thật, đường lùi "khôi phục từ
   tệp sao lưu" MẤT LỰA CHỌN của khách đó.** Tệp sao lưu chỉ có dữ liệu tại
   thời điểm sao lưu; mọi thứ khách bấm SAU đó (thả tim, ghi chú, chốt đơn)
   không có trong tệp. Trước mốc "khách đầu tiên bấm chọn ảnh", đường lùi nào
   cũng an toàn (dựng lại được từ Lark). Sau mốc đó, đường lùi DUY NHẤT là
   **Promote bản dựng cũ trên Vercel + GIỮ NGUYÊN bb-prod** (mục 9) — không
   khôi phục ngược bb-prod từ tệp sao lưu cũ hơn thời điểm đó nữa.

---

## 1. Sao lưu bb-prod (trước khi đụng bất cứ thứ gì)

**Ai làm:** Claude.

```bash
npm run db:backup:prod
```

**Kiểm:** lệnh in ra đường dẫn tệp `.sql` và số dòng > 0 cho ít nhất
`branches`, `packages`, `customers`, `galleries` (457 bộ hôm nay). Thoát mã 0.

**Đường lùi:** không áp dụng — đây CHÍNH LÀ đường lùi cho mọi bước sau, cho
tới mốc "khách đầu tiên bấm chọn ảnh" (xem mục 0.3). Giữ tệp này tới khi
bước 13 (kiểm nhanh sau cắt) qua hết.

---

## 2. So khoảng lệch migration — CHỈ ĐỌC

**Ai làm:** Claude.

```bash
npm run db:so-migration -- --dich .env.prod.local
```

**Sửa theo cố vấn CV-01 (lỗi chặn C1):** trước đây công cụ này (và
`migrate-prod.mjs`) chỉ canh **chín mốc cấu trúc** — chín mốc đó đo đúng
0045-0050 (đã áp lên bb-prod từ 21/09), nên chạy đúng theo bản runbook cũ sẽ
báo "chín mốc đều khớp" và khiến người vận hành tưởng lầm là đã xong, trong
khi 0051→0075 CHƯA TỪNG áp. Nay công cụ đọc một **bảng theo dõi TỆP đã áp**
(`public.schema_migrations`, xem mục 3) — phần quan trọng nhất của output là
dòng **"Tệp migration ĐÍCH CÒN THIẾU"**, không phải bảng chín mốc (bảng đó
giờ chỉ còn tác dụng CHẨN ĐOÁN, không quyết định gì).

**Kiểm:** đọc phần "Tệp migration ĐÍCH CÒN THIẾU" — phải liệt kê đủ dãy tệp
từ `0045-...` trở lên (bb-prod hôm nay chưa có bảng `schema_migrations`, nên
lượt đo ĐẦU TIÊN sẽ báo THIẾU TOÀN BỘ dãy — đúng, kể cả 0045-0050 đã áp trước
đó bằng tay/`--ep-ap` cũ; xem mục 3 vì sao áp lại chúng vẫn an toàn). Không
báo lỗi kết nối.

Cũng đo cấu trúc Storage (bucket + policy) trong CÙNG lượt chạy — xem mục 4.

---

## 3. Áp migration lên bb-prod

**Ai làm:** Claude (chạy lệnh), **anh duyệt trước khi gõ `--thuc-thi`**.

```bash
# đọc trước — KHÔNG ghi gì
npm run db:migrate:prod

# anh duyệt xong mới chạy dòng này:
npm run db:migrate:prod -- --thuc-thi --that-su-la-bb-prod
```

### Cơ chế mới (sửa lỗi chặn C1)

`migrate-prod.mjs` không còn quyết định "áp gì" bằng chín mốc cấu trúc. Nó tự
đảm bảo một bảng theo dõi tồn tại (`create table if not exists
public.schema_migrations (ten text primary key, ap_luc timestamptz)`, viết
sẵn cũng trong `db/migrations/0076-bang-theo-doi-migration-da-ap.sql` — **tệp
này ĐÃ VIẾT nhưng CHƯA áp**, đợi đúng lượt cắt), rồi so dãy tệp thật trong
`db/migrations/` (đọc động, ≥ `0045-`) với những tên ĐÃ CÓ trong bảng đó. Áp
xong một tệp thì ghi tên tệp vào bảng theo dõi **trong CÙNG giao dịch** — gãy
ở tệp nào thì cả việc áp lẫn việc ghi nhận đều rollback cùng nhau.

**Lượt chạy ĐẦU TIÊN trên bb-prod sẽ áp lại cả 0045-0050** (đã áp một lần hồi
21/09, trước khi bảng theo dõi tồn tại) — CỐ VẤN CV-01 đã đọc tay toàn bộ 31
tệp 0045-0075 và xác nhận **an toàn áp lại nhiều lần** (`if exists`, `or
replace`, `on conflict`), **trừ đúng một tệp `0069-kieu-chu-bia.sql`** — đã vá
(thêm `if not exists`) trong đợt sửa lỗi này. Một phép thử
(`tests/unit/bb-315-migrations-idempotent.test.ts`) quét TOÀN BỘ dãy 0045+ mỗi
lượt `npm run test`, bắt được đúng lớp lỗi này nếu tái diễn.

**Kiểm — làm ĐỦ CẢ BA, theo đúng thứ tự, TRƯỚC khi sang bước 4:**

1. Lệnh trên thoát mã 0 và dòng cuối in "**Chín mốc đều đạt**" — chín mốc vẫn
   in ra để CHẨN ĐOÁN cấu trúc, dù không còn là thứ quyết định áp gì.
2. Chạy cổng `verify:db` trên bb-prod (xem khung dưới) — phải ra **đủ N/N**
   mốc (không chắc vẫn là 17 — kho có thể đã thêm mốc mới từ lúc `docs/18`
   viết; đọc số N thật do chính lệnh in ra, không chép cứng "17" vào đây).
3. Đo lại RIÊNG mốc quyền mặc định (0050) — đây là mốc **nặng nhất** trong
   chín mốc (đã từng làm lộ đọc/ghi/xoá `share_links` và `staff_profiles` qua
   `anon` trên bb-prod trước khi vá, xem `docs/18` §2.0b). Dòng "Vật sinh sau
   không tự mở cho anon" và "Khung nhìn: anon trắng tay, không ai ghi" trong
   bảng "SAU KHI VÁ" của lệnh ở bước 3 phải cả hai đều `OK`. Nếu một trong hai
   không `OK`: **DỪNG, không đi tiếp sang bước 4**, báo anh ngay — đây đúng là
   lớp lỗi từng để lộ dữ liệu 457 nhà thật một lần rồi.

### Cổng `verify:db` trên bb-prod

```bash
node --env-file=.env.prod.local scripts/verify-db.mjs
```

Đây là cổng ĐÃ CÓ SẴN từ trước BB-315 (xem `docs/18` §1), không phải công cụ
mới. Đọc con số N/N mà chính lệnh in ra.

**Đường lùi:** khôi phục từ tệp sao lưu ở bước 1 bằng ba bước ghi sẵn đầu tệp
`.sql` đó (`scripts/setup-prod.mjs` → tạo lại `auth.users` đúng UUID → nạp tệp
`.sql`). Vì mỗi tệp migration chạy trong giao dịch riêng, một lỗi giữa dãy tự
dừng và KHÔNG cần khôi phục toàn bộ — chỉ tệp gãy chưa áp, các tệp trước vẫn
đứng (đã ghi nhận trong `schema_migrations`, lượt chạy lại sẽ bỏ qua chúng).

---

## 4. Storage: bucket `thumbnails` + policy

**Ai làm:** Claude đo, anh xác nhận nếu cần thao tác tay trên Supabase
Dashboard.

bb-prod hôm nay **0 ảnh trong bảng `photos`, chưa từng ghi đệm ảnh** — nghĩa
là bucket `thumbnails` **CHƯA từng được tạo** ở đó (bucket này tự sinh LƯỜI:
chỉ tạo khi có lượt ghi đệm đầu tiên, xem `src/lib/drive/lam-nong-cache.ts`
dòng ~327 — `createBucket("thumbnails", { public: false })`).

**Đo (không đọc dữ liệu, chỉ đọc cấu trúc)** — cùng lệnh với mục 2:

```bash
npm run db:so-migration -- --dich .env.prod.local
```

Phần "Bucket Storage" và "Policy Storage" ở cuối output so bb-dev với bb-prod
bằng `admin.storage.listBuckets()` và `pg_policies where schemaname='storage'`
— không đọc một tệp ảnh nào.

**Hai đường để bucket + policy có mặt trên bb-prod, chọn MỘT:**

- **A — để app tự tạo (khuyến khích, không cần thao tác tay):** sau bước 7
  (nạp dữ liệu), mở một bộ ảnh bất kỳ trong màn quản trị bb-prod và bấm
  "Đồng bộ lại" (kéo ảnh từ Drive) — `lamNongMotLo`/`lamNongAnhBia` tự tạo
  bucket `thumbnails` (`public: false`) trong đúng lượt ghi đệm đầu tiên đó.
  Đây là con đường app đã dùng ở bb-dev, không phải đường mới.
- **B — chỉ khi A không tạo được policy đúng (kiểm lại bằng lệnh
  `db:so-migration` ở trên sau khi làm A):** so sánh policy Storage của bb-dev
  (cột "nguồn" trong output) với bb-prod (cột "đích"), rồi vào Supabase
  Dashboard của bb-prod → **Storage** → **Policies** → chép tay từng policy
  còn thiếu, cùng `cmd`/`roles` đã in ra. Vì đây là thao tác tay hiếm khi cần,
  không đóng gói thành script — làm khi B thật sự cần, không làm trước.

**Kiểm:** chạy lại `npm run db:so-migration -- --dich .env.prod.local`, phần
"Bucket đích còn thiếu" và "Policy Storage đích còn thiếu" đều phải bằng 0
**trước khi gửi link đầu tiên cho khách** (bước 12).

---

## 5. Auth settings — Site URL / Redirect URLs

**Ai làm:** anh (thao tác tay trên Supabase Dashboard — gõ mật khẩu/khoá,
việc của người, không phải agent — xem AGENTS.md).

1. Supabase Dashboard → dự án **bb-prod** → **Authentication** → **URL
   Configuration**.
2. **Site URL**: `https://hauky.babybeanstudio.vn`
3. **Redirect URLs**: thêm `https://hauky.babybeanstudio.vn/**` (giữ mọi dòng
   khác nếu có, ví dụ localhost cho phát triển).

**Kiểm:** trang cấu hình lưu không báo lỗi đỏ; giá trị hiện đúng domain thật,
không còn `*.vercel.app` mặc định.

**Đường lùi:** đổi lại giá trị cũ (Supabase giữ lịch sử rất ngắn — ghi lại giá
trị cũ TRƯỚC khi đổi, dán vào một ghi chú riêng ngoài kho).

---

## 5a. Trả `lark.webhook_url` về nhóm THẬT (nếu tuần thử đã đổi tạm)

**Ai làm:** anh, qua màn Cài đặt trong app.

**Sửa theo cố vấn CV-01 (S2), và ĐỔI THỨ TỰ theo đề nghị của cố vấn:** bước
này PHẢI làm **TRƯỚC** bước 6 (chép cấu hình), không phải sau. Nếu mục 15 (tuần
nhân viên thử trên bb-dev) đã đổi tạm `lark.webhook_url` sang nhóm "Kiểm thử
app", và bước này bị bỏ qua, thì bước 6 sẽ CHÉP NGUYÊN webhook nhóm thử sang
bb-prod — mọi tin khách chốt sau khi mở đi lạc vào nhóm thử, không ai trong
nhóm vận hành thật thấy, và không có lỗi nào hiện ra để biết mà sửa.

1. Vào `/admin/settings` trên bb-dev → mục `lark.webhook_url`.
2. Dán lại ĐÚNG giá trị webhook của nhóm vận hành thật (giá trị Claude đã lưu
   tạm ngoài kho lúc đổi ở mục 15 — không phải giá trị nhóm "Kiểm thử app").
3. Lưu.

**Kiểm:** `npm run db:chep-cau-hinh -- --dich .env.prod.local` (chế độ chỉ
xem, bước 6 dưới) in đúng dòng "settings đụng lark.webhook_url" — đọc giá trị
ĐÃ CHE (`cheBot`) và tự xác nhận bằng mắt đây có phải domain webhook nhóm
thật hay không, TRƯỚC khi gõ `--xac-nhan-webhook-that` ở bước 6.

Bước 6 (dưới) sẽ **tự đòi thêm cờ `--xac-nhan-webhook-that`** nếu phần chép
`settings` đụng khoá này — không dựa hẳn vào việc anh nhớ làm bước 5a, đây là
một lớp chốt thứ hai.

---

## 5b. Tài khoản quản trị ĐẦU TIÊN trên bb-prod (0 nhân sự hôm nay)

**Ai làm:** anh (gõ mật khẩu — việc của người, xem AGENTS.md).

**Đổi thứ tự theo đề nghị của cố vấn CV-01:** làm bước này **TRƯỚC** bước 6,
không phải sau (bản trước ghi "làm sau cũng được"). Lý do: nếu bước 6 gặp
nhân sự trùng email và phải BỎ QUA việc tạo tài khoản mới cho đúng người đó
(xem S6/email trùng ở bước 6), vẫn cần có ÍT NHẤT MỘT tài khoản `owner` sẵn
sàng để đặt lại mật khẩu cho những người khác — nếu chưa có bootstrap trước,
lúc đó không ai vào được màn quản trị để làm việc đó.

bb-prod hôm nay có **0 `staff_profiles` và chưa có `auth.users` nào** — không
ai đăng nhập được, kể cả anh. Việc này KHÔNG chép tự động được (đây là bí
mật — mật khẩu — việc của người):

1. Supabase Dashboard → dự án **bb-prod** → **Authentication** → **Users** →
   **Add user**.
2. Email công việc, mật khẩu mạnh, tick **Auto Confirm User**.
3. Copy `UUID` của user vừa tạo.
4. **Table Editor** → `staff_profiles` → **Insert row**: dán UUID vào `id`,
   điền `full_name`, `email` (khớp bước 1), `role` = `owner`.

`chep-cau-hinh` ở bước 6 không đụng gì tới tài khoản này (không có trong
bb-dev, không khớp qua `id` nào của nguồn).

---

## 6. `db:chep-cau-hinh` — chép cấu hình từ bb-dev sang bb-prod

**Ai làm:** Claude chạy; anh duyệt số đếm trước khi gõ `--ghi`. **Làm SAU khi
mục 5a và 5b đã xong.**

```bash
# chỉ xem — không ghi gì, in số dòng sẽ thêm/sửa, CHỈ id + code/key
node --import tsx scripts/chep-cau-hinh.mjs --dich .env.prod.local

# anh duyệt số đếm xong mới chạy dòng này (mã xác nhận lấy từ lượt trên;
# --xac-nhan-webhook-that CHỈ cần khi output có dòng "đụng lark.webhook_url"):
node --import tsx scripts/chep-cau-hinh.mjs --dich .env.prod.local \
  --ghi --xac-nhan <mã in ở lượt trên> --that-su-la-bb-prod \
  --xac-nhan-webhook-that
```

Chép sáu bảng: `branches`, `packages`, `roles` (chỉ vai TỰ TẠO — chín vai hệ
thống dùng UUID cố định, migration 0052 đã tự lo), `settings` (loại các khoá
TRẠNG THÁI đồng bộ — xem S3 dưới; giữ lại `chat.page_url`, `lark.webhook_url`,
`gallery.link_ttl_days`, `lark.nhac_noi_bo` và mọi khoá cấu hình khác),
`staff_profiles`, `staff_branches`. Tự sao lưu ĐÍCH trước khi ghi (gọi
`backup.mjs`). Không bao giờ in tên/SĐT/email nhân sự hay giá trị bí mật ra
màn hình — chỉ in id và khoá tự nhiên.

### Sửa lỗi chặn C2 — branches khớp id → code → name, KHÔNG tự chèn

Bản đầu khớp `branches` chỉ theo `code` và tự CHÈN một dòng mới bằng UUID
nguồn khi không khớp được — `db/seed.sql` và `db/seed-prod.sql` dùng CHUNG ba
UUID (`1111…/2222…/3333…`) nhưng khác `code`, nên có nguy cơ thật
`duplicate key value violates unique constraint "branches_pkey"`. Nay khớp
theo BA khoá (ưu tiên `id`, rồi `code`, rồi `name`), và **branches không bao
giờ tự chèn dòng mới** — nếu phần chỉ-xem báo `branches` có dòng "sẽ thêm"
(nghĩa là không khớp được với đích qua cả ba khoá), lệnh `--ghi` **TỪ CHỐI
CHẠY**, liệt kê đúng dòng đó. **Nếu gặp trường hợp này: DỪNG, không tự sửa
code/tên đoán mò — hỏi kỹ thuật (Claude) kiểm lại `code` hiện tại của ba chi
nhánh trên bb-prod (Supabase Dashboard → Table Editor → `branches`) rồi quyết
định: sửa `code` cho khớp, hay đây thật sự là một chi nhánh mới cần tạo tay.**

### S5 — role_id được nắn đúng, không trỏ vào hàng không tồn tại

Một vai TỰ TẠO đã có sẵn ở bb-prod (khớp theo tên, id khác nguồn) không còn
làm `staff_profiles.role_id` vỡ khoá ngoại — role_id được nắn qua bản đồ
vai (nguồn → đích) trước khi ghi.

### S3 — không chép khoá TRẠNG THÁI đồng bộ

`settings` không chỉ chứa cấu hình — còn có `lark_hook_queue` (hàng đợi đang
chạy) và `lark_retouch_last_sync` (mốc cron đã đồng bộ tới đâu). Chép nguyên
các khoá này sang một cơ sở dữ liệu MỚI NẠP là nói dối "đã đồng bộ tới giờ
này" trong khi bb-prod chưa có gì — lượt cron đầu sẽ BỎ QUA mọi bản ghi Lark
sửa trước mốc đó. `chep-cau-hinh` loại các khoá này (và mọi khoá kết thúc
bằng `_last_sync`/`_cursor`) khỏi toàn bộ phần chép settings.

### Nhân sự — việc PHẢI làm ngay sau bước này

Tài khoản nhân sự tạo mới ở bb-prod có **mật khẩu ngẫu nhiên không ai biết**
(không chép mật khẩu). Trước khi bất kỳ ai đăng nhập được:

1. Đăng nhập bb-prod bằng tài khoản `owner` bootstrap (mục 5b, đã làm trước).
2. Vào màn **Nhân sự** → từng người vừa được chép sang → **Đặt lại mật khẩu**
   → đặt một mật khẩu mới, gọi điện/nhắn Zalo riêng báo cho từng người (không
   dán mật khẩu vào Lark/email chung).

**Trùng email dưới một id khác** (ví dụ email của tài khoản owner bootstrap ở
5b trùng với một dòng ở bb-dev): script IN CẢ HAI id (nguồn và id thật ở
đích) và vẫn ghi `staff_profiles`/`staff_branches` theo đúng id THẬT tìm
được — không bỏ hẳn người đó, chỉ là không tạo user Auth mới cho họ.

**Kiểm:** chạy lại lệnh KHÔNG có `--ghi` — phần "sẽ thêm"/"sẽ sửa" của cả sáu
bảng phải về 0 (idempotent — chạy hai lần không tạo trùng).

**Đường lùi:** khôi phục bb-prod từ tệp `.sql` mà lệnh này tự sao lưu ngay
trước khi ghi (in đường dẫn ra màn hình lúc chạy). Toàn bộ phần ghi bảng nằm
trong MỘT giao dịch — gãy giữa chừng thì tự rollback sạch, không để lại cấu
hình nửa vời (không cần khôi phục thủ công cho trường hợp đó).

---

## 7. `db:nap-lai --env .env.prod.local` — xoá sạch rồi nạp lại từ Lark

**Ai làm:** Claude chạy; anh duyệt số đếm trước mỗi lệnh ghi.

**Kiểm TRƯỚC khi chạy `--nap`:** bb-prod phải đã áp đủ migration (bước 3) —
chạy lại `npm run db:so-migration -- --dich .env.prod.local`, dòng "Tệp
migration đích còn thiếu" phải là **0**. `--nap` gọi `sync-lark-hauky.mjs` ghi
vào các cột/bảng sinh ra từ 0067-0075 (`lark_trang_thai`, `cover_layout`,
`share_link_ma`…) — chạy trên schema cũ là gãy giữa chừng, SAU KHI đã xoá dữ
liệu cũ.

```bash
# đếm — chỉ đọc
npm run db:nap-lai -- --env .env.prod.local --dem

# sao lưu trước khi xoá (khác tệp sao lưu ở bước 1 — đây là JSON theo bảng)
npm run db:nap-lai -- --env .env.prod.local --sao-luu "D:/bb-prod-sao-luu/truoc-xoa"

# anh duyệt số đếm ở bước --dem xong mới chạy dòng này:
npm run db:nap-lai -- --env .env.prod.local --xoa \
  --xac-nhan <mã in ở --dem> --that-su-la-bb-prod

# nạp lại từ Lark
npm run db:nap-lai -- --env .env.prod.local --nap --that-su-la-bb-prod
```

`--env .env.prod.local` là cờ MỚI của BB-315 — trước đây `db:nap-lai` chỉ chạy
được lên bb-dev (nạp cố định qua `node --env-file-if-exists=.env.local`). Cờ
`--that-su-la-bb-prod` bắt buộc cho **mọi** thao tác ghi (`--xoa`, `--nap`) khi
mã dự án là bb-prod — cùng cơ chế với `--that-su-la-bb-dev` đã có.

Sáu bảng cấu hình (`branches`, `staff_profiles`, `staff_branches`, `roles`,
`settings`, `packages`) **không bị `--xoa` đụng tới** — đúng những bảng bước 6
vừa chép sang.

### S4 — tệp mốc sao lưu ghi mã dự án, từ chối xoá nếu lệch

Tệp `tong-so-dong.json` mà `--sao-luu` ghi ra nay có thêm trường `maDuAn`. Nếu
bản sao lưu GẦN NHẤT (theo tệp mốc, hoặc chỉ định bằng `--tu`) là của MỘT MÔI
TRƯỜNG KHÁC — ví dụ đang xoá bb-prod nhưng bản sao lưu trẻ nhất lại là của
bb-dev (đúng kịch bản mục 14: dọn bb-dev vài ngày sau khi cắt, cả hai môi
trường đều có bản sao lưu "trẻ" cùng khung giờ) — `--xoa` **TỪ CHỐI**, không
chỉ kiểm "có bản sao lưu < 24 giờ" như trước.

**Kiểm:**

1. `--xoa` in "Đã xoá:" kèm số dòng khớp số đã duyệt ở `--dem`.
2. `--nap` in `[OK]` cho đủ 5 bước (danh mục sản phẩm → hậu kỳ → hợp đồng →
   chỉnh sửa → ảnh Drive), thoát mã 0.
3. Đếm lại: `node --env-file=.env.prod.local scripts/verify-db.mjs` — vẫn đủ
   N/N mốc.
4. `select count(*) from galleries` trên bb-prod phải > 0 và khớp số buổi
   chụp Lark gần đây (không còn 457 bộ cũ).

**Đường lùi:** `--khoi-phuc "<thư mục --sao-luu ở trên>"` (thêm
`--buoc-khoi-phuc` nếu bảng đích đã có dòng), hoặc khôi phục toàn bộ từ tệp
sao lưu SQL ở bước 1 — **CHỈ TRƯỚC MỐC khách đầu tiên bấm chọn ảnh** (xem mục
0.3). Sau mốc đó, đường lùi là Promote (mục 9), không khôi phục ngược.

---

## 7b. Soát ô "Link app" cũ trên Lark (S6) — CHỈ XEM TRƯỚC

**Ai làm:** Claude chạy (chỉ đọc); CSKH xử lý tay theo danh sách in ra.

Chủ studio đã tự tạo ~25 link thử trên bb-dev (`docs/23` mục 2) — mỗi lần bấm
"Tạo link chia sẻ" cho một bộ ảnh THẬT, app tự ghi cột "Link app" của đúng
dòng Hậu Kỳ đó lên Lark (BB-132). Sau bước 7, mã link đó chỉ còn tồn tại ở
bb-dev — cột "Link app" trên Lark vẫn còn nguyên chuỗi CŨ. CSKH copy đúng cột
đó gửi khách là khách mở ra một trang lỗi.

```bash
npm run lark:soat-link-cu -- --dich .env.prod.local
```

Công cụ (mới, BB-315, `scripts/soat-link-app-cu.mjs`) đọc TOÀN BỘ bảng Hậu Kỳ
(chỉ đọc), trích mã link từ cột "Link app", băm SHA-256 (đúng hàm ứng dụng
dùng), rồi hỏi `share_links` của bb-prod có dòng nào khớp không. Không khớp
→ in mã dòng Hậu Kỳ (record_id) ra màn hình. **Công cụ này KHÔNG GHI GÌ LÊN
LARK**, và không đề nghị chạy `ghi-link-app-len-lark.ts` cho việc xoá — tệp đó
từ chối ghi khi `--dia-chi` rỗng (chỉ ghi được link MỚI, không xoá được link
cũ). **CSKH mở Lark, tìm đúng record_id, xoá TAY nội dung ô "Link app" của
dòng đó** (bôi đen, xoá, lưu) — đây là cách duy nhất hôm nay, không có đường
tự động.

**Kiểm:** danh sách "CHẾT" (nếu có) đã được CSKH xoá tay từng dòng trên Lark
trước khi gửi link đầu tiên cho khách mới (bước 12).

---

## 8. Ba biến Supabase trên Vercel — Production

**Ai làm:** anh (dán khoá bí mật — việc của người).

Vercel → project `babybean-studio` → **Settings** → **Environment
Variables** → môi trường **Production** — sửa ĐÚNG ba biến (lấy giá trị từ
Supabase Dashboard của bb-prod, **Settings → API**), **KHÔNG đụng Preview**
(Preview vẫn trỏ bb-dev — nhánh thử không được chạm dữ liệu khách thật):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Cùng lượt này, thêm hoặc kiểm lại hai biến sau (đo 25/09/2026: CẢ HAI ĐỀU
CHƯA CÓ trên Production — xem `docs/11` §5 cuối mục):**

- `CRON_SECRET` — một chuỗi dài tự sinh. **Tên biến do Vercel quy định**, đặt
  nó là Vercel tự gắn `Authorization: Bearer <giá trị>` vào mọi lượt cron nó
  gọi. Thiếu thì `expire-galleries` và `hau-ky` (bên dưới) đều 401 mọi lượt.
- `SUPABASE_DB_URL` — chuỗi kết nối Postgres **của bb-prod** (route
  `hau-ky`/`sync-lark` nối thẳng Postgres, không qua PostgREST).

**`SYNC_CRON_SECRET` vẫn phải có** trên Production (đường kéo Lark định kỳ,
`docs/11` §5a) — kiểm nó đã tồn tại trong cùng lượt này, không đợi tới mục 10.

**Sau khi lưu, bấm Redeploy** (biến môi trường chỉ vào bản dựng MỚI).

**Kiểm — chạy hai lệnh này, KHÔNG dán secret vào đâu, chỉ điền tại chỗ khi
gõ trực tiếp trên máy anh:**

```bash
# 1. expire-galleries — chạy hằng ngày 01:00 giờ VN (0 18 * * * UTC)
curl -i -H "Authorization: Bearer <dán CRON_SECRET tại đây>" \
  https://hauky.babybeanstudio.vn/api/cron/expire-galleries

# 2. hau-ky — chạy hằng ngày 08:00 giờ VN (0 1 * * * UTC)
curl -i -H "Authorization: Bearer <dán CRON_SECRET tại đây>" \
  https://hauky.babybeanstudio.vn/api/cron/hau-ky
```

Cả hai phải ra **`HTTP/2 200`** kèm phần thân JSON có `stats`. Ra `401` là
biến chưa vào bản dựng — Redeploy lại rồi thử lại. Ra `500` ở `hau-ky` là
`SUPABASE_DB_URL` sai hoặc chưa Redeploy.

**Đường lùi (P1 — khách không mở được album):** xem mục 9.

---

## 9. Đường lùi — Promote bản dựng cũ

**Ai làm:** anh, hoặc Claude nếu anh không có mặt (ghi lại theo bảng mục 14).

Vercel → **Deployments** → chọn bản TRƯỚC → **Promote to Production**. Đổi
lại ba biến Supabase (mục 8) về giá trị bb-dev cũ nếu cần lùi hẳn cả cơ sở dữ
liệu — **dưới 5 phút**, không cần Redeploy thủ công (Promote tự dùng bản
dựng cũ, còn đổi biến thì Redeploy).

**Hệ quả người dùng thấy khi Promote:** nhân viên phải đăng nhập lại (JWT của
project Supabase khác không dùng chéo được); phiên khách đang mở link sẽ gặp
404 (cookie đang trỏ vào một `gallery_id` không tồn tại ở bb-dev).

**Sau mốc "khách đầu tiên bấm chọn ảnh" (mục 0.3): CHỈ Promote, KHÔNG khôi
phục ngược bb-prod từ tệp sao lưu cũ hơn mốc đó** — làm vậy là xoá mất lựa
chọn thật của khách đã lỡ chọn trên bb-prod sau khi cắt.

Ghi rõ **ai bấm và lúc nào** vào bảng ở mục 14 mỗi lần làm việc này.

---

## 10. GitHub secret `BACKUP_DATABASE_URL` → bb-prod

**Ai làm:** anh (dán chuỗi kết nối bí mật vào GitHub Secrets).

1. GitHub → kho `binh-bean/babybean-studio` → **Settings** → **Secrets and
   variables** → **Actions**.
2. Sửa secret `BACKUP_DATABASE_URL` (đã có từ BB-273) → dán chuỗi kết nối
   **Session pooler** của **bb-prod** (Supabase Dashboard bb-prod → Connect →
   Connection string → URI → Session pooler).
3. `BACKUP_PASSPHRASE` **giữ nguyên** — không đổi, mật khẩu mã hoá không liên
   quan tới cơ sở dữ liệu nào đang được sao lưu.

`docs/24-sao-luu-tu-dong.md` đã cập nhật một dòng ghi chú trỏ về bước này.

**Kiểm:** GitHub → tab **Actions** → workflow **"Sao lưu tự động"** → **Run
workflow** (chạy tay một lần) → đợi dấu tích xanh → mở **Artifacts**, thấy tệp
`sao-luu-...` mới. Không cần tải về giải mã để kiểm bước này — dấu tích xanh
và artifact mới là đủ.

**Đường lùi:** sửa lại secret về chuỗi kết nối bb-dev cũ.

---

## 11. Lark webhook/cron — chỉ kiểm, không đổi

**Ai làm:** Claude kiểm; không cần anh làm gì nếu qua.

Đường kéo Lark (`sync-lark.yml`, GitHub Actions) gọi vào **CÙNG MỘT domain**
(`hauky.babybeanstudio.vn`) trước và sau khi cắt — domain không đổi, chỉ
Supabase phía sau đổi. `SYNC_CRON_SECRET` và `APP_URL` (GitHub Secrets) không
cần sửa.

**Kiểm:** GitHub → tab **Actions** → workflow kéo Lark → chạy tay một lần
(**Run workflow**) → dấu tích xanh → `select value from settings where
key = 'lark_retouch_last_sync'` trên bb-prod có mốc thời gian mới (đã chép
đúng `lark.webhook_url` ở bước 6, nên tin nhắn báo lỗi/xác nhận đi đúng nhóm
Lark của studio). Lưu ý: `lark_retouch_last_sync` cố ý KHÔNG được chép ở
bước 6 (S3) — mốc này phải sinh MỚI trên bb-prod từ lượt chạy thật đầu tiên.

---

## 12. Trước khi gửi link đầu tiên cho khách

**Ai làm:** Claude (làm nóng đệm ảnh + soát), anh xem kết quả soát.

### 12.1. Làm nóng ảnh bìa cho chi nhánh mở đầu

Không có lệnh dòng lệnh riêng cho việc này — con đường ĐÃ CÓ của app tự làm
(`src/lib/drive/lam-nong-cache.ts`, hàm `lamNongAnhBia`/`lamNongMotLo`, được
gọi tự động khi mở một bộ ảnh trong màn quản trị hoặc khi tạo link chia sẻ).
Với chi nhánh mở đầu: vào màn quản trị bb-prod, lọc theo chi nhánh đó, **mở
lần lượt từng bộ ảnh** (hoặc bấm "Đồng bộ lại" nếu chưa có ảnh) — mỗi lượt mở
tự làm nóng ảnh bìa cho bộ đó. Không cần viết công cụ mới cho việc này.

### 12.2. Soát "gom nhiều hợp đồng — CÁCH XA NHAU"

Một bộ ảnh (`galleries`) có thể **gom nhiều hợp đồng** (`gallery_items` với
`lark_contract_code` khác nhau, `parent_item_id is null` — dòng hợp đồng, xem
`db/schema.sql`) khi một khách mua nhiều gói cho cùng một buổi chụp — **bình
thường**. Nhưng gom hai hợp đồng có NGÀY CÁCH XA NHAU là dấu hiệu Lark ghép
NHẦM hợp đồng vào sai bộ ảnh. Mã hợp đồng có dạng `HD_YYYYMMDD#n` — ngày nằm
sẵn trong mã, dùng được ngay không cần tra bảng khác.

Claude chạy soát này bằng `pg` (không có `psql` trên máy studio — xem
`docs/11` §1c), ví dụ:

```bash
node --env-file=.env.prod.local -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
c.connect().then(async () => {
  const { rows } = await c.query(\`
    select gallery_id,
           array_agg(distinct lark_contract_code) as ma_hop_dong,
           max(substring(lark_contract_code from 4 for 8))::date
             - min(substring(lark_contract_code from 4 for 8))::date as so_ngay_cach
      from gallery_items
     where parent_item_id is null and lark_contract_code ~ '^HD_[0-9]{8}#'
     group by gallery_id
    having count(distinct substring(lark_contract_code from 4 for 8)) > 1
       and max(substring(lark_contract_code from 4 for 8))::date
           - min(substring(lark_contract_code from 4 for 8))::date > 30
     order by so_ngay_cach desc
  \`);
  console.log(rows.length, 'bộ ảnh gom hợp đồng cách nhau > 30 ngày');
  for (const r of rows) console.log(r.gallery_id, r.so_ngay_cach, 'ngày', r.ma_hop_dong.join(', '));
  await c.end();
});
"
```

Ngưỡng 30 ngày là điểm khởi đầu hợp lý (một buổi chụp + gói mua thêm thường
diễn ra trong vài tuần) — **anh xem danh sách in ra và tự quyết** bộ nào cần
tách lại bằng tay trên Lark trước khi gửi link, không tự động sửa gì ở đây.

**Kiểm:** danh sách in ra (nếu có) đã được anh xem qua và quyết định giữ/tách
từng dòng trước khi bước 13; mục 7b (soát Link app cũ) cũng đã xử lý xong.

---

## 13. Kiểm nhanh sau khi cắt

**Ai làm:** anh, trên điện thoại thật, 4G (không phải Wi-Fi văn phòng — đúng
điều kiện khách thật dùng).

1. Đăng nhập `hauky.babybeanstudio.vn/login` bằng tài khoản ở mục 5b/6.
2. Màn danh sách bộ ảnh hiện đúng số bộ vừa nạp ở bước 7 (không còn 457 bộ
   cũ), cột đầu là Số hoá đơn.
3. Mở MỘT bộ ảnh thật của chi nhánh mở đầu, bấm "Đồng bộ lại" — ảnh phải hiện
   ra, bộ chuyển khỏi `draft`.
4. Cấp một link thử cho **chính anh**, mở bằng điện thoại: ảnh nét, thả tim
   được, có nút tải xuống.
5. Nút "Nhắn cho studio" hiện đúng (đã chép `chat.page_url` ở bước 6).

Qua cả năm ý trên mới coi là cắt xong.

---

## 14. Bb-dev: giữ nguyên ít nhất 3 ngày, KHÔNG dọn cùng ngày cắt

**Quyết định của anh, 28/09/2026.** Chỉ xoá dữ liệu khách trên bb-dev **SAU
KHI bb-prod đã chạy ổn định ít nhất 3 ngày**, không làm trong cùng một ngày
với lúc cắt. Lý do: trong 3 ngày đó, bb-dev vẫn là đường LÙI nhanh nhất (mục
9) — trước mốc "khách đầu tiên bấm chọn ảnh" trên bb-prod.

**Điền vào đây MỖI LẦN làm việc này** (ai bấm, lúc nào — không được bỏ trống):

| Việc | Ai bấm | Lúc nào (giờ VN) | Ghi chú |
|---|---|---|---|
| Cắt sang bb-prod (đổi 3 biến Vercel, bước 8) | | | |
| Ngày thứ 3 ổn định — bắt đầu được phép dọn bb-dev | | | (tự động = ngày cắt + 3) |
| Dọn dữ liệu khách trên bb-dev | | | |
| (nếu có) Promote lùi về bb-dev — mục 9 | | | ghi lý do |

**Lệnh dọn** (chỉ chạy khi bảng trên đã điền đủ và ngày hôm nay ≥ ngày thứ 3):

```bash
# đếm trước — chỉ đọc, KHÔNG cần --that-su-la-bb-prod (đây là bb-dev)
npm run db:nap-lai -- --dem

# anh duyệt số đếm xong:
npm run db:nap-lai -- --sao-luu "D:/bb-dev-sao-luu-truoc-don"
npm run db:nap-lai -- --xoa --xac-nhan <mã in ở --dem> --that-su-la-bb-dev
```

Giữ nguyên nhân sự (`staff_profiles`, `staff_branches`, `roles`) — `--xoa`
không đụng sáu bảng cấu hình, đúng như mọi lần chạy `db:nap-lai` khác. Sau bước
này bb-dev trở thành cơ sở dữ liệu THỬ (agent tiếp tục có khoá, tiếp tục chạy
phép thử lên đó — đúng vai trò cũ trước khi có tên thật, xem `docs/18` §4).

S4 (bảng mục 3) áp dụng đúng vào lúc này: `--sao-luu` trên bb-dev tự ghi mã
dự án bb-dev vào tệp mốc, nên `--xoa` không bị nhầm với một bản sao lưu
bb-prod "trẻ" hơn tạo trong cùng khung giờ.

---

## 15. Tuần nhân viên thử trên bb-dev — TRƯỚC khi cắt

**Đọc kỹ trước khi cho nhân viên thử tay trên trình duyệt thật (không phải
Playwright).**

`src/lib/kiem-thu.ts` có hai chốt: `khongGuiRaLarkThat()` (chặn ghi Lark) và
`khongGhiDemPhepThu()` (chặn ghi bộ đệm ảnh). Cả hai chỉ tự bật khi
`VITEST`/`NODE_ENV=test` (phép thử `vitest`) **hoặc** biến
`PHEP_THU_TRINH_DUYET=1` — biến này `playwright.config.ts` tự đặt cho máy chủ
Playwright, **KHÔNG có khi nhân viên mở `npm run dev` rồi bấm chuột trên trình
duyệt thật**.

Nghĩa là: nếu nhân viên thử trên một **bộ ảnh THẬT** (có `lark_hauky_record_id`
— đã nối với Lark):

- **Tạo link app** → route `POST .../share-link` gọi thẳng `ghiLinkAppVeLark`
  (`src/app/api/admin/galleries/[id]/share-link/route.ts` dòng ~308) → **ghi
  thật** cột "Link app" lên đúng dòng Hậu Kỳ thật bên Lark.
- **Chốt lựa chọn** (khách/nhân viên giả làm khách bấm chốt) → `notify.ts` gửi
  thẻ vào **nhóm Lark thật** của studio qua `settings['lark.webhook_url']`.

### Hai việc PHẢI làm trước khi bắt đầu tuần thử

**1. Đổi tạm `lark.webhook_url` sang nhóm "Kiểm thử app"**

Trước khi đổi, Claude đọc giá trị HIỆN TẠI (không dán ra khung chat — đây là
`biMat: true`, xem `src/app/api/admin/settings/schema.ts`) và lưu tạm ngoài
kho. Đổi qua màn **Cài đặt** trong app quản trị (`/admin/settings`,
`PATCH /api/admin/settings`, đã có sẵn từ BB-197) → mục `lark.webhook_url` →
dán link Webhook của nhóm Lark **"Kiểm thử app"** (nhóm riêng, không phải nhóm
vận hành thật) → Lưu.

**Đổi lại ngay khi tuần thử xong — trước bước 6, xem mục 5a.** Nếu quên,
mọi lượt chốt thật SAU tuần thử vẫn báo vào nhóm "Kiểm thử app" — không ai
trong nhóm vận hành thật thấy tin, và không có lỗi nào hiện ra để biết mà sửa.

**2. Nhân viên CHỈ thử trên bộ ảnh Fixture (không có mã Lark)**

Tạo vài bộ ảnh Fixture (`db/seed.sql` hoặc nhập tay qua màn quản trị, đặt tên
rõ ràng `Fixture — …`, KHÔNG gắn `lark_hauky_record_id`/`lark_contract_code`,
theo đúng quy ước AGENTS.md §6) để nhân viên tập thao tác. Với bộ Fixture:
`ghiLinkAppVeLark` tự thoát sớm ("chưa gắn dòng Hậu Kỳ nào") — **không** ghi
gì lên Lark dù có đổi webhook hay không, vì nó không tìm được
`lark_hauky_record_id` để ghi vào. Việc đổi webhook ở bước 1 chỉ bảo vệ đường
`notify.ts` (chốt lựa chọn) — đường đó gửi bất kể bộ ảnh Fixture hay thật.

**Nếu nhân viên lỡ thử trên một bộ ảnh THẬT** trong tuần này (trước khi đổi
webhook, hoặc quên đổi): kiểm ngay cột "Link app" trên bảng Hậu Kỳ Lark của
đúng dòng đó, và báo CSKH xem có tin rác nào lọt vào nhóm thật không — xử lý
thủ công (xoá dòng "Link app" ghi nhầm, giải thích với nhóm nếu có tin sai).

---

## 16. Sau khi cắt — cập nhật khuyến nghị (KHÔNG tự đổi)

`src/lib/lark/muc-tieu-du-lieu.ts` (`MA_DU_AN_THAT`) hiện cho cả bb-dev VÀ
bb-prod nhận tên khách thật — đúng, vì bb-dev vẫn giữ dữ liệu khách 3 ngày (mục
14) trước khi dọn. **Khuyến nghị, không phải việc Claude tự làm:** sau khi mục
14 hoàn tất (bb-dev đã dọn sạch, trở lại là cơ sở dữ liệu thử), anh cân nhắc bỏ
dòng `ohkfoqqsrpvsponiwcij // bb-dev` khỏi `MA_DU_AN_THAT` để bb-dev về lại
trạng thái CHE TÊN — phép thử và dữ liệu mẫu tạo mới trên bb-dev từ lúc đó sẽ
không còn cần thay tên trước khi commit (AGENTS.md §6). Đây là quyết định của
anh, không phải điều Claude tự sửa trong lượt cắt này.

---

## 17. Diễn tập — chạy thẳng trên bb-prod (không có project tạm)

**Quyết định của anh, 28/09/2026.** Gói Supabase miễn phí không lập thêm
được một project tạm để diễn tập. Vì bb-prod hôm nay **đang bỏ không** (app
chưa trỏ vào nó, không có khách nào cầm link tới nó) và đã có sao lưu (bước
1), buổi diễn tập chạy THẲNG trên bb-prod:

**Chỉ diễn tập SAU khi mục 15 (tuần nhân viên thử trên bb-dev) đã xong,
không phải trong lúc đang diễn ra.** Bước 5a của mỗi lượt diễn tập đòi trả
`lark.webhook_url` trên bb-dev về nhóm vận hành THẬT — làm việc này GIỮA tuần
thử là tin nhân viên chốt lựa chọn Fixture/thử tay bắn thẳng vào nhóm vận
hành thật, đúng thứ mục 15 đang cố tránh.

1. Chạy đủ bước 1 → 7b (sao lưu → so migration → áp migration → Storage →
   auth settings → webhook thật → owner bootstrap → chép cấu hình → xoá+nạp
   → soát Link app cũ) — **TRỪ bước 8 (đổi biến Vercel)**. App vẫn tiếp tục
   phục vụ khách thật từ bb-dev suốt buổi diễn tập; bb-prod nhận dữ liệu thật
   (nạp từ Lark) nhưng chưa ai truy cập được qua web.
2. Kiểm đủ các mốc ở mỗi bước (chín mốc, `verify:db`, Storage, v.v.) như thể
   đang cắt thật — đây CHÍNH LÀ buổi diễn tập, không phải một môi trường giả.
3. Nếu MỌI bước qua hết: hôm cắt thật, chạy lại đúng bước 7 (`--xoa` rồi
   `--nap`) một lần nữa để dữ liệu là BẢN MỚI NHẤT từ Lark (không dùng dữ liệu
   diễn tập cũ), rồi mới sang bước 8 (đổi Vercel).
4. Nếu một bước nào gãy: sửa, khôi phục bb-prod về trạng thái trống (mục 3 —
   `setup-prod.mjs` dựng lại sạch) rồi diễn tập lại từ đầu — đừng vá tạm rồi
   đi tiếp, vì hôm cắt thật sẽ lặp lại đúng các bước này. Lưu ý: `setup-prod.mjs`
   áp lại cả `0076` (tạo bảng theo dõi) nhưng bảng đó khởi động RỖNG — lượt
   `migrate-prod` kế tiếp sẽ áp lại TOÀN BỘ dãy 0045+ một lần nữa. Đây là hành
   vi ĐÚNG (đã xác nhận an toàn — mục 1 bảng dưới), không phải lỗi.

Vì diễn tập và cắt thật dùng CHUNG một cơ sở dữ liệu (bb-prod), **buổi diễn
tập không được dừng ở giữa chừng rồi bỏ đó** — hoặc chạy trọn tới bước 7b rồi
dừng an toàn (bb-prod có dữ liệu thật, đã nạp xong, chỉ chưa ai truy cập
được), hoặc quay bb-prod về trống trước khi ngừng. Không được để bb-prod ở
trạng thái nửa vời (đã xoá 457 bộ cũ, chưa nạp lại) qua đêm.

---

## Tổng kết bảng công cụ mới (BB-315)

| Lệnh | Làm gì | Chỉ đọc / có ghi |
|---|---|---|
| `npm run db:so-migration -- --dich <env>` | So bảng theo dõi migration + Storage giữa hai môi trường | Chỉ đọc |
| `npm run db:migrate:prod -- --thuc-thi --that-su-la-bb-prod` | Áp migration còn thiếu (theo bảng theo dõi) lên bb-prod | Có ghi (tự sao lưu trước) |
| `node --import tsx scripts/chep-cau-hinh.mjs --dich <env> [--ghi --xac-nhan <mã> --that-su-la-bb-prod --xac-nhan-webhook-that]` | Chép branches(chỉ sửa)/packages/roles/settings(trừ khoá trạng thái)/staff sang môi trường khác | Mặc định chỉ đọc; `--ghi` mới ghi, MỘT giao dịch |
| `npm run db:nap-lai -- --env <env> ...` | Đếm/sao lưu/xoá/nạp lại từ Lark trên MỘT môi trường bất kỳ (bb-dev hoặc bb-prod), tệp sao lưu ghi mã dự án | Tuỳ cờ (`--dem`/`--sao-luu` chỉ đọc, `--xoa`/`--nap`/`--khoi-phuc` có ghi) |
| `npm run lark:soat-link-cu -- --dich <env>` | Tìm ô "Link app" cũ trên Lark không khớp share_links ở đích | Chỉ đọc, không ghi Lark |

Ghi trong bàn giao BB-315: kết quả `npx tsc --noEmit`, `npx vitest run`, và
lượt dry-run thật trên **bb-dev, chỉ đọc, chỉ đếm** (không có khoá bb-prod).
