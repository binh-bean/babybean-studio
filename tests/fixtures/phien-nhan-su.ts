/**
 * Phiên nhân sự giả lập cho phép thử — BB-172 chặng 2d.
 *
 * Từ chặng 2d, `StaffSession` mang theo `permissions`, và mọi cửa quyền ở tầng
 * API hỏi bộ quyền đó chứ không hỏi tên vai. Phép thử nào giả lập phiên thì
 * phải giả lập cả bộ quyền — nếu không, nó kiểm một thứ không giống đời thật.
 *
 * Bảng dưới đây là bản sao của `db/migrations/0052` (và những migration sau bổ
 * sung thêm). Bản sao thì trôi được, nên tám tệp trong `tests/security/` vẫn
 * chạy trên cơ sở dữ liệu THẬT với vai thật — chúng là thứ bắt được nếu bảng
 * này lệch khỏi thực tế.
 */
import type { StaffRole, StaffSession } from "@/types/domain";

const CHUNG_ALBUM = [
  "branch:dashboard",
  "galleries:read",
  "galleries:all_in_branch",
  "photos:read",
  "selections:read",
  "customers:read",
  "packages:read",
  "branches:read",
];

const QUYEN_THEO_VAI: Record<string, string[]> = {
  owner: [
    ...CHUNG_ALBUM,
    "system:superuser",
    "system:dashboard",
    "galleries:create",
    "galleries:write",
    "galleries:sync",
    "galleries:share",
    "galleries:reopen",
    "galleries:delete",
    "galleries:export",
    "customers:write",
    "customers:delete",
    "packages:write",
    "packages:delete",
    "branches:write",
    "branches:manage",
    "branches:delete",
    "staff:read",
    "staff:manage",
    "roles:manage",
    "activity_logs:read",
    "reports:operations",
    "reports:financial",
    "settings:system",
    "settings:branch:read",
    "settings:branch:write",
    "settings:branch:delete",
    "retouch:read",
    "retouch:write",
    "deliveries:read",
    "deliveries:write",
    "deliveries:delete",
  ],
  branch_manager: [
    ...CHUNG_ALBUM,
    "galleries:create",
    "galleries:write",
    "galleries:sync",
    "galleries:share",
    "galleries:reopen",
    "galleries:delete",
    "galleries:export",
    "customers:write",
    "customers:delete",
    "packages:write",
    "branches:write",
    "staff:read",
    "activity_logs:read",
    "reports:operations",
    "reports:financial",
    "settings:branch:read",
    "settings:branch:write",
    "retouch:read",
    "retouch:write",
    "deliveries:read",
    "deliveries:write",
    "deliveries:delete",
  ],
  cs: [
    ...CHUNG_ALBUM,
    "galleries:create",
    "galleries:write",
    "galleries:sync",
    "galleries:share",
    "galleries:export",
    "customers:write",
    "staff:read",
    "reports:operations",
    "settings:branch:read",
    "retouch:read",
    "retouch:write",
    "deliveries:read",
    "deliveries:write",
  ],
  photographer: [
    ...CHUNG_ALBUM,
    "galleries:create",
    "galleries:sync",
    "galleries:export",
    "retouch:read",
    "deliveries:read",
  ],
  retoucher: [
    ...CHUNG_ALBUM,
    "galleries:export",
    "retouch:read",
    "retouch:write",
    "deliveries:read",
    "deliveries:write",
  ],
  accountant: [
    "branch:dashboard",
    "galleries:read",
    "galleries:all_in_branch",
    "selections:read",
    "customers:read",
    "packages:read",
    "branches:read",
    "reports:operations",
    "reports:financial",
    "deliveries:read",
  ],
  viewer: [...CHUNG_ALBUM, "reports:operations", "deliveries:read"],
  photoshop_ctv: [
    "branch:dashboard",
    "galleries:read",
    "photos:read",
    "retouch:read",
    "retouch:write",
    "deliveries:read",
  ],
};

QUYEN_THEO_VAI.admin = QUYEN_THEO_VAI.owner as string[];

export function quyenCuaVai(vai: string): string[] {
  return QUYEN_THEO_VAI[vai] ?? [];
}

/** Một phiên nhân sự đủ trường, dùng cho `vi.spyOn(staffAuth, "requireStaff")`. */
export function phienGiaLap(
  vai: StaffRole,
  branchIds: string[] = [],
  staffId = "00000000-0000-0000-0000-0000000000aa",
): StaffSession {
  return {
    staffId,
    role: vai,
    roleName: vai,
    permissions: quyenCuaVai(vai),
    branchIds,
  };
}
