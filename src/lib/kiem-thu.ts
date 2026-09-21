/**
 * Một chốt duy nhất cho câu hỏi: mã này có đang chạy trong phép thử không?
 *
 * ---------------------------------------------------------------------------
 * Học bằng cách làm hỏng, 21/09/2026
 * ---------------------------------------------------------------------------
 * Một lượt `npm run test` đẩy sáu thẻ "Test BB114…" vào **nhóm Lark thật của
 * studio**. Bộ phép thử BB-114 gọi thật `/api/g/submit` trên bb-dev, và không
 * có gì trên đường đi biết mình đang chạy phép thử.
 *
 * Trước đó không ai gặp, vì đường ghi cũ hỏng sẵn (PGRST204, xem BB-190) — một
 * cái lỗi đang che một cái lỗi khác. Vá cái thứ nhất là cái thứ hai lộ ra ngay.
 *
 * Chốt đặt ở **đường đi**, không ở từng phép thử: phép thử sẽ nhiều dần lên, và
 * chỉ cần một cái quên là nhân viên lại nhận tin rác giữa giờ làm.
 *
 * Nơi gọi chốt này, tính đến 21/09/2026:
 *   · `src/lib/lark/notify.ts`      — webhook báo tin sang nhóm Lark
 *   · `src/lib/lark/ghi-link-app.ts`— ghi cột *Link app* sang bảng Hậu Kỳ thật
 *   · `src/lib/lark/sync-retouch.ts`— đọc bảng Hậu Kỳ
 *   · `src/lib/drive/client.ts`     — mọi lượt gọi Google Drive
 *
 * ---------------------------------------------------------------------------
 * Cửa thoát
 * ---------------------------------------------------------------------------
 * Phép thử nào muốn đi QUA chốt để kiểm chính hình dạng lượt gọi mạng thì phải
 * giả lập `fetch` trước, rồi đặt `CHO_PHEP_GOI_MANG_TRONG_PHEP_THU="1"`.
 *
 * Tên biến cố ý KHÔNG mang chữ `LARK`: bản đầu tên là
 * `LARK_CHO_PHEP_GUI_TRONG_PHEP_THU`, rồi BB-195 kéo thêm Drive vào cùng chốt —
 * một cái tên nói sai phạm vi là một cái bẫy cho người đọc sau.
 *
 * Cửa thoát này **không rò sang tệp khác**: Vitest tách mỗi tệp phép thử sang
 * một tiến trình riêng, nên `process.env` đặt ở tệp này không sang tệp kia. Đã
 * đo thật ngày 21/09 chứ không suy ra từ tài liệu.
 */
export function dangChayPhepThu(): boolean {
  if (process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU === "1") return false;
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}
