/**
 * BB-358 (người chấm vòng 8, A2) — chữ "ạ." đứng một mình ở dòng cuối (bìa máy
 * tính, bìa sau chốt, thông báo hạn mức). Gắn "ạ" vào chữ đứng trước bằng
 * khoảng trắng KHÔNG NGẮT (U+00A0), để trình duyệt chỉ xuống dòng trước cả cụm
 * "mẹ ạ." chứ không bao giờ trước riêng "ạ".
 *
 * MỘT hàm dùng chung cho mọi câu khách thấy có thể xuống dòng. Đi kèm lớp
 * `text-pretty` ở chỗ hiển thị (trình duyệt hỗ trợ thì tránh luôn dòng cuối quá ngắn).
 */
const TRUOC_A = /[ \t\n\r]+(ạ)(?=$|[\s.,!?…"”'»)])/gu;

export const KHOANG_KHONG_NGAT = " ";

export function giuA(cau: string): string;
export function giuA(cau: string | null | undefined): string | null | undefined;
export function giuA(cau: string | null | undefined): string | null | undefined {
  if (typeof cau !== "string") return cau;
  return cau.replace(TRUOC_A, `${KHOANG_KHONG_NGAT}$1`);
}
