/**
 * BB-331 — "Kích thước đang bán" (màn Cài đặt, chỉ đọc).
 *
 * Bày ĐỦ mọi kích thước của sản phẩm in ấn đang kinh doanh (ảnh in, album,
 * khung — không canvas, `sanPhamBanChoKhach`), đồng bộ từ danh mục Lark, kèm
 * trạng thái: khách đã thấy trên màn chọn, hay đang ẩn vì chưa đủ mẫu giá /
 * chưa có giá (luật giá BB-335, xem `src/lib/products/kich-thuoc-dang-ban.ts`).
 *
 * Server component: đọc `products` bằng phiên nhân viên (RLS products_select) — trang đã kiểm
 * quyền `settings:system` trước khi dựng.
 */
import { createServerClient } from "@/lib/supabase/server";
import { nhomSanPham, sanPhamBanChoKhach, TEN_NHOM, THU_TU_NHOM, type NhomSanPham } from "@/lib/products/nhom-san-pham";
import { khoaXepKichThuoc, trangThaiKichThuoc, type TrangThaiKichThuoc } from "@/lib/products/kich-thuoc-dang-ban";

/** BB-335 — câu anh chốt cho kích thước chưa có giá. */
export const CHU_CHUA_CO_GIA = "Chưa có giá — nhập giá bên Lark rồi đồng bộ";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { CARD_TITLE_CLASS } from "./page-header";

interface Dong {
  id: string;
  material: string;
  size: string;
  listPrice: number | null;
  priceSamples: number;
  trangThai: TrangThaiKichThuoc;
}

export async function DanhMucKichThuoc() {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, kind, material, size, list_price, price_confidence, price_samples, is_active")
    .eq("is_active", true)
    .not("size", "is", null);
  if (error) {
    return <p className="text-sm text-[var(--bb-danger)]">Không đọc được danh mục sản phẩm.</p>;
  }

  const theoNhom = new Map<NhomSanPham, Map<string, Dong[]>>();
  let tong = 0;
  let khachThay = 0;
  for (const p of data ?? []) {
    const name = String(p.name ?? "");
    if (/^(Fixture|TEST) /.test(name)) continue;
    const sp = { isActive: !!p.is_active, kind: p.kind as string | null, material: p.material as string | null };
    if (!sanPhamBanChoKhach(sp)) continue;
    const nhom = nhomSanPham(sp.kind, sp.material);
    if (!nhom) continue;
    const trangThai = trangThaiKichThuoc({
      listPrice: p.list_price === null ? null : Number(p.list_price),
      priceConfidence: p.price_confidence === null ? null : Number(p.price_confidence),
      priceSamples: p.price_samples === null ? null : Number(p.price_samples),
    });
    const dong: Dong = {
      id: String(p.id),
      material: String(p.material ?? "—"),
      size: String(p.size),
      listPrice: p.list_price === null ? null : Number(p.list_price),
      priceSamples: Number(p.price_samples ?? 0),
      trangThai,
    };
    tong += 1;
    if (trangThai === "khach_thay") khachThay += 1;
    const m = theoNhom.get(nhom) ?? new Map<string, Dong[]>();
    m.set(dong.material, [...(m.get(dong.material) ?? []), dong]);
    theoNhom.set(nhom, m);
  }

  return (
    <section data-testid="danh-muc-kich-thuoc" className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] p-5">
      <h2 className={CARD_TITLE_CLASS}>Kích thước đang bán</h2>
      <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
        Mọi kích thước của ảnh in, album và khung đang kinh doanh, đồng bộ từ danh mục Lark. Khách thấy{" "}
        <strong className="text-[var(--bb-fg)]">{khachThay}</strong>/{tong} kích thước. Kích thước có giá bên Lark
        (cột Giá Bán, hoặc đã bán ít nhất 1 lần) đều hiện cho khách; kích thước chưa có giá thì ẩn.
      </p>
      <div className="mt-4 flex flex-col gap-5">
        {THU_TU_NHOM.filter((n) => theoNhom.has(n)).map((nhom) => (
          <div key={nhom}>
            <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--bb-fg-muted)]">{TEN_NHOM[nhom]}</h3>
            <BangChatLieu theoChatLieu={[...theoNhom.get(nhom)!.entries()]} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Trình bày thuần một nhóm sản phẩm: mỗi dòng một chất liệu, kèm các kích
 * thước. Dữ liệu do `DanhMucKichThuoc` ở trên đọc từ `products` rồi truyền
 * xuống qua props (BB-336: tách để verify:wired thấy danh sách có nguồn).
 */
function BangChatLieu({ theoChatLieu }: { theoChatLieu: [string, Dong[]][] }) {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {theoChatLieu
        .sort(([a], [b]) => a.localeCompare(b, "vi"))
        .map(([material, dongs]) => (
          <li key={material} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
            <span className="w-40 shrink-0 text-sm font-medium text-[var(--bb-fg)]">{material}</span>
            <span className="flex flex-wrap gap-1.5">
              {dongs
                .sort((a, b) => {
                  const [a1, a2] = khoaXepKichThuoc(a.size);
                  const [b1, b2] = khoaXepKichThuoc(b.size);
                  return a1 - b1 || a2 - b2;
                })
                .map((d) => (
                  <span
                    key={d.id}
                    data-trang-thai={d.trangThai}
                    title={
                      d.trangThai === "khach_thay"
                        ? `Khách thấy · ${formatCurrencyVND(d.listPrice ?? 0)}`
                        : `Đang ẩn với khách. ${CHU_CHUA_CO_GIA}`
                    }
                    className={
                      d.trangThai === "khach_thay"
                        ? "rounded-full border border-[var(--bb-border)] px-2.5 py-0.5 text-xs tabular-nums text-[var(--bb-fg)]"
                        : "rounded-full border border-dashed border-[var(--bb-border)] px-2.5 py-0.5 text-xs tabular-nums text-[var(--bb-fg-muted)]"
                    }
                  >
                    {d.size.replace(/x/i, "×")}
                    {d.trangThai !== "khach_thay" && (
                      <span className="ml-1">· {CHU_CHUA_CO_GIA}</span>
                    )}
                  </span>
                ))}
            </span>
          </li>
        ))}
    </ul>
  );
}
