/**
 * GET /api/admin/galleries/[id]/anh-chinh-sua — ảnh chỉnh sửa của một bộ ảnh cho nhân viên (BB-371).
 *
 * Trả: từng tấm ảnh chỉnh (ghép ảnh gốc theo tên), tấm nào CHƯA gửi khách
 * (mới về sau lần "Gửi khách duyệt" gần nhất), và các vòng khách xin sửa với
 * đủ chi tiết từng tấm: ghi chú, vùng khoanh, ảnh mẫu (qua route cùng origin `anh-mau` —
 * bucket riêng tư, không bao giờ trả đường công khai).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { xetQuyenXemBoAnh, CAU_CHAN_BO_ANH } from "@/lib/auth/quyen-xem-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { laAnhChuaGui, chuanHoaVung, TRANG_THAI_GUI_DUOC } from "@/lib/anh-chinh-sua/nhan-dien";
import { canhBaoKhachChuaXem } from "@/lib/anh-chinh-sua/vong-duyet";
import { maLarkConHieuLuc } from "@/lib/gallery-status";
import { giaiDoanCua } from "@/lib/lark/trang-thai-hau-ky";
import {
  coBangChiTiet,
  laDuongDanAnhMau,
  docBoiCanhAnhChinh,
  docChiTietVong,
  docVongSua,
  khachThayTrongBoiCanh,
} from "@/lib/anh-chinh-sua/du-lieu";
import {
  KHOA_TRONG_GOI,
  gomTheoDot,
  guiDuocDotMuaThem,
  laKhoaMuaThem,
  mocGuiCuaKhoa,
  nhanCuaKhoa,
  trangThaiDuyetDot,
  trangThaiDuyetTrongGoi,
} from "@/lib/anh-chinh-sua/theo-dot";
import { tamDuyetConHieuLuc } from "@/lib/anh-chinh-sua/duyet-tung-tam";
import { docDuyetTam } from "@/lib/anh-chinh-sua/duyet-tam-du-lieu";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status, editor_id, lark_trang_thai, lark_trang_thai_tu, reopened_at")
      .eq("id", galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    // BB-383 — cùng luật với màn chi tiết (BB-382): xem được màn thì API trả được, và ngược lại.
    const lyDoChan = xetQuyenXemBoAnh(staff, gallery as { branch_id: string; editor_id: string | null });
    if (lyDoChan) return fail("FORBIDDEN", CAU_CHAN_BO_ANH[lyDoChan].tieuDe);

    const [bc, vong, chiTiet, coBang, dongDuyet] = await Promise.all([
      docBoiCanhAnhChinh(admin, galleryId),
      docVongSua(admin, galleryId, false),
      docChiTietVong(admin, galleryId),
      coBangChiTiet(admin),
      // BB-401 vòng 2 — tấm khách đã bấm "Duyệt tấm này" (0108); null = chưa áp.
      docDuyetTam(admin, galleryId),
    ]);
    const theoDot = bc.mocDot !== null;
    const guiLuc = bc.mocChung;
    const gocTheoId = new Map(bc.goc.map((g) => [g.id, g]));
    const tenTheoId = new Map<string, string>([
      ...bc.anhChinh.map((a) => [a.id, a.file_name] as [string, string]),
      ...bc.goc.map((g) => [g.id, g.file_name] as [string, string]),
    ]);

    // BB-401 vòng 3 — ảnh mẫu đi qua route cùng origin (xét quyền lại mỗi lần xem): URL ký của
    // Storage bị CSP `img-src` chặn nên trước đây ảnh không bao giờ hiện trên màn quản trị.
    const urlAnhMau = (p: string) =>
      `/api/admin/galleries/${galleryId}/anh-chinh-sua/anh-mau?p=${encodeURIComponent(p)}`;

    const anh = bc.anhChinh.map((a) => {
      const g = gocTheoId.get(bc.gocCua.get(a.id) ?? "");
      const khoa = bc.khoaCua.get(a.id) ?? KHOA_TRONG_GOI;
      return {
        id: a.id,
        fileName: a.file_name,
        width: a.width,
        height: a.height,
        taoLuc: a.created_at,
        khoa,
        // BB-377 — ảnh mua thêm theo mốc gửi của ĐÚNG đợt nó (đã áp 0095).
        chuaGui: laAnhChuaGui(mocGuiCuaKhoa(khoa, guiLuc, bc.mocDot), a.created_at),
        goc: g ? { id: g.id, fileName: g.file_name } : null,
      };
    });

    // Đợt của một vòng sửa: `dot_khoa` (0095); chưa áp thì suy từ tấm đầu tiên.
    const khoaCuaVong = (v: { id: string; dot_khoa: string | null }) => {
      if (v.dot_khoa) return v.dot_khoa;
      const muc = chiTiet.find((c) => c.revision_request_id === v.id);
      return (muc && bc.khoaCua.get(muc.photo_id)) || KHOA_TRONG_GOI;
    };

    const coTheGuiTrongGoi = (soAnh: number, soChuaGui: number) =>
      soAnh > 0 &&
      (TRANG_THAI_GUI_DUOC as readonly string[]).includes(gallery.status) &&
      (gallery.status !== "awaiting_approval" || soChuaGui > 0);

    const nhom = gomTheoDot(anh, bc.nhom).map((g) => {
      const soChuaGui = g.anh.filter((a) => a.chuaGui).length;
      const vongMo = vong.some((v) => v.resolved_at === null && khoaCuaVong(v) === g.khoa);
      const laMuaThem = theoDot && laKhoaMuaThem(g.khoa);
      const trangThai = laMuaThem
        ? trangThaiDuyetDot(bc.mocDot!.get(g.khoa), vongMo)
        : trangThaiDuyetTrongGoi(gallery.status, vongMo);
      return {
        khoa: g.khoa,
        nhan: g.nhan,
        deXuatBoi: g.deXuatBoi,
        soAnh: g.anh.length,
        soChuaGui,
        trangThai,
        guiLuc: laMuaThem ? (bc.mocDot!.get(g.khoa)?.guiLuc ?? null) : guiLuc,
        duyetLuc: laMuaThem ? (bc.mocDot!.get(g.khoa)?.duyetLuc ?? null) : null,
        coTheGui: laMuaThem
          ? guiDuocDotMuaThem({ trangThaiBo: gallery.status, soAnh: g.anh.length, soChuaGui, trangThai })
          : null,
      };
    });
    // Vòng TRONG GÓI (nút gửi cũ): tấm trong gói khi đã áp 0095, mọi tấm khi chưa.
    const anhVongChung = theoDot ? anh.filter((a) => !laKhoaMuaThem(a.khoa)) : anh;
    const soChuaGui = anhVongChung.filter((a) => a.chuaGui).length;
    // BB-384 — bộ ở bước khách duyệt (app, hoặc Lark "Đã gửi duyệt") mà khách KHÔNG thấy
    // tấm ảnh chỉnh trong gói nào: màn quản trị cảnh báo (khách đang thấy "Bean đang chuẩn bị").
    const idChung = new Set(anhVongChung.map((a) => a.id));
    const soAnhKhachThay = bc.anhChinh.filter(
      (a) => idChung.has(a.id) && khachThayTrongBoiCanh(bc, gallery.status, a),
    ).length;
    const canhBao = canhBaoKhachChuaXem({
      status: gallery.status,
      giaiDoan: giaiDoanCua(maLarkConHieuLuc(gallery)),
      soAnhKhachThay,
    });

    // BB-401 vòng 2 — "Khách đã duyệt n/N tấm": N = ảnh chỉnh đã gửi khách; n = dấu duyệt bấm
    // sau mốc gửi gần nhất của vòng tấm đó (gửi lại sau khi sửa thì khách duyệt lại từ đầu).
    const daGui = anh.filter((a) => !a.chuaGui);
    const idDaGui = new Set(daGui.map((a) => a.id));
    const khoaTheoId = new Map(anh.map((a) => [a.id, a.khoa]));
    const duyetTam =
      dongDuyet === null
        ? null
        : (() => {
            const conHieuLuc = tamDuyetConHieuLuc(dongDuyet, (id) =>
              idDaGui.has(id) ? mocGuiCuaKhoa(khoaTheoId.get(id) ?? KHOA_TRONG_GOI, guiLuc, bc.mocDot) : null,
            );
            return {
              tong: daGui.length,
              daDuyet: dongDuyet
                .filter((d) => conHieuLuc.has(d.photo_id))
                .map((d) => ({
                  photoId: d.photo_id,
                  fileName: tenTheoId.get(d.photo_id) ?? "",
                  nhan: nhanCuaKhoa(khoaTheoId.get(d.photo_id) ?? KHOA_TRONG_GOI, bc.nhom),
                  duyetLuc: d.duyet_luc,
                }))
                .sort((a, b) => a.fileName.localeCompare(b.fileName)),
            };
          })();

    return ok({
      trangThai: gallery.status,
      guiLuc,
      duyetTam,
      anh,
      soChuaGui,
      coTheGui: coTheGuiTrongGoi(anhVongChung.length, soChuaGui),
      theoDot,
      nhom,
      vongSua: vong.map((v) => {
        const khoa = khoaCuaVong(v);
        return {
          round: v.round,
          note: v.note,
          createdAt: v.created_at,
          resolved: v.resolved_at !== null,
          khoa,
          nhan: nhanCuaKhoa(khoa, bc.nhom),
          deXuatBoi: bc.nhom.find((n) => n.khoa === khoa)?.deXuatBoi ?? null,
          items: chiTiet
            .filter((c) => c.revision_request_id === v.id)
            .map((c) => {
              const khoaTam = bc.khoaCua.get(c.photo_id) ?? KHOA_TRONG_GOI;
              return {
                photoId: c.photo_id,
                fileName: tenTheoId.get(c.photo_id) ?? "",
                gocId: c.original_photo_id,
                nhan: nhanCuaKhoa(khoaTam, bc.nhom),
                deXuatBoi: bc.nhom.find((n) => n.khoa === khoaTam)?.deXuatBoi ?? null,
                note: c.note,
                marks: chuanHoaVung(c.marks),
                anhMau: (c.reference_paths ?? []).filter((p) => laDuongDanAnhMau(p, galleryId)).map(urlAnhMau),
              };
            }),
        };
      }),
      tinhNang: { chiTiet: coBang, theoDot },
      soAnhKhachThay,
      canhBao,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
