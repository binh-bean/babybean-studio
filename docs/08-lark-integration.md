# 08 — Tích hợp Lark (Phase 3)

Studio đang dùng **Lark** để quản trị nội bộ. Nguyên tắc: **không bắt nhân viên bỏ Lark**. Web app là nơi khách chọn ảnh và là nguồn sự thật về album; Lark là nơi nhân viên nhận thông báo và làm việc hằng ngày.

## 1. Ba mức tích hợp, làm theo thứ tự

| Mức | Nội dung | Công sức | Phase |
|---|---|---|---|
| **1. Thông báo một chiều** | Bot Lark bắn tin vào nhóm chi nhánh khi có sự kiện | Thấp | 3.1 |
| **2. Đồng bộ sang Lark Base** | Đẩy bảng album/tiến độ sang Lark Base để quản lý xem như bảng tính quen thuộc | Trung bình | 3.2 |
| **3. Hai chiều + phê duyệt** | Đọc lịch đặt chụp từ Lark, gửi yêu cầu phê duyệt (mở lại album, giảm giá) qua Lark Approval | Cao | 4 |

## 2. Mức 1 — Thông báo (làm trước)

### Sự kiện cần bắn

| Sự kiện | Gửi tới | Nội dung |
|---|---|---|
| `gallery.sent` | Nhóm chi nhánh | Đã gửi link album cho khách X, hạn chốt DD/MM |
| `gallery.first_view` | Nhóm chi nhánh | Khách X đã mở album lần đầu |
| `selection.submitted` | Nhóm chi nhánh + nhóm retouch | **Khách X đã chốt 24 ảnh (4 ảnh thêm — 200.000đ)** kèm nút mở album |
| `gallery.due_soon` | Nhóm chi nhánh | Album của X còn 2 ngày, khách mới chọn 5/20 |
| `gallery.overdue` | Nhóm chi nhánh + quản lý | Album của X đã quá hạn 3 ngày |
| `gallery.sync_error` | Nhóm kỹ thuật | Album Y không đọc được thư mục Drive |
| `delivery.ready` | Nhóm chi nhánh | Album final của X đã sẵn sàng giao |

### Cách gửi

Đơn giản nhất: **Custom Bot webhook** của từng nhóm chat.

```
POST https://open.larksuite.com/open-apis/bot/v2/hook/<webhook_id>
Content-Type: application/json
```

Dùng **message card** để có nút bấm:

```json
{
  "msg_type": "interactive",
  "card": {
    "header": { "title": { "tag": "plain_text", "content": "Khách đã chốt ảnh" },
                "template": "green" },
    "elements": [
      { "tag": "div", "fields": [
          { "is_short": true, "text": { "tag": "lark_md", "content": "**Khách:**\nNguyễn Thị A" } },
          { "is_short": true, "text": { "tag": "lark_md", "content": "**Bé:**\nBơ - 3 tháng" } },
          { "is_short": true, "text": { "tag": "lark_md", "content": "**Đã chọn:**\n24 ảnh" } },
          { "is_short": true, "text": { "tag": "lark_md", "content": "**Phụ thu:**\n200.000đ" } }
      ]},
      { "tag": "action", "actions": [
          { "tag": "button", "text": { "tag": "plain_text", "content": "Mở album" },
            "type": "primary", "url": "https://.../admin/galleries/<id>" }
      ]}
    ]
  }
}
```

### Bốn webhook, không phải một

| Webhook | Nhóm Lark | Nhận sự kiện |
|---|---|---|
| `settings['lark.webhook_url', <chi nhánh>]` × 3 | Vận hành từng chi nhánh | `gallery.sent`, `gallery.first_view`, `selection.submitted`, `gallery.due_soon` — chỉ album của chi nhánh mình |
| `settings['lark.webhook_url', NULL]` | Quản lý BabyBean | `gallery.overdue`, `gallery.sync_error`, `delivery.ready`, báo cáo 20:00 |

Gộp cả 3 chi nhánh vào một nhóm sẽ tạo ~120 tin/ngày; nhân viên tắt thông báo trong tuần đầu và từ đó mọi cảnh báo đều vô dụng. Xem `docs/13-quyet-dinh-van-hanh.md §6`.

### Triển khai

- Webhook URL lưu trong `settings` theo từng chi nhánh: key `lark.webhook_url`, `branch_id = <chi nhánh>`; `branch_id = NULL` là nhóm quản lý chung.
- Sự kiện được **đẩy vào bảng `notifications`** (`channel = 'lark'`), cron `flush-notifications` gửi mỗi 5 phút, retry tối đa 3 lần với backoff.
- Không gửi đồng bộ trong request của khách — chốt đơn không được chậm vì Lark.
- Nếu gửi hỏng: `status = 'failed'`, `last_error`, hiện cảnh báo trong màn hình Cài đặt. **Không bao giờ để lỗi Lark làm hỏng nghiệp vụ.**

## 3. Mức 2 — Đồng bộ sang Lark Base

### Vì sao
Quản lý chi nhánh quen nhìn bảng trong Lark Base. Đẩy dữ liệu album sang đó để họ không phải mở thêm một app.

### Bảng `Album` trong Lark Base

| Cột Lark | Nguồn |
|---|---|
| Mã album | `galleries.id` (8 ký tự đầu) |
| Chi nhánh | `branches.name` |
| Khách hàng | `customers.full_name` |
| SĐT | `customers.phone` |
| Bé | `babies.full_name` |
| Ngày chụp | `shoots.shoot_date` |
| Trạng thái | `galleries.status` (map sang tiếng Việt) |
| Số ảnh | `galleries.photo_count` |
| Đã chọn | `count_selected()` |
| Ảnh thêm | `extra_count` |
| Phụ thu | `extra_amount` |
| Hạn chốt | `galleries.due_at` |
| Ngày chốt | `galleries.submitted_at` |
| Link quản trị | URL |

### Chiều đồng bộ

**Một chiều: app → Lark Base.** Lark Base là bản sao chỉ đọc.
Lý do: hai chiều gây xung đột ghi và rất khó gỡ khi số liệu lệch. Nếu quản lý cần sửa, họ sửa trong app.

```
Trigger: sau mỗi thay đổi trạng thái album  → enqueue notifications(channel='lark', template='base_upsert')
Cron 5 phút                                  → gom lô, gọi Lark Base API bitable records batchUpdate
```

API:
```
POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_create
POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_update
```
Xác thực: `tenant_access_token` lấy từ `LARK_APP_ID` + `LARK_APP_SECRET`, cache 2 giờ (token sống 2 giờ).

Lưu `lark_record_id` vào `galleries` (thêm cột ở migration Phase 3) để upsert đúng dòng.

## 4. Mức 3 — Hai chiều + phê duyệt (Phase 4)

| Luồng | Mô tả |
|---|---|
| Lịch chụp Lark → app | Đọc Lark Calendar / Base "Lịch đặt" để tự tạo `shoots`, giảm nhập liệu |
| Phê duyệt mở lại album | Nhân viên bấm "Mở lại" → gửi Lark Approval tới quản lý → được duyệt thì app mới đổi trạng thái |
| Đồng bộ nhân sự | Lấy danh bạ Lark để tạo `staff_profiles`, đăng nhập bằng Lark SSO (OAuth) |
| Báo cáo hằng ngày | 20:00 mỗi ngày bot gửi thẻ tổng kết cho từng chi nhánh |

## 5. Bảo mật

- `LARK_APP_SECRET` chỉ ở server.
- Webhook đến (Phase 4) phải kiểm chữ ký `X-Lark-Signature` và chống replay bằng timestamp (lệch > 5 phút thì từ chối).
- **Không gửi ảnh của bé vào Lark.** Chỉ gửi số liệu và link. Ai muốn xem ảnh thì mở app và bị kiểm quyền ở đó.
- Không đưa số điện thoại đầy đủ vào tin nhắn nhóm — che giữa: `090***4567`.

## 6. Nghiệm thu

- [ ] Cấu hình webhook riêng cho từng chi nhánh, chi nhánh A không nhận tin của B.
- [ ] Tắt webhook → nghiệp vụ vẫn chạy bình thường, chỉ không có thông báo.
- [ ] Lark trả 500 → retry 3 lần rồi đánh dấu `failed`, có cảnh báo trong Cài đặt.
- [ ] Số điện thoại trong tin nhắn đã được che.
- [ ] Không có URL ảnh nào lọt vào payload Lark (có test tự động).
