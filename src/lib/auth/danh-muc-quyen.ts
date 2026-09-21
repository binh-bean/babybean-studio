/**
 * Danh mục quyền: mã quyền, tên tiếng người, và nhóm để xếp ô tích chọn.
 *
 * OWNER: SEC-ARCH. Task BB-172 chặng 2b.
 * Nguồn: `docs/04-api-spec.md §7`, và chính mảng `permissions` của các vai hệ
 * thống trong `db/migrations/0052`.
 *
 * ---------------------------------------------------------------------------
 * Vì sao danh mục nằm trong MÃ chứ không đọc từ cơ sở dữ liệu
 * ---------------------------------------------------------------------------
 * ADR-0007: cứng hoá tên QUYỀN, không cứng hoá tên VAI TRÒ. Một quyền chỉ có
 * nghĩa khi có chỗ nào đó trong mã hỏi tới nó — `app.has_permission('x')`.
 * Cho người dùng tự đặt ra tên quyền mới là cho họ tạo ra những ô tích không
 * nối với gì cả, và không ai biết ô nào thật ô nào giả.
 *
 * ---------------------------------------------------------------------------
 * Mười hai quyền hôm nay THẬT SỰ đổi được hành vi
 * ---------------------------------------------------------------------------
 * Nói thẳng để không ai tích một ô rồi tưởng mình vừa đổi được cái gì:
 *
 *   · `galleries:write` / `galleries:create` -> ghi album, ảnh, buổi chụp
 *   · `galleries:all_in_branch`              -> thấy mọi album trong chi nhánh
 *   · `photos:read`                          -> xem ảnh
 *   · `selections:read`                      -> xem lựa chọn của khách
 *   · `customers:read` / `customers:write`   -> xem / sửa khách hàng
 *   · `packages:read` / `packages:write`     -> xem / sửa gói chụp
 *   · `deliveries:write`                     -> cập nhật giao ảnh
 *   · `settings:branch:write`                -> sửa cài đặt chi nhánh
 *   · `system:superuser`                     -> vượt trên mọi chi nhánh
 *
 * Sau chặng 2c (migration 0056 và 0057), lớp RLS KHÔNG còn đọc tên vai ở đâu
 * nữa — mười ba chỗ so với 'photoshop_ctv', 'accountant', 'branch_manager' đã
 * đổi hết sang hỏi quyền. Những quyền còn lại trong danh mục đã lưu được nhưng
 * chưa có luật nào hỏi tới; màn Vai trò ghi thẳng "(chưa có hiệu lực)" lên
 * chúng thay vì giấu đi.
 */

export interface DinhNghiaQuyen {
  ma: string;
  ten: string;
  nhom: string;
  /** Lớp RLS hôm nay có thật sự hỏi tới quyền này không. */
  dangCoHieuLuc?: boolean;
}

export const DANH_MUC_QUYEN: DinhNghiaQuyen[] = [
  { ma: "system:superuser", ten: "Vượt trên mọi chi nhánh", nhom: "Hệ thống", dangCoHieuLuc: true },
  { ma: "system:dashboard", ten: "Xem bảng điều khiển toàn hệ thống", nhom: "Hệ thống" },
  { ma: "branch:dashboard", ten: "Xem bảng điều khiển chi nhánh", nhom: "Hệ thống" },

  { ma: "galleries:read", ten: "Xem danh sách và chi tiết album", nhom: "Album" },
  {
    ma: "galleries:all_in_branch",
    ten: "Thấy MỌI album trong chi nhánh (không có thì chỉ thấy album mình được giao)",
    nhom: "Album",
    dangCoHieuLuc: true,
  },
  { ma: "photos:read", ten: "Xem ảnh trong album", nhom: "Album", dangCoHieuLuc: true },
  { ma: "selections:read", ten: "Xem khách đã chọn ảnh nào", nhom: "Album", dangCoHieuLuc: true },
  { ma: "galleries:create", ten: "Tạo album mới", nhom: "Album", dangCoHieuLuc: true },
  { ma: "galleries:write", ten: "Sửa cấu hình album", nhom: "Album", dangCoHieuLuc: true },
  { ma: "galleries:sync", ten: "Đồng bộ ảnh từ Drive", nhom: "Album" },
  { ma: "galleries:share", ten: "Gửi và thu hồi link chia sẻ", nhom: "Album" },
  { ma: "galleries:reopen", ten: "Mở lại album đã chốt", nhom: "Album" },
  { ma: "galleries:delete", ten: "Xoá hoặc lưu trữ album", nhom: "Album" },
  { ma: "galleries:export", ten: "Xuất danh sách ảnh", nhom: "Album" },

  { ma: "customers:read", ten: "Xem danh sách khách hàng", nhom: "Khách hàng", dangCoHieuLuc: true },
  { ma: "customers:write", ten: "Thêm và sửa khách hàng", nhom: "Khách hàng", dangCoHieuLuc: true },
  { ma: "customers:delete", ten: "Xoá khách hàng", nhom: "Khách hàng" },

  { ma: "packages:read", ten: "Xem danh sách gói chụp", nhom: "Gói chụp", dangCoHieuLuc: true },
  { ma: "packages:write", ten: "Thêm và sửa gói chụp", nhom: "Gói chụp", dangCoHieuLuc: true },
  { ma: "packages:delete", ten: "Xoá gói chụp", nhom: "Gói chụp" },

  { ma: "branches:read", ten: "Xem danh sách chi nhánh", nhom: "Chi nhánh" },
  { ma: "branches:write", ten: "Sửa chi nhánh", nhom: "Chi nhánh", dangCoHieuLuc: true },
  { ma: "branches:manage", ten: "Tạo chi nhánh, bật/tắt chi nhánh", nhom: "Chi nhánh", dangCoHieuLuc: true },
  { ma: "branches:delete", ten: "Xoá chi nhánh", nhom: "Chi nhánh" },

  { ma: "staff:read", ten: "Xem danh sách nhân sự", nhom: "Nhân sự" },
  { ma: "staff:manage", ten: "Quản lý nhân sự", nhom: "Nhân sự" },
  { ma: "roles:manage", ten: "Quản lý vai trò và phân quyền", nhom: "Nhân sự" },
  { ma: "activity_logs:read", ten: "Xem nhật ký thao tác", nhom: "Nhân sự" },

  { ma: "reports:operations", ten: "Xem báo cáo vận hành", nhom: "Báo cáo" },
  { ma: "reports:financial", ten: "Xem báo cáo doanh thu", nhom: "Báo cáo" },

  { ma: "settings:system", ten: "Sửa cài đặt toàn hệ thống", nhom: "Cài đặt" },
  { ma: "settings:branch:read", ten: "Xem cài đặt chi nhánh", nhom: "Cài đặt" },
  { ma: "settings:branch:write", ten: "Sửa cài đặt chi nhánh", nhom: "Cài đặt", dangCoHieuLuc: true },
  { ma: "settings:branch:delete", ten: "Xoá cài đặt chi nhánh", nhom: "Cài đặt" },

  { ma: "retouch:read", ten: "Xem hàng đợi chỉnh ảnh", nhom: "Hậu kỳ" },
  { ma: "retouch:write", ten: "Cập nhật trạng thái chỉnh ảnh", nhom: "Hậu kỳ" },
  { ma: "deliveries:read", ten: "Xem lịch sử giao ảnh", nhom: "Hậu kỳ" },
  { ma: "deliveries:write", ten: "Cập nhật tiến độ giao ảnh", nhom: "Hậu kỳ", dangCoHieuLuc: true },
  { ma: "deliveries:delete", ten: "Xoá dữ liệu giao ảnh", nhom: "Hậu kỳ" },
];

export const MA_QUYEN_HOP_LE = new Set(DANH_MUC_QUYEN.map((q) => q.ma));

/** Tên vai nào cũng phải đọc được, gõ được, và không đụng tên vai hệ thống. */
export function tenVaiCoVanDeGi(ten: string): string | null {
  const s = ten.trim();
  if (s.length < 2) return "Tên vai trò quá ngắn";
  if (s.length > 40) return "Tên vai trò quá dài (tối đa 40 ký tự)";
  return null;
}
