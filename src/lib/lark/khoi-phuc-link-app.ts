/**
 * BB-201 — khôi phục mã link CŨ (tạo trước khi có share_link_ma) từ cột
 * "Link app" của bảng Hậu Kỳ trên Lark.
 *
 * OWNER: PM. CHỈ ĐỌC Lark, không ghi gì lên Lark.
 *
 * Vì sao chạy TRÊN MÁY CHỦ APP lúc có người mở bộ ảnh, không phải một script
 * chạy một lượt: bản mã phải được tạo bằng khoá của môi trường đang phục vụ
 * (APP_SECRET của production). Script chạy trên máy khác mã hoá bằng khoá khác
 * → production không giải ra được.
 *
 * Link lấy từ Lark CHƯA được tin: chỗ gọi phải đối chiếu băm SHA-256 của mã
 * với share_links.token_hash trước khi lưu hay hiện. Cột Lark ai cũng sửa
 * được; dán nhầm link của nhà khác vào dòng này thì băm không khớp và bị bỏ.
 */
import { docCauHinhLark, timCotLinkApp } from "@/lib/lark/ghi-link-app";
import { HOST, larkAuth } from "@/lib/lark/sync-retouch";
import { dangChayPhepThu } from "@/lib/kiem-thu";

/** Mã link khách: đoạn sau "/g/" trong một đường dẫn app. */
const MAU_MA = /\/g\/([A-Za-z0-9_-]{20,})/;

/** Ô "Link app" có thể là chuỗi, {link,text}, hoặc mảng các {link,text}. */
export function layMaTuO(v: unknown): string | null {
  if (typeof v === "string") return MAU_MA.exec(v)?.[1] ?? null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const m = layMaTuO(x);
      if (m) return m;
    }
    return null;
  }
  if (v && typeof v === "object") {
    const o = v as { link?: unknown; text?: unknown };
    return layMaTuO(o.link) ?? layMaTuO(o.text);
  }
  return null;
}

/** Hạn chờ: màn quản trị đang đợi — Lark chậm thì bỏ, lần mở sau thử lại. */
const HAN_CHO_MS = 4_000;

/** Đọc mã link ở cột "Link app" của một bản ghi Hậu Kỳ. Không bao giờ ném. */
export async function docMaLinkAppTuLark(recordId: string): Promise<string | null> {
  if (dangChayPhepThu()) return null;
  const cfg = docCauHinhLark();
  if (!cfg) return null;
  const viec = (async () => {
    const auth = await larkAuth(cfg.appId, cfg.appSecret);
    const viTri = await timCotLinkApp(auth, cfg.baseToken);
    const res = await fetch(
      `${HOST}/bitable/v1/apps/${cfg.baseToken}/tables/${viTri.tableId}/records/${encodeURIComponent(recordId)}`,
      { headers: { authorization: auth.authorization } },
    );
    const json = (await res.json()) as { code: number; data?: { record?: { fields?: Record<string, unknown> } } };
    if (json.code !== 0) return null;
    return layMaTuO(json.data?.record?.fields?.[viTri.fieldName]);
  })();
  try {
    return await Promise.race([
      viec,
      new Promise<null>((r) => setTimeout(() => r(null), HAN_CHO_MS)),
    ]);
  } catch {
    return null;
  }
}
