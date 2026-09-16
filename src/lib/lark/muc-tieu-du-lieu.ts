/**
 * Cơ sở dữ liệu đang ghi vào có được phép nhận tên thật không.
 *
 * OWNER: DEV-INT. Task BB-139.
 * Spec: docs/16 mục 7.3.
 *
 * ---------------------------------------------------------------------------
 * Vì sao chốt theo DANH SÁCH CHO PHÉP chứ không phải danh sách cấm
 * ---------------------------------------------------------------------------
 * Bản đầu viết `isDevDb = url.includes(<mã bb-dev>)` rồi cho tên thật vào mọi
 * nơi còn lại. Cái chốt đó MỞ SẴN: dựng thêm một cơ sở dữ liệu thử nào nữa —
 * bb-test, một bản sao để diễn tập, một máy của nhân viên — là 443 tên khách và
 * số điện thoại thật chảy vào đó mà không ai phải làm gì sai.
 *
 * Nên đảo lại: chỉ những mã dự án ghi thẳng ở đây mới được tên thật. Không biết
 * là che. Sai về phía che thì mất công đồng bộ lại; sai về phía mở thì mất dữ
 * liệu của khách, và không lấy lại được.
 *
 * Mã dự án Supabase KHÔNG phải bí mật: nó nằm trong địa chỉ công khai của app,
 * ai mở trình duyệt cũng thấy. Ghi vào đây không rò gì.
 */

/**
 * Mã dự án Supabase được phép nhận tên khách thật.
 *
 * Thêm vào đây là một quyết định của chủ studio, không phải việc agent tự nới
 * cho tiện thử. Mỗi dòng ghi rõ ai quyết và ngày nào.
 */
export const MA_DU_AN_THAT: readonly string[] = [
  "hecpaiizklbuckqvdndk", // bb-prod — agent không có khoá vào đây
  "ohkfoqqsrpvsponiwcij", // bb-dev — chủ studio chốt 16.09.2026, xem ghi chú dưới
];

/**
 * ---------------------------------------------------------------------------
 * Vì sao bb-dev có trong danh sách, và cái giá của nó
 * ---------------------------------------------------------------------------
 * Chủ studio chốt ngày 16.09.2026: bb-dev hiện tên thật để soát dữ liệu trước
 * khi cắt sang bb-prod — tên che làm không đối chiếu được bộ nào là của nhà nào.
 *
 * Cái giá, ghi ra để người sau không phải đoán: bb-dev là nơi agent CÓ khoá,
 * còn bb-prod thì không. Từ hôm nay, 427 tên khách và số điện thoại thật nằm ở
 * môi trường mà mọi agent, mọi lượt chạy phép thử đều đọc được. Kho mã lại là
 * kho public.
 *
 * Kéo theo ba quy tắc, và chúng không còn là lời khuyên nữa:
 *
 *   1. Không dán kết quả truy vấn bb-dev vào khung chat, vào issue, vào commit.
 *   2. Fixture và ảnh chụp màn hình lấy từ bb-dev phải thay tên trước khi commit.
 *   3. Tệp sao lưu bb-dev giờ cũng là dữ liệu khách thật — đối xử như bb-prod.
 *
 * Cấu trúc danh sách CHO PHÉP giữ nguyên, và đó vẫn là phần quan trọng: một
 * cơ sở dữ liệu thử dựng thêm ngày mai — bb-test, bản sao diễn tập, máy của
 * nhân viên — vẫn bị che, vì nó không có tên ở đây.
 */

/**
 * Bóc mã dự án Supabase từ một chuỗi kết nối hoặc một địa chỉ API.
 *
 * Chuỗi pooler:  postgresql://postgres.<mã>:<mật khẩu>@aws-0-...
 * Địa chỉ API:   https://<mã>.supabase.co
 */
export function maDuAn(chuoi: string | undefined | null): string {
  if (!chuoi) return "";
  const pooler = chuoi.match(/postgres\.([a-z0-9]{16,})/i);
  if (pooler?.[1]) return pooler[1].toLowerCase();
  const api = chuoi.match(/https?:\/\/([a-z0-9]{16,})\.supabase\./i);
  if (api?.[1]) return api[1].toLowerCase();
  const truc = chuoi.match(/db\.([a-z0-9]{16,})\.supabase\./i);
  if (truc?.[1]) return truc[1].toLowerCase();
  return "";
}

/**
 * Có được ghi tên khách, số điện thoại, ghi chú và tên bé thật vào đây không.
 *
 * Mặc định là KHÔNG. Chỉ đúng khi mã dự án nằm trong danh sách cho phép.
 */
export function choPhepTenThat(chuoiKetNoi: string | undefined | null): boolean {
  const ma = maDuAn(chuoiKetNoi);
  if (!ma) return false;
  return MA_DU_AN_THAT.includes(ma);
}
