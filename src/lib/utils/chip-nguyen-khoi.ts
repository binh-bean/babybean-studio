/**
 * BB-361 (người chấm vòng 9, A1 — P1 chặn 8,0) — chip "trong gói" ở bảng bên
 * của xem lớn 1440 gãy thành "trong" / "gói", nền chip vỡ hai mảnh.
 *
 * MỘT lớp dùng chung cho mọi chip/huy hiệu/viên chữ ở màn khách: chip KHÔNG BAO
 * GIỜ xuống dòng bên trong; thiếu chỗ thì cả viên xuống dòng nguyên khối
 * (`inline-block`). `max-w-full` để viên dài không đẩy tràn khung chứa.
 *
 * Ghép bằng `cn(CHIP_NGUYEN_KHOI, "...")`: chip nào cần `flex`/`inline-flex`
 * thì tailwind-merge giữ lớp hiển thị đứng SAU, `whitespace-nowrap` vẫn còn.
 */
export const CHIP_NGUYEN_KHOI = "inline-block max-w-full whitespace-nowrap";
