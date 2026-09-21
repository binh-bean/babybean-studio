# BB-190 — 18 chỗ ghi dữ liệu xong không kiểm xem có ghi được không

**Cửa sổ: DEV-BE.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-be` — nhánh `agent/dev-be`.

**Không phải SEC-ARCH, không phải DEV-INT.** DEV-INT đang làm BB-191 cùng chủ
đề "im lặng" trong một cửa sổ khác — đọc mục *Hai việc chạy song song* ở cuối.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Việc này không phải dọn dẹp. Nó là một lớp lỗi đã cắn bốn lần.

Bốn lần trong bốn tuần, cùng một hình dạng: **một tính năng không chạy, và
không có gì báo.**

| Khi nào | Cái gì | Vì sao không ai thấy |
|---|---|---|
| BB-152 | Đường kéo Lark định kỳ | Thiếu biến môi trường → route trả 401 mọi lượt. Cửa đóng đúng cách |
| BB-164 | — | Tính năng chưa từng chạy mà mọi thứ đều báo ổn |
| BB-186 | Lịch cho link hết hạn | Handler chỉ có `POST`, Vercel gọi `GET` → 405 mỗi ngày. Và kiểm sai tên khoá → 401 |
| BB-167 | Báo CSKH khi khách chốt | Ghi `notifications` bằng hai cột **không tồn tại** → PGRST204 |

Cái thứ tư là cái cần đọc kỹ, vì nó chính là việc của bạn.

`/api/g/submit` có đoạn này (đã vá ở BB-167, chép lại nguyên văn bản cũ):

```ts
await admin.from("notifications").insert({
  gallery_id: session.galleryId,   // ← cột này KHÔNG CÓ trong bảng
  recipient: branch?.name,          // ← cột này cũng KHÔNG CÓ
  ...
});
```

Đo ngày 21/09/2026 bằng chính khoá của app:

```
PGRST204: Could not find the 'gallery_id' column of 'notifications'
```

**`supabase-js` không ném lỗi.** Nó trả `{ data, error }`. Mã trên bỏ qua cả
hai. Nên mỗi lượt khách bấm Chốt là một dòng rơi vào hư không, khách vẫn nhận
200, và bảng `notifications` rỗng trơn từ ngày dựng tới ngày soát ra.

## Còn 18 chỗ nữa cùng hình dạng

Quét `src/` ngày 21/09 — mọi lệnh **GHI** (`insert`/`update`/`upsert`/`delete`)
mà không đọc `error`:

```
src/app/api/admin/branches/route.ts:107              activity_logs.insert
src/app/api/admin/branches/[id]/route.ts:87          activity_logs.insert
src/app/api/admin/galleries/route.ts:151             share_links.update (expires_at)
src/app/api/admin/galleries/[id]/confirm/route.ts:80 activity_logs.insert
src/app/api/admin/galleries/[id]/payments/route.ts:141 activity_logs.insert
src/app/api/admin/galleries/[id]/retouch-done/route.ts:87  deliveries.update
src/app/api/admin/galleries/[id]/retouch-done/route.ts:92  deliveries.insert
src/app/api/admin/galleries/[id]/retouch-done/route.ts:101 revision_requests.update
src/app/api/admin/galleries/[id]/share-link/route.ts:142   share_links.update (thu hồi)
src/app/api/admin/staff/route.ts:189                 activity_logs.insert
src/app/api/admin/staff/[id]/route.ts:108            staff_branches.delete
src/app/api/auth/gallery/route.ts:72                 activity_logs.insert
src/app/api/auth/gallery/route.ts:192                share_links.update (last_viewed_at)
src/app/api/g/buoi-chup/route.ts:229                 share_links.update (last_viewed_at)
src/app/api/g/placements/route.ts:246                selection_placements.delete
src/app/api/g/review/route.ts:98                     revision_requests.update
src/app/api/g/submit/route.ts:192                    activity_logs.insert
src/lib/lark/notify.ts:303                           notifications.insert (BB-167, cố ý)
```

Lệnh quét để bạn chạy lại và tự đối chiếu — **đừng tin danh sách trên, hãy tự
đo**, con số có thể đã đổi sau khi `main` đi tiếp:

```bash
grep -rnE '^\s*await (admin|supabase)$|^\s*await (admin|supabase)\.' src --include=*.ts -A6 | grep -E '\.(insert|update|upsert|delete)\('
```

## Bốn chỗ trong danh sách trên KHÔNG phải chuyện nhỏ

Đây là phần cần suy nghĩ, không phải phần gõ phím. Mỗi dòng dưới đây là một
hậu quả có thật nếu lệnh ghi trượt mà không ai biết:

**`staff/[id]/route.ts:108` — xoá `staff_branches` rồi chèn lại.**
Xoá trượt mà chèn trúng thì nhân viên nằm trong **cả chi nhánh cũ lẫn chi nhánh
mới**. Chủ studio chuyển một người từ Pasteur sang Tân Bình, tưởng đã chuyển,
còn người đó vẫn đọc được dữ liệu Pasteur. Không màn hình nào hiện ra điều đó.

**`share-link/route.ts:142` — thu hồi link cũ khi cấp link mới.**
CSKH bấm *Tạo link mới* **chính vì nghi mã cũ đã lọt ra ngoài**. Thu hồi trượt
nghĩa là mã cũ vẫn mở được ảnh của nhà đó, trong khi màn hình báo đã thu hồi.
Đây là chỗ duy nhất trong danh sách mà lỗi im lặng biến thành lộ ảnh trẻ con.

**`retouch-done/route.ts:87/92` — ghi link Drive ảnh đã chỉnh.**
Ghi trượt thì CSKH thấy "đã giao", khách không nhận được gì, và không ai biết
cho tới khi khách gọi lên.

**`galleries/route.ts:151` — đặt hạn hai tháng cho link vừa tạo.**
Ghi trượt thì link sống vĩnh viễn trong khi màn khách in "2 tháng".

**Một điều đã đo, đừng lặp lại công:** tôi đã nghi dòng 151 bị RLS chặn (nó
dùng `supabase` chứ không `admin`). **Không phải.** Đóng vai một CSKH trong
giao dịch rồi `update share_links set expires_at` → `1 dòng bị đổi`. Chính sách
`share_links_write` cho `authenticated` với `cmd = ALL`. Nên đây là rủi ro
tiềm tàng, không phải lỗi đang xảy ra. **Đừng viết vào bàn giao rằng nó đang
hỏng** — nó không hỏng.

## Cái khó thật sự: không phải chỗ nào cũng xử như nhau

Đừng bọc cả 18 chỗ bằng `if (error) throw error`. Làm thế là đổi một lớp lỗi
này lấy một lớp lỗi khác — cụ thể là biến một dòng nhật ký ghi hụt thành một
cái 500 trước mặt ba mẹ.

Hãy tự phân loại, và **ghi cách phân loại ấy vào bàn giao**. Gợi ý ba nhóm:

1. **Ghi trượt là hỏng nghiệp vụ** → ném, để lượt gọi trả lỗi thật.
   (`staff_branches`, `share_links` thu hồi, `deliveries`)
2. **Ghi trượt không được chặn việc của người dùng, nhưng phải để lại dấu**
   → `console.error` có cấu trúc, đủ để tìm lại được. (`activity_logs`)
3. **Ghi trượt thật sự không quan trọng** → nếu bạn tìm ra chỗ nào như vậy,
   phải **viết ra vì sao** ngay tại dòng đó. Không có chú thích thì lần soát
   sau lại phải suy nghĩ lại từ đầu.

Nhóm 2 là chỗ dễ sai nhất: `activity_logs` là thứ dùng để **truy lại ai đã
làm gì**. Một nhật ký ghi hụt trong im lặng còn tệ hơn không có nhật ký, vì
người ta tin vào nó.

**Ranh giới cho nhóm 1:** lệnh ghi đứng **sau** một giao dịch đã commit thì
KHÔNG được ném — xem `src/lib/lark/notify.ts` và ghi chú dài ở đầu tệp đó. Ném
ở vị trí ấy là biến một việc đã xong của ba mẹ thành lỗi 500, và họ sẽ bấm
lại.

## Và một chốt để lớp lỗi này không quay lại

Nhóm 1 và 2 vá xong thì 18 chỗ hôm nay sạch. Ngày mai có chỗ thứ 19.

Viết một **phép thử đọc mã nguồn** đếm số lệnh ghi bỏ qua `error`, và chặn ở
con số bạn đạt được. Có sẵn mẫu để theo: `tests/unit/bien-moi-truong-phai-co-trong-mau.test.ts`
làm đúng kiểu này cho biến môi trường, và nó đã bắt được lỗi thật hai lần
(BB-152, và BB-167 tuần này).

Phép thử ấy phải **nêu tên tệp và số dòng** khi đỏ, không chỉ nói "có 19 chỗ" —
một con số trần thì người đọc không biết đi đâu.

## Ba chỗ đừng đụng

**Đừng sửa `src/lib/lark/notify.ts`.** Vừa gộp ở BB-167 hôm nay, dòng 303 đã
cố ý bỏ qua `error` và có chú thích giải thích. Đụng vào là đè lên một quyết
định vừa cân nhắc xong.

**Đừng đổi hình dạng phản hồi API.** `src/lib/api-response.ts` là hợp đồng
chung; thêm một mã lỗi mới thì phải nói trong bàn giao, đừng tự thêm.

**Đừng sửa `scripts/ownership.mjs`.** Tệp được bảo vệ, chỉ PM sửa.

## Tiêu chí xong

- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — **361/361** cộng ca bạn thêm. Không ca nào được biến mất.
- [ ] `npm run verify:db` — **17/17**.
- [ ] `AGENTS.md §5a`: hoàn nguyên bản vá thì phép thử phải **ĐỎ**. Làm thật,
      dán cả hai kết quả vào bàn giao.
- [ ] Ca bắt buộc, ít nhất hai: một ca chứng minh `staff_branches` xoá trượt
      thì lượt gọi **báo lỗi** chứ không lặng lẽ thành công; một ca chứng minh
      `activity_logs` ghi trượt **không** làm hỏng việc của người dùng nhưng
      **có** để lại dấu vết đọc được.
- [ ] Bảng phân loại 18 chỗ vào ba nhóm, kèm lý do từng nhóm, trong bàn giao.

**Kiểm ngược, bắt buộc:** `npm run dev`, gọi đường sửa nhân sự để đổi chi nhánh
của một tài khoản thử (`Fixture BB-190`), rồi dán truy vấn `staff_branches`
chứng minh chỉ còn ĐÚNG chi nhánh mới. Sau đó làm cho lệnh xoá thất bại (đổi
tạm tên bảng, hay chặn bằng một policy) và dán lại lời từ chối. Che tên và
email thật.

## Hai việc chạy song song

**DEV-INT đang làm BB-191** trong `babybean-dev-int` — cùng chủ đề "chạy mà
không ai biết", nhưng ở phía **phép thử chạm ra thế giới thật**, không ở phía
`error` bị nuốt. Nếu bạn thấy mình đang sửa `tests/unit/ghi-link-app-len-lark.test.ts`
hay `src/lib/lark/ghi-link-app.ts` thì dừng lại — đó là phần của DEV-INT.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
Dọn rác sau khi xong: `npm run db:cleanup`.
