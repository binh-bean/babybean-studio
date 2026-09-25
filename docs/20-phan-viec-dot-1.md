# 20. Phân việc cho bản yêu cầu đợt 1

**Lập ngày 24/09/2026** từ `docs/19-ban-yeu-cau-dot-1.md` (29 mục chủ studio giữ).
Chủ studio giao: "tư duy và phân bổ công việc cho model Sonnet làm những phần có
thể; còn agent Antigravity nếu cần thì tạo phần việc cho nó".

## Nguyên tắc chia

| Ai | Nhận loại việc gì | Vì sao |
|---|---|---|
| **Claude Opus** (điều phối) | Việc đổi MÔ HÌNH dữ liệu, bảo mật, nối Lark, và mọi việc cần chủ studio quyết. Soát và gộp mọi phần việc của agent. | Sai ở đây là sai dây chuyền: trạng thái bộ ảnh, quyền link, tiền. Và theo `bao-xong-phai-tu-chay-lai`, báo cáo của agent không phải bằng chứng — phải có người tự chạy lại. |
| **Claude Sonnet** (agent, mỗi việc một worktree) | Việc có đề bài rõ, tiêu chí đạt đo được, nằm gọn trong vài tệp. | Nhanh, chạy song song được, và đề bài đủ chặt thì không cần tự quyết điều gì lớn. |
| **Antigravity** (thư mục vai cố định) | Việc tách biệt hẳn khỏi phần Sonnet đang sửa, và việc tạo HÌNH ẢNH (Nano Banana). | Tránh hai đội đụng cùng một tệp. Tạo ảnh phòng thật cho màn treo tường là việc chỉ vai Thiết kế làm được. |

**Không chia**: chuyển sang bb-prod (cần chủ studio có mặt), và mọi việc còn chờ
chủ studio trả lời (mục "Đang chờ" cuối tệp).

## Đợt 1 — chạy song song ngay

### Claude Sonnet — 7 phần việc, mỗi phần một worktree

| Mã | Việc | Mục trong docs/19 | Mức |
|---|---|---|---|
| BB-210 | Màn xem ảnh lớn **phóng to được** (chụm hai ngón, lăn chuột, chạm hai lần), kéo khi đang phóng, vuốt lật mượt; **hiện lại tên file** ở lưới và màn lớn | zoom · hiện tên file | P0 · P1 |
| BB-211 | **Con trỏ bàn tay** trên mọi chỗ bấm được, cả màn khách lẫn quản trị, kèm phép thử canh | bàn tay | P0 |
| BB-212 | **Hộp chốt mới** (tên khách điền sẵn, ô xác nhận đúng thông tin), **cửa hàng mua thêm** và **các màn phụ** theo giao diện mới | chốt · cửa hàng · màn phụ | P0 · P2 |
| BB-213 | **Biểu tượng app**: biểu tượng trang là logo; thêm ra màn hình chính thì biểu tượng là ảnh bìa bộ ảnh; **hướng dẫn thêm ra màn hình chính** theo từng loại máy | icon + hướng dẫn | P0 |
| BB-214 | Việc nhỏ phía máy chủ: **bộ đếm lượt mở link**; **tệp văn bản cho CSKH** (mã ảnh chọn + ghi chú từng ảnh + ảnh đó in gì); **giá ảnh chọn thêm cấu hình được** (mặc định 50.000 ₫); bộ quét báo nhầm; **phân tích hai phép thử đỏ** | đếm link · file CSKH · giá · bộ quét · phép thử | P1–P3 |
| BB-215 | **CSKH chọn ảnh bìa** và **chữ trên bìa** (điền sẵn kiểu tạp chí thời trang, CSKH sửa được) | ảnh bìa + chữ bìa | P0 |
| BB-216 | **Trang gốc** hauky.babybeanstudio.vn theo chuẩn thiết kế mới; sửa nút "Nhắn cho studio" đang trỏ `https://m.me/` chung | "sửa màn này theo chuẩn thiết kế" | P0 |

Luật chung cho mọi agent Sonnet: xem mục "Luật cho agent" cuối tệp.

### Antigravity — 1 phần việc ngay, 1 phần sau

| Mã | Cửa sổ | Thư mục | Việc |
|---|---|---|---|
| BB-220 | **Thiết kế** (DESIGNER, Nano Banana) | `babybean-assets\BB-220` (chỉ xuất ảnh) | Ảnh phòng thật cho màn treo tường: 4 phòng × 2 khổ, mảng tường trống nhìn thẳng, kèm số liệu tỷ lệ. Đề bài: `docs/briefs/BB-220-anh-phong-cho-man-treo-tuong.md` |
| BB-062 | **Giao diện** (DEV-FE) | `babybean-dev-fe` | Màn quản lý gói chụp — **LÙI lại sau BB-203**. |

**Vì sao lùi BB-062** (soát 24/09): gói chụp thật là **38 sản phẩm** loại
`shoot_package` đồng bộ từ Lark (Baby 02 dùng cho 129 bộ, Fam 02 cho 83 bộ…),
còn bảng `packages` trong app chỉ có 4 dòng và không ai dùng. Thành phần của
mỗi gói (bao nhiêu ảnh chỉnh, kèm sản phẩm in nào) hiện KHÔNG có bảng mẫu nào
trong app — nó đến theo từng bộ ảnh từ dòng hoá đơn Lark, và chủ studio cho biết
Lark có bảng "chi tiết gói chụp". Giao màn gói chụp trước khi chốt mô hình lấy
dữ liệu từ Lark (BB-203) là để agent tự đặt ra một mô hình thứ hai — đúng kiểu
lệch nhau mà dự án đã phải dọn nhiều lần. BB-203 xong thì đề bài BB-062 viết
trên mô hình đó.

### Claude Opus — tự làm

| Mã | Việc | Mức |
|---|---|---|
| BB-200 | **Luồng trạng thái nối Lark**: khách chốt → "đã ghi nhận yêu cầu"; CSKH chốt → Lark "đã chọn ảnh, xếp hàng chờ chỉnh"; Lark "đang làm" → cả hai màn "đang chỉnh sửa" | P0 |
| BB-201 | **Giữ link app trên màn quản trị** — hiện nay mã link chỉ lưu dạng băm nên tạo xong là mất; cần lưu mã hoá để xem lại được | P0 |
| BB-202 | **Album đúng khái niệm**: album trong gói → gợi ý chọn **ảnh bìa** album; bán album → **màn bán hàng**, không bắt chọn 20–30 ảnh | P0 |
| BB-203 | **Tự lấy dữ liệu từ hoá đơn Lark** (khách, sản phẩm, gói chụp), CSKH sửa/bỏ phần thừa; màn quản trị có **link hoá đơn** để đối chiếu. Đi cùng việc chuyển bb-prod | P0 |
| BB-204 | **Bộ ảnh rỗng theo hoá đơn**: không có dịch vụ chụp → hoá đơn hậu kỳ, luồng riêng; có gói chụp mà link rỗng → cảnh báo CSKH | P0 · không gấp |
| — | Soát, gộp, chạy đủ phép thử và phép thử trình duyệt cho mọi phần việc của agent | — |

## Đợt 2 — sau khi đợt 1 gộp xong

| Việc | Ai | Điều kiện |
|---|---|---|
| Màn treo tường đẹp, hiện đại (ảnh phòng thật của BB-220) | Opus dựng khung, Sonnet làm chi tiết | BB-220 giao ảnh |
| So sánh nhiều tấm (chọn bất kỳ, bỏ bớt khi chọn quá) | Sonnet | BB-210 đã gộp (cùng màn xem lớn) |
| Mời mua lần hai **khi khách duyệt in không yêu cầu chỉnh lại** | Sonnet | BB-200 xong (cần trạng thái đúng) |
| Thông báo đẩy từ app | Sonnet | BB-213 xong (cùng nền PWA) |
| Mời ông bà cùng xem | Opus đặc tả quyền → chủ studio duyệt → Sonnet làm | Chủ studio duyệt đặc tả |
| Bộ báo cáo điều hành và bán hàng | Opus đặc tả → Sonnet làm | Chủ studio duyệt danh sách chỉ số |
| Bộ ảnh chưa có tên bé | đi cùng BB-203 | — |

## Đang chờ chủ studio

1. ~~Màn nào cần theo chuẩn thiết kế~~ — chủ studio trả lời 24/09: **trang gốc** hauky.babybeanstudio.vn → BB-216.
2. ~~Tệp logo thật~~ — chủ studio gửi 24/09: `thuong hieu/1.jpg` cạnh thư mục dự án (hạt đậu nét xám). Đã chuyển cho BB-213.
3. Đặc tả "Mời ông bà" và danh sách chỉ số báo cáo — Claude soạn, chủ studio duyệt.

## Quyết định Claude đã chốt khi chia (chủ studio có thể lật lại)

- **Chạm hai lần vào ảnh = phóng to**, không còn là thả tim (bản 23/09). Chủ studio
  xếp phóng to vào P0, và mọi trình xem ảnh ba mẹ quen (Ảnh của iPhone, Google
  Photos) đều dùng chạm hai lần để phóng. Thả tim vẫn ở nút tim to dưới đáy.
- **Hiện lại tên file** (bản 23/09 đã bỏ): chủ studio cần để ba mẹ đối chiếu với
  file tải về và với danh sách CSKH xuất ra. Tên file nhỏ, dưới ảnh, không đè lên
  mặt bé.
- **Bỏ** gom ảnh gần giống và bán combo; **giữ nguyên** cho tải ảnh gốc từ đầu —
  đúng như chủ studio chọn Bỏ trong bản yêu cầu.

## Luật cho agent

Áp dụng cho mọi agent (Sonnet và Antigravity):

1. **Không đụng thư mục chính `babybean-studio` và nhánh `main`.** Làm trên nhánh
   của mình, không đẩy lên GitHub, không gộp. Claude Opus soát rồi gộp.
2. **Không bật máy chủ ở cổng 3100 và 3099** (cổng xem trước của chủ studio và
   cổng phép thử trình duyệt). Cần máy chủ thì dùng cổng 3150 trở lên.
3. **Cơ sở dữ liệu dùng chung là dữ liệu THẬT** (bb-dev đang chạy app). Phép thử
   chỉ tạo dữ liệu tên `Fixture BB-2xx…` và tự dọn; không sửa dòng thật; không đổi
   dòng `settings` chung trừ khi trả lại đúng giá trị cũ trong `afterAll`.
4. Chỉ chạy các tệp phép thử mình thêm hoặc sửa (`npx vitest run <tệp>`). Bộ phép
   thử đầy đủ và phép thử trình duyệt do Claude Opus chạy sau khi gộp — nhiều
   agent cùng chạy cả bộ trên một cơ sở dữ liệu sẽ giẫm lên nhau.
5. Ghi chú trong mã và thông điệp commit **bằng tiếng Việt**, theo giọng của các
   ghi chú sẵn có: nói VÌ SAO, kèm con số hoặc lời chủ studio làm bằng chứng.
6. **Mọi phép thử canh phải kiểm ngược**: cố tình làm hỏng thứ nó canh, thấy nó ĐỎ
   đúng lý do, rồi trả lại. Ghi việc kiểm ngược vào thông điệp commit.
7. Trước khi báo xong: `npx tsc --noEmit -p tsconfig.json` sạch, `npm run lint`
   0 lỗi, các phép thử của mình xanh. **Dán mã thoát**, không kể lại bằng lời.
8. Việc đụng màn khách: màn khách luôn sáng, màu và phông lấy từ khối
   `.giao-dien-khach` trong `src/styles/tokens.css` (kem `#f7f2eb`, mực `#2a2420`,
   tim `#c4645a`, rêu `#4f5b45`, tiêu đề phông Fraunces qua `font-display`).

---

## Đợt 2 — chia ngày 24/09/2026 (sau khi đợt 1 gộp xong, `c9975d9`)

Chủ studio: "có thể chia việc thêm cho Antigravity (Banana) hoặc các model khác,
và việc cho Sonnet nếu còn việc Sonnet làm được". Lưu ý: Antigravity 2.0 KHÔNG có
Nano Banana — ảnh tạo bằng ứng dụng Gemini (chủ studio tự dán lời nhắc).

| Mã | Ai | Việc |
|---|---|---|
| BB-217 | Sonnet | **Màn treo ảnh lên tường** trên ảnh phòng thật (BB-220), đúng tỷ lệ cm, chất liệu/cỡ/khung đổi tại chỗ, giá thật, thêm vào đơn |
| BB-218 | Sonnet | **So sánh nhiều tấm** (2–4 tấm, cạnh nhau hay không đều được), bỏ bớt ngay trong màn so sánh |
| BB-219 | Sonnet | **Phép thử trình duyệt dò con trỏ** trên MỌI màn quản trị + màn khách, sửa chỗ thiếu |
| BB-230 | Antigravity — Giao diện (DEV-FE) | **Kịch bản thử trình duyệt đợt 2**: E-2, E-3, E-7, E-9, E-10, E-12 (docs/10 §5). Đề bài `docs/briefs/BB-230-e2e-dot-2.md` |
| BB-221 | Chủ studio + Gemini | Ảnh góc khung (4 kiểu) và tạo lại ảnh sảnh vào nhà khổ dọc (tường quá thấp). Lời nhắc: `babybean-assets/BB-220/LOI-NHAC-GEMINI-DOT-2.txt` |
| BB-200 | Opus | Luồng trạng thái + bộ nhắc theo `docs/21` (nguồn chuẩn: sơ đồ quy trình của chủ studio) |

Luật thêm cho đợt 2: phép thử trình duyệt chạy với `PW_PORT` riêng (Sonnet
3160–3169, Antigravity 3170) — KHÔNG dùng 3099/3100. Lệnh bị môi trường chặn
thì DỪNG và báo, không lách (vụ BB-215 đợt 1).

### Kết quả đợt 2 (24–25/09/2026)

BB-217/218/219 gộp sau khi soát (cỡ khung lấy từ danh mục thật, màn so sánh
không tự bật lại, phép thử con trỏ không xanh khi dò rỗng). BB-230 báo xong
nhưng 2/7 đỏ — một ca lộ ra lỗi thật: **ghi chú cho thợ chỉnh ảnh chưa từng lưu
được** (thiếu clientOpId; chữ "đã lưu" bị xoá; ghi chú tới trước lượt thả tim
thì mất trắng mà vẫn báo lưu). Đã sửa. BB-221: ảnh sảnh mới, chủ studio chọn
khung treo cao né bó hoa.

## Đợt 3 (25/09/2026)

Chủ studio: "nhớ giao việc cho sub agent" — mặc định giao Sonnet việc đề bài chặt.

| Mã | Ai | Việc |
|---|---|---|
| BB-222 | Sonnet (PW_PORT 3166) | **Khung thật trên màn treo tường** từ 4 ảnh góc khung, danh sách mẫu trong MỘT tệp dữ liệu. Chủ studio: mẫu khung đổi liên tục nên **chỉ để tham khảo**, không ghi vào đơn; bảng mẫu gửi sau |
| BB-223 | Sonnet (PW_PORT 3165) | **API trả lỗi sạch**: thân yêu cầu hỏng → 400 thay vì 500 (28 tuyến); không để mã trần ("FORBIDDEN") hay thông báo Postgres tới tay người dùng |
| BB-200 | Opus | Luồng trạng thái + bộ nhắc theo `docs/21` |
| BB-231 | Antigravity — Giao diện (DEV-FE, PW_PORT 3170) | **Kịch bản thử đợt 3**: E-8 mở lại (CSKH được mở, quyết định 25/09), E-11 bộ 1.000 ảnh. Đề bài `docs/briefs/BB-231-e2e-dot-3.md`. E-4 bỏ (hết PIN), E-5 chờ quyền ông bà, E-6 chờ tính năng hàng chờ khi mất mạng |
| BB-200 giao diện | Sonnet (PW_PORT 3167) | Nhãn trạng thái Lark + màu cảnh báo ở quản trị, "Bộ ảnh đã được ghi nhận yêu cầu" ở màn khách, giấu form Mở lại với người không có quyền. **Dừng giữa chừng 25/09 15:4x — tài khoản chạm hạn mức chi tiêu tháng**; việc dở còn trong worktree, làm tiếp sau khi hạn mức đặt lại. Có migration 0068 (hàm `get_admin_galleries`) CHƯA áp — Opus soát trước khi áp |
| BB-232 | Sonnet (PW_PORT 3168) | E-6: giữ lượt thả tim khi mất mạng, "Chưa lưu", tự gửi lại. Dừng cùng lúc, cùng lý do |
| BB-224 | Chủ studio + Gemini ("banana") | 10 tranh minh hoạ "hành trình bộ ảnh" (mỗi giai đoạn BB-200 một hình, chốt thành công, link hết hạn, chưa có ảnh). Chỉ đồ vật — không người, không trẻ em, không chữ. Lời nhắc: `babybean-assets/BB-224/LOI-NHAC-GEMINI.txt` |
| BB-225 | Antigravity — Giao diện (sau BB-224 + BB-200 giao diện) | Thẻ "Hành trình bộ ảnh" trên màn khách dùng tranh BB-224 theo `nhanTienDo`. Đề bài soạn khi tranh về |
