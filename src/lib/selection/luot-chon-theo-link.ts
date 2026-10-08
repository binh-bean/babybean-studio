/**
 * Lượt chọn của cặp (link, bộ ảnh) — có thì lấy, chưa có thì tạo.
 *
 * OWNER: DEV-BE. Tách từ `src/app/api/g/buoi-chup/route.ts` (BB-130) ở BB-334A
 * để `/api/g/*` (qua `requirePhienBoAnh`) và `/api/g/buoi-chup` dùng CHUNG một
 * luật — hai bản chép tay là hai luật trôi khỏi nhau.
 *
 * MỘT lượt chọn cho mỗi CẶP, không phải mỗi link (0040 nới
 * `uq_selections_share_link` thành `(share_link_id, gallery_id)`). Tạo lúc ba mẹ
 * mở bộ ảnh chứ không phải lúc tạo link: một khách có mười buổi chụp mà chỉ mở
 * hai thì tám lượt chọn rỗng kia chỉ làm báo cáo đếm nhầm.
 *
 * ---------------------------------------------------------------------------
 * BB-334A — link GIA ĐÌNH (owner) DÙNG CHUNG lượt chọn chính của bộ ảnh
 * ---------------------------------------------------------------------------
 * Anh chốt 30/09: link cũ theo từng bộ CHẠY MÃI. Khách cũ nhận link gia đình
 * khi có bộ mới — nghĩa là bộ CŨ của họ đã có lượt chọn CHÍNH (`is_primary`)
 * nằm trên link cũ. Nếu link gia đình tạo lượt chọn thứ hai thì:
 *   - `uq_selections_primary` không cho nó là lượt chính → ba mẹ chọn/chốt qua
 *     link gia đình mà màn quản trị (export, items, payments đều đọc lượt CHÍNH)
 *     không thấy gì;
 *   - mở bằng link cũ và link gia đình thấy HAI danh sách khác nhau của cùng
 *     một nhà.
 * Nên với vai `owner` của link gia đình: bộ ảnh đã có lượt chính thì DÙNG CHÍNH
 * NÓ (không chuyển `share_link_id`, link cũ vẫn thấy đúng danh sách ấy). An toàn
 * vì người gọi (`chotBoAnhChoPhien`) đã kiểm bộ ảnh thuộc ĐÚNG khách của link.
 * Link theo bộ (kiểu cũ) KHÔNG đi qua nhánh này — luật BB-148 của nó ở
 * `dang-nhap-bang-ma.ts` giữ nguyên.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function layHoacTaoLuotChon(
  admin: SupabaseClient,
  args: {
    shareLinkId: string;
    galleryId: string;
    /** Vai `owner` — được giữ/dùng chung lượt chọn chính. */
    laKhachChinh: boolean;
    /** Link gắn theo khách (gia đình). Chỉ khi đó mới dùng chung lượt chính. */
    laLinkGiaDinh?: boolean;
  },
): Promise<string> {
  if (args.laKhachChinh && args.laLinkGiaDinh) {
    const { data: chinh, error: chinhErr } = await admin
      .from("selections")
      .select("id")
      .eq("gallery_id", args.galleryId)
      .eq("is_primary", true)
      .maybeSingle();
    if (chinhErr) throw chinhErr;
    if (chinh) return chinh.id as string;
  }

  const { data: daCo, error: daCoErr } = await admin
    .from("selections")
    .select("id")
    .eq("share_link_id", args.shareLinkId)
    .eq("gallery_id", args.galleryId)
    .maybeSingle();
  if (daCoErr) throw daCoErr;
  if (daCo) return daCo.id as string;

  // `uq_selections_primary` chỉ cho MỘT lượt chọn chính trên mỗi bộ ảnh. Bộ đã
  // có lượt chính từ một link khác thì đặt thêm cái nữa là lỗi trùng khoá — rơi
  // đúng vào lúc ba mẹ bấm vào xem ảnh.
  let laChinh = args.laKhachChinh;
  if (laChinh) {
    const { data: chinhSan } = await admin
      .from("selections")
      .select("id")
      .eq("gallery_id", args.galleryId)
      .eq("is_primary", true)
      .maybeSingle();
    if (chinhSan) laChinh = false;
  }

  const { data: taoMoi, error } = await admin
    .from("selections")
    .insert({
      gallery_id: args.galleryId,
      share_link_id: args.shareLinkId,
      is_primary: laChinh,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    // BB-334B — hai lượt gọi CÙNG LÚC lần đầu mở bộ (màn khách bắn song song
    // gallery/photos/tuc-thi/tim… mỗi lượt đều qua đây) cùng thấy "chưa có" rồi
    // cùng chèn: lượt thua vấp `uq_selections_primary` / `(share_link_id,
    // gallery_id)` và trả 500. Lượt thắng đã tạo đúng dòng cần có — đọc lại nó.
    const daTao = await timLuotDaCo(admin, args);
    if (daTao) return daTao;
  }
  if (error || !taoMoi) throw error ?? new Error("Tạo lượt chọn không trả về gì");
  await ghiMocKhachMoBoAnh(admin, args.galleryId);
  return taoMoi.id as string;
}

/**
 * BB-402 — mốc "khách đã mở bộ ảnh" cho bộ đi qua link GIA ĐÌNH.
 *
 * Lỗi anh báo 08/10 (bộ HD_20260924#5261): khách đã chọn và chốt mà `galleries.sent_at`
 * và `first_viewed_at` đều NULL. Nguyên nhân: `sent_at` chỉ được ghi ở route CSKH "Tạo
 * link gửi khách" (`/api/admin/galleries/[id]/share-link`). Bộ mới của khách ĐÃ có link
 * gia đình (`/k/<mã>`) không bao giờ đi qua route đó — link gia đình tạo theo khách,
 * không theo bộ — nên không đường nào đặt mốc; còn `first_viewed_at` thì chưa từng có
 * đường ghi (xem `bao-cao/dieu-hanh/cong-thuc.ts`).
 *
 * Lượt chọn được TẠO đúng lúc một người cầm link mở bộ lần đầu (đầu tệp), nên đây là
 * chỗ đặt mốc: `first_viewed_at` nếu đang trống; `sent_at` nếu đang trống (bộ đã tới tay
 * gia đình muộn nhất là lúc này). Chỉ ghi khi đang NULL — không ghi đè mốc gửi link
 * của CSKH. KHÔNG đặt `due_at` (hạn chốt tự huỷ bộ ảnh — việc đó thuộc nút của CSKH).
 *
 * Không bao giờ ném: hụt mốc chỉ làm báo cáo thiếu một dòng, không được chặn ba mẹ mở ảnh.
 */
export async function ghiMocKhachMoBoAnh(admin: SupabaseClient, galleryId: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    const [xem, gui] = await Promise.all([
      admin.from("galleries").update({ first_viewed_at: now }).eq("id", galleryId).is("first_viewed_at", null),
      admin.from("galleries").update({ sent_at: now }).eq("id", galleryId).is("sent_at", null),
    ]);
    const loi = xem?.error ?? gui?.error;
    if (loi) console.error(JSON.stringify({ evt: "gallery.moc_mo_bo_anh_hut", galleryId, lyDo: loi.message }));
  } catch (err) {
    console.error(
      JSON.stringify({ evt: "gallery.moc_mo_bo_anh_hut", galleryId, lyDo: err instanceof Error ? err.message : String(err) }),
    );
  }
}

async function timLuotDaCo(
  admin: SupabaseClient,
  args: { shareLinkId: string; galleryId: string; laKhachChinh: boolean; laLinkGiaDinh?: boolean },
): Promise<string | null> {
  if (args.laKhachChinh && args.laLinkGiaDinh) {
    const { data } = await admin
      .from("selections")
      .select("id")
      .eq("gallery_id", args.galleryId)
      .eq("is_primary", true)
      .maybeSingle();
    if (data) return data.id as string;
  }
  const { data } = await admin
    .from("selections")
    .select("id")
    .eq("share_link_id", args.shareLinkId)
    .eq("gallery_id", args.galleryId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
