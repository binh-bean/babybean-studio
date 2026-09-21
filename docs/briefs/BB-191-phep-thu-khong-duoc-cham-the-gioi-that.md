# BB-191 — `npm run test` đang gửi tin và ghi dữ liệu ra ngoài thật

**Cửa sổ: DEV-INT.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-int` — nhánh `agent/dev-int`.

**Không phải DEV-BE.** DEV-BE đang làm BB-190 cùng chủ đề "im lặng" trong một
cửa sổ khác — đọc mục *Hai việc chạy song song* ở cuối.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Chuyện đã xảy ra thật, ngày 21/09/2026

BB-167 vừa làm đường bắn tin sang Lark chạy được. Lượt `npm run test` ngay sau
đó đẩy **sáu thẻ "Test BB114…"** vào **nhóm Lark thật của studio**. Nhân viên
nhận sáu tin rác giữa giờ làm.

Vì sao: bộ phép thử của BB-114 gọi **thật** `/api/g/submit` trên bb-dev — cơ sở
dữ liệu thật, bảng `settings` thật, webhook thật. Không có gì trong đường đi
biết rằng nó đang chạy phép thử.

Và đây là phần đáng sợ hơn: **trước đó không ai gặp, vì đường ghi cũ hỏng sẵn**
(PGRST204, xem BB-190). Một cái lỗi đang che một cái lỗi khác. Vá cái lỗi thứ
nhất là cái lỗi thứ hai lộ ra ngay lập tức.

Đã vá tạm ở `src/lib/lark/notify.ts`: hàm `dangChayPhepThu()` chặn mọi lượt gửi
khi `process.env.VITEST` có mặt. Có ca canh ở
`tests/unit/bb-167-phep-thu-khong-duoc-ban-tin.test.ts`.

**Việc của bạn là phần còn lại — và phần còn lại nặng hơn.**

## Đường thứ hai: phép thử đang ghi vào bảng Hậu Kỳ THẬT bên Lark

`/api/admin/galleries/[id]/share-link` gọi `ghiLinkAppVeLark({ ghiThat: true })`
để dán link vào cột *Link app* đúng dòng Hậu Kỳ của khách.

Bốn bộ phép thử gọi **thật** đường đó, và **không bộ nào chặn `fetch`**:

```
tests/unit/tao-link-gui-khach.test.ts
tests/unit/cap-lai-link-bb148.test.ts
tests/unit/link-mo-duoc-that.test.ts
tests/unit/bb-188-mo-khoa-link-cu.test.ts
```

Lệnh để bạn tự đo lại:

```bash
for f in tests/unit/tao-link-gui-khach.test.ts tests/unit/cap-lai-link-bb148.test.ts \
         tests/unit/link-mo-duoc-that.test.ts tests/unit/bb-188-mo-khoa-link-cu.test.ts; do
  printf "%-42s " "$(basename $f)"
  grep -q 'ghi-link-app\|stubGlobal("fetch")' "$f" && echo "co chan" || echo "KHONG CHAN"
done
```

**Vì sao chưa có gì hỏng:** bộ ảnh fixture do phép thử dựng ra có
`lark_hauky_record_id = null`, nên `ghiLinkAppVeLark` dừng lại ở câu *"Bộ ảnh
này chưa gắn dòng Hậu Kỳ nào bên Lark, không biết ghi vào đâu"*. Bạn sẽ thấy
đúng câu đó trong log khi chạy `npm run test` hôm nay.

Tức là dự án đang được cứu **bởi một sự tình cờ**, không bởi một chốt nào.
Chỉ cần một trong ba điều sau xảy ra là phép thử ghi đè cột *Link app* của một
nhà thật:

- ai đó viết một ca dùng **bộ ảnh có sẵn** thay vì dựng fixture mới (BB-186 và
  BB-187 tuần này đều suýt làm vậy);
- ai đó thêm `lark_hauky_record_id` vào fixture cho "giống thật";
- đường đồng bộ Lark gán record id cho fixture trước khi phép thử chạy.

Ghi đè cột *Link app* của một nhà thật nghĩa là **ba mẹ nhà đó mở link ra
trang lỗi**, và CSKH đọc bên Lark thấy một link không dẫn tới đâu.

## Việc

Đừng vá từng bộ phép thử. Vá ở **tầng thư viện**, đúng cách `notify.ts` vừa làm
— vì số bộ phép thử sẽ nhiều dần lên và chỉ cần một cái quên.

Ba phần:

**1. Chốt chung, không phải ba chốt rời.** `notify.ts` tự có `dangChayPhepThu()`
riêng. Nếu bạn viết thêm một bản nữa cho `ghi-link-app.ts` thì dự án có hai bản
sao của cùng một quyết định, và chúng sẽ trôi khỏi nhau. Gom về một chỗ, rồi
sửa `notify.ts` dùng chung — **đó là phần duy nhất của `notify.ts` bạn được
đụng**.

**2. Quét xem còn đường nào ra ngoài nữa.** Hai đường đã biết là Lark webhook
và Lark Bitable. Còn Google Drive (`src/lib/drive/`), và có thể còn nữa. Liệt
kê **mọi** lượt gọi `fetch` ra khỏi máy trong `src/lib/`, rồi nói rõ đường nào
đã an toàn và vì sao. `docs/10-testing-qa.md` là chỗ ghi kết luận.

**3. Cửa thoát phải hẹp.** `notify.ts` dùng
`LARK_CHO_PHEP_GUI_TRONG_PHEP_THU=1` để chính bộ phép thử của nó mở chốt — nó
thay `fetch` bằng hàm giả nên không có gì ra khỏi máy. Giữ nguyên nguyên tắc
đó: cửa thoát chỉ mở cho bộ phép thử **đã chặn `fetch`**, và biến môi trường
phải có mặt trong `.env.example` kèm lời cảnh báo (cổng
`tests/unit/bien-moi-truong-phai-co-trong-mau.test.ts` sẽ bắt nếu bạn quên).

## Ba chỗ dễ sai

**Đừng chỉ dựa vào `NODE_ENV === "test"`.** Vitest **không** tự đặt `NODE_ENV`
thành `test` trong mọi cấu hình. Đo trước rồi hãy dựa vào nó — thêm một điều
kiện không bao giờ đúng là dựng một cái chốt giả.

**Đừng chặn bằng cách kiểm tên tệp hay đường dẫn.** Mã nguồn chạy trên Vercel
không được biết gì về thư mục `tests/`.

**Đừng làm phép thử im lặng bỏ qua.** Khi chốt chặn một lượt gửi, nó phải để
lại dấu đọc được — `notify.ts` ghi `status: 'skipped'` kèm lý do vào bảng
`notifications`. Chặn mà không để dấu là lại dựng thêm một lớp im lặng nữa,
đúng thứ cả hai task này sinh ra để dẹp.

## Tiêu chí xong

- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — **361/361** cộng ca bạn thêm.
- [ ] `AGENTS.md §5a`: hoàn nguyên bản vá thì phép thử phải **ĐỎ**. Làm thật,
      dán cả hai kết quả.
- [ ] Ca bắt buộc: gọi `ghiLinkAppVeLark({ ghiThat: true })` **trong lúc chạy
      phép thử** thì **không** có lượt `fetch` nào ra ngoài. Chứng minh bằng
      một `fetch` giả đếm số lần gọi, không bằng lời.
- [ ] Danh sách **mọi** đường gọi ra ngoài trong `src/lib/`, kèm trạng thái
      từng đường, ghi vào `docs/10-testing-qa.md`.
- [ ] `git diff --stat` chỉ đụng `src/lib/lark/notify.ts` ở đúng phần gom chốt
      chung — không đụng phần còn lại của tệp đó.

**Kiểm ngược, bắt buộc:** chạy `npm run test` đủ bộ, rồi dán:
1. truy vấn chứng minh `select count(*) from notifications where status='sent'`
   bằng **0** sau lượt chạy;
2. số lượt `fetch` ra miền `larksuite.com` trong cả lượt chạy, bằng **0**.

## Hai việc chạy song song

**DEV-BE đang làm BB-190** trong `babybean-dev-be` — 18 chỗ ghi dữ liệu bỏ qua
`error`. Cùng chủ đề "chạy mà không ai biết" nhưng khác phía hẳn. Nếu bạn thấy
mình đang sửa route trong `src/app/api/` thì dừng lại — đó là phần của DEV-BE.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
Và bảng Hậu Kỳ bên Lark là **bảng vận hành thật của studio**, không có bản
nháp. Dọn rác sau khi xong: `npm run db:cleanup`.
