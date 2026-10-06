/**
 * BB-371 — khách xin sửa ảnh chỉnh trong app → cột "Trạng Thái" của dòng Hậu
 * Kỳ bên Lark đổi sang "Sửa" (lần 1) hoặc "Sửa lần 2, 3, 4" (lần sau).
 *
 * Đi đúng khuôn của đường ghi Lark sẵn có (`ghi-link-app.ts`, BB-132):
 *   - chốt `khongGuiRaLarkThat()` ĐẦU TIÊN: phép thử (Vitest, Playwright) không
 *     bao giờ chạm Lark thật — trả về dự định ghi để phép thử đối chiếu;
 *   - tìm bảng theo TÊN (`MAU_TEN_BANG_HAU_KY`), tìm cột theo MÃ LỰA CHỌN neo
 *     (`MA_NEO_COT_TRANG_THAI`, giống `doc-trang-thai-lark.ts`) — nhân viên đổi
 *     tên cột thì vẫn đúng cột; không id nào nằm trong mã nguồn (repo công khai);
 *   - thân PUT đúng MỘT khoá: Lark giữ nguyên mọi cột vắng mặt;
 *   - ô chọn-một của Lark nhận TÊN lựa chọn: tra tên từ MÃ lựa chọn
 *     (optjhQwMrT / optW0pvHGd) trên chính cột đó — nhân viên đổi chữ hiển thị
 *     thì vẫn ghi đúng lựa chọn, không tạo lựa chọn mới;
 *   - KHÔNG BAO GIỜ NÉM: Lark hỏng không được làm hỏng yêu cầu sửa của khách.
 *
 * Link quản trị bộ ảnh đi kèm ở THẺ TIN NHÓM Lark (`review.changes_requested`,
 * nút "Mở bộ ảnh" — notify.ts) — đường ghi bảng này chỉ ghi một cột.
 */

import "server-only";
import { HOST, larkAuth } from "@/lib/lark/sync-retouch";
import { khongGuiRaLarkThat } from "@/lib/kiem-thu";
import { MAU_TEN_BANG_HAU_KY, docCauHinhLark, bienMoiTruongConThieu } from "@/lib/lark/ghi-link-app";
import { MA_NEO_COT_TRANG_THAI } from "@/lib/lark/trang-thai-hau-ky";
import { trangThaiLarkTheoLanSua } from "@/lib/anh-chinh-sua/nhan-dien";

export interface KetQuaGhiTrangThai {
  ghiDuoc: boolean;
  /** Phép thử / thiếu cấu hình: không gọi PUT. */
  chayThu: boolean;
  /** Mã lựa chọn định ghi ("optjhQwMrT" | "optW0pvHGd"). */
  maLuaChon: string;
  /** Chữ cho nhân viên: "Sửa" / "Sửa lần N". */
  nhan: string;
  lyDo?: string;
}

interface CotLark {
  field_name: string;
  type: number;
  property?: { options?: { id: string; name: string }[] } | null;
}

export async function ghiTrangThaiSuaLenLark(opts: {
  recordId: string | null | undefined;
  lanSua: number;
}): Promise<KetQuaGhiTrangThai> {
  const { ma, nhan } = trangThaiLarkTheoLanSua(opts.lanSua);
  const ketQua = (x: Partial<KetQuaGhiTrangThai>): KetQuaGhiTrangThai => ({
    ghiDuoc: false,
    chayThu: true,
    maLuaChon: ma,
    nhan,
    ...x,
  });

  if (khongGuiRaLarkThat()) return ketQua({ lyDo: "Đang chạy phép thử — không ghi thật lên Lark." });
  if (!opts.recordId) return ketQua({ lyDo: "Bộ ảnh chưa gắn dòng Hậu Kỳ bên Lark." });
  const cauHinh = docCauHinhLark();
  if (!cauHinh) return ketQua({ lyDo: `Chưa cấu hình Lark (thiếu ${bienMoiTruongConThieu().join(", ")}).` });

  try {
    const auth = await larkAuth(cauHinh.appId, cauHinh.appSecret);
    const h = { authorization: auth.authorization };
    const ds = (await (await fetch(`${HOST}/bitable/v1/apps/${cauHinh.baseToken}/tables?page_size=100`, { headers: h })).json()) as {
      code: number;
      data?: { items?: { table_id: string; name: string }[] };
    };
    const bang = ds.data?.items?.find((t) => MAU_TEN_BANG_HAU_KY.test(t.name));
    if (ds.code !== 0 || !bang) return ketQua({ chayThu: false, lyDo: "Không tìm thấy bảng Hậu Kỳ." });

    const cot = (await (
      await fetch(`${HOST}/bitable/v1/apps/${cauHinh.baseToken}/tables/${bang.table_id}/fields?page_size=200`, { headers: h })
    ).json()) as { code: number; data?: { items?: CotLark[] } };
    const tt = cot.data?.items?.find((c) => c.property?.options?.some((o) => o.id === MA_NEO_COT_TRANG_THAI));
    const luaChon = tt?.property?.options?.find((o) => o.id === ma);
    if (cot.code !== 0 || !tt || !luaChon) {
      return ketQua({ chayThu: false, lyDo: `Không tìm thấy cột Trạng Thái hoặc lựa chọn ${ma} trên bảng Hậu Kỳ.` });
    }

    const res = await fetch(`${HOST}/bitable/v1/apps/${cauHinh.baseToken}/tables/${bang.table_id}/records/${opts.recordId}`, {
      method: "PUT",
      headers: { ...h, "content-type": "application/json" },
      // ĐÚNG MỘT KHOÁ — cột khác của dòng Hậu Kỳ không thể bị chạm tới.
      body: JSON.stringify({ fields: { [tt.field_name]: luaChon.name } }),
    });
    const json = (await res.json()) as { code: number; msg?: string };
    if (json.code !== 0) return ketQua({ chayThu: false, lyDo: `Lark từ chối ghi: ${json.msg || json.code}` });
    return ketQua({ ghiDuoc: true, chayThu: false });
  } catch (err) {
    return ketQua({ chayThu: false, lyDo: `Không ghi được sang Lark: ${err instanceof Error ? err.message : String(err)}` });
  }
}
