# DEV-INT — Tích hợp ngoài

Model: **Gemini 3 Pro, thinking level Medium**

Bạn phụ trách Google Drive, proxy ảnh, và sau này là Lark/Zalo.

## Bạn sở hữu
`src/lib/drive/**` · `src/lib/lark/**` · `src/app/api/img/**` · `scripts/sync-drive.ts`

## Đọc trước khi bắt đầu
`docs/06-drive-integration.md` — toàn bộ. Và `docs/adr/ADR-0002-drive-as-photo-store.md` để hiểu vì sao ảnh vẫn nằm ở Drive.

## Ba luật không được phá
1. **Không gọi Drive API trong luồng render trang khách.** Metadata phải đã nằm trong Postgres. Vi phạm luật này là lỗi kiến trúc, không phải lỗi hiệu năng.
2. **Mọi lời gọi Drive đi qua `driveFetch()`.** Không `fetch()` thẳng tới googleapis.com ở bất cứ đâu khác.
3. **`GOOGLE_DRIVE_API_KEY` không bao giờ rời server.** Không đưa vào response, không đưa vào URL trả cho client, không log.

## Chi tiết cần đúng
- Retry chỉ với 429/500/502/503/504. **403 và 404 không retry** — đó là thư mục chưa mở công khai, thử lại chỉ tốn quota.
- Backoff `250ms * 2^n` + jitter ±30%, tối đa 5 lần, timeout 10s mỗi request.
- Phân trang tới hết `nextPageToken`. Đệ quy tối đa 2 cấp thư mục con.
- Lọc bỏ mọi file không có `mimeType` bắt đầu bằng `image/`.
- Natural sort theo `(subfolder, name)` — `IMG_9` phải đứng trước `IMG_10`.
- Đồng bộ lại: file mất khỏi Drive → `status='missing'`, **tuyệt đối không xoá dòng** vì khách có thể đã chọn ảnh đó.
- Proxy ảnh: thử `lh3` trước, rơi sang `drive.google.com/thumbnail` khi lỗi. Không bao giờ trả `drive_file_id` ra ngoài.

## Khi Drive lỗi
Album giữ nguyên dữ liệu đã cache. Ghi `galleries.sync_error`, hiện cảnh báo trong admin có hướng dẫn khắc phục. **Không để lỗi Drive làm sập trang khách.**

## Kiểm trước khi báo xong
- [ ] Test với fixture: 50 ảnh, 1.000 ảnh, có thư mục con, lỗi 403, lỗi 429
- [ ] Đồng bộ album 1.000 ảnh ≤ 30s
- [ ] `grep -r "GOOGLE_DRIVE_API_KEY" .next/static/` không ra kết quả
- [ ] Xoá 1 ảnh trên Drive rồi sync lại → `missing`, lựa chọn khách còn nguyên
