# 26 — Runbook cắt app sang bb-prod

Viết cho chủ studio (anh) — mỗi bước ghi rõ **ai làm** (Claude/anh), **lệnh
chính xác** để copy, **cách kiểm** biết bước đã qua, và **đường lùi** nếu hỏng.
BB-315. Nối tiếp `docs/18-bang-kiem-bb-prod.md` (bảy cổng, phần lớn đã xong) và
`docs/23-ke-hoach-mo-cho-tat-ca.md`.

**Quyết định của anh, 28/09/2026** (xem đầu brief BB-315): trước khi mở, **nạp
dữ liệu sạch vào bb-prod rồi mới mở** — đây là luồng dev → prod chuẩn. Mục
tiêu mở: **06/10/2026**.

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

---

## 1. Sao lưu bb-prod (trước khi đụng bất cứ thứ gì)

**Ai làm:** Claude.

```bash
npm run db:backup:prod
```

**Kiểm:** lệnh in ra đường dẫn tệp `.sql` và số dòng > 0 cho ít nhất
`branches`, `packages`, `customers`, `galleries` (457 bộ hôm nay). Thoát mã 0.

**Đường lùi:** không áp dụng — đây CHÍNH LÀ đường lùi cho mọi bước sau. Giữ
tệp này tới khi bước 12 (kiểm nhanh sau cắt) qua hết.

---

## 2. So khoảng lệch migration — CHỈ ĐỌC

**Ai làm:** Claude.

```bash
npm run db:so-migration -- --dich .env.prod.local
```

Lệnh này (mới, BB-315) so **chín mốc** của `migrate-prod.mjs`, danh sách tệp
migration migrate-prod SẼ áp (đọc thẳng từ `db/migrations/`, không phải một
danh sách gõ tay — luôn khớp những gì đang có trong kho ngay lúc chạy, kể cả
tệp BB-31x thêm sau ngày viết tài liệu này), **và** cấu trúc Storage (bucket +
policy — xem mục 4).

**Kiểm:** đọc phần "Chín mốc migration" — cột `đích` phải toàn `THIẾU` (đúng
như dự kiến, bb-prod đang chậm hơn bb-dev). Không báo lỗi kết nối.

**Dãy tệp thật tại thời điểm viết tài liệu này (28/09/2026), 31 tệp, 0045 →
0075** — chép lại để đối chiếu, nhưng **luôn tin lệnh trên, không tin danh
sách tĩnh này** nếu có tệp mới hơn 0075 trong `db/migrations/` lúc chạy thật:

```
0045-bo-ma-pin.sql              0046-link-ttl.sql
0047-xoa-nhan-su.sql             0048-khoa-lai-check-staff-deletable.sql
0049-dong-chat-page-url.sql      0050-quyen-mac-dinh-cho-vat-sinh-sau.sql
0051-activity-logs-gallery-fk.sql 0052-vai-tro-dong.sql
0053-quyen-doc-tu-bang-roles.sql 0054-bo-dong-require-pin-default.sql
0055-chot-vai-he-thong-that-su-chan.sql
0056-policy-thoi-doc-ten-vai.sql
0057-quyen-ghi-thoi-tang-kem-quyen-doc.sql
0058-quyen-quan-ly-chi-nhanh-va-gan-vai-tay.sql
0059-mot-san-pham-mua-them-mot-dong.sql
0060-chot-chua-phai-la-khoa.sql   0061-mua-them-gan-vao-anh-cu-the.sql
0062-anh-trong-album-mua-them.sql 0063-chu-tren-bia.sql
0064-dem-luot-mo-link.sql         0065-gia-anh-chon-them-mac-dinh.sql
0066-cskh-mo-lai-bo-anh.sql       0067-trang-thai-hau-ky-tu-lark.sql
0068-admin-galleries-rpc-tra-them-lark.sql
0069-kieu-chu-bia.sql             0070-giu-ma-link-ma-hoa.sql
0071-dang-ky-thong-bao-day.sql    0072-yeu-cau-mua-them.sql
0073-mua-them-nguoi-mua.sql       0074-hop-thu-thong-bao.sql
0075-bia-album.sql
```

---

## 3. Áp migration lên bb-prod

**Ai làm:** Claude (chạy lệnh), **anh duyệt trước khi gõ `--thuc-thi`**.

```bash
# đọc trước — KHÔNG ghi gì
npm run db:migrate:prod

# anh duyệt xong mới chạy dòng này:
npm run db:migrate:prod -- --thuc-thi --that-su-la-bb-prod
```

`migrate-prod.mjs` (BB-315: dãy tệp nay đọc động từ `db/migrations/`, không
còn mảng gõ tay — không bao giờ "quên" một tệp mới) tự sao lưu trước khi ghi
(gọi `backup.mjs`), áp từng tệp trong một giao dịch riêng (gãy ở tệp nào hoàn
nguyên đúng tệp đó, các tệp trước giữ nguyên), rồi đo lại chín mốc.

**Kiểm — làm ĐỦ CẢ BA, theo đúng thứ tự, TRƯỚC khi sang bước 4:**

1. Lệnh trên thoát mã 0 và dòng cuối in "**Chín mốc đều đạt**".
2. Chạy `npm run verify:db:prod` — xem mục "Cổng `verify:db` trên bb-prod" bên
   dưới nếu kho chưa có sẵn script này; nếu có thì phải ra **17/17**.
3. Đo lại RIÊNG mốc quyền mặc định (0050) — đây là mốc **nặng nhất** trong
   chín mốc (đã từng làm lộ đọc/ghi/xoá `share_links` và `staff_profiles` qua
   `anon` trên bb-prod trước khi vá, xem `docs/18` §2.0b). Dòng "Vật sinh sau
   không tự mở cho anon" và "Khung nhìn: anon trắng tay, không ai ghi" trong
   bảng "SAU KHI VÁ" của lệnh ở bước 3 phải cả hai đều `OK`. Nếu một trong hai
   không `OK`: **DỪNG, không đi tiếp sang bước 4**, báo anh ngay — đây đúng là
   lớp lỗi từng để lộ dữ liệu 457 nhà thật một lần rồi.

### Cổng `verify:db` trên bb-prod

Kho hiện có `npm run verify:db` chạy trên `.env.local` (bb-dev). Nếu chưa có
biến thể cho bb-prod, chạy tay:

```bash
node --env-file=.env.prod.local scripts/verify-db.mjs
```

Phải ra **17/17**. Đây là cổng ĐÃ CÓ SẴN từ trước BB-315 (xem `docs/18` §1),
không phải công cụ mới.

**Đường lùi:** khôi phục từ tệp sao lưu ở bước 1 bằng ba bước ghi sẵn đầu tệp
`.sql` đó (`scripts/setup-prod.mjs` → tạo lại `auth.users` đúng UUID → nạp tệp
`.sql`). Vì mỗi tệp migration chạy trong giao dịch riêng, một lỗi giữa dãy tự
dừng và KHÔNG cần khôi phục toàn bộ — chỉ tệp gãy chưa áp, các tệp trước vẫn
đứng.

---

## 4. Storage: bucket `thumbnails` + policy

**Ai làm:** Claude đo, anh xác nhận nếu cần thao tác tay trên Supabase
Dashboard.

bb-prod hôm nay **0 ảnh trong bảng `photos`, chưa từng ghi đệm ảnh** — nghĩa
là bucket `thumbnails` **CHƯA từng được tạo** ở đó (bucket này tự sinh LƯỜI:
chỉ tạo khi có lượt ghi đệm đầu tiên, xem `src/lib/drive/lam-nong-cache.ts`
dòng ~327 — `createBucket("thumbnails", { public: false })`).

**Đo (không đọc dữ liệu, chỉ đọc cấu trúc):**

```bash
npm run db:so-migration -- --dich .env.prod.local
```

(lệnh giống bước 2 — phần "Bucket Storage" và "Policy Storage" ở cuối output
so bb-dev với bb-prod bằng `admin.storage.listBuckets()` và
`pg_policies where schemaname='storage'`, không đọc một tệp ảnh nào)

**Hai đường để bucket + policy có mặt trên bb-prod, chọn MỘT:**

- **A — để app tự tạo (khuyến khích, không cần thao tác tay):** sau bước 6
  (nạp dữ liệu), mở một bộ ảnh bất kỳ trong màn quản trị bb-prod và bấm
  "Đồng bộ lại" (kéo ảnh từ Drive) — `lamNongMotLo`/`lamNongAnhBia` tự tạo
  bucket `thumbnails` (`public: false`) trong đúng lượt ghi đệm đầu tiên đó.
  Đây là con đường app đã dùng ở bb-dev, không phải đường mới.
- **B — chỉ khi A không tạo được policy đúng (kiểm lại bằng lệnh `db:so-migration`
  ở trên sau khi làm A):** so sánh policy Storage của bb-dev
  (cột "nguồn" trong output) với bb-prod (cột "đích"), rồi vào Supabase
  Dashboard của bb-prod → **Storage** → **Policies** → chép tay từng policy
  còn thiếu, cùng `cmd`/`roles` đã in ra. Vì đây là thao tác tay hiếm khi cần,
  không đóng gói thành script — làm khi B thật sự cần, không làm trước.

**Kiểm:** chạy lại `npm run db:so-migration -- --dich .env.prod.local`, phần
"Bucket đích còn thiếu" và "Policy Storage đích còn thiếu" đều phải bằng 0
**trước khi gửi link đầu tiên cho khách** (bước 11).

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

## 6. `db:chep-cau-hinh` — chép cấu hình từ bb-dev sang bb-prod

**Ai làm:** Claude chạy; anh duyệt số đếm trước khi gõ `--ghi`.

```bash
# chỉ xem — không ghi gì, in số dòng sẽ thêm/sửa, CHỈ id + code/key
node --import tsx scripts/chep-cau-hinh.mjs --dich .env.prod.local

# anh duyệt số đếm xong mới chạy dòng này (mã xác nhận lấy từ lượt trên):
node --import tsx scripts/chep-cau-hinh.mjs --dich .env.prod.local \
  --ghi --xac-nhan <mã in ở lượt trên> --that-su-la-bb-prod
```

Chép sáu bảng: `branches`, `packages`, `roles` (chỉ vai TỰ TẠO — chín vai hệ
thống dùng UUID cố định, migration 0052 đã tự lo), `settings` (toàn bộ, kể cả
`chat.page_url`, `lark.webhook_url`, `gallery.link_ttl_days`,
`lark.nhac_noi_bo` — bốn khoá anh nhắc riêng), `staff_profiles`,
`staff_branches`. Tự sao lưu ĐÍCH trước khi ghi (gọi `backup.mjs`). Không bao
giờ in tên/SĐT/email nhân sự hay giá trị `lark.webhook_url` ra màn hình — chỉ
in id và khoá tự nhiên (xem đầu `scripts/chep-cau-hinh.mjs`).

**Nhân sự — việc PHẢI làm ngay sau bước này:**

Tài khoản nhân sự tạo mới ở bb-prod có **mật khẩu ngẫu nhiên không ai biết**
(không chép mật khẩu — xem đầu tệp script). Trước khi bất kỳ ai đăng nhập
được:

1. Anh đăng nhập bb-prod bằng tài khoản `owner` bootstrap (mục 2.1 dưới đây,
   phải làm TRƯỚC bước này nếu chưa có).
2. Vào màn **Nhân sự** → từng người vừa được chép sang → **Đặt lại mật khẩu**
   → đặt một mật khẩu mới, gọi điện/nhắn Zalo riêng báo cho từng người (không
   dán mật khẩu vào Lark/email chung).

**Kiểm:** chạy lại lệnh KHÔNG có `--ghi` — phần "sẽ thêm"/"sẽ sửa" của cả sáu
bảng phải về 0 (idempotent — chạy hai lần không tạo trùng).

**Đường lùi:** khôi phục bb-prod từ tệp `.sql` mà lệnh này tự sao lưu ngay
trước khi ghi (in đường dẫn ra màn hình lúc chạy).

### 6.1. Tài khoản quản trị ĐẦU TIÊN trên bb-prod (0 nhân sự hôm nay)

Trước khi bước 6 chạy `--ghi`, bb-prod có **0 `staff_profiles` và chưa có
`auth.users` nào** — không ai đăng nhập được, kể cả anh. Việc này KHÔNG chép
tự động được (đây là bí mật — mật khẩu — việc của người, xem AGENTS.md):

1. Supabase Dashboard → dự án **bb-prod** → **Authentication** → **Users** →
   **Add user**.
2. Email công việc, mật khẩu mạnh, tick **Auto Confirm User**.
3. Copy `UUID` của user vừa tạo.
4. **Table Editor** → `staff_profiles` → **Insert row**: dán UUID vào `id`,
   điền `full_name`, `email` (khớp bước 1), `role` = `owner`.

Làm việc này **trước** bước 6 nếu muốn tự đăng nhập kiểm ngay sau khi chép
xong; làm **sau** bước 6 cũng được — `chep-cau-hinh` không đụng gì tới tài
khoản này (không có trong bb-dev).

---

## 7. `db:nap-lai --env .env.prod.local` — xoá sạch rồi nạp lại từ Lark

**Ai làm:** Claude chạy; anh duyệt số đếm trước mỗi lệnh ghi.

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

**Kiểm:**

1. `--xoa` in "Đã xoá:" kèm số dòng khớp số đã duyệt ở `--dem`.
2. `--nap` in `[OK]` cho đủ 5 bước (danh mục sản phẩm → hậu kỳ → hợp đồng →
   chỉnh sửa → ảnh Drive), thoát mã 0.
3. Đếm lại: `node --env-file=.env.prod.local scripts/verify-db.mjs` — vẫn
   **17/17**.
4. `select count(*) from galleries` trên bb-prod phải > 0 và khớp số buổi
   chụp Lark gần đây (không còn 457 bộ cũ).

**Đường lùi:** `--khoi-phuc "<thư mục --sao-luu ở trên>"` (thêm
`--buoc-khoi-phuc` nếu bảng đích đã có dòng), hoặc khôi phục toàn bộ từ tệp
sao lưu SQL ở bước 1.

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

**Đường lùi (P1 — khách không mở được album):** Vercel → **Deployments** →
chọn bản TRƯỚC → **Promote to Production**. Đổi lại ba biến Supabase về giá
trị bb-dev cũ nếu cần lùi hẳn cả cơ sở dữ liệu — **dưới 5 phút**, không cần
Redeploy thủ công (Promote tự dùng bản dựng cũ, còn đổi biến thì Redeploy).
Ghi rõ **ai bấm và lúc nào** vào một ghi chú vận hành riêng ngoài kho mỗi lần
làm việc này (xem mục 13).

---

## 9. GitHub secret `BACKUP_DATABASE_URL` → bb-prod

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

## 10. Lark webhook/cron — chỉ kiểm, không đổi

**Ai làm:** Claude kiểm; không cần anh làm gì nếu qua.

Đường kéo Lark (`sync-lark.yml`, GitHub Actions) gọi vào **CÙNG MỘT domain**
(`hauky.babybeanstudio.vn`) trước và sau khi cắt — domain không đổi, chỉ
Supabase phía sau đổi. `SYNC_CRON_SECRET` và `APP_URL` (GitHub Secrets) không
cần sửa.

**Kiểm:** GitHub → tab **Actions** → workflow kéo Lark → chạy tay một lần
(**Run workflow**) → dấu tích xanh → `select value from settings where
key = 'lark_retouch_last_sync'` trên bb-prod có mốc thời gian mới (đã chép
đúng `lark.webhook_url` ở bước 6, nên tin nhắn báo lỗi/xác nhận đi đúng nhóm
Lark của studio).

---

## 11. Trước khi gửi link đầu tiên cho khách

**Ai làm:** Claude (làm nóng đệm ảnh + soát), anh xem kết quả soát.

### 11.1. Làm nóng ảnh bìa cho chi nhánh mở đầu

Không có lệnh dòng lệnh riêng cho việc này — con đường ĐÃ CÓ của app tự làm
(`src/lib/drive/lam-nong-cache.ts`, hàm `lamNongAnhBia`/`lamNongMotLo`, được
gọi tự động khi mở một bộ ảnh trong màn quản trị hoặc khi tạo link chia sẻ).
Với chi nhánh mở đầu: vào màn quản trị bb-prod, lọc theo chi nhánh đó, **mở
lần lượt từng bộ ảnh** (hoặc bấm "Đồng bộ lại" nếu chưa có ảnh) — mỗi lượt mở
tự làm nóng ảnh bìa cho bộ đó. Không cần viết công cụ mới cho việc này.

### 11.2. Soát "gom nhiều hợp đồng — CÁCH XA NHAU"

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
từng dòng trước khi bước 12.

---

## 12. Kiểm nhanh sau khi cắt

**Ai làm:** anh, trên điện thoại thật, 4G (không phải Wi-Fi văn phòng — đúng
điều kiện khách thật dùng).

1. Đăng nhập `hauky.babybeanstudio.vn/login` bằng tài khoản ở mục 6.1/6.
2. Màn danh sách bộ ảnh hiện đúng số bộ vừa nạp ở bước 7 (không còn 457 bộ
   cũ), cột đầu là Số hoá đơn.
3. Mở MỘT bộ ảnh thật của chi nhánh mở đầu, bấm "Đồng bộ lại" — ảnh phải hiện
   ra, bộ chuyển khỏi `draft`.
4. Cấp một link thử cho **chính anh**, mở bằng điện thoại: ảnh nét, thả tim
   được, có nút tải xuống.
5. Nút "Nhắn cho studio" hiện đúng (đã chép `chat.page_url` ở bước 6).

Qua cả năm ý trên mới coi là cắt xong.

---

## 13. Bb-dev: giữ nguyên ít nhất 3 ngày, KHÔNG dọn cùng ngày cắt

**Quyết định của anh, 28/09/2026.** Chỉ xoá dữ liệu khách trên bb-dev **SAU
KHI bb-prod đã chạy ổn định ít nhất 3 ngày**, không làm trong cùng một ngày
với lúc cắt. Lý do: trong 3 ngày đó, bb-dev vẫn là đường LÙI nhanh nhất — đổi
lại 3 biến Supabase trên Vercel (mục 8) về giá trị bb-dev cũ + Redeploy là về
bản cũ trong **dưới 5 phút**, không cần khôi phục từ tệp sao lưu.

**Điền vào đây MỖI LẦN làm việc này** (ai bấm, lúc nào — không được bỏ trống):

| Việc | Ai bấm | Lúc nào (giờ VN) | Ghi chú |
|---|---|---|---|
| Cắt sang bb-prod (đổi 3 biến Vercel, bước 8) | | | |
| Ngày thứ 3 ổn định — bắt đầu được phép dọn bb-dev | | | (tự động = ngày cắt + 3) |
| Dọn dữ liệu khách trên bb-dev | | | |

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

---

## 14. Tuần nhân viên thử trên bb-dev — TRƯỚC khi cắt

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

**Đổi lại sau tuần thử — dùng ĐÚNG giá trị đã lưu ở trên, qua cùng màn Cài
đặt.** Nếu quên bước này, mọi lượt chốt thật SAU tuần thử vẫn báo vào nhóm
"Kiểm thử app" — không ai trong nhóm vận hành thật thấy tin, và không có lỗi
nào hiện ra để biết mà sửa.

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

## 15. Sau khi cắt — cập nhật khuyến nghị (KHÔNG tự đổi)

`src/lib/lark/muc-tieu-du-lieu.ts` (`MA_DU_AN_THAT`) hiện cho cả bb-dev VÀ
bb-prod nhận tên khách thật — đúng, vì bb-dev vẫn giữ dữ liệu khách 3 ngày (mục
13) trước khi dọn. **Khuyến nghị, không phải việc Claude tự làm:** sau khi mục
13 hoàn tất (bb-dev đã dọn sạch, trở lại là cơ sở dữ liệu thử), anh cân nhắc bỏ
dòng `ohkfoqqsrpvsponiwcij // bb-dev` khỏi `MA_DU_AN_THAT` để bb-dev về lại
trạng thái CHE TÊN — phép thử và dữ liệu mẫu tạo mới trên bb-dev từ lúc đó sẽ
không còn cần thay tên trước khi commit (AGENTS.md §6). Đây là quyết định của
anh, không phải điều Claude tự sửa trong lượt cắt này.

---

## Tổng kết bảng công cụ mới (BB-315)

| Lệnh | Làm gì | Chỉ đọc / có ghi |
|---|---|---|
| `npm run db:so-migration -- --dich <env>` | So migration + Storage giữa hai môi trường | Chỉ đọc |
| `npm run db:migrate:prod -- --thuc-thi --that-su-la-bb-prod` | Áp migration còn thiếu lên bb-prod | Có ghi (tự sao lưu trước) |
| `node --import tsx scripts/chep-cau-hinh.mjs --dich <env> [--ghi --xac-nhan <mã> --that-su-la-bb-prod]` | Chép branches/packages/roles/settings/staff sang môi trường khác | Mặc định chỉ đọc; `--ghi` mới ghi |
| `npm run db:nap-lai -- --env <env> ...` | Đếm/sao lưu/xoá/nạp lại từ Lark trên MỘT môi trường bất kỳ (bb-dev hoặc bb-prod) | Tuỳ cờ (`--dem`/`--sao-luu` chỉ đọc, `--xoa`/`--nap`/`--khoi-phuc` có ghi) |

Ghi trong bàn giao BB-315: kết quả `npx tsc --noEmit`, `npx vitest run`, và
lượt dry-run thật trên **bb-dev, chỉ đọc, chỉ đếm** (không có khoá bb-prod).
