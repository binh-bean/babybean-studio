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

**Bản 01/10/2026 (BB-352) — vá tám chỗ thiếu mà vòng 7 (soát C) tìm ra**
(`scratchpad/danh-gia/13-vong7-C-phan-bien.md`, mục 3). Mỗi chỗ vá nằm ngay tại
bước liên quan, và có ô ☐ để anh tích khi làm xong:
mục **3a** (dãy migration 0076–0085) · **5c** (Realtime) · **7** (bảng nào giữ,
bảng nào xoá) · **8a** (biến môi trường đầy đủ, gồm `APP_SECRET`, VAPID, loại
chuỗi kết nối) · **11** (hai Automation của Lark) · **11b** (thứ tự chạy cron và
đồng bộ sau khi cắt).

**Bản 02/10/2026 (BB-363) — vá R1–R9 của soát C vòng 11 và chỗ thiếu soát B nêu**
(`scratchpad/danh-gia/18-vong11-C-phan-bien.md` mục 3, `17-vong11-B-van-hanh.md`
mục 2.6): **3a** (thêm 0086–0089; 0088/0089 áp ở bước 3 như mọi tệp khác) ·
**6a** (cờ thu sản phẩm qua app: mặc định tắt, ngày hiệu lực) · **7c** (MỚI — chép
mốc "mở link" từ bb-dev, để bước nạp lại không đặt lại đồng hồ thu gọn ảnh) ·
**5c** (rủi ro Realtime công khai) · **8a-A2** (MỚI — lộ `APP_SECRET` thì làm gì) ·
**11c** (ô quyết định lưới đỡ, 2 secret, kiểm mỗi thứ Hai) · **13a** (MỚI — bộ dọn
dữ liệu: đêm đầu, xem trước trên bb-prod).

### Đường đi tóm tắt — một màn hình

Làm TRƯỚC ngày cắt:

☐ A. Diễn tập trên bb-prod (mục 17) và tuần nhân viên thử trên bb-dev (mục 15).
☐ B. Anh quyết: bật hay không bật lưới đỡ `sync-lark` (mục 11c).

Ngày cắt, theo đúng thứ tự:

☐ 1. Sao lưu bb-prod (mục 1).
☐ 2. So khoảng lệch migration — chỉ đọc (mục 2).
☐ 3. Áp migration, gồm cả 0086–0090 (mục 3, 3a). `verify:db` ra đủ N/N.
☐ 4. Storage (mục 4) · Auth (mục 5) · webhook Lark thật (mục 5a) · tài khoản quản
   trị đầu tiên (mục 5b) · Realtime (mục 5c).
☐ 5. Chép cấu hình (mục 6), rồi kiểm cờ thu sản phẩm đang TẮT (mục 6a).
☐ 6. Xoá rồi nạp lại từ Lark (mục 7).
☐ 7. Soát ô "Link app" cũ trên Lark (mục 7b).
☐ 8. Chép mốc "mở link" từ bb-dev (mục 7c). Làm NGAY sau bước 6, trước khi dọn bb-dev.
☐ 9. Biến môi trường Vercel (mục 8, 8a).
☐ 9b. **Link quản lý bộ ảnh lên Lark** (anh chốt 06/10: chỉ làm khi sang prod):
   - đặt `LARK_GHI_LINK_QUAN_LY=1` trên Vercel để app tự ghi cho bộ mới;
   - rồi điền bù bằng `NEXT_PUBLIC_APP_URL=https://hauky.babybeanstudio.vn npm run lark:ghi-link-quan-ly`: chạy thử trước, xem dòng "Địa chỉ gốc", rồi mới thêm `-- --write`.
   - Ô hiện tên khách, link là `…/admin/galleries/<id>`. Script tự thay 492 ô `http://localhost:3000/…` lỡ ghi ngày 06/10.
☐ 10. Backup secret (mục 10) · Lark Automation (mục 11, 11a, 11b).
☐ 11. Trước link đầu tiên (mục 12) → kiểm nhanh (mục 13).
☐ 12. Sáng hôm sau: kiểm bộ dọn đã chạy đêm đầu (mục 13a).
☐ 13. Giữ bb-dev ít nhất 3 ngày (mục 14).

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
`branches`, `packages`, `customers`, `galleries` (con số "457 bộ" ở các chỗ
trong tài liệu này là số của ngày 28/09, đã cũ — bb-dev ngày 01/10 có 499 bộ;
chỉ cần > 0 và khớp với những gì anh biết). Thoát mã 0.

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
   mốc. Từ BB-352 cổng có **23 mốc** (trước đó 17) vì đã thêm sáu phép kiểm
   riêng cho dãy 0052–0085: bảng mới tồn tại, RLS bật, `anon` không có quyền
   nào, khoá công khai không đọc được, 23 cột mới tồn tại, hai hàm viết lại
   (`get_admin_galleries` 14 tham số, `get_gallery_photos` 6 tham số) đúng chữ
   ký. **Nếu bb-prod ra 17/17 thì đang chạy cổng cũ — không tin con số đó**:
   cổng cũ không biết dãy 0077–0085 nên xanh cả khi bb-prod thiếu hẳn dãy ấy.
   Số N thật là số do chính lệnh in ra; không chép cứng vào đây.
3. Đo lại RIÊNG mốc quyền mặc định (0050) — đây là mốc **nặng nhất** trong
   chín mốc (đã từng làm lộ đọc/ghi/xoá `share_links` và `staff_profiles` qua
   `anon` trên bb-prod trước khi vá, xem `docs/18` §2.0b). Dòng "Vật sinh sau
   không tự mở cho anon" và "Khung nhìn: anon trắng tay, không ai ghi" trong
   bảng "SAU KHI VÁ" của lệnh ở bước 3 phải cả hai đều `OK`. Nếu một trong hai
   không `OK`: **DỪNG, không đi tiếp sang bước 4**, báo anh ngay — đây đúng là
   lớp lỗi từng để lộ dữ liệu 457 nhà thật một lần rồi.

### 3a. Dãy migration phải áp lên bb-prod (BB-352)

Bản cũ của runbook chỉ nhắc 0067–0075. Dãy đầy đủ từ lúc bảng theo dõi ra đời:

| Số | Làm gì |
|---|---|
| 0076 | Tạo bảng theo dõi `schema_migrations` — bảng GIỮ NGUYÊN, `db:nap-lai` không bao giờ xoá |
| 0077 | Đợt chọn thêm ảnh: bảng `selection_rounds`, cột `dot` ở ảnh/mua thêm, cờ ở `selections` |
| ~~0078~~ | **Không tồn tại** — số bỏ trống, không phải tệp bị mất |
| 0079 | "Bản ghi mới từ Lark": bảng `lark_ban_ghi_moi`, cột `galleries.lark_dong_da_xoa_luc` |
| 0080 | Mua thêm đã thanh toán: mã hoá đơn, mã phiếu thu |
| 0081 | `galleries.lark_photo`, viết lại hàm `get_admin_galleries` (14 tham số) |
| 0082 | Studio xử lý đợt 1 (`selections.studio_xu_ly_dot1_at/_boi`) |
| 0083 | Tim của link mời gia đình: bảng `tim_gia_dinh`, cột mới của `yeu_cau_mua_them` |
| ~~0084~~ | **Không tồn tại** — như 0078 |
| 0085 | Viết lại hàm `get_gallery_photos` (6 tham số, trả mã tệp Drive) |
| 0086 | Sổ thu tiền chống ghi trùng: cột `gallery_payments.ma_yeu_cau` + chỉ mục duy nhất (BB-351). Đã áp bb-dev |
| 0087 | Hai chỉ mục cho bộ dọn dữ liệu (`activity_logs.created_at`, `notifications`) (BB-356). Đã áp bb-dev |
| 0088 | Thu gọn ảnh bộ cũ: cột `trang_thai_tu`, `danh_sach_thu_gon_luc`, `so_anh_truoc_thu_gon`, `mo_lai_anh_luc`, `mo_link_cuoi_luc`; hàm `nhan_mo_lai_anh`; viết lại `tang_luot_mo_link` (BB-357/359/363). **CHƯA áp bb-dev — cố ý** |
| 0089 | Dựng lại 4 chỉ mục bảng `photos` (REINDEX, không đổi định nghĩa) (BB-357). **CHƯA áp bb-dev — cố ý** |
| 0090 | Link gia đình: chỉ mục duy nhất "một link gia đình còn sống/khách", cột `galleries.so_thu_tu_khach` + trigger `gan_so_thu_tu_khach` (BB-334A). **Đã áp bb-dev 06/10** bằng `migrate-prod --chi 0090` (cờ mới, áp riêng từng tệp, không kéo 0088/0089) |

(Đầu tệp 0083 vẫn ghi "viết nhưng chưa áp" — câu đó đã cũ, bb-dev áp từ 01/10.
Đầu tệp 0086/0087 cũng ghi "chưa áp" — đã cũ, bb-dev áp từ 02/10.)

☐ 1. `npm run db:so-migration -- --dich .env.prod.local` liệt kê **đủ** các số
   trên trong mục "Tệp migration đích còn thiếu" (cộng dãy 0045–0075).
☐ 2. Sau `--thuc-thi`, chạy lại lệnh đó: "còn thiếu" = **0**.
☐ 3. `node --env-file=.env.prod.local scripts/verify-db.mjs` ra **28/28** (từ
   BB-334A; 27 từ BB-363; trước đó 23), và riêng các dòng "Bảng mới: …", "23 cột mới …", "Hàm
   viết lại …", "0086: …", "0087: …" đều ĐẠT. Trên bb-prod sau bước 3, ba dòng
   "0088: …", "0089: …" và "0090: …" phải ghi **"đã áp"**. Nếu ghi "CHỜ CẮT" nghĩa là bước 3
   chưa áp chúng: DỪNG, báo Claude. (Trên bb-dev hai dòng đó ghi "CHỜ CẮT" và
   vẫn ĐẠT — đúng kế hoạch.) Dòng "0088" ghi "ÁP NỬA VỜI" là HỎNG: DỪNG.
☐ 4. Không có 0078 / 0084 trong danh sách thiếu (nếu công cụ đòi chúng: DỪNG,
   báo Claude — đó là lỗi của công cụ, không phải tệp thiếu).
☐ 5. **0088, 0089 và 0090 áp NGAY Ở BƯỚC NÀY, cùng mọi tệp khác** (BB-363 chọn cách
   này: viết lại tài liệu cho khớp `migrate-prod`, KHÔNG thêm cờ giữ lại). Lý do:
   - `migrate-prod` áp mọi tệp còn thiếu theo thứ tự, mỗi tệp một giao dịch.
     Thêm cờ giữ lại là thêm một thứ người làm có thể quên gõ.
   - 0088 không cần dữ liệu đã nạp: mốc thu gọn ảnh của bộ nạp ở bước 7 được
     điền bằng bước **7c** (chép từ bb-dev), không phải bằng phần điền sẵn của 0088.
   - 0089 chỉ REINDEX. Bảng `photos` của bb-prod lúc này gần như rỗng nên chạy
     vài giây; chỉ mục sau bước 7 được dựng dần khi nạp, không phình như bb-dev
     (bb-dev phình vì nạp/xoá nhiều lần). Không cần chạy lại sau bước 7.
   - "Áp ngay trước khi lên bb-prod" (anh chốt 02/10) vẫn đúng: bước 3 chính là
     ngay trước khi lên. bb-dev **không** áp 0088/0089.

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

## 5c. Realtime trên bb-prod (BB-352 — bản cũ KHÔNG có bước nào cho việc này)

**Ai làm:** anh (Supabase Dashboard); Claude kiểm.

Từ BB-342, màn khách và màn nhân viên tự cập nhật không cần F5 nhờ Supabase
Realtime. Máy chủ app phát tin bằng khoá `service_role` tới **kênh công khai**
(không dùng kênh riêng tư vì khách không có tài khoản Supabase). Nếu bb-prod chỉ
cho kênh riêng tư thì việc phát tin **hỏng âm thầm** — không có lỗi nào hiện ra,
màn chỉ còn tự hỏi lại mỗi 30 giây.

☐ 1. Supabase Dashboard → dự án **bb-prod** → **Project Settings** →
   **Realtime** (chưa chắc tên: có thể nằm ở mục **Realtime → Settings**).
☐ 2. Bảo đảm Realtime đang **bật** cho dự án.
☐ 3. Bật **Allow public access** (cho phép kênh công khai). Lưu.
☐ 4. Ghi lại hạn mức gói Free để biết khi nào chạm trần: **200 kết nối đồng
   thời, 2 triệu tin mỗi tháng** (số theo báo cáo vòng 7 — anh kiểm lại trên
   trang giá của Supabase, vì họ có thể đổi). Mỗi khách đang mở link là một kết
   nối; mỗi nhân viên đang mở màn quản trị cũng là một.
☐ 5. **Kiểm (làm sau bước 8, khi app đã trỏ vào bb-prod):** mở một bộ ảnh bằng
   link khách trên điện thoại, mở màn quản trị của đúng bộ đó trên máy tính. Thả
   tim một tấm ở màn khách: màn quản trị đổi **không cần F5**. Hoặc mở DevTools →
   **Network** → lọc **WS**, thấy kết nối tới `…supabase.co/realtime/…` ở trạng
   thái đang mở.
☐ 6. Nếu không thấy gì đổi: kiểm lại bước 3 trước tiên, rồi báo Claude đọc log
   `tuc_thi.phat_hong` trên Vercel.
☐ 7. **Rủi ro anh chấp nhận (soát C R7):** chính "Allow public access" làm cho ai
   cầm được tên kênh (khách của bộ đó, nhân viên đã nghỉ cầm kênh chi nhánh) nghe
   được và phát giả được tin "có thay đổi" mãi mãi. Tin không chứa tên, SĐT hay
   tiền. Rủi ro đáng kể hơn là kẻ xấu xả tin để ăn hạn mức Free. Tuần đầu, mỗi
   sáng xem Supabase → **Usage → Realtime messages**: vượt ~70.000 tin/ngày (nhịp
   chạm 2 triệu/tháng) thì báo Claude.

**Đường lùi:** tắt lại **Allow public access** (app vẫn chạy, chỉ mất tính năng
tự cập nhật tức thì).

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

## 6a. Cờ "thu tiền sản phẩm trong app" (BB-360/363) — phải đang TẮT

**Ai làm:** Claude kiểm; anh quyết khi nào bật (không phải ngày cắt).

Cờ `thanh_toan.thu_san_pham_qua_app` quyết định tiền ảnh in / khung / album khách
mua thêm có nằm trong "Phải thu" của app không. Hôm nay studio thu khoản này qua
Lark, nên **mặc định TẮT**. Cờ đi theo bước 6 (chép `settings`).

Từ BB-363 cờ **không hồi tố**: lúc anh bật trong màn Cài đặt, máy chủ tự ghi ngày
bật vào khoá `thanh_toan.thu_san_pham_qua_app_tu` (không sửa tay được) và ghi một
dòng nhật ký `thanh_toan.bat_thu_san_pham_qua_app`. Chỉ giỏ khách chốt **từ ngày
đó** mới thu sản phẩm qua app (đợt mua thêm tính theo lúc gửi đợt). Bộ chốt trước
ngày đó vẫn hiện "thu qua Lark", không bao giờ hiện nợ ma.

Khi cờ tắt, CSKH không ghi được dòng thu lớn hơn số còn phải thu (máy chủ báo
"tiền sản phẩm thu qua Lark — không ghi vào sổ này"). Lý do: tiền sản phẩm lẫn
vào sổ sẽ bị tính là tiền ảnh và làm hạn mức tăng cho ảnh khách chưa trả.

☐ 1. Sau bước 6, trên bb-prod: khoá `thanh_toan.thu_san_pham_qua_app` = `false`
   hoặc **không có dòng**. Có dòng `true`: DỪNG, hỏi anh.
☐ 2. Khoá `thanh_toan.thu_san_pham_qua_app_tu` **không có dòng** (hoặc anh biết vì
   sao có).
☐ 3. Ghi nhớ: **không bật cờ khi chưa có kế hoạch cho bộ cũ**. Bật lên chỉ ảnh
   hưởng giỏ chốt sau ngày bật; tắt rồi bật lại thì ngày hiệu lực là ngày bật
   LẦN SAU.

**Đường lùi:** tắt cờ trong màn Cài đặt. Tiền sản phẩm đã ghi vào sổ app giữ
nguyên (sổ chỉ ghi thêm); màn hình hiện lại dòng "thu qua Lark".

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

### 7.0. Bảng nào giữ, bảng nào xoá (BB-352 — sửa lỗi P1 vòng 7)

Bản cũ của công cụ có luật "bảng lạ thì tự xoá". Luật đó đã **xoá nhầm
`schema_migrations`** (sổ ghi 39 migration đã áp — mất sổ này là `migrate-prod`
áp lại cả dãy 0045+ lên cơ sở dữ liệu đã có dữ liệu, và bước kiểm "Tệp migration
đích còn thiếu = 0" báo thiếu toàn bộ) và xếp chín bảng mới sai chỗ. Nay **mọi
bảng phải có tên trong bảng phân loại** `PHAN_LOAI_BANG`
(`scripts/nap-lai-tu-lark.mjs`), và **gặp bảng chưa có tên thì công cụ DỪNG ở
mọi chế độ** (kể cả `--dem`), in ra tên bảng và không làm gì cả.

**Giữ nguyên (7 bảng) — `--xoa` không đụng tới:** `branches`, `staff_profiles`,
`staff_branches`, `roles`, `settings`, `packages` (sáu bảng bước 6 vừa chép
sang) và **`schema_migrations`** (mới).

**Xoá rồi `--nap` dựng lại từ Lark / Drive (8 bảng):** `customers`, `babies`,
`shoots`, `galleries`, `photos`, `gallery_items`, `products`, và
`lark_ban_ghi_moi` (bản sao dòng Hậu Kỳ chưa có bộ ảnh — hook và cron dựng lại).

**Xoá, KHÔNG nạp lại — dữ liệu dùng thử của app (20 bảng):** lựa chọn của khách
(`selections`, `selection_items`, `selection_addons`, `selection_addon_photos`,
`selection_placements`, `selection_ops`, `selection_rounds`, `album_covers`),
link (`share_links`, `share_link_ma`, `tim_gia_dinh`), thông báo (`push_dang_ky`,
`thong_bao_khach`, `notifications`), `lark_nhac_da_gui`, `yeu_cau_mua_them`,
`revision_requests`, `deliveries`, `activity_logs` và **`gallery_payments`**.

Hệ quả anh cần biết (chỉ đúng khi chưa có khách thật dùng):

- `push_dang_ky` bị xoá → khách nào đã bật thông báo thì phải **bật lại**.
- `lark_nhac_da_gui` bị xoá → lượt cron 08:00 kế tiếp có thể **nhắc lại một lần**
  các mốc chưa quá trễ (bộ ảnh mới có id mới nên sổ cũ cũng không còn khớp).
- `share_links` bị xoá → mọi link đã gửi **chết** (xem mục 7b).
- `gallery_payments` bị xoá → **mất sổ thu tiền**. Lệnh `--dem` in cảnh báo đỏ
  nếu bảng này còn dòng. **Nếu có một đồng tiền thật nào trong đó: DỪNG.**

**Từ lúc khách đầu tiên bấm chọn ảnh hay có một khoản thu thật trên bb-prod
(mục 0.3): KHÔNG chạy `--xoa` trên bb-prod nữa.** Công cụ này sinh ra cho việc
dựng lại từ đầu TRƯỚC ngày mở, không phải để sửa dữ liệu đang chạy.

☐ 1. `npm run db:nap-lai -- --env .env.prod.local --dem` in được **ba khối**
   (GIỮ NGUYÊN / XOÁ rồi nạp lại / XOÁ dữ liệu dùng thử) và **không** có dòng
   "DỪNG — không làm gì cả". Nếu có dòng đó: bảng mới vừa xuất hiện — báo Claude
   thêm vào bảng phân loại, không tự gõ lệnh ép.
☐ 2. `schema_migrations` có tên trong khối **GIỮ NGUYÊN**. Sau `--xoa`, chạy
   lại `npm run db:so-migration -- --dich .env.prod.local`: "Tệp migration đích
   còn thiếu" vẫn là **0** (nếu bảng này bị xoá thì nó sẽ báo thiếu toàn bộ).
☐ 3. Anh đọc khối "XOÁ dữ liệu dùng thử", thấy số dòng của `gallery_payments`
   và `selections` đúng là dữ liệu thử.

### S4 — tệp mốc sao lưu ghi mã dự án, từ chối xoá nếu lệch

Tệp `tong-so-dong.json` mà `--sao-luu` ghi ra nay có thêm trường `maDuAn`. Nếu
bản sao lưu GẦN NHẤT (theo tệp mốc, hoặc chỉ định bằng `--tu`) là của MỘT MÔI
TRƯỜNG KHÁC — ví dụ đang xoá bb-prod nhưng bản sao lưu trẻ nhất lại là của
bb-dev (đúng kịch bản mục 14: dọn bb-dev vài ngày sau khi cắt, cả hai môi
trường đều có bản sao lưu "trẻ" cùng khung giờ) — `--xoa` **TỪ CHỐI**, không
chỉ kiểm "có bản sao lưu < 24 giờ" như trước.

**Kiểm:**

1. `--xoa` in "Đã xoá:" kèm số dòng khớp số đã duyệt ở `--dem` (28 bảng; **không** có `schema_migrations` trong danh sách đó).
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

## 7c. Chép mốc "mở link" từ bb-dev (BB-363) — để đồng hồ thu gọn ảnh không về 0

**Ai làm:** Claude chạy; anh duyệt số đếm trước khi ghi.

Vì sao: app thu gọn danh sách ảnh của bộ **chưa xong** (khách chưa chọn xong) mà
**không ai mở link quá 6 tháng** (ảnh gốc vẫn trên Drive, mở lại là app tự đồng
bộ lại). Đồng hồ 6 tháng đo từ **lần mở link cuối** (ba mẹ hoặc gia đình), chưa ai
mở thì từ lúc gửi link, rồi lúc tạo bộ. Bước 7 xoá `share_links`, `activity_logs`
và dựng lại `galleries` trên bb-prod, nên **cả hai nguồn của mốc đều mất**: mọi bộ
nhận "lúc tạo" = ngày cắt, đồng hồ của mọi bộ về 0. Không dựng lại được từ dữ liệu
còn giữ trên bb-prod. Nguồn duy nhất còn lại là bb-dev, nên bước này chép từ đó.

Chép gì: lần mở link cuối, lúc gửi link đầu, lúc tạo bộ (lấy sớm hơn), khớp bộ
theo thư mục Drive (đã băm, không in). Kèm: bộ đã giao/lưu trữ/hết hạn lấy lại
mốc trạng thái từ ngày Lark (R3 của soát C). Không bao giờ làm mốc muộn hơn.

```bash
# 1) xem — chỉ đọc cả hai bên, in số đếm
npm run db:chep-moc-mo-link -- --dich .env.prod.local

# 2) (nên làm) lưu mốc của bb-dev ra tệp — phòng khi bb-dev bị dọn trước khi chép
npm run db:chep-moc-mo-link -- --luu "D:/bb-prod-sao-luu/moc-mo-link.json"

# 3) anh duyệt số đếm xong mới chạy:
npm run db:chep-moc-mo-link -- --dich .env.prod.local --ghi --that-su-la-bb-prod
# (bb-dev đã bị dọn? dùng tệp đã lưu: thêm --tu-tep "D:/bb-prod-sao-luu/moc-mo-link.json")
```

☐ 1. Làm SAU bước 7 (`--nap` xong) và TRƯỚC mục 14 (dọn bb-dev).
☐ 2. Lượt xem in bảng số: `khop` > 0 (số bộ khớp được giữa hai bên), `khoaTrung`
   gần 0. `khop` = 0 nghĩa là sai đích hoặc bước 7 chưa nạp: DỪNG.
☐ 3. Sau `--ghi`: chạy lại lượt xem, `capNhat` = **0** (chạy hai lần không đổi gì thêm).
☐ 4. Có đúng một dòng nhật ký `van_hanh.chep_moc_mo_link` trên bb-prod.

Nếu bỏ bước này: không mất dữ liệu gì, chỉ là bộ ảnh cũ trên bb-prod sẽ không
được thu gọn trước khoảng 6 tháng sau ngày cắt (DB phình lâu hơn).

**Đường lùi:** không cần. Bước này chỉ đổi ba cột mốc thời gian trên `galleries`;
khôi phục toàn bộ thì dùng tệp sao lưu của bước 7.

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
  `hau-ky`/`sync-lark` nối thẳng Postgres, không qua PostgREST). **Phải là chuỗi
  Session pooler, cổng 5432 — không phải Transaction pooler (6543); lý do và
  cách kiểm ở mục 8a ô 9.**

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

## 8a. Biến môi trường Production — danh sách ĐẦY ĐỦ (BB-352)

**Ai làm:** anh dán giá trị (khoá bí mật — việc của người). Claude **chỉ kiểm
tên biến**, không đọc giá trị: `vercel env ls production` (lệnh này liệt kê tên,
không in giá trị).

Mục 8 ở trên mới nhắc năm biến. Mã trong `src/` đọc nhiều biến hơn thế; thiếu
biến nào là một tính năng **im lặng không chạy** (không có màn hình đỏ). Làm lần
lượt, tích từng ô:

### A. `APP_SECRET` — một khoá, bốn việc, KHÔNG BAO GIỜ ĐỔI

☐ 1. `APP_SECRET` **đã có** trên Production, dài **từ 32 ký tự** (ngắn hơn là
   mã ném lỗi ngay lúc dùng). Kiểm bằng `vercel env ls production` thấy tên này.
☐ 2. **Giữ NGUYÊN giá trị đang chạy.** Đổi ba biến Supabase ở mục 8 **không**
   kéo theo việc đổi `APP_SECRET`. Không "cho an toàn hơn" mà đổi khi cắt.
☐ 3. Mọi nơi chạy mã này trên cùng dữ liệu phải **cùng một giá trị**: Production
   trên Vercel, và các tệp `.env.local` / `.env.prod.local` của Claude khi chạy
   script đụng tới mã hoá link (như `lark:ghi-link`). Hai nơi khác giá trị là hai
   nơi không đọc được dữ liệu của nhau.

Khoá này làm bốn việc cùng lúc:

| Việc | Đổi khoá thì |
|---|---|
| Phiên của khách (cookie `bb_gs`) | Mọi khách đang mở link bị văng ra |
| Dấu ký giữa middleware và màn nhân viên (BB-341) | Chỉ chậm hơn một nhịp, tự lành |
| Tên kênh cập nhật tức thì (BB-342) | Mọi kênh đổi tên; màn đang mở mất tự cập nhật tới khi tải lại |
| Mã hoá bảng `share_link_ma` (link "hiện lại" ở màn quản trị) | **Mọi link CSKH và ba mẹ đang "hiện lại" thành rỗng**, không khôi phục được |

`docs/11` §5 có một dòng ghi "mỗi môi trường một giá trị khác nhau". Dòng đó
đúng cho Preview, **không áp dụng cho lúc cắt**: Production giữ giá trị đang chạy.

### A2. Nếu `APP_SECRET` bị lộ — kế hoạch ứng cứu (BB-363, soát C R8)

Ai cầm `APP_SECRET` thì tự ký được phiên khách cho **bất kỳ** bộ ảnh nào, tức xem
được ảnh của mọi bé. Hôm nay app chưa có cơ chế "hai khoá" (khoá cũ chỉ để giải
mã), nên đổi khoá là cách duy nhất, và nó làm hỏng bốn thứ trong bảng trên.
Dấu hiệu lộ: tệp `.env*` bị gửi nhầm, ảnh chụp màn hình Vercel lộ giá trị, máy có
`.env.prod.local` bị mất, hay nhật ký thấy phiên khách mở bộ mà không có lượt mở
link tương ứng.

Đổi khoá thì hỏng gì:

| Thứ | Hỏng thế nào | Ai bị ảnh hưởng |
|---|---|---|
| Phiên khách (`bb_gs`) | Mọi khách đang mở bị văng ra, phải bấm lại link | Khách: chỉ cần mở lại link cũ, link vẫn sống |
| `share_link_ma` | Link "hiện lại" ở màn quản trị thành rỗng, không khôi phục được | CSKH: muốn gửi lại link phải TẠO link mới |
| Kênh tức thì | Màn đang mở mất tự cập nhật tới khi tải lại | Nhân viên + khách: F5 là xong |
| Dấu ký middleware | Chậm một nhịp, tự lành | Không ai |

Thứ tự làm (anh làm, Claude hỗ trợ):

☐ 1. Sinh khoá mới ≥ 32 ký tự ngẫu nhiên (Claude in lệnh sinh, anh chạy trên máy anh).
☐ 2. Vercel → Production → sửa `APP_SECRET` = khoá mới → **Redeploy**. Từ lúc này
   phiên giả ký bằng khoá cũ hết tác dụng.
☐ 3. Sửa cùng giá trị trong `.env.prod.local` của Claude (mục A ô 3).
☐ 4. Báo CSKH: link khách đang dùng **vẫn mở được**; chỉ ô "hiện lại link" trong
   màn quản trị trống. Khách nào cần gửi lại link thì tạo link mới cho khách đó.
☐ 5. Nếu nghi kẻ lộ đã xem ảnh: soát nhật ký `gallery.auth` / lượt mở bất thường
   theo thời gian lộ, báo anh danh sách bộ bị mở để anh quyết có báo gia đình
   không.
☐ 6. Ghi vào đây ngày đổi, ai đổi, lý do.

Việc sau cắt (chưa làm): cơ chế hai khoá (`kid`) + script mã hoá lại
`share_link_ma`, để lần đổi khoá sau không làm mất link "hiện lại".

### B. Địa chỉ gốc và thông báo đẩy

☐ 4. `NEXT_PUBLIC_APP_URL` = `https://hauky.babybeanstudio.vn` (không dấu `/` ở
   cuối). Link mời gia đình và tin Lark ghép địa chỉ từ biến này. Biến
   `NEXT_PUBLIC_…` được **nướng vào bản dựng** — sửa xong phải Redeploy.
☐ 5. Ba biến thông báo đẩy (BB-246): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (dạng `mailto:<email studio>`).
   **Không tạo cặp khoá mới** — đổi cặp khoá thì mọi trình duyệt đã đăng ký phải
   đăng ký lại. Dùng lại cặp khoá đang chạy (tệp
   `babybean-backups/KHOA-THONG-BAO-VERCEL.txt` theo `docs/20`). Thiếu: nút "Bật
   thông báo" của khách không hoạt động, và không có lỗi nào hiện ra.

### C. Lark, Drive, lịch chạy

☐ 6. `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_BASE_APP_TOKEN` — cả ba (cron
   `hau-ky`, hook và ghi "Link app" đều cần). Tuỳ chọn: `LARK_BASE_URL`.
☐ 7. `GOOGLE_DRIVE_API_KEY` (đồng bộ ảnh và ảnh bìa).
☐ 8. `CRON_SECRET` và `SYNC_CRON_SECRET` (đã nêu ở mục 8). `SYNC_CRON_SECRET` là
   giá trị nằm trong **hai Automation của Lark** (mục 11a) — đổi một nơi mà không
   đổi nơi kia là Lark nhận 401.

### D. Loại chuỗi kết nối `SUPABASE_DB_URL` — phải là SESSION pooler

☐ 9. `SUPABASE_DB_URL` của bb-prod phải là chuỗi **Session pooler** (Supabase
   Dashboard bb-prod → **Connect** → **Connection string** → **Session pooler**;
   cổng **5432**, tên người dùng có dạng `postgres.<mã dự án>`).

   **Không dùng Transaction pooler (cổng 6543).** Lý do kiểm từ mã: hook Lark,
   cron `hau-ky`, nút "Đồng bộ giá" và "Bản ghi mới từ Lark" đều mở MỘT kết nối
   rồi gọi `pg_try_advisory_lock` / `pg_advisory_unlock` để hai lượt không chạy
   chồng nhau. Khoá kiểu này gắn với **phiên** (một kết nối cố định). Transaction
   pooler đổi kết nối sau mỗi câu lệnh, nên khoá mất tác dụng: hai lượt cùng
   chạy được, hoặc khoá "kẹt" ở kết nối mà không ai gọi unlock được.
   (Ghi chú cho người đọc brief gốc: nhiều tài liệu nói "serverless nên dùng
   transaction pooler" — đúng với mã không dùng khoá phiên, **không đúng với mã
   này**.) Không dùng kết nối thẳng `db.<mã>.supabase.co` vì gói Free của Supabase
   chỉ cho IPv6 (theo tài liệu Supabase — kiểm lại nếu họ đổi), còn Vercel gọi ra
   bằng IPv4.

   Kiểm mà không để lộ khoá — lệnh này chỉ in cổng và loại máy chủ:

   ```bash
   node --env-file=.env.prod.local -e "const u=new URL(process.env.SUPABASE_DB_URL); console.log('cổng', u.port||5432, /pooler\.supabase\.com$/.test(u.hostname)?'pooler':'khác', /^postgres\./.test(decodeURIComponent(u.username))?'user có tiền tố postgres.<mã>':'user thiếu tiền tố')"
   ```

   Phải ra `cổng 5432 pooler user có tiền tố postgres.<mã>`. (bb-dev hôm nay ra
   đúng như vậy — đã đo 01/10/2026.) Giá trị đặt trên **Vercel** là chuỗi anh
   dán; tệp `.env.prod.local` chỉ là bản sao để Claude kiểm, nên nhớ so hai nơi
   cùng loại.

### E. CẤM đặt trên Production

☐ 10. **KHÔNG được có** biến `PHEP_THU_TRINH_DUYET` (và `CHO_PHEP_GOI_MANG_TRONG_PHEP_THU`)
   trên Production. `PHEP_THU_TRINH_DUYET=1` làm app **tắt mọi lượt gửi tin và
   ghi "Link app" sang Lark, và tắt ghi bộ đệm ảnh** — vì tưởng đang chạy phép
   thử. Không có cảnh báo: Lark chỉ đơn giản im. Kiểm: `vercel env ls production`
   **không** liệt kê hai tên này. Cũng không đặt `NODE_ENV=test` hay `VITEST`.
☐ 11. Sau Redeploy, làm một việc có tin Lark đi kèm (ví dụ bước 4 của mục 13: cấp
   link thử cho chính anh rồi thao tác) và xác nhận nhóm Lark **có nhận tin**.
   Không nhận được thì kiểm lại ô 10 trước tiên.

**Kiểm cuối:** ☐ 12. `vercel env ls production` thấy đủ: `APP_SECRET`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_BASE_APP_TOKEN`,
`GOOGLE_DRIVE_API_KEY`, `CRON_SECRET`, `SYNC_CRON_SECRET`, `SUPABASE_DB_URL`, ba
biến Supabase — và **không** thấy hai tên cấm ở ô 10.

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

## 11. Lark gọi vào app — hook, cron, workflow (BB-352: viết lại)

**Ai làm:** Claude kiểm; **anh** sửa Automation trên Lark nếu kiểm ra sai.

Lark đi vào app bằng **ba đường**, và bản cũ của mục này chỉ nói về đường thứ ba:

| Đường | Chạy khi nào | Trạng thái hôm nay |
|---|---|---|
| 1. **Hook** `POST /api/lark/hook` | Vài giây sau mỗi lần sửa/thêm dòng Hậu Kỳ, do **hai Automation trên Lark** gọi | Đường chính. Cấu hình trên Lark (`docs/28`) |
| 2. **Cron** `/api/cron/hau-ky` | 08:00 mỗi ngày, Vercel gọi | Lưới đỡ của hook. Gánh 6 việc trong trần 60 giây (mục 11b) |
| 3. **Workflow** `sync-lark.yml` | Chỉ khi bấm tay — **dòng `schedule` đang bị comment** | KHÔNG có lịch. Xem mục 11c |

Hệ quả: ngoài hook, mỗi ngày app chỉ còn **một** lượt tự kéo lại (08:00). Câu
"lượt 5 phút" ở một số chú thích trong mã là câu của thiết kế cũ, **không đúng
với hôm nay**.

### 11a. Hai Automation của Lark phải trỏ vào PRODUCTION

Hai Automation (`Gửi sang app khi sửa dòng Hậu Kỳ`, `Gửi sang app khi thêm dòng
Hậu Kỳ` — cách tạo ở `docs/28` mục 3 và 4) gọi **một địa chỉ**. Domain
`hauky.babybeanstudio.vn` không đổi khi cắt (nó là domain Production của Vercel);
cái đổi là cơ sở dữ liệu phía sau. Nên việc cần kiểm là **địa chỉ đúng và bí mật
đúng**, không phải đổi địa chỉ:

☐ 1. Lark Base → bảng **Hậu Kỳ** → **Automation**: có đúng **hai** Automation
   như `docs/28`, cả hai đang **Bật**.
☐ 2. Trong từng cái, bước **Gửi yêu cầu HTTP**: URL là chính xác
   `https://hauky.babybeanstudio.vn/api/lark/hook`. **Không** phải địa chỉ
   `*.vercel.app`, **không** phải địa chỉ xem trước (Preview) của một nhánh,
   **không** phải `localhost` hay đường hầm (ngrok…) từ lúc thử. Địa chỉ trỏ nhầm
   vào đâu thì tin cập nhật đi vào đó và bb-prod không bao giờ nhận được.
☐ 3. Header `Authorization` = `Bearer <SYNC_CRON_SECRET>` với giá trị **giống hệt**
   `SYNC_CRON_SECRET` đặt trên Vercel Production (mục 8a ô 8). Đây là việc của
   anh, Claude không đọc được giá trị.
☐ 4. **TRƯỚC khi đổi ba biến Supabase (bước 8):** rút sạch hàng đợi hook trên
   bb-dev. Hook xếp dòng chờ vào `settings` khoá `lark_hook_queue` khi đang bận.
   Claude đọc giá trị: phải là rỗng (`[]`) hoặc không có khoá. Nếu còn dòng: chạy
   tay cron `hau-ky` một lượt (curl ở mục 8) để app đọc lại bảng Hậu Kỳ, rồi đọc
   lại khoá. Vẫn còn: DỪNG, báo Claude. (Không làm bước này thì các dòng đang
   chờ ở bb-dev bị bỏ lại — cron 08:00 sáng mai chỉ dựng lại được một phần.)
☐ 5. **Sau khi cắt (sau bước 8 và Redeploy):** trên Lark sửa một dòng Hậu Kỳ
   **của studio** (khách giả, tên "Test nội bộ" — **không** sửa dòng khách thật,
   vì ba mẹ đã bật thông báo sẽ nhận chuông thật; `docs/28` mục 5). Trong 10 giây:
   - lịch sử chạy của Automation trên Lark: **HTTP 200** và `"message":"Success"`;
   - Claude đọc dòng bộ ảnh tương ứng **trên bb-prod** thấy thay đổi.
☐ 6. Ghi nhớ và nói với cả nhóm: **từ lúc này bb-dev KHÔNG còn nhận cập nhật từ
   Lark.** Muốn lùi về bb-dev (mục 9) thì phải chạy cron `hau-ky` một lượt để
   bb-dev bắt kịp những gì đã đổi trên Lark trong lúc đó.

### 11b. Thứ tự chạy cron và đồng bộ ngay sau khi cắt

Cron `hau-ky` làm **sáu việc** nối đuôi nhau trong **60 giây** (trần của gói
Hobby), theo đúng thứ tự này: (1) dựng bộ ảnh từ Lark, (2) đọc trạng thái hậu kỳ,
(3) xử lý bộ ảnh mà Lark đã xoá dòng, (4) gửi tin nhắc hậu kỳ và nhắc thông báo
chưa đọc, (5) **đồng bộ giá + trạng thái sản phẩm** từ bảng "Sản phẩm" của Lark,
(6) kiểm lại bộ lỗi Drive (dừng ở giây 50). Lượt đầu trên bb-prod chưa có ai đo,
nên chạy tay có đồng hồ. **Chạy TUẦN TỰ, không chạy hai lệnh cùng lúc** — các lệnh
dùng chung khoá tư vấn nên lệnh sau sẽ "nhường" và trả về như thể thành công.

Làm đúng thứ tự sau, mỗi bước chờ bước trước xong:

☐ 1. **Sau Redeploy ở mục 8:** `expire-galleries` trả 200 (curl ở mục 8). Việc
   này cũng gửi lại tin Lark hỏng, vì nó gọi cùng hàm với `flush-notifications`.
☐ 2. **Chạy tay `hau-ky` một lượt, có bấm giờ:**

   ```bash
   curl -i -w "\nthoi_gian=%{time_total}s\n" -H "Authorization: Bearer <dán CRON_SECRET tại đây>" \
     https://hauky.babybeanstudio.vn/api/cron/hau-ky
   ```

   Đọc phần JSON trả về. Phải thấy:
   - HTTP **200** (không 500); `thoi_gian` **dưới 60 giây**. Gần 60 thì báo
     Claude — cron sẽ bị cắt giữa chừng mỗi sáng;
   - `larkXoaDong`: là một đối tượng số liệu, **không** có khoá `loi`. Nếu lượt
     đầu báo nhiều bộ "mất dòng Lark" bất thường (hơn mấy chục): **DỪNG** — trần
     xoá là theo lượt, không phải theo ngày; hỏi Claude trước khi chạy lại;
   - `dongBoGia`: có số liệu, **không** có `loi` và không phải `boQua`. Nếu
     `boQua` ("nút Đồng bộ giá ngay đang chạy") thì chờ 1 phút rồi chạy lại;
   - `kiemLaiLoi`: có số liệu, hoặc `boQua: "Hết giờ trong lượt này"` (chấp nhận
     được ở lượt đầu, vì bước (6) chỉ chạy khi còn dư giờ).
☐ 3. **Đồng bộ giá:** nếu `dongBoGia` ở ô 2 báo `loi`, hoặc đọc dưới 80% bảng
   "Sản phẩm" của Lark (nên không ghi gì), anh vào màn quản trị bấm **Đồng bộ giá
   ngay**, đọc kết quả, rồi mới tiếp tục. Giá khách thấy phải khớp bảng giá 01/10.
☐ 4. **Đồng bộ dựng bộ ảnh:** GitHub → tab **Actions** → **Sync Lark Retouch** →
   **Run workflow** (chạy tay). Dấu tích xanh, rồi Claude đọc khoá
   `lark_retouch_last_sync` trong bảng `settings` của bb-prod: phải có mốc thời
   gian **mới** (mốc này cố ý không được chép ở bước 6 — phải tự sinh ra từ lượt
   chạy thật này).
☐ 5. **Gửi lại tin Lark hỏng:** gọi `.../api/cron/flush-notifications` với cùng
   kiểu `curl` ở ô 2, phải ra **200**. Lưu ý: **route này KHÔNG có lịch chạy nào**
   (không nằm trong `vercel.json`, không có workflow gọi). Tin Lark gửi hụt hôm
   nay chỉ được gửi lại **một lần mỗi ngày**, nhờ cron `expire-galleries` (01:00
   giờ Việt Nam) gọi chung hàm. Khi thấy "tin báo chốt không tới nhóm", nó có
   thể chờ tới 24 giờ.
☐ 6. **Thử hook (mục 11a ô 5)** — làm SAU các ô 2–5, không trước, để dòng thử
   không bị dựng hai lần.
☐ 7. **Ngày hôm sau, sau 08:00:** Claude đọc log Vercel của lượt cron tự chạy:
   dòng `cron.hau_ky.xong` có mặt và không có `cron.hau_ky.failed`. Một cron chưa
   từng tự chạy trên bb-prod thì chưa thể coi là "đã chạy".

**Thứ tự rút ra:** `expire-galleries` → `hau-ky` (đã gồm giá) → `sync-lark` →
`flush-notifications` → thử hook. Không đảo, không song song.

### 11c. Lưới đỡ định kỳ — vì sao đang tắt (CHƯA bật)

`.github/workflows/sync-lark.yml` được tạo hôm 15/09/2026 (BB-152) với dòng
`schedule` **đã comment sẵn** ("chủ studio có thể mở comment để lên lịch tự
động"). Chưa ai bật: nó cần GitHub Secrets `SYNC_CRON_SECRET` + `APP_URL` và một
quyết định của anh. `flush-notifications` thì bị gỡ khỏi `vercel.json` vì gói
Hobby chỉ cho 2 cron mỗi ngày một lần, và cả hai chỗ đã dùng (`expire-galleries`,
`hau-ky`). Đề xuất bật lưới đỡ nằm ở bản bàn giao BB-352 — **anh quyết, không tự
bật**.

Bản đề xuất: `scratchpad/bb352/sync-lark.DE-XUAT.yml` (mỗi 15 phút, 08:00–21:45
giờ VN). BB-363 đã sửa một lỗi của bản đề xuất: bước `flush-notifications` **bỏ
`--retry`**, vì hàm gửi lại tin không giữ khoá — nếu lần đầu chỉ hết giờ phía
curl, lần thử lại chạy song song có thể gửi **trùng tin Lark**. Tin còn hụt sẽ
được lượt 15 phút sau gửi tiếp.

☐ 8. **Anh quyết:** ☐ Bật ☐ Chưa bật. Ghi ngày + lý do vào đây.
☐ 9. Nếu bật, làm đủ theo thứ tự:
   1. Thêm `export const maxDuration = 60;` vào hai route
      `src/app/api/cron/sync-lark/route.ts` và
      `src/app/api/cron/flush-notifications/route.ts` (**bắt buộc**, không tuỳ
      chọn), qua một task có mã BB.
   2. GitHub → repo → Settings → Secrets → tạo **2 secret**: `SYNC_CRON_SECRET`
      (cùng giá trị biến này trên Vercel Production) và `APP_URL`
      (`https://hauky.babybeanstudio.vn`, không dấu `/` cuối). Anh dán giá trị.
   3. Chép bản đề xuất đè lên `.github/workflows/sync-lark.yml`, qua PR.
   4. Tab **Actions** → chạy tay một lần (Run workflow) → hai bước đều xanh.
☐ 10. **Mỗi thứ Hai** mở tab Actions xem lượt chạy gần nhất. GitHub **tự tắt lịch**
   của repo không có commit trong 60 ngày, và lịch thường trễ 5–30 phút. Thấy
   dòng "This scheduled workflow is disabled" thì bấm Enable lại.

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

## 13a. Bộ dọn dữ liệu (BB-356/357/363) — đêm đầu và tuần đầu

**Ai làm:** Claude kiểm; anh xem kết quả xem trước.

Bộ dọn chạy **tự động** trong cron `expire-galleries` lúc 01:00 giờ VN, mỗi đêm,
dùng phần giờ còn lại của 60 giây. Nó xoá dữ liệu vận hành cũ (nhật ký nhiễu, tin
Lark đã gửi quá 90 ngày…) và thu gọn danh sách ảnh của bộ cũ (bộ đã giao/lưu
trữ/hết hạn quá 6 tháng; bộ chưa xong không ai mở link quá 6 tháng). Ảnh gốc
không bao giờ bị đụng: chúng nằm trên Drive. Không cần ai bấm gì để nó chạy.

Đêm đầu trên bb-prod gần như không có gì để dọn: dữ liệu vừa nạp, và mốc mở
link đã chép ở 7c đều còn mới. Đo trên bb-dev ngày 02/10 (mốc theo BB-363):
**hôm nay 0 bộ, 0 MB**; tới khoảng **03/04/2027** thì ~368 bộ / ~155.000 dòng ảnh
(~78 MB) đủ tuổi, mỗi đêm thu gọn tối đa 5.000 dòng (~13 bộ).

☐ 1. **Trước đêm đầu:** đăng nhập bb-prod bằng tài khoản Admin → Cài đặt → khối
   dọn dữ liệu vận hành → bấm **"Xem trước sẽ dọn gì"** (KHÔNG bấm nút "Dọn dữ
   liệu vận hành" hiện ra sau đó). Xem trước chạy
   trong giao dịch chỉ đọc. Kết quả mong đợi: tổng sẽ xoá ≈ 0, không dòng nào
   báo lỗi, dòng "anh_bo_cu" không ghi "chờ áp migration 0088" (nếu ghi thế
   nghĩa là bước 3 chưa áp 0088: báo Claude).
☐ 2. **Sáng hôm sau:** có đúng **1** dòng nhật ký `van_hanh.don_rac` actor
   `system` của đêm qua, trong đó `hetGio` = false và không loại nào `loi` = 1.
   Claude đọc bằng truy vấn chỉ đọc.
☐ 3. **Tuần đầu: KHÔNG bấm "Dọn dữ liệu vận hành"** trên bb-prod. Để cron tự chạy.
☐ 4. Mỗi thứ Hai tuần đầu: xem thanh dung lượng DB (Supabase → Database size).
   Chạm 350 MB (70%) thì báo anh (ngưỡng chuyển gói).

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
không đụng bảy bảng GIỮ NGUYÊN (sáu bảng cấu hình và `schema_migrations`, xem mục 7.0), đúng như mọi lần chạy `db:nap-lai` khác. Sau bước
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
