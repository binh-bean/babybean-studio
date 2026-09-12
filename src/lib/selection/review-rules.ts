/**
 * Luật của vòng duyệt ảnh đã chỉnh, tách khỏi giao diện.
 *
 * OWNER: PM. Task BB-121.
 * Spec: docs/16 mục 4b
 *
 * Dự án chưa có thư viện dựng DOM để thử, nên luật nào quan trọng thì tách ra
 * hàm thuần — giống `buildHeartPayload`. Phép thử gọi đúng hàm mà màn hình
 * gọi, không phải một bản chép lại của nó.
 */

export interface ReviewState {
  status: string;
  finalDriveUrl: string | null;
}

/**
 * Có được bấm "duyệt, cho in" không?
 *
 * Hai điều kiện, và điều kiện thứ hai mới là điều dễ quên: **phải có link bản
 * đã chỉnh**. Studio quên dán link mà khách vẫn duyệt được thì bộ ảnh đi thẳng
 * vào xưởng in, và cái sai chỉ lộ ra lúc khách cầm ảnh trên tay.
 */
export function canApprove(s: ReviewState): boolean {
  return s.status === "awaiting_approval" && !!s.finalDriveUrl;
}

/**
 * Có được gửi yêu cầu sửa với nội dung này không?
 *
 * "Sửa đi" mà không nói sửa gì thì người chỉnh ảnh phải gọi lại hỏi — khách
 * trả lời hai lần cho một việc. Route API cũng chặn; chặn ở đây là để nút tắt
 * đi chứ không phải bấm rồi mới báo lỗi.
 */
export function canRequestRevision(s: ReviewState, note: string): boolean {
  return canApprove(s) && note.trim().length > 0 && note.trim().length <= 1000;
}
