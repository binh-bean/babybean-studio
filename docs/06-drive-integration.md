# 06 — Tích hợp Google Drive

Chủ sở hữu: **DEV-INT**.

## 1. Nguyên tắc

Drive là **kho ảnh**, không phải cơ sở dữ liệu. Hệ thống:
- đọc metadata → lưu vào `photos`;
- hiển thị thumbnail qua proxy của mình;
- **không** gọi Drive trong luồng render trang khách;
- **không** tải file gốc về server.

## 2. Điều kiện tiên quyết (studio phải làm)

Thư mục ảnh trên Drive phải ở chế độ:
> **Chia sẻ → Quyền truy cập chung → "Bất kỳ ai có đường liên kết" → vai trò "Người xem"**

Nếu chưa mở, API key không đọc được và hệ thống trả `DRIVE_ACCESS_DENIED` kèm hướng dẫn 3 bước hiển thị ngay trên màn hình tạo album.

Preset xuất ảnh preview (2048px, JPEG q75, sRGB, xoá GPS) và quy ước đặt tên file nằm ở [`docs/13-quyet-dinh-van-hanh.md §7`](13-quyet-dinh-van-hanh.md). Xuất sai kích thước không làm hỏng hệ thống, nhưng ảnh quá nhỏ sẽ vỡ khi khách pinch-zoom soi mắt bé, còn ảnh full-res thì tự tay đưa sản phẩm cho khách trước khi họ trả tiền.

## 3. Thiết lập API key

1. Google Cloud Console → tạo project `babybean-studio`.
2. Bật **Google Drive API**.
3. Tạo API key → **Restrict key**:
   - API restrictions: chỉ `Google Drive API`.
   - Application restrictions: IP của Vercel Functions, hoặc để không giới hạn nhưng bắt buộc chỉ dùng phía server.
4. Đặt vào `GOOGLE_DRIVE_API_KEY`. **Chỉ đọc ở server.** Nếu key xuất hiện trong bundle client → coi là sự cố bảo mật.

**Hạn mức**: mặc định ~10.000 request / 100 giây / project, 1.000 request / 100 giây / người dùng. Một album 1.000 ảnh tốn ~2 request khi đồng bộ (1.000 file/trang). Không có nguy cơ chạm trần nếu tuân thủ quy tắc "không gọi Drive khi render".

**Phase 2 — Service Account**: khi studio chuyển sang Shared Drive, dùng service account với quyền Viewer để không phụ thuộc chế độ chia sẻ công khai. Interface `DriveClient` đã tách sẵn để đổi cách xác thực mà không đụng nghiệp vụ.

## 4. Nhận diện link

Các dạng link studio hay dùng:

```
https://drive.google.com/drive/folders/1a2B3c4D5eF6g?usp=sharing
https://drive.google.com/drive/u/0/folders/1a2B3c4D5eF6g
https://drive.google.com/open?id=1a2B3c4D5eF6g
https://drive.google.com/drive/folders/1a2B3c4D5eF6g?usp=drive_link
```

Quy tắc parse (xem `src/lib/drive/parse-link.ts`):
1. Thử regex `/folders/([a-zA-Z0-9_-]{10,})`.
2. Thử query `?id=`.
3. Nếu chuỗi đầu vào đã là ID thuần (`^[a-zA-Z0-9_-]{10,}$`) thì nhận luôn.
4. Không khớp → `INVALID_INPUT` với thông báo "Link không hợp lệ. Hãy dán link thư mục Google Drive."

## 5. Liệt kê file

```
GET https://www.googleapis.com/drive/v3/files
  ?q='<folderId>' in parents and trashed = false
  &fields=nextPageToken,files(id,name,mimeType,size,imageMediaMetadata(width,height,time),modifiedTime)
  &orderBy=name_natural
  &pageSize=1000
  &supportsAllDrives=true
  &includeItemsFromAllDrives=true
  &key=<API_KEY>
```

- Lọc phía client: chỉ giữ `mimeType` bắt đầu bằng `image/` (bỏ `.DS_Store`, file Lightroom catalog, v.v.).
- Thư mục con (`mimeType = application/vnd.google-apps.folder`): duyệt **tối đa 2 cấp**, tên thư mục ghi vào `photos.subfolder`.
- Phân trang bằng `nextPageToken` cho tới hết.
- `sort_index` = thứ tự sau khi sắp xếp natural theo `(subfolder, name)`.

## 6. URL thumbnail

Ba lựa chọn, xếp theo mức ưu tiên:

| Mẫu URL | Ưu | Nhược |
|---|---|---|
| `https://lh3.googleusercontent.com/d/<fileId>=w<size>` | Nhanh, có CDN, chọn được kích thước | Không chính thức, có thể đổi |
| `https://drive.google.com/thumbnail?id=<fileId>&sz=w<size>` | Ổn định hơn | Chậm hơn, hay 302 nhiều chặng |
| `files.get?alt=media` | Chính thức | Trả file gốc — quá nặng, tốn quota. **Không dùng để hiển thị** |

**Quyết định**: dùng `lh3` là chính, tự động chuyển sang `drive.google.com/thumbnail` nếu `lh3` trả lỗi 2 lần liên tiếp. Cả hai đều đi qua proxy `/api/img/[photoId]` của mình, nên đổi nguồn không ảnh hưởng client.

Kích thước dùng trong app: `w200` (lưới dày) · `w400` (lưới thường) · `w800` (lưới thưa / DPR2) · `w1600` (lightbox).

## 7. Vì sao phải có proxy `/api/img`

| Lý do | Giải thích |
|---|---|
| Kiểm soát quyền | Chỉ người có phiên hợp lệ với đúng album mới xem được ảnh |
| Không lộ `drive_file_id` | Client chỉ thấy UUID nội bộ, không suy ra được link Drive để phát tán |
| Đổi nguồn linh hoạt | Sau này chuyển sang S3/R2 chỉ cần sửa proxy |
| Cache | Vercel Edge cache theo `photoId + w`, giảm tải lên Google |
| Watermark | Điểm duy nhất để chèn watermark ở phía server (Phase 2) |
| Đo lường | Đếm lượt xem, phát hiện hành vi tải hàng loạt |

## 8. Đồng bộ

### Lần đầu
```
status = 'syncing'
  → liệt kê toàn bộ file (đệ quy 2 cấp)
  → lọc ảnh, natural sort, gán sort_index
  → insert theo lô 500 dòng
  → photo_count, last_synced_at
  → cover_photo_id = ảnh đầu tiên (nếu chưa đặt)
  → status = 'ready'
```

### Đồng bộ lại
```
đọc lại danh sách Drive
  → có trong Drive, chưa có trong DB   → insert (status='active')
  → có ở cả hai nơi                     → update tên/kích thước/sort_index
  → có trong DB, không còn trên Drive   → update status='missing'  (KHÔNG xoá)
  → ảnh 'missing' xuất hiện trở lại     → update status='active'
```

Ảnh `missing` mà khách đã chọn: giữ nguyên lựa chọn, hiện cảnh báo cho nhân viên trên màn hình album và trong `/api/g/review` (`warnings: ["MISSING_PHOTOS"]`).

### Chạy nền
Phase 1: chạy trong route handler với `maxDuration = 60` (đủ cho ~3.000 ảnh).
Nếu album lớn hơn: chia lô theo `pageToken`, lưu tiến trình vào `galleries.sync_error`/metadata, client hỏi qua `/sync/status`.
Phase 2: chuyển sang Vercel Queue hoặc Supabase Edge Function nếu cần.

## 9. Chống lỗi

```ts
// src/lib/drive/client.ts — hợp đồng bắt buộc
async function driveFetch(url: string, init?: RequestInit): Promise<Response>
```

| Tình huống | Xử lý |
|---|---|
| 429 / 500 / 502 / 503 | Thử lại tối đa 5 lần, backoff `2^n * 250ms` + jitter ±30% |
| 403 `forbidden` | Không thử lại. Trả `DRIVE_ACCESS_DENIED`, ghi `galleries.sync_error` |
| 404 | Thư mục bị xoá/đổi quyền → `sync_error` |
| Timeout | 10s mỗi request, huỷ bằng `AbortController` |
| Vượt số lần thử | `DRIVE_UNAVAILABLE`, album giữ nguyên trạng thái cũ, ảnh đã cache vẫn dùng được |

Mọi lời gọi ghi log: `{ requestId, folderId, pageToken, durationMs, status }`. Không log API key.

## 10. Giới hạn đã biết (nói trước với studio)

| Giới hạn | Ảnh hưởng | Cách sống chung |
|---|---|---|
| Thư mục phải mở công khai | Ai có link Drive gốc đều xem được | Không đưa link Drive cho khách; chỉ đưa link app. Phase 2 dùng Shared Drive + service account |
| URL `lh3` không có tài liệu chính thức | Google có thể đổi | Đã có phương án dự phòng + proxy để đổi nguồn không ảnh hưởng client |
| Drive giới hạn tải khi lượt xem quá cao | Ảnh không load lúc cao điểm | Cache Edge dài ngày; Phase 2 cân nhắc đẩy thumbnail sang Supabase Storage |
| Đổi tên file trên Drive | `drive_file_id` không đổi nên lựa chọn không mất, nhưng danh sách xuất ra dùng tên mới | Đồng bộ lại trước khi xuất cho retoucher |
| Xoá file trên Drive | Ảnh thành `missing` | Cảnh báo trên UI |

## 11. Nghiệm thu module này

- [ ] Parse đúng cả 4 dạng link ở §4 và từ chối link không hợp lệ.
- [ ] Đồng bộ album 1.000 ảnh trong ≤ 30 giây.
- [ ] Thư mục chưa mở công khai → thông báo có hướng dẫn 3 bước, không phải lỗi 500.
- [ ] Xoá 1 ảnh trên Drive rồi đồng bộ lại → ảnh thành `missing`, lựa chọn của khách còn nguyên.
- [ ] Thêm 10 ảnh vào Drive rồi đồng bộ lại → thêm đúng 10 dòng, `sort_index` vẫn đúng thứ tự.
- [ ] Thư mục có 2 thư mục con → `subfolder` điền đúng, UI nhóm đúng.
- [ ] Ngắt mạng giữa chừng khi đồng bộ → album không kẹt vĩnh viễn ở `syncing`.
- [ ] `GOOGLE_DRIVE_API_KEY` không xuất hiện trong `.next/static/**` (có test tự động grep).
