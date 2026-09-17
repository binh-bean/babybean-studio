# BB-170 — Kanban khoe tổng thật nhưng chỉ vẽ 50 bộ mới nhất

**Cửa sổ: DEV-FE.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-fe` — nhánh `agent/dev-fe`.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Chủ studio thấy gì

Mở Quản lý bộ ảnh, chế độ Kanban. Cột **"Sẵn sàng" ghi 357** và **không có
thẻ nào** — chỉ dòng chữ "Không có bộ ảnh". Cột **"Lỗi tải ảnh" ghi 0** trong
khi cơ sở dữ liệu có **76** bộ.

Không phải một cột hỏng. Cả bảng đang nói một đằng vẽ một nẻo.

## Vì sao — đã soát sẵn, khỏi dò

Ba dòng trong `src/components/features/admin/gallery-list.tsx`:

```
dòng 201   queryParams.set("limit", "50")        chỉ tải 50 bộ
dòng 579   items.filter(it => it.status === ...) thẻ lấy từ 50 bộ đó
dòng 580   counts[col.key] ?? colItems.length    số lấy TỔNG THẬT từ máy chủ
```

Danh sách sắp theo mới nhất trước. 50 bộ mới nhất tình cờ đều là `draft`, nên
mọi cột khác vẽ ra rỗng trong khi vẫn khoe tổng.

Đo trên bb-dev ngày 17/09: `ready` 357 · `sync_error` 76 · `draft` 53 ·
`in_review` 2. Tổng 488 bộ, mà màn chỉ cầm 50.

## Phải làm gì

**Mỗi cột tự tải dữ liệu của nó.** Đường `GET /api/admin/galleries` đã nhận
tham số lọc theo trạng thái và đã có con trỏ phân trang (`cursor`, `hasMore`,
`nextCursor`) — dùng lại, đừng dựng đường mới.

Cách làm:

1. Khi vào chế độ Kanban, mỗi cột gọi một lượt riêng với `status` của nó và
   `limit` nhỏ (20 là đủ cho một màn hình).
2. Cuối mỗi cột có nút **"Tải thêm"** khi `hasMore`, dùng `nextCursor` của
   chính cột đó. Mỗi cột giữ con trỏ riêng — dùng chung một con trỏ là lẫn.
3. Số trên đầu cột giữ nguyên tổng thật. Nó đang đúng, đừng đổi thành số thẻ
   đang hiện — chủ studio cần biết cột đó có bao nhiêu bộ, không phải bao nhiêu
   bộ đang vẽ.
4. Bộ lọc phía trên (chi nhánh, ngày, tìm kiếm) phải áp cho **cả tám cột**.
   Lọc một chỗ mà cột khác không đổi là lỗi tiếp theo của chính màn này.

**Chế độ Bảng giữ nguyên** — nó vốn đúng: tải 50, cuộn hết thì tải thêm.

## Tiêu chí xong

- [ ] Mở Kanban trên bb-dev: cột "Sẵn sàng" phải hiện thẻ, cột "Lỗi tải ảnh"
      phải hiện thẻ. Đây là điều chủ studio sẽ mở ra xem đầu tiên.
- [ ] Số trên đầu mỗi cột vẫn là tổng thật, không phải số thẻ đang hiện.
- [ ] Bấm "Tải thêm" ở một cột không làm cột khác đổi.
- [ ] Đổi bộ lọc chi nhánh thì cả tám cột đổi theo.
- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — **307/307 đạt** cộng ca bạn thêm. Thấp hơn là bạn làm
      hỏng phép thử đang xanh; đừng sửa phép thử cho nó xanh lại.
- [ ] Phép thử mới phải **dựng component thật** và kiểm số thẻ vẽ ra. Đừng đọc
      tệp `.tsx` bằng `fs` rồi khớp regex như ở BB-108 — cách đó canh chính tả
      chứ không canh hành vi.

**Kiểm ngược, bắt buộc, dán kết quả vào bàn giao:** chạy `npm run dev` trong
worktree này (`.env.local` đã trỏ sẵn bb-dev), mở
`http://localhost:3000/admin/galleries`, chuyển sang Kanban, **chụp màn hình**
cho thấy cột "Sẵn sàng" có thẻ. Che tên khách trước khi đưa vào bàn giao.

Không gọi ra internet cho việc này — không có host nào tên `bb-dev.*`.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà, tên và số điện thoại thật
(`AGENTS.md §6`). Kho này public. Ảnh chụp màn hình phải che tên.

Dọn rác sau khi xong: `npm run db:cleanup`. Bộ ảnh thử đặt tên bắt đầu bằng
`Fixture BB-170`.
