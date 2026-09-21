# BB-173 — Màn lịch sử thao tác, và lý do nó chưa dùng được

**Cửa sổ: DEV-FE.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-fe` — nhánh `agent/dev-fe`.

**Không phải DEV-BE, không phải DEV-INT.** Cả hai đang làm BB-190 và BB-191
trong hai cửa sổ khác, cùng chủ đề "dữ liệu không đáng tin". Đọc mục cuối.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Chủ studio muốn gì

Xem được **ai đã làm gì**: nhân viên nào sửa bộ ảnh nào, ai cấp link, ai xác
nhận thanh toán, ai đổi vai trò của người khác.

`activity_logs` đã ghi sẵn. Chưa màn nào đọc nó.

## Nhưng dựng màn hình KHÔNG phải phần khó

Đo trên bb-dev ngày 21/09/2026:

```
tổng số dòng                                        9.823
dòng trỏ vào bộ ảnh ĐÃ BỊ XOÁ (tức là fixture)      9.507   ← 96,8%
dòng trỏ vào bộ ảnh còn thật                           46   ← 0,5%
```

Và phân bố theo việc:

```
selection.patch            4.209
share_link.created         3.257     ← studio chỉ có 6 link đang sống
gallery.payment_recorded   1.142
```

**3.257 lượt cấp link, trong khi cả studio có đúng 6 link đang dùng.** Đó là
dấu vết của các lượt `npm run test` chạy trên bb-dev, không phải của người.

Nếu bạn dựng màn hình rồi dừng ở đó, chủ studio mở ra sẽ thấy **gần mười nghìn
dòng nói về những bộ ảnh không còn tồn tại**, lẫn 46 dòng thật ở đâu đó giữa
chúng. Họ sẽ đóng lại và kết luận app hỏng — và họ không sai.

Hôm 17/09 con số được dẫn ra để chứng minh nhật ký "đã có sẵn dữ liệu" là
6.420 dòng. Bây giờ biết rõ: gần như toàn bộ con số đó là rác.

## Nên việc này có HAI nửa, và nửa đầu quan trọng hơn

### Nửa 1 — làm cho nhật ký đáng tin

Nhận diện dòng do phép thử dựng ra, rồi dọn.

Dấu hiệu chắc chắn nhất đã đo: **`entity_type = 'gallery'` mà `entity_id`
không còn trong bảng `galleries`**. Bộ ảnh thật không bị xoá bao giờ —
`docs/13 §8` chốt "tắt, không xoá" cho nhân sự, và bộ ảnh cũng đi theo cùng
nguyên tắc.

**Nhưng đừng tin câu trên vì tôi viết ra.** Tự kiểm: có đường nào trong `src/`
xoá `galleries` không? (`grep -rn 'from("galleries")' src | grep delete`).
Nếu có, suy luận "mồ côi ⇒ fixture" sai, và bạn phải tìm dấu khác. **Ghi kết
quả kiểm ấy vào bàn giao** — đó là phần đáng đọc nhất của việc này.

Dọn xong thì dạy `npm run db:cleanup` tự dọn từ nay (tệp
`scripts/cleanup-test-galleries.mjs`, nó vừa học dọn `notifications` ở BB-167 —
theo đúng khuôn đó).

Hai chốt cho nửa này:

- **Chỉ xoá dòng mồ côi.** 46 dòng trỏ vào bộ ảnh thật là lịch sử thật, và
  không có bản sao nào khác.
- **`scripts/cleanup-test-galleries.mjs` từ chối chạy trên bb-prod.** Giữ
  nguyên chốt đó.

### Nửa 2 — màn hình

Đặt ở `/admin/reports/nhat-ky` hoặc trong màn Nhân sự — bạn chọn, và nói rõ vì
sao trong bàn giao. Theo khuôn có sẵn:
`src/app/(admin)/admin/reports/link-sap-het-han/page.tsx` cộng
`src/components/features/admin/link-sap-het-han-report.tsx` là cặp mẫu gần
nhất, vừa gộp hôm 21/09.

Phải có:

- Lọc theo **người**, theo **việc** (`action`), theo **khoảng ngày**.
- Cột "ai" đọc được: `actor_label` đang lưu **vai trò** chứ không lưu tên
  (`staff.role`). Tra sang `staff_profiles` để hiện tên — nhưng **đọc kỹ đoạn
  dưới về người đã nghỉ**.
- Phân biệt rõ **nhân viên** và **khách** — `actor_type` có hai giá trị, và
  5.156 dòng là của khách. Chủ studio hỏi về nhân sự; trộn chung là không trả
  lời được câu họ hỏi.

### Người đã nghỉ việc vẫn phải đọc được tên

`docs/13 §8`: *"Nghỉ việc: tắt, không xoá. Xoá hẳn sẽ làm mọi album cũ mất dấu
vết người thực hiện."*

Nên màn này phải hiện tên người đã tắt tài khoản, kèm dấu cho biết họ đã nghỉ.
Hiện "(không rõ)" cho mọi dòng của người cũ là đúng bằng việc xoá lịch sử.

Tài khoản bị **xoá hẳn** (BB-171 cho phép, chỉ với tài khoản chưa làm gì) thì
theo định nghĩa không có dòng nhật ký nào — nếu bạn thấy có, dừng lại và báo,
vì nghĩa là chốt của BB-171 đã thủng.

## Ba chỗ đừng đụng

**Đừng cho sửa hay xoá nhật ký từ giao diện.** Nhật ký sửa được thì không còn
là nhật ký. Chỉ đọc, kể cả cho `owner`.

**Đừng hiện mã link.** Nhiều dòng có `metadata.tokenPrefix` — sáu ký tự, đúng
theo thiết kế. Đừng đi tìm mã đầy đủ ở đâu khác để hiện cho "đầy đủ hơn": sau
khi bỏ PIN, chuỗi đó là thứ duy nhất che ảnh của một nhà.

**Đừng đụng `src/lib/api-response.ts` hay `scripts/ownership.mjs`.**

## Tiêu chí xong

- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — **361/361** cộng ca bạn thêm.
- [ ] `AGENTS.md §5a`: hoàn nguyên bản vá thì phép thử phải **ĐỎ**. Làm thật,
      dán cả hai kết quả.
- [ ] Ca bắt buộc: đường API lọc đúng theo chi nhánh của người gọi (CSKH chi
      nhánh Pasteur **không** đọc được thao tác ở Tân Bình); `photoshop_ctv`
      không mở được màn này; và dòng của nhân viên đã nghỉ **vẫn hiện tên**.
- [ ] Sau khi dọn: dán lại ba con số ở đầu brief này, đo lại trên bb-dev.
- [ ] Chữ mới đi qua i18n, `vi.ts` và `en.ts` cùng bộ khoá.

**Kiểm ngược, bắt buộc:** `npm run dev`, mở màn mới, chụp lại. Rồi làm một thao
tác thật (đổi chi nhánh một tài khoản thử) và chụp dòng nhật ký vừa sinh ra.
Che tên và email thật.

## Ba việc chạy song song

- **DEV-BE — BB-190**: 18 chỗ ghi dữ liệu bỏ qua `error`. Trong đó có bốn chỗ
  ghi `activity_logs`. Nếu bạn thấy mình đang sửa route trong `src/app/api/`
  để chữa việc **ghi** nhật ký, dừng lại — bạn lo phần **đọc**.
- **DEV-INT — BB-191**: chặn phép thử chạm ra ngoài thật. Đó chính là thứ sẽ
  ngăn nhật ký bẩn trở lại; nhưng nó không dọn phần đã bẩn, phần đó là của bạn.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
Nhật ký chứa tên nhân viên thật: che trước khi dán vào bàn giao.
