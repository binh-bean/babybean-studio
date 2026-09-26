/**
 * Báo cáo "Hậu kỳ & cảnh báo" — reports:operations.
 *
 * OWNER: DEV-BE. Task BB-260.
 *
 * ---------------------------------------------------------------------------
 * Định nghĩa từng số
 * ---------------------------------------------------------------------------
 * - Giai đoạn Lark và màu cảnh báo: ảnh chụp NGAY LÚC XEM báo cáo (đọc cột
 *   `lark_trang_thai`/`lark_canh_bao` hiện tại của `galleries`), không giới
 *   hạn theo kỳ — đây là TRẠNG THÁI, không phải sự kiện.
 * - "Số vòng xin sửa": số dòng `revision_requests` có `created_at` rơi trong
 *   kỳ đang xem, của các bộ ảnh chưa bị loại (Fixture/archived).
 *
 * 11 giai đoạn chi tiết của `giaiDoanCua()` (src/lib/lark/trang-thai-hau-ky.ts)
 * được gộp thành 5 nhóm hiển thị theo đúng thứ tự chủ studio chốt: chỉnh /
 * duyệt / in / đã về / đã giao. Bộ chưa có dữ liệu Lark (giai đoạn null hoặc
 * "đã gửi file gốc") vào nhóm riêng "chưa vào hậu kỳ".
 */

import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao } from "../loai";
import { locBoAnhThat, GHI_CHU_LOAI_TRU } from "../loc-chung";
import { giaiDoanCua, mauCanhBao, type MauCanhBao } from "@/lib/lark/trang-thai-hau-ky";

const NHOM_GIAI_DOAN = ["Chưa vào hậu kỳ", "Chỉnh", "Duyệt", "In", "Đã về", "Đã giao"] as const;
type NhomGiaiDoan = (typeof NHOM_GIAI_DOAN)[number];

function nhomCuaGiaiDoan(gd: number | null): NhomGiaiDoan {
  if (gd === null || gd <= 1) return "Chưa vào hậu kỳ";
  if (gd <= 4) return "Chỉnh";
  if (gd <= 6) return "Duyệt";
  if (gd <= 8) return "In";
  if (gd === 9) return "Đã về";
  return "Đã giao";
}

const NHAN_MAU: Record<MauCanhBao | "khong-co", string> = {
  xanh: "Xanh (an toàn)",
  cam: "Cam (cảnh báo)",
  do: "Đỏ (nguy hiểm)",
  tim: "Tím (phải xong trong ngày)",
  "khong-co": "Chưa có cảnh báo",
};

interface HangGallery {
  id: string;
  branch_id: string;
  lark_trang_thai: string | null;
  lark_canh_bao: string | null;
}

interface HangRevision {
  id: string;
  created_at: string;
  galleries: { branch_id: string; title: string; status: string } | { branch_id: string; title: string; status: string }[] | null;
}

function motGallery(raw: HangRevision["galleries"]) {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

async function chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao> {
  let qGallery = ctx.client
    .from("galleries")
    .select("id, branch_id, lark_trang_thai, lark_canh_bao");
  qGallery = locBoAnhThat(qGallery);
  if (ctx.chiNhanhIds) qGallery = qGallery.in("branch_id", ctx.chiNhanhIds);

  // Không lọc chi nhánh bằng `.in("galleries.branch_id", …)` ở đây: PostgREST
  // không bảo đảm cú pháp lọc theo cột của bảng lồng qua mọi phiên bản. An
  // toàn hơn là lấy hết vòng xin sửa trong kỳ (số này nhỏ, không phải hàng
  // nghìn dòng) rồi tự lọc chi nhánh/Fixture/archived ở tầng JS bên dưới.
  const qRevision = ctx.client
    .from("revision_requests")
    .select("id, created_at, galleries!inner(branch_id, title, status)")
    .gte("created_at", ctx.tu.toISOString())
    .lt("created_at", ctx.den.toISOString());

  let qBranch = ctx.client.from("branches").select("id, name").order("name");
  if (ctx.chiNhanhIds) qBranch = qBranch.in("id", ctx.chiNhanhIds);

  const [{ data: galleryData, error: galleryErr }, { data: revisionData, error: revisionErr }, { data: branchData, error: branchErr }] =
    await Promise.all([qGallery, qRevision, qBranch]);
  if (galleryErr) throw galleryErr;
  if (revisionErr) throw revisionErr;
  if (branchErr) throw branchErr;

  const galleries = (galleryData ?? []) as HangGallery[];
  const tenChiNhanh = new Map<string, string>();
  for (const b of (branchData ?? []) as { id: string; name: string }[]) tenChiNhanh.set(b.id, b.name);

  // revision_requests.galleries!inner đã bảo đảm KHÔNG null, nhưng vẫn lọc lại
  // Fixture/archived ở tầng JS: PostgREST không cho `.not("embed.col", "ilike", …)`
  // đáng tin cậy trên inner join qua mọi phiên bản, nên lọc thủ công cho chắc.
  const chiNhanhChoPhep = ctx.chiNhanhIds ? new Set(ctx.chiNhanhIds) : null;
  const revisions = ((revisionData ?? []) as HangRevision[]).filter((r) => {
    const g = motGallery(r.galleries);
    if (!g) return false;
    if (g.status === "archived") return false;
    if (g.title.toLowerCase().startsWith("fixture")) return false;
    if (chiNhanhChoPhep && !chiNhanhChoPhep.has(g.branch_id)) return false;
    return true;
  });

  const demGiaiDoan = new Map<NhomGiaiDoan, number>();
  const demMau = new Map<string, number>();
  const demRevisionTheoChiNhanh = new Map<string, number>();
  const demGiaiDoanTheoChiNhanh = new Map<string, Map<NhomGiaiDoan, number>>();

  for (const g of galleries) {
    const nhom = nhomCuaGiaiDoan(giaiDoanCua(g.lark_trang_thai));
    demGiaiDoan.set(nhom, (demGiaiDoan.get(nhom) ?? 0) + 1);
    const mau = mauCanhBao(g.lark_canh_bao) ?? "khong-co";
    demMau.set(mau, (demMau.get(mau) ?? 0) + 1);

    if (!demGiaiDoanTheoChiNhanh.has(g.branch_id)) demGiaiDoanTheoChiNhanh.set(g.branch_id, new Map());
    const m = demGiaiDoanTheoChiNhanh.get(g.branch_id) as Map<NhomGiaiDoan, number>;
    m.set(nhom, (m.get(nhom) ?? 0) + 1);
  }

  for (const r of revisions) {
    const g = motGallery(r.galleries);
    if (!g) continue;
    demRevisionTheoChiNhanh.set(g.branch_id, (demRevisionTheoChiNhanh.get(g.branch_id) ?? 0) + 1);
  }

  const theSo = [
    ...NHOM_GIAI_DOAN.map((n) => ({ nhan: n, giaTri: demGiaiDoan.get(n) ?? 0, donVi: "bộ" })),
    { nhan: "Vòng xin sửa trong kỳ", giaTri: revisions.length, donVi: "vòng" },
  ];

  const bangDong = [...tenChiNhanh.entries()].map(([id, ten]) => {
    const m = demGiaiDoanTheoChiNhanh.get(id) ?? new Map<NhomGiaiDoan, number>();
    return [
      ten,
      ...NHOM_GIAI_DOAN.map((n) => m.get(n) ?? 0),
      demRevisionTheoChiNhanh.get(id) ?? 0,
    ];
  });

  return {
    theSo,
    bang: {
      cot: ["Chi nhánh", ...NHOM_GIAI_DOAN, "Vòng xin sửa"],
      dong: bangDong,
    },
    bieuDo: {
      loai: "cot",
      nhan: Object.keys(NHAN_MAU).map((k) => NHAN_MAU[k as MauCanhBao | "khong-co"]),
      chuoi: [
        {
          ten: "Số bộ theo cảnh báo",
          giaTri: Object.keys(NHAN_MAU).map((k) => demMau.get(k) ?? 0),
        },
      ],
    },
    ghiChu: [
      GHI_CHU_LOAI_TRU,
      "Giai đoạn hậu kỳ và màu cảnh báo là số tại THỜI ĐIỂM XEM báo cáo, không giới hạn theo kỳ lọc.",
    ],
  };
}

export const hauKyCanhBao: DinhNghiaBaoCao = {
  ma: "hau-ky-canh-bao",
  ten: "Hậu kỳ & cảnh báo",
  moTa: "Số bộ theo giai đoạn hậu kỳ Lark, theo màu cảnh báo, và số vòng xin sửa trong kỳ.",
  nhom: "van-hanh",
  quyen: "reports:operations",
  boLoc: {},
  chay,
};
