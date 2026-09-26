/**
 * GET /api/admin/galleries/:id/export — danh sách ảnh khách đã chọn.
 *
 * OWNER: DEV-BE. Task BB-067.
 *
 * ---------------------------------------------------------------------------
 * Quyền `galleries:export` đã có từ lâu, và nó không mở được gì
 * ---------------------------------------------------------------------------
 * Rà soát ngày 22/09/2026: quyền `galleries:export` ("Xuất danh sách ảnh") nằm
 * trong danh mục quyền và được cấp cho sáu vai; `docs/04` mục 4.1 mô tả đường
 * `GET /galleries/:id/export?format=lightroom`; `src/i18n` có sẵn cả một cụm
 * chữ — tiêu đề, ba định dạng, nút sao chép. **Nhưng không có route, không có
 * nút, không có gì.** Một cái quyền không mở ra cửa nào, và một màn hình chỉ
 * tồn tại trong tệp dịch.
 *
 * Người thật cần nó: thợ chỉnh ảnh làm việc theo TÊN FILE. Không có đường này
 * thì CSKH đọc tên từng tấm trên màn hình rồi gõ tay sang chỗ khác — và gõ nhầm
 * một ký tự là chỉnh nhầm ảnh.
 *
 * ---------------------------------------------------------------------------
 * Chỉ ảnh khách CHÍNH đã chọn — không lấy ảnh người thân gợi ý
 * ---------------------------------------------------------------------------
 * Một bộ ảnh có thể có nhiều lượt chọn: link của khách chính (`is_primary`) và
 * link của bà, của dì (vai `suggester`). Ảnh người thân đánh dấu nằm ở
 * `mark = 'suggested'` trong lượt chọn RIÊNG của họ.
 *
 * Xuất nhầm những tấm đó nghĩa là thợ chỉnh ảnh làm thừa hàng chục tấm không
 * ai đặt, và studio tính tiền những tấm khách không chọn. Nên ở đây khoá chặt
 * hai vế: đúng lượt chọn chính, và đúng `mark = 'selected'`.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Bọc một ô CSV.
 *
 * Ghi chú của khách viết tự do: dấu phẩy, dấu nháy, xuống dòng đều có thể có.
 * Không bọc thì một dấu phẩy trong ghi chú đẩy cả dòng lệch cột, và người mở
 * bảng tính đọc sai ghi chú sang tấm ảnh bên cạnh.
 *
 * Dấu `=`, `+`, `-`, `@` đứng đầu ô bị Excel hiểu là CÔNG THỨC. Đó là đường
 * chèn mã quen thuộc (CSV injection): khách gõ `=HYPERLINK(...)` vào ghi chú
 * thì máy của nhân viên là nơi nó chạy. Thêm dấu nháy đơn ở đầu để Excel coi
 * là chữ.
 */
function oCsv(giaTri: string | null | undefined): string {
  const s = String(giaTri ?? "");
  const antoan = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${antoan.replace(/"/g, '""')}"`;
}

interface DongAnh {
  file_name: string;
  retouch_note: string | null;
  is_favorite: boolean | null;
  order_index: number | null;
  sort_index: number | null;
  subfolder: string | null;
  selection_item_id?: string;
  photo_id?: string;
}

/** Một dòng ngày giờ kiểu VN, cho phần đầu tệp chi tiết — không phải ISO. */
function ngayVi(iso: string | null): string {
  if (!iso) return "(chưa chốt)";
  return new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

/**
 * Dạng xuất "chi-tiet" — BB-214(b), lời chủ studio: "CSKH tải file text mã
 * chọn và note chi tiết từng ảnh khách note hoặc ảnh chọn in là gì".
 *
 * Khác hai dạng cũ ở chỗ: mỗi ảnh không chỉ có tên file + ghi chú chỉnh sửa,
 * mà còn liệt kê ảnh đó đang được DÙNG CHO sản phẩm nào, gom từ ba nguồn:
 *
 *   1. Suất trong gói  — selection_placements -> gallery_items -> products
 *      (album/khung/ảnh phóng đã có sẵn trong hợp đồng, khách gắn ảnh vào).
 *   2. Sản phẩm mua thêm gắn thẳng vào MỘT ảnh — selection_addons.photo_id.
 *   3. Album mua thêm, ảnh gộp nhiều tấm — selection_addon_photos, nối qua
 *      addon_id sang selection_addons.product_id.
 *
 * Ba nguồn không loại trừ nhau: một tấm có thể vừa nằm trong suất của gói,
 * vừa được đưa thêm vào một album mua thêm.
 */
async function xuatChiTiet(
  admin: SupabaseClient,
  ctx: {
    gallery: { id: string; title: string | null; customer_id: string | null; baby_id: string | null };
    luotChon: { id: string; general_note: string | null; submitted_at: string | null; submitted_by_name: string | null };
    dong: DongAnh[];
    /** BB-202 — tên (các) album mà mỗi ảnh (theo photo_id) đang làm bìa. */
    tenAlbumBiaTheoAnh: Map<string, string[]>;
  },
): Promise<string> {
  const { gallery, luotChon, dong, tenAlbumBiaTheoAnh } = ctx;
  const itemIds = dong.map((d) => d.selection_item_id).filter((v): v is string => Boolean(v));
  const photoIds = dong.map((d) => d.photo_id).filter((v): v is string => Boolean(v));

  const [khachRes, beRes, datGoiRes, muaThemAnhRes, albumAnhRes] = await Promise.all([
    gallery.customer_id
      ? admin.from("customers").select("full_name").eq("id", gallery.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    gallery.baby_id
      ? admin.from("babies").select("full_name").eq("id", gallery.baby_id).maybeSingle()
      : Promise.resolve({ data: null }),
    itemIds.length
      ? admin
          .from("selection_placements")
          .select("selection_item_id, gallery_items(products(name))")
          .in("selection_item_id", itemIds)
      : Promise.resolve({ data: [] }),
    photoIds.length
      ? admin
          .from("selection_addons")
          .select("photo_id, quantity, products(name)")
          .eq("selection_id", luotChon.id)
          .in("photo_id", photoIds)
      : Promise.resolve({ data: [] }),
    itemIds.length
      ? admin
          .from("selection_addon_photos")
          .select("selection_item_id, selection_addons(products(name))")
          .in("selection_item_id", itemIds)
      : Promise.resolve({ data: [] }),
  ]);

  const tenSanPhamTheoItem = new Map<string, string[]>();
  const themVao = (id: string | null | undefined, ten: string | null | undefined) => {
    if (!id || !ten) return;
    const ds = tenSanPhamTheoItem.get(id) ?? [];
    ds.push(ten);
    tenSanPhamTheoItem.set(id, ds);
  };

  for (const r of (datGoiRes.data ?? []) as unknown as {
    selection_item_id: string;
    gallery_items?: { products?: { name?: string } | null } | null;
  }[]) {
    themVao(r.selection_item_id, r.gallery_items?.products?.name);
  }

  const tenSanPhamTheoAnh = new Map<string, string[]>();
  for (const r of (muaThemAnhRes.data ?? []) as unknown as {
    photo_id: string;
    quantity?: number;
    products?: { name?: string } | null;
  }[]) {
    const ten = r.products?.name;
    if (!ten) continue;
    const nhan = r.quantity && r.quantity > 1 ? `${ten} (mua thêm x${r.quantity})` : `${ten} (mua thêm)`;
    const ds = tenSanPhamTheoAnh.get(r.photo_id) ?? [];
    ds.push(nhan);
    tenSanPhamTheoAnh.set(r.photo_id, ds);
  }

  for (const r of (albumAnhRes.data ?? []) as unknown as {
    selection_item_id: string;
    selection_addons?: { products?: { name?: string } | null } | null;
  }[]) {
    const ten = r.selection_addons?.products?.name;
    themVao(r.selection_item_id, ten ? `${ten} (album mua thêm)` : null);
  }

  const dongViet: string[] = [];
  dongViet.push(`Bộ ảnh: ${gallery.title ?? "(chưa đặt tên)"}`);
  dongViet.push(`Khách: ${(khachRes.data as { full_name?: string } | null)?.full_name ?? "(chưa rõ)"}`);
  const tenBe = (beRes.data as { full_name?: string } | null)?.full_name;
  if (tenBe) dongViet.push(`Bé: ${tenBe}`);
  dongViet.push(`Ngày chốt: ${ngayVi(luotChon.submitted_at)}`);
  dongViet.push(`Người xác nhận: ${luotChon.submitted_by_name ?? "(chưa rõ)"}`);
  if (luotChon.general_note) dongViet.push(`Ghi chú chung: ${luotChon.general_note}`);
  dongViet.push(`Số ảnh đã chọn: ${dong.length}`);
  dongViet.push("");
  dongViet.push("=".repeat(60));
  dongViet.push("");

  for (const d of dong) {
    dongViet.push(d.file_name);
    dongViet.push(`  Ghi chú chỉnh sửa: ${d.retouch_note ?? "(không có)"}`);
    const dungCho = [
      ...(d.selection_item_id ? tenSanPhamTheoItem.get(d.selection_item_id) ?? [] : []),
      ...(d.photo_id ? tenSanPhamTheoAnh.get(d.photo_id) ?? [] : []),
      // BB-202: liệt kê riêng "bìa" — CSKH/thợ chỉnh ảnh phải biết đây là ảnh
      // ĐẠI DIỆN cả cuốn, không chỉ là một tấm ruột thường.
      ...(d.photo_id ? (tenAlbumBiaTheoAnh.get(d.photo_id) ?? []).map((t) => `${t} (BÌA)`) : []),
    ];
    dongViet.push(`  Dùng cho: ${dungCho.length ? dungCho.join(", ") : "(chưa gắn sản phẩm nào)"}`);
    dongViet.push("");
  }

  return dongViet.join("\r\n");
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:export");

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const formatParam = new URL(request.url).searchParams.get("format");
    const dinhDang =
      formatParam === "csv" ? "csv" : formatParam === "chi-tiet" ? "chi-tiet" : "txt";
    const admin = createAdminClient();

    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, title, status, customer_id, baby_id")
      .eq("id", galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, String(gallery.branch_id));

    const { data: luotChon } = await admin
      .from("selections")
      .select("id, general_note, submitted_at, submitted_by_name")
      .eq("gallery_id", galleryId)
      .eq("is_primary", true)
      .maybeSingle();

    if (!luotChon) {
      return fail("INVALID_INPUT", "Bộ ảnh chưa có lượt chọn nào của khách chính");
    }

    const { data, error } = await admin
      .from("selection_items")
      .select(
        "id, photo_id, order_index, retouch_note, is_favorite, photos(file_name, sort_index, subfolder)",
      )
      .eq("selection_id", luotChon.id)
      .eq("mark", "selected");
    if (error) throw error;

    /**
     * Sắp theo thứ tự ảnh trong thư mục, không theo thứ tự khách bấm.
     *
     * Thợ chỉnh ảnh mở thư mục Drive ra và đi từ trên xuống. Danh sách sắp
     * theo thứ tự bấm thì họ phải nhảy tới nhảy lui giữa 300 tấm.
     */
    /*
      BB-202 — "bìa album" cho mỗi ảnh: tên (các) album mà tấm này đang làm
      bìa, nếu có. Bảng `album_covers` có thể CHƯA TỒN TẠI (migration 0075
      chưa áp) — bắt lỗi 42P01 và coi như không có bìa nào, không làm hỏng cả
      lượt xuất tệp.
    */
    const tenAlbumBiaTheoAnh = new Map<string, string[]>();
    try {
      const { data: covers, error: coversErr } = await admin
        .from("album_covers")
        .select("selection_item_id, gallery_items(products(name))")
        .eq("gallery_id", galleryId);
      if (!coversErr && covers && covers.length > 0) {
        const selItemIds = covers.map((c) => c.selection_item_id);
        const { data: sis } = await admin
          .from("selection_items")
          .select("id, photo_id")
          .in("id", selItemIds);
        const photoIdBySelItem = new Map((sis ?? []).map((s) => [s.id, s.photo_id as string]));
        for (const c of covers as unknown as {
          selection_item_id: string;
          gallery_items?: { products?: { name?: string } | null } | null;
        }[]) {
          const photoId = photoIdBySelItem.get(c.selection_item_id);
          const ten = c.gallery_items?.products?.name;
          if (!photoId || !ten) continue;
          const ds = tenAlbumBiaTheoAnh.get(photoId) ?? [];
          ds.push(ten);
          tenAlbumBiaTheoAnh.set(photoId, ds);
        }
      }
    } catch {
      // Bảng chưa áp — coi như không có bìa nào, không chặn xuất tệp.
    }

    const dong: DongAnh[] = (data ?? [])
      .map((d) => {
        const p = (d as { photos?: unknown }).photos as
          | { file_name?: string; sort_index?: number; subfolder?: string }
          | null;
        return {
          file_name: String(p?.file_name ?? ""),
          retouch_note: (d as { retouch_note?: string | null }).retouch_note ?? null,
          is_favorite: (d as { is_favorite?: boolean | null }).is_favorite ?? null,
          order_index: (d as { order_index?: number | null }).order_index ?? null,
          sort_index: p?.sort_index ?? null,
          subfolder: p?.subfolder ?? null,
          selection_item_id: (d as { id?: string }).id,
          photo_id: (d as { photo_id?: string }).photo_id,
        };
      })
      .filter((d) => d.file_name !== "")
      // Hai ảnh trùng sort_index (ảnh ở hai thư mục con khác nhau, hoặc đồng
      // bộ lại giữa chừng) thì xếp tiếp theo tên file. Thiếu vế này thì thứ
      // tự do cơ sở dữ liệu trả về — tệp CSKH tải hai lần ra hai thứ tự khác
      // nhau, và phép thử BB-214b đỏ lúc có lúc không (soát khi gộp 24/09).
      .sort(
        (a, b) =>
          (a.sort_index ?? 0) - (b.sort_index ?? 0) ||
          a.file_name.localeCompare(b.file_name, "vi", { numeric: true }),
      );

    let than: string;

    if (dinhDang === "chi-tiet") {
      than = await xuatChiTiet(admin, { gallery, luotChon, dong, tenAlbumBiaTheoAnh });
    } else if (dinhDang === "csv") {
      than = [
        // BB-202: cột "bia_album" — tên (các) album mà ảnh này đang làm bìa,
        // rỗng nếu ảnh không phải bìa của album nào.
        ["ten_file", "thu_muc_con", "ghi_chu_chinh_sua", "yeu_thich", "bia_album"].join(","),
        ...dong.map((d) =>
          [
            oCsv(d.file_name),
            oCsv(d.subfolder),
            oCsv(d.retouch_note),
            oCsv(d.is_favorite ? "x" : ""),
            oCsv((d.photo_id && tenAlbumBiaTheoAnh.get(d.photo_id)?.join(" + ")) || ""),
          ].join(","),
        ),
        // Ghi chú chung của khách đi kèm, nếu có: nó là lời dặn cho CẢ bộ,
        // mất nó thì thợ chỉnh ảnh không biết gia đình muốn tông màu nào.
        ...(luotChon.general_note
          ? ["", oCsv("Ghi chú chung của khách") + "," + oCsv(luotChon.general_note)]
          : []),
      ].join("\r\n");
    } else {
      than = dong.map((d) => d.file_name).join("\r\n");
    }

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: String(gallery.branch_id),
      action: "gallery.export",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { dinhDang, soAnh: dong.length },
    });

    /**
     * Tên tệp KHÔNG mang tên khách.
     *
     * Tệp này rơi vào thư mục Tải xuống của máy chung ở studio, và tên tệp thì
     * hiện ra ở mọi cửa sổ chọn file. Mã bộ ảnh là đủ để tra ngược.
     */
    const duoiTep = dinhDang === "csv" ? "csv" : "txt";
    const hauTo = dinhDang === "chi-tiet" ? "-chi-tiet" : "";
    const tenTep = `bo-anh-${galleryId.slice(0, 8)}${hauTo}.${duoiTep}`;

    return new Response(than, {
      status: 200,
      headers: {
        "Content-Type":
          dinhDang === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${tenTep}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
