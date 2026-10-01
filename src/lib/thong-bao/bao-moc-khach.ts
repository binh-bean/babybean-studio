import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";
import { NOI_DUNG_MOC, type MocBaoKhach } from "@/lib/thong-bao/moc-khach";

/**
 * BB-347 — gửi lời báo của một mốc (chuông + đẩy). Một chỗ duy nhất cho chữ
 * (xem moc-khach.ts). Không bao giờ ném (guiThongBaoBoAnh tự nuốt lỗi).
 * Việc "đã báo chưa" do bên gọi kiểm trước (cap-nhat-tu-hook.ts).
 */
export async function baoMocKhach(galleryId: string, moc: MocBaoKhach): Promise<void> {
  const nd = NOI_DUNG_MOC[moc];
  await guiThongBaoBoAnh(createAdminClient(), galleryId, { ...nd, loai: moc });
}
