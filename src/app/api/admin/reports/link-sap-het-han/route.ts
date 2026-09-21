/**
 * GET /api/admin/reports/link-sap-het-han — link gửi khách sắp chết, và đã chết.
 *
 * OWNER: DEV-BE. Task BB-186.
 *
 * ---------------------------------------------------------------------------
 * Chủ studio hỏi gì
 * ---------------------------------------------------------------------------
 * *"Link hết hạn sau hai tháng được tính từ đâu, khi hết hạn có ai nhận được
 * thông báo không, CSKH có biết trên giao diện không?"*
 *
 * Câu trả lời trước bản vá này: tính từ ngày cấp link; **không ai được báo**;
 * và **CSKH không biết** — màn chi tiết chỉ trả `shareLink: { id }`.
 *
 * BB-188 đã vá nửa sau: màn chi tiết nay hiện tình trạng và hạn. Nhưng nó chỉ
 * trả lời được khi đã BIẾT phải mở bộ nào ra xem — tức là sau khi khách gọi
 * đến. Bảng này là nửa còn lại: mở ra thấy ngay tuần này nhà nào sắp mất link.
 *
 * ---------------------------------------------------------------------------
 * Gộp cả link ĐÃ hết hạn, không chỉ link sắp hết
 * ---------------------------------------------------------------------------
 * Link đã chết là việc gấp hơn link sắp chết: ba mẹ bấm vào là thấy trang báo
 * hết hạn ngay bây giờ. Tách ra hai màn thì màn "đã chết" sẽ không ai mở.
 *
 * ---------------------------------------------------------------------------
 * Tự lọc chi nhánh, không dựa vào RLS
 * ---------------------------------------------------------------------------
 * Đọc bằng khoá quản trị thì RLS bị bỏ qua hoàn toàn. `requireStaff()` đã trả
 * sẵn `branchIds` đúng theo vai — lọc theo đó, giống hệt báo cáo over-quota.
 *
 * ---------------------------------------------------------------------------
 * KHÔNG trả mã link
 * ---------------------------------------------------------------------------
 * Sau khi bỏ PIN, chuỗi 43 ký tự là thứ duy nhất che ảnh của một nhà. Bảng này
 * chỉ cần nói *nhà nào, bộ nào, còn mấy ngày* — và `token_prefix` sáu ký tự để
 * đối chiếu khi khách đọc link qua điện thoại.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** CTV thời vụ không đụng tới khách. Cùng luật với 0012. */
const BLOCKED_ROLES = ["photoshop_ctv"];

/** Cửa sổ mặc định. Hai tuần đủ để CSKH gọi hết mà không thành danh sách dài vô nghĩa. */
const SO_NGAY_MAC_DINH = 14;
const SO_NGAY_TOI_DA = 90;

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    if (BLOCKED_ROLES.includes(staff.role)) {
      return fail("FORBIDDEN", "Vai trò này không xem được danh sách khách");
    }
    if (staff.branchIds.length === 0) {
      return ok({ soNgay: SO_NGAY_MAC_DINH, tong: khongCoGi(), items: [] });
    }

    const url = new URL(request.url);
    const soNgayTho = Number(url.searchParams.get("soNgay"));
    const soNgay =
      Number.isFinite(soNgayTho) && soNgayTho > 0
        ? Math.min(Math.trunc(soNgayTho), SO_NGAY_TOI_DA)
        : SO_NGAY_MAC_DINH;

    const branchFilter = url.searchParams.get("branchId");
    const branchIds = branchFilter
      ? staff.branchIds.filter((b) => b === branchFilter)
      : staff.branchIds;
    if (branchIds.length === 0) return fail("FORBIDDEN", "Không có quyền xem chi nhánh này");

    const nguong = new Date();
    nguong.setDate(nguong.getDate() + soNgay);

    const admin = createAdminClient();

    // `galleries!inner`: link không gắn bộ ảnh nào (link theo KHÁCH, xem 0010)
    // thì không có chi nhánh để lọc, và đưa nó vào đây là hiện chéo chi nhánh.
    const { data: rows, error } = await admin
      .from("share_links")
      .select(
        "id, status, expires_at, token_prefix, view_count, created_at, " +
          "galleries!inner(id, title, branch_id, lark_contract_codes, " +
          "branches(name), customers(full_name, phone))",
      )
      .in("status", ["active", "expired"])
      .not("expires_at", "is", null)
      .lte("expires_at", nguong.toISOString())
      .in("galleries.branch_id", branchIds)
      .order("expires_at", { ascending: true })
      .limit(500);

    if (error) throw error;

    type Row = {
      id: string;
      status: string;
      expires_at: string;
      token_prefix: string | null;
      view_count: number;
      created_at: string;
      galleries: {
        id: string;
        title: string;
        branch_id: string;
        lark_contract_codes: string[] | null;
        branches: { name: string } | null;
        customers: { full_name: string; phone: string | null } | null;
      };
    };

    const bayGio = Date.now();
    const items = ((rows ?? []) as unknown as Row[]).map((r) => {
      const conLai = Math.ceil((new Date(r.expires_at).getTime() - bayGio) / 86_400_000);
      return {
        shareLinkId: r.id,
        galleryId: r.galleries.id,
        galleryTitle: r.galleries.title,
        branchName: r.galleries.branches?.name ?? null,
        contractCode: r.galleries.lark_contract_codes?.[0] ?? null,
        customerName: r.galleries.customers?.full_name ?? null,
        customerPhone: r.galleries.customers?.phone ?? null,
        tokenPrefix: r.token_prefix,
        viewCount: r.view_count,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        // Số ngày còn lại, âm nghĩa là đã chết được bấy nhiêu ngày. Một con số
        // đọc được nhanh hơn hai cái ngày tháng đặt cạnh nhau.
        conLaiNgay: conLai,
        // `status` trong cơ sở dữ liệu KHÔNG tự đổi khi đồng hồ đi qua hạn — nó
        // chờ lượt chạy định kỳ. Tính lại ở đây, không thì bảng báo "đang dùng"
        // trong khi ba mẹ đang nhìn trang báo hết hạn.
        daChet: conLai <= 0,
      };
    });

    const tong = {
      daChet: items.filter((i) => i.daChet).length,
      trong7Ngay: items.filter((i) => !i.daChet && i.conLaiNgay <= 7).length,
      tatCa: items.length,
      // Ba mẹ chưa mở lần nào mà link sắp chết là ca gấp nhất: cả bộ ảnh có thể
      // chưa ai trong nhà nhìn thấy.
      chuaAiMo: items.filter((i) => i.viewCount === 0).length,
    };

    return ok({ soNgay, tong, items });
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}

function khongCoGi() {
  return { daChet: 0, trong7Ngay: 0, tatCa: 0, chuaAiMo: 0 };
}
