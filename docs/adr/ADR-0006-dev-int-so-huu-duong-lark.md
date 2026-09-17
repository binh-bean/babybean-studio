# ADR 005: DEV-INT sở hữu webhook API của Lark

## Bối cảnh
Trong quá trình thực hiện BB-179, DEV-INT được giao nhiệm vụ dựng endpoint `POST /api/lark/hook` để nhận webhook từ Lark.
Tuy nhiên, cấu hình `verify:own` hiện tại quy định toàn bộ `src/app/api/**` (ngoại trừ `img/**`) thuộc về DEV-BE. Điều này dẫn đến cảnh báo "Ngoài vùng sở hữu" khi DEV-INT tạo file `src/app/api/lark/hook/route.ts`.

## Quyết định
DEV-INT cần được cấp quyền sở hữu đối với thư mục `src/app/api/lark/**` vì mọi nghiệp vụ, xác thực và tích hợp với Lark đều do DEV-INT đảm nhận.

## Đề xuất sửa đổi `scripts/ownership.mjs`
Thêm `"src/app/api/lark/**"` vào vùng sở hữu của DEV-INT:
```javascript
  "DEV-INT": [
    "src/lib/drive/**",
    "src/lib/lark/**",
    "src/app/api/img/**",
    "src/app/api/lark/**",
    "scripts/sync-drive.ts",
    "scripts/sync-lark-catalog.mjs",
    "scripts/sync-lark-contracts.mjs",
    "scripts/sync-lark-hauky.mjs",
  ]
```

## Trạng thái
Chờ PM duyệt và cập nhật `scripts/ownership.mjs`.
