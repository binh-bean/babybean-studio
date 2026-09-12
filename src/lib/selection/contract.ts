import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GalleryContractComponent {
  id: string;
  galleryId: string;
  productId: string;
  name: string;
  kind: string;
  material: string | null;
  size: string | null;
  quantity: number;
  parentItemId: string;
  larkContractCode: string | null;
}

export interface GalleryContractItem {
  id: string;
  galleryId: string;
  productId: string;
  name: string;
  kind: string;
  material: string | null;
  size: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  larkContractCode: string | null;
  components: GalleryContractComponent[];
}

export interface GalleryContractSummary {
  quotaKnown: boolean;
  includedQuota: number | null;
  totalValue: number;
  items: GalleryContractItem[];
}

interface RawProduct {
  name: string;
  kind: string;
  material: string | null;
  size: string | null;
  list_price: number | null;
}

interface RawGalleryItemRow {
  id: string;
  gallery_id: string;
  product_id: string;
  parent_item_id: string | null;
  quantity: number;
  unit_price: number | null;
  lark_contract_code: string | null;
  created_at: string;
  product: RawProduct | RawProduct[] | null;
}

/**
 * Lấy hạn mức ảnh (từ app.gallery_quota) và cây thành phần hợp đồng của album.
 * Trả về 2 tầng: dòng hợp đồng (cha) và thành phần gói chụp (con).
 */
export async function getGalleryContractSummary(
  galleryId: string,
  client?: SupabaseClient
): Promise<GalleryContractSummary> {
  const supabase = client || createAdminClient();

  // 1. Lấy quota qua app.gallery_quota RPC
  const { data: quotaVal, error: quotaErr } = await supabase.rpc("gallery_quota", {
    p_gallery_id: galleryId,
  });

  if (quotaErr) {
    throw quotaErr;
  }

  const quotaKnown = quotaVal !== null && quotaVal !== undefined;
  const includedQuota = quotaKnown ? Number(quotaVal) : null;

  // 2. Lấy danh sách gallery_items join với products
  const { data: rows, error: itemsErr } = await supabase
    .from("gallery_items")
    .select(`
      id,
      gallery_id,
      product_id,
      parent_item_id,
      quantity,
      unit_price,
      lark_contract_code,
      created_at,
      product:products (
        name,
        kind,
        material,
        size,
        list_price
      )
    `)
    .eq("gallery_id", galleryId)
    .order("created_at", { ascending: true });

  if (itemsErr) {
    throw itemsErr;
  }

  const rawItems = (rows || []) as unknown as RawGalleryItemRow[];

  // Tách parents và children
  const parentRows = rawItems.filter((r) => !r.parent_item_id);
  const childRows = rawItems.filter((r) => Boolean(r.parent_item_id));

  // Map children theo parent_item_id
  const childrenMap = new Map<string, GalleryContractComponent[]>();
  for (const child of childRows) {
    const parentId = child.parent_item_id!;
    const prod = Array.isArray(child.product) ? child.product[0] : child.product;
    const component: GalleryContractComponent = {
      id: child.id,
      galleryId: child.gallery_id,
      productId: child.product_id,
      name: prod?.name || "Sản phẩm",
      kind: prod?.kind || "addon",
      material: prod?.material || null,
      size: prod?.size || null,
      quantity: child.quantity,
      parentItemId: parentId,
      larkContractCode: child.lark_contract_code || null,
    };

    const existing = childrenMap.get(parentId) || [];
    existing.push(component);
    childrenMap.set(parentId, existing);
  }

  // Tạo cây hai tầng
  let totalValue = 0;
  const items: GalleryContractItem[] = parentRows.map((parent) => {
    const prod = Array.isArray(parent.product) ? parent.product[0] : parent.product;
    const unitPrice = parent.unit_price !== null && parent.unit_price !== undefined
      ? Number(parent.unit_price)
      : null;
    const totalPrice = unitPrice !== null ? unitPrice * parent.quantity : null;

    if (totalPrice !== null) {
      totalValue += totalPrice;
    }

    return {
      id: parent.id,
      galleryId: parent.gallery_id,
      productId: parent.product_id,
      name: prod?.name || "Gói chụp",
      kind: prod?.kind || "shoot_package",
      material: prod?.material || null,
      size: prod?.size || null,
      quantity: parent.quantity,
      unitPrice,
      totalPrice,
      larkContractCode: parent.lark_contract_code || null,
      components: childrenMap.get(parent.id) || [],
    };
  });

  return {
    quotaKnown,
    includedQuota,
    totalValue,
    items,
  };
}
