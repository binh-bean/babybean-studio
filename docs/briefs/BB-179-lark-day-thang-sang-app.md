# BB-179 — Lark đẩy thẳng sang app, thôi chờ đến giờ

**Cửa sổ: DEV-INT.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-int` — nhánh `agent/dev-int`.

**Không phải DEV-BE.** DEV-INT sở hữu mọi đường nối sang Lark và Drive.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Việc

Hôm nay dữ liệu Lark về app bằng cách **kéo định kỳ**: GitHub Actions gọi
`POST /api/cron/sync-lark` mỗi giờ, đọc cả bảng Hậu Kỳ rồi dựng bộ ảnh.

Chủ studio xác nhận ngày 17/09/2026: bản Lark của studio **có** hành động
**"Yêu cầu HTTP"** trong Tự động hoá. Nghĩa là Lark **đẩy sang được** — nhân
viên sửa một ô là app biết ngay, không chờ đến giờ, không tốn tiền, không phụ
thuộc máy nào bật.

## Vì sao không dùng luôn đường cron sẵn có

Vì nó đọc **cả bảng**. Nhân viên sửa 30 dòng trong một buổi là 30 lượt đọc
toàn bảng — vừa chậm vừa chạm trần gọi API của Lark.

Nhưng nửa còn lại đã có sẵn: `syncSingleRetouchRecord` trong
`src/lib/lark/sync-retouch.ts:386` đồng bộ **đúng một bản ghi**. Việc của bạn
là mở một cửa cho Lark gọi thẳng vào hàm đó.

## Đường cần dựng

`POST /api/lark/hook` — một bản ghi một lượt gọi.

**Xác thực bằng chính `SYNC_CRON_SECRET`.** Lark gửi kèm header
`Authorization: Bearer <secret>`. Không có hoặc sai thì trả 401 và **không
nói gì thêm** — đừng trả thông báo giúp người gọi đoán ra mình sai chỗ nào.

**Thân yêu cầu chỉ cần mã bản ghi**, ví dụ `{ "record_id": "recXXXX" }`. Nhận
được thì đọc đúng bản ghi đó từ Lark rồi gọi `syncSingleRetouchRecord`.

**Đừng tin thân yêu cầu.** Lark gửi gì thì gửi, luôn đọc lại bản ghi từ Lark
bằng mã, chứ không lấy giá trị các trường thẳng từ thân yêu cầu. Thân yêu cầu
là thứ người ta soạn tay trong màn Tự động hoá — soạn nhầm một lần là dữ liệu
sai chảy vào cơ sở dữ liệu thật mà không ai biết.

**Dùng lại khoá của BB-152** (`LOCK_ID = 152111` trong
`src/app/api/cron/sync-lark/route.ts`). Lark đẩy dồn nhiều lượt cùng lúc là
chuyện thường; hai lượt cùng dựng một bộ ảnh là sinh bộ trùng. Đang có lượt
chạy thì trả 200 kèm `{ skipped: "busy" }` — **không trả lỗi**, vì Lark sẽ thử
lại và làm dồn thêm.

**Không bao giờ ném lỗi ra ngoài.** Hỏng thì ghi log và trả 200. Lark thấy lỗi
sẽ thử lại liên tục, và một bản ghi hỏng có thể kéo cả luồng đứng.

## Đường cron cũ GIỮ NGUYÊN

Đừng bỏ nó. Nó là lưới đỡ: Lark đẩy hụt một lượt — mạng lỗi, Tự động hoá bị
tắt, ai đó sửa bản ghi lúc Lark bảo trì — thì lượt kéo định kỳ vá lại. Hai
đường cùng chạy được vì cả hai đi qua một khoá.

Sau khi việc này xong, lượt kéo định kỳ **giãn ra được**, ví dụ mỗi 6 giờ
thay vì mỗi giờ. Đề xuất trong bàn giao, đừng tự đổi lịch.

## Phần chủ studio phải tự làm — viết sẵn cho họ

Bàn giao phải có **hướng dẫn từng bước bằng tiếng Việt cho người không lập
trình**, để chủ studio tự tạo Tự động hoá bên Lark. Ít nhất phải nói rõ:

- Tự động hoá đặt trên bảng **Hậu Kỳ**, **không phải bảng Khách Hàng** — ảnh
  chụp chủ studio gửi đang chọn nhầm bảng Khách Hàng.
- Sự kiện là **khi bản ghi được cập nhật**, không chỉ khi thêm mới. Bộ ảnh
  sinh ra từ việc nhân viên sửa ô trong bản ghi đã có, chứ không phải từ việc
  thêm dòng.
- Địa chỉ gọi tới, header `Authorization`, và thân yêu cầu gồm đúng mã bản ghi.
- **Đừng dán `SYNC_CRON_SECRET` vào brief hay vào bàn giao.** Ghi chỗ điền,
  chủ studio tự dán.

## Tiêu chí xong

- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — **307/307 đạt** cộng ca bạn thêm.
- [ ] Phép thử phải có đủ bốn ca: không header thì 401; header sai thì 401;
      mã bản ghi không tồn tại thì 200 và không ghi gì; đang có lượt chạy thì
      200 kèm `skipped`.
- [ ] `grep -rn "SYNC_CRON_SECRET" docs/` → không có giá trị thật nào.

**Kiểm ngược, bắt buộc, dán kết quả vào bàn giao:** chạy `npm run dev` trong
worktree này, rồi tự gọi đường mới bằng `curl` với mã một bản ghi Hậu Kỳ có
thật. Dán lại phản hồi, và dán truy vấn cho thấy bộ ảnh tương ứng vừa được
dựng hoặc cập nhật. Che tên khách trước khi dán.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
Mọi thứ dán vào bàn giao phải che tên và số điện thoại.

Dọn rác sau khi xong: `npm run db:cleanup`.
