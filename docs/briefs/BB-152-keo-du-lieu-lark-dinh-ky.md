# BB-152 — Kéo dữ liệu Lark về đều đặn, không chờ ai bấm

**Cửa sổ:** TÍCH HỢP
**Thư mục worktree:** `../bb-int-152` *(dựng khi giao)*
**Nhánh:** `feat/bb-152-keo-lark-dinh-ky`

---

## Vì sao có việc này

Chủ studio hỏi ngày 15.09.2026: dữ liệu từ Lark cần **cập nhật theo thời gian
thực**. Hôm nay không có gì tự chạy: `npm run sync:hauky` là lệnh gõ tay trên máy
PM. Nhân viên đổi một dòng bên Lark thì app không biết cho tới lần ai đó nhớ ra.

Chủ studio đã chốt **kéo định kỳ vài phút một lần**, không dùng đường Lark bắn
sang. Lý do chọn: không phải xin thêm quyền bên Lark, hỏng thì chỉ chậm chứ không
mất dữ liệu, và kể cả đi đường Lark bắn sang thì vẫn phải làm đường kéo bù cho
những lần bắn trượt.

## Ràng buộc nền tảng — đọc trước khi chọn cách

**Vercel Cron KHÔNG dùng được cho việc này.** Dự án đang ở gói **Hobby**: mỗi dự
án tối đa hai lệnh định kỳ, và **chỉ chạy được mức một lần mỗi ngày**. Hai suất
đó đã dùng hết trong `vercel.json`:

```
/api/cron/expire-galleries   0 18 * * *
/api/cron/send-reminders     0 2  * * *
```

Nên phải có một thứ **bên ngoài** gọi vào. Ba hướng, chọn một và nói rõ vì sao:

- **GitHub Actions** chạy theo lịch, gọi vào một đường trong app. Kho đã ở GitHub,
  không tốn thêm tiền. Lịch nhỏ nhất thực tế là 5 phút và GitHub hay chạy trễ vài
  phút — chấp nhận được với việc này.
- **Supabase `pg_cron` + `pg_net`** gọi thẳng từ cơ sở dữ liệu.
- **Máy ở studio** chạy lịch gõ sẵn. Rẻ nhưng phụ thuộc một cái máy có người tắt.

## Phải làm gì

1. Một đường trong app nhận lệnh kéo, **có khoá**: không ai gọi được nếu không
   mang đúng bí mật. Đây là đường ghi vào dữ liệu thật của studio.
2. **Kéo phần đổi, không kéo cả bảng.** Lark có 3.227 dòng; kéo hết mỗi 5 phút là
   tự bắn vào hạn mức của chính mình. Lọc theo mốc thời gian sửa gần nhất.
3. **Hai lần chạy chồng nhau thì lần sau phải nhường.** Một khoá chạy để không
   có hai tiến trình cùng ghi — cùng bệnh với BB-136, chỉ khác chỗ.
4. Chạy xong ghi lại: lấy về bao nhiêu dòng, đổi bao nhiêu, hỏng cái gì. Không có
   dòng này thì hỏng âm thầm hàng tuần không ai biết — đúng chuyện đã xảy ra với
   Vercel deploy và với 138 dòng rác trong bb-dev.
5. Phần đọc và ánh xạ **dùng lại** logic của `scripts/sync-lark-hauky.mjs`, đừng
   chép thành bản thứ hai. Hai bản chép nhau là hai bản lệch nhau sau một tháng.
6. Giữ nguyên quy tắc che tên của `docs/16` mục 7.3 — BB-139 đang làm phần đó,
   đừng mở sẵn ở đây.

## Xong là khi

- [ ] Đổi một dòng bên Lark → trong vòng một nhịp lịch, app thấy đổi
- [ ] Chạy hai lần chồng nhau: lần sau nhường, không có hai tiến trình cùng ghi
- [ ] Gọi đường đó mà không có khoá → bị từ chối
- [ ] Số dòng gọi sang Lark mỗi nhịp: đo và ghi vào báo cáo
- [ ] `npm run verify:own -- DEV-INT --base main`, `npm test`, `tsc`, `lint` sạch
