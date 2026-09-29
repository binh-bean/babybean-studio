/**
 * BB-325 — tìm bộ ảnh ĐÃ CÓ trong app theo thư mục Drive hoặc theo dòng Hậu Kỳ
 * Lark, kèm tên hiển thị để thuật sĩ nói rõ "đã gắn với bộ nào" và cho mở bộ đó
 * (trước đây chỉ chặn bằng một câu "đã được gắn với một bộ ảnh khác", không
 * nói bộ nào — yêu cầu "tạo bộ ảnh", ảnh giá ảnh in thêm.JPG).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { tinhTieuDeBoAnhQuanTri, dongThongTinBoAnhQuanTri } from "@/lib/utils/dinh-dang";

export interface BoAnhDaCo {
  id: string;
  tieuDe: string;
  thongTin: string;
  status: string;
  /** true = bộ đã neo vào một dòng Hậu Kỳ bên Lark. */
  tuLark: boolean;
  branchName: string | null;
}

type Dong = {
  id: string;
  title: string;
  status: string;
  lark_hauky_record_id: string | null;
  lark_contract_code: string | null;
  customers: { full_name: string | null; phone: string | null } | null;
  babies: { full_name: string | null; nickname: string | null } | null;
  packages: { name: string | null } | null;
  branches: { name: string | null } | null;
};

const CHON =
  "id, title, status, lark_hauky_record_id, lark_contract_code, customers(full_name, phone), babies(full_name, nickname), packages(name), branches(name)";

function doiDong(d: Dong): BoAnhDaCo {
  const { tieuDe } = tinhTieuDeBoAnhQuanTri({
    babyNickname: d.babies?.nickname,
    babyFullName: d.babies?.full_name,
    customerName: d.customers?.full_name,
    duPhong: d.title,
  });
  return {
    id: d.id,
    tieuDe,
    thongTin: dongThongTinBoAnhQuanTri({
      tieuDe,
      babyNickname: d.babies?.nickname,
      babyFullName: d.babies?.full_name,
      customerPhone: d.customers?.phone,
      maHoaDon: d.lark_contract_code,
      packageName: d.packages?.name,
    }),
    status: d.status,
    tuLark: !!d.lark_hauky_record_id,
    branchName: d.branches?.name ?? null,
  };
}

/** Bộ ảnh đang dùng thư mục Drive này (bỏ qua bộ đã lưu trữ — cùng luật unique). */
export async function boAnhTheoThuMuc(admin: SupabaseClient, driveFolderId: string): Promise<BoAnhDaCo | null> {
  const { data } = await admin
    .from("galleries")
    .select(CHON)
    .eq("drive_folder_id", driveFolderId)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  return data ? doiDong(data as unknown as Dong) : null;
}

/** Bộ ảnh đã neo vào dòng Hậu Kỳ này. */
export async function boAnhTheoDongLark(admin: SupabaseClient, recordId: string): Promise<BoAnhDaCo | null> {
  const { data } = await admin
    .from("galleries")
    .select(CHON)
    .eq("lark_hauky_record_id", recordId)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  return data ? doiDong(data as unknown as Dong) : null;
}
