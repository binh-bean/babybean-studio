/**
 * Nhắc bộ ảnh khách chưa chốt — nửa còn lại của BB-068.
 *
 * OWNER: DEV-BE.
 *
 * ---------------------------------------------------------------------------
 * Nhắc AI, và vì sao không nhắc thẳng khách
 * ---------------------------------------------------------------------------
 * Dòng cài đặt tên là "Nhắc khách vào ngày thứ", nhưng app **không có đường
 * nào nhắn thẳng cho ba mẹ**: khách phần lớn không có email (406/447 khách chỉ
 * có số điện thoại), Zalo ZNS chưa nối, và tin nhắn SMS thì chưa có nhà cung
 * cấp. Thứ app có là webhook nhóm Lark của studio.
 *
 * Nên tin này đi tới **nhóm Lark của chi nhánh**, kèm đủ thứ để CSKH nhấc máy
 * gọi khách: tên bộ ảnh, gửi mấy ngày rồi, còn mấy ngày tới hạn, số điện thoại
 * đã che giữa, và nút mở bộ ảnh. Câu chữ trong màn Cài đặt đã sửa theo đúng
 * điều này — hứa nhắn cho khách rồi không nhắn là kiểu hỏng tệ nhất.
 *
 * ---------------------------------------------------------------------------
 * Ba chốt để không biến nhóm chat thành thùng rác
 * ---------------------------------------------------------------------------
 *  1. **Mỗi bộ ảnh mỗi mốc đúng một tin.** Lượt chạy hằng ngày mà không chống
 *     trùng thì một bộ ảnh nằm ở ngày thứ 3 sẽ bị nhắc lại mỗi ngày.
 *  2. **Trần mỗi lượt.** Ngày cắt sang bb-prod có thể có hàng chục bộ đã gửi
 *     từ lâu cùng rơi vào mốc; bắn hết một lúc là nhân viên tắt thông báo, và
 *     từ đó mọi cảnh báo đều vô dụng (docs/08 §2 đã nói đúng chuyện này).
 *  3. **Chỉ bộ ảnh đang chờ khách.** Khách chốt rồi, bộ đã chuyển sang chỉnh
 *     ảnh, hay bộ đã hết hạn thì nhắc là sai.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueLarkNotification, cheSoDienThoai } from "@/lib/lark/notify";

/** Nhiều nhất bấy nhiêu tin mỗi lượt chạy. Xem chốt 2 ở đầu tệp. */
const TRAN_MOI_LUOT = 20;

/** Bộ ảnh đang thật sự chờ khách bấm. */
const DANG_CHO_KHACH = ["ready", "in_review"];

export interface KetQuaNhac {
  ungVien: number;
  daNhac: number;
  boQuaVeTrung: number;
  chamTran: boolean;
}

/** Số ngày trọn vẹn từ `moc` tới bây giờ. */
function soNgayDaQua(moc: string): number {
  return Math.floor((Date.now() - new Date(moc).getTime()) / 86_400_000);
}

/**
 * Đọc `gallery.reminder_days`. Trả mảng rỗng khi chưa cấu hình — và **mảng
 * rỗng nghĩa là tắt hẳn**, không phải là lấy mặc định. Chủ studio xoá hết số
 * trong ô đó là cố ý không muốn nhắc nữa.
 */
async function docMocNhac(
  admin: ReturnType<typeof createAdminClient>,
): Promise<number[]> {
  const { data } = await admin
    .from("settings")
    .select("value")
    .eq("key", "gallery.reminder_days")
    .is("branch_id", null)
    .maybeSingle();

  const v = (data as { value?: unknown } | null)?.value;
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 90)
    .slice(0, 5);
}

/**
 * Quét và bắn tin nhắc. Không ném — đi nhờ lượt chạy của `expire-galleries`,
 * và một lỗi ở đây không được phép làm hỏng phần cho link hết hạn.
 */
export async function quetNhacKhachChuaChot(): Promise<KetQuaNhac> {
  const admin = createAdminClient();
  const mocNhac = await docMocNhac(admin);
  if (mocNhac.length === 0) {
    return { ungVien: 0, daNhac: 0, boQuaVeTrung: 0, chamTran: false };
  }

  // Chỉ nhìn lại xa nhất bằng mốc nhắc lớn nhất cộng một ngày: bộ ảnh gửi từ
  // ba tháng trước không còn là việc để nhắc, nó là việc để dọn.
  const xaNhat = new Date();
  xaNhat.setDate(xaNhat.getDate() - (Math.max(...mocNhac) + 1));

  const { data: boAnh, error } = await admin
    .from("galleries")
    .select("id, branch_id, title, sent_at, due_at, customer_id")
    .in("status", DANG_CHO_KHACH)
    .not("sent_at", "is", null)
    .is("submitted_at", null)
    .gte("sent_at", xaNhat.toISOString())
    .order("sent_at", { ascending: true });
  if (error) throw error;

  const ungVien = (boAnh ?? [])
    .map((g) => ({ g, ngay: soNgayDaQua(String(g.sent_at)) }))
    .filter((x) => mocNhac.includes(x.ngay));

  if (ungVien.length === 0) {
    return { ungVien: 0, daNhac: 0, boQuaVeTrung: 0, chamTran: false };
  }

  /**
   * Đã nhắc những mốc nào rồi.
   *
   * Đọc cả bảng `notifications` của mẫu này trong khoảng đang xét rồi đối
   * chiếu trong bộ nhớ: đơn giản hơn là lọc theo đường dẫn JSON bên PostgREST,
   * và số dòng ở đây nhỏ (mỗi bộ ảnh nhiều nhất năm mốc).
   */
  const { data: daGui } = await admin
    .from("notifications")
    .select("payload")
    .eq("template", "gallery.due_soon")
    .gte("created_at", xaNhat.toISOString());

  const daCo = new Set(
    (daGui ?? []).map((n) => {
      const p = (n.payload ?? {}) as Record<string, unknown>;
      return `${String(p.galleryId)}:${String(p.ngayThu)}`;
    }),
  );

  // Tên và số khách lấy một lượt cho cả mẻ, thay vì một câu truy vấn mỗi bộ.
  const idKhach = [...new Set(ungVien.map((x) => x.g.customer_id).filter(Boolean))] as string[];
  const { data: khach } = idKhach.length
    ? await admin.from("customers").select("id, full_name, phone").in("id", idKhach)
    : { data: [] };
  const soKhach = new Map(
    (khach ?? []).map((k) => [String(k.id), { ten: String(k.full_name), so: k.phone as string | null }]),
  );

  let daNhac = 0;
  let boQuaVeTrung = 0;

  for (const { g, ngay } of ungVien) {
    if (daCo.has(`${g.id}:${ngay}`)) {
      boQuaVeTrung++;
      continue;
    }
    if (daNhac >= TRAN_MOI_LUOT) break;

    const kh = g.customer_id ? soKhach.get(String(g.customer_id)) : undefined;
    const conLai = g.due_at
      ? Math.ceil((new Date(String(g.due_at)).getTime() - Date.now()) / 86_400_000)
      : null;

    await enqueueLarkNotification({
      branchId: g.branch_id ? String(g.branch_id) : null,
      event: "gallery.due_soon",
      payload: {
        galleryId: String(g.id),
        galleryTitle: String(g.title),
        ngayThu: ngay,
        conLaiNgay: conLai,
        customerName: kh?.ten ?? null,
        // Che giữa ngay tại đây: nhóm Lark rộng hơn app và tin chuyển tiếp được.
        customerPhone: cheSoDienThoai(kh?.so ?? null),
      },
    });
    daNhac++;
  }

  return {
    ungVien: ungVien.length,
    daNhac,
    boQuaVeTrung,
    chamTran: ungVien.length - boQuaVeTrung > TRAN_MOI_LUOT,
  };
}
