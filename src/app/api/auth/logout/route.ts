/**
 * POST /api/auth/logout — nhân viên thoát khỏi máy này.
 *
 * OWNER: DEV-FE. Task BB-185.
 *
 * ---------------------------------------------------------------------------
 * Vì sao tới hôm nay mới có
 * ---------------------------------------------------------------------------
 * Quét cả dự án ngày 18.09.2026: **không có một đường đăng xuất nào**, và cũng
 * không có nút nào gọi tới. Có `signInWithPassword` ở màn đăng nhập, không có
 * `signOut` ở đâu hết.
 *
 * Ba chi nhánh đều dùng máy chung ở quầy. Nhân viên ca sáng đăng nhập, hết ca
 * đứng dậy, ca chiều ngồi vào là **thừa nguyên phiên của người trước** — mọi
 * thao tác ghi vào `activity_logs` dưới tên người đã về, và người đang ngồi có
 * đúng bộ quyền của người kia. Chủ studio ngồi vào máy của CTV thì ngược lại:
 * mở ra thấy ít hơn hẳn những gì mình có quyền xem, rồi tưởng app hỏng.
 *
 * BB-174 ẩn nút tài khoản ở góc phải (vì nó chưa làm gì) nên cũng ẩn luôn chỗ
 * tự nhiên để đặt nút này. Bản vá trả chỗ đó lại, nhưng lần này nó làm thật.
 *
 * ---------------------------------------------------------------------------
 * `scope: "local"`, không phải `"global"` — và cái giá của lựa chọn ấy
 * ---------------------------------------------------------------------------
 * Supabase mặc định `global`: thoát là **huỷ phiên trên MỌI máy** của người đó.
 *
 * Ở đây chọn `local`, chỉ xoá phiên trên chính trình duyệt đang bấm. Lý do:
 * một người thường mở app ở hai chỗ cùng lúc — máy quầy và điện thoại riêng.
 * Bấm Đăng xuất ở máy quầy lúc hết ca mà bị đá ra khỏi điện thoại giữa chừng
 * là chuyện không ai đoán trước được, và người ta sẽ thôi bấm nút này.
 *
 * Cái giá phải nói rõ: `local` **không huỷ** khoá làm mới phiên ở phía máy chủ.
 * Nếu cookie đã bị lấy cắp thì bấm Đăng xuất KHÔNG đóng được đường đó. Muốn
 * đóng thì cần một nút riêng "Thoát khỏi mọi máy" (`scope: 'global'`) — chưa
 * làm, và đừng lặng lẽ đổi nút này thành global để "cho chắc".
 *
 * ---------------------------------------------------------------------------
 * Xoá luôn phiên KHÁCH trên máy đó
 * ---------------------------------------------------------------------------
 * CSKH hay mở link của khách ngay trên máy quầy để xem ba mẹ đang thấy gì. Việc
 * đó để lại cookie `bb_gs` — một phiên xem album của MỘT NHÀ CỤ THỂ, sống độc
 * lập với phiên nhân viên.
 *
 * Đăng xuất mà bỏ lại cookie ấy nghĩa là máy quầy vẫn đang mở sẵn album nhà
 * khách cho người kế tiếp. Nên xoá cả hai. Không có chiều ngược lại: khách
 * không bao giờ đụng vào phiên nhân viên.
 */

import { randomUUID } from "node:crypto";
import { ok, failUnexpected } from "@/lib/api-response";
import { createServerClient } from "@/lib/supabase/server";
import { clearGallerySessionCookie } from "@/lib/auth/gallery-session";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const requestId = randomUUID();
  try {
    // KHÔNG gọi requireStaff() trước. Phiên hỏng, tài khoản vừa bị tắt, hay
    // hồ sơ đã xoá đều làm requireStaff ném lỗi — mà đó đúng là những lúc người
    // ta cần thoát ra nhất. Đăng xuất phải luôn chạy được.
    //
    // Cùng lý do, `signOut` bọc riêng: nó gọi sang Supabase qua mạng. Mất mạng,
    // Supabase không trả lời, hay khoá làm mới đã chết đều làm nó ném — và nếu
    // để lỗi đó bật lên thành 500 thì cookie phiên khách bên dưới cũng không được
    // xoá, và người bấm nút nhận một thông báo lỗi rồi đứng dậy đi — tưởng mình
    // đã thoát.
    let loiSignOut: string | null = null;
    try {
      const supabase = await createServerClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch (err) {
      loiSignOut = err instanceof Error ? err.message : String(err);
    }

    await clearGallerySessionCookie();

    if (loiSignOut) {
      console.warn(
        JSON.stringify({ evt: "logout.signout_failed", requestId, lyDo: loiSignOut }),
      );
    }

    // `daSachHan` sai nghĩa là cookie Supabase có thể còn trên máy này. Màn gọi
    // vẫn đưa người ta về /login — đứng im sau khi bấm Đăng xuất là tệ hơn hẳn.
    return ok({ daThoat: true, daSachHan: loiSignOut === null });
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}
