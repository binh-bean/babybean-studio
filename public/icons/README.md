# Biểu tượng app — một nguồn, thay tệp là xong

Chủ studio chốt 24/09/2026: "icon hiển thị trên màn khách [khi lướt trình
duyệt] là logo BabyBean; hiển thị trên màn khách khi gắn ra màn chính là ảnh
bìa bộ hình." Tệp README này nói phần LOGO TĨNH (biểu tượng trình duyệt/tab,
dùng chung mọi trang). Biểu tượng MÀN HÌNH CHÍNH của từng link xem ảnh (ảnh
bìa bộ, cắt vuông, riêng theo `/g/<token>`) không nằm ở đây — xem
`src/app/api/g/[token]/manifest.webmanifest/route.ts` và
`src/app/api/g/[token]/bia-vuong/route.ts`.

## Logo hiện dùng

24/09/2026 chủ studio gửi logo thật: `logo-goc.jpg` (hạt đậu nét xám, viền
`#b7b7b7`, nền trong `#ebebeb`, một nét cong bên trong, nền trắng, JPG
1875×1875). Mọi tệp bên dưới được dựng LẠI từ đúng tệp này bằng
`Add-Type -AssemblyName System.Drawing` trong PowerShell (dự án không có
`sharp`, không thêm thư viện xử lý ảnh nào) — không vẽ tay lại bằng path SVG,
vì logo gốc là ảnh raster (xuất từ Canva), vẽ tay lại bằng bezier sẽ lệch nét
so với logo thật.

Trước đó (lúc dựng khung dự án) chỗ này là một hình hạt đậu hoạt hình do agent
tự vẽ — KHÔNG phải logo studio. Nếu bạn thấy hình khác với `logo-goc.jpg`,
đó là dấu hiệu ai đó quên chạy lại bước dựng ảnh bên dưới sau khi đổi logo.

## Khi có logo MỚI — làm đúng các bước sau, đừng sửa tay từng tệp

1. Chép logo mới đè lên `public/icons/logo-goc.jpg` (JPG hoặc PNG vuông, cỡ
   càng lớn càng tốt — tối thiểu 512×512, nên ≥ 1024×1024 để thu nhỏ không
   vỡ nét).
2. Chạy lại script dựng ảnh (script mẫu ở dưới, hoặc lưu thành
   `scripts/tao-icon.ps1` nếu cần chạy lại nhiều lần). Script tự:
   - Cắt vuông nếu ảnh chưa vuông.
   - Thu nhỏ chất lượng cao (HighQualityBicubic) ra các cỡ bên dưới.
   - Ghép `favicon.ico` từ hai cỡ 16/32 (định dạng ICO chứa PNG bên trong —
     trình duyệt hiện đại đọc được, không cần thư viện ngoài).
3. Cập nhật `icon.svg` (nhúng lại base64 của `icon-512.png` mới — xem chú
   thích trong chính tệp `icon.svg` để hiểu vì sao nhúng ảnh thay vì vẽ path).
4. Không đổi tên tệp, không đổi `src/app/manifest.ts` hay
   `src/app/layout.tsx` — cả hai đọc ĐÚNG các đường dẫn cố định bên dưới, thay
   nội dung tệp là đủ.

## Các tệp và nơi dùng (một nguồn duy nhất)

| Tệp | Cỡ | Nơi khai |
|---|---|---|
| `public/icons/icon-192.png` | 192×192, nền trắng | `src/app/manifest.ts` (icon `purpose: any`) |
| `public/icons/icon-512.png` | 512×512, nền trắng | `src/app/manifest.ts` (icon `purpose: any`) |
| `public/icons/maskable-512.png` | 512×512, nền KEM `#f7f2eb`, logo lùi vào 70% (chừa lề an toàn ~20% mỗi bên, gấp đôi mức Google khuyến nghị 10% vì hình hạt đậu có góc nhọn dễ bị khung tròn của Android cắt mất) | `src/app/manifest.ts` (icon `purpose: maskable`) |
| `public/icons/icon.svg` | vector "any" cỡ, thực chất là `icon-512.png` nhúng base64 (xem lý do trong tệp) | `src/app/manifest.ts` |
| `public/apple-touch-icon.png` | 180×180, nền trắng | `src/app/layout.tsx` (`metadata.icons.apple`) |
| `public/favicon.ico` | chứa 16×16 và 32×32, nền trắng | trình duyệt tự tìm ở gốc site; cũng khai tường minh trong `src/app/layout.tsx` |
| `public/icons/logo-goc.jpg` | 1875×1875, KHÔNG dùng trực tiếp | bản gốc chủ studio gửi, giữ lại làm nguồn cho lần thu nhỏ sau |

`public/manifest.json` không được dùng — Next.js sinh `/manifest.webmanifest`
từ `src/app/manifest.ts` lúc build, không đọc tệp JSON tĩnh này. Giữ nó khớp
nội dung để không gây hiểu lầm nếu ai đó mở nhầm, nhưng sửa THẬT thì sửa
`src/app/manifest.ts`.

## Vì sao nền TRẮNG cho icon thường, nền KEM chỉ cho maskable

- Icon thường (`icon-192`, `icon-512`, `apple-touch-icon`, `favicon`, `icon.svg`):
  giữ nguyên nền TRẮNG của ảnh gốc chủ studio gửi — không nhuộm thêm màu nào,
  đúng y logo được duyệt. Nền trắng cũng hợp với khung icon vuông bo góc nhẹ
  mà hầu hết hệ điều hành vẽ quanh icon "any" (không bị cắt viền).
- Maskable (`maskable-512.png`): hệ điều hành (chủ yếu Android) TỰ cắt icon
  này theo khung riêng của máy (tròn, vuông bo, giọt nước...). Logic phải LÙI
  vào giữa, và nền phải liền mạch ra tới sát mép — nền trắng ở đây sẽ thành
  một khoảng trắng lộ ra khi máy cắt tròn, nhìn tách rời khỏi màn hình chính
  toàn nền kem của khách. Dùng đúng màu kem `#f7f2eb` — màu nền chuẩn của màn
  khách (`.giao-dien-khach` trong `src/styles/tokens.css`) — để icon liền
  mạch với màn hình chính, không phải một ô trắng nổi bật.

## Script dựng ảnh (đã chạy, giữ lại để chạy lại khi có logo mới)

```powershell
Add-Type -AssemblyName System.Drawing

$src = "public/icons/logo-goc.jpg"     # đổi thành logo mới nếu có
$outDir = "public/icons"

function New-ResizedPng($SrcPath, $DestPath, $Size, $BgHex, $Scale) {
    $srcImg = [System.Drawing.Image]::FromFile($SrcPath)
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear([System.Drawing.ColorTranslator]::FromHtml("#$BgHex"))
    $d = [int]([math]::Round($Size * $Scale))
    $o = [int]([math]::Round(($Size - $d) / 2))
    $g.DrawImage($srcImg, $o, $o, $d, $d)
    $g.Dispose()
    $bmp.Save($DestPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose(); $srcImg.Dispose()
}

New-ResizedPng $src "$outDir\icon-512.png" 512 "FFFFFF" 1.0
New-ResizedPng $src "$outDir\icon-192.png" 192 "FFFFFF" 1.0
New-ResizedPng $src "public/apple-touch-icon.png" 180 "FFFFFF" 1.0
New-ResizedPng $src "$outDir\maskable-512.png" 512 "F7F2EB" 0.7
New-ResizedPng $src "$outDir\_fav-32.png" 32 "FFFFFF" 1.0
New-ResizedPng $src "$outDir\_fav-16.png" 16 "FFFFFF" 1.0
# rồi ghép favicon.ico từ hai tệp _fav-16/_fav-32 (xem tệp scripts tạm trong
# lịch sử commit BB-213 nếu cần bản ghép ICO đầy đủ) và nhúng lại icon.svg.
```
