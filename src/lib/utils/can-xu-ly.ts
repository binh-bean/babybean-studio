/**
 * BB-283 (soát bởi giám đốc 27/09/2026, sau khi chấm ảnh chụp): huy hiệu số
 * cạnh "Việc cần xử lý" trong sidebar và khối "Cần xử lý ngay" ở Bảng điều
 * khiển PHẢI cùng một công thức.
 *
 * ---------------------------------------------------------------------------
 * Mâu thuẫn trước khi có tệp này
 * ---------------------------------------------------------------------------
 * Huy hiệu sidebar đọc `GET /api/admin/can-xu-ly` (BB-257: bộ ảnh lỗi tải
 * Drive + bộ ảnh chưa có ảnh). Khối "Cần xử lý ngay" ở Bảng điều khiển đọc
 * `data.actionRequired` của `GET /api/admin/dashboard` (BB-270: bộ ảnh khách
 * sắp/đã quá hạn chọn). Hai nguồn khác hẳn nhau, nên ảnh chụp thật
 * (27/09/2026) cho huy hiệu "127" trong lúc khối kia nói "Tuyệt vời! Không có
 * album nào cần xử lý gấp" — CSKH không biết tin cái nào.
 *
 * `can-xu-ly.tsx` (khối cùng tên, đặt ở trang DANH SÁCH BỘ ẢNH) có ghi rõ lý
 * do tách hai khối theo BB-257: "canh hai câu hỏi khác nhau". Giám đốc chốt
 * lại ở BB-283: mâu thuẫn nhìn thấy được trên MỘT màn hình (huy hiệu + khối
 * cùng lúc) quan trọng hơn — gộp một công thức, một chỗ, một chỗ hiển thị.
 * `can-xu-ly.tsx` ở trang danh sách bộ ảnh giữ nguyên (không đụng, ngoài
 * phạm vi BB-283), chỉ Bảng điều khiển + sidebar đổi sang dùng chung dữ liệu.
 *
 * ---------------------------------------------------------------------------
 * Vì sao có `dueSoon`/`overdue` dạng SỐ, không phải mảng như hai loại kia
 * ---------------------------------------------------------------------------
 * `GET /api/admin/dashboard` đã đếm sẵn `stats.dueSoon`/`stats.overdue` bằng
 * `count: "exact", head: true` (không tải cả bảng) — dùng lại đúng hai số đó,
 * không viết thêm truy vấn hay route mới.
 */

export interface CanXuLyTongHop {
  /** `GET /api/admin/can-xu-ly` → data.driveChuaChiaSe */
  driveChuaChiaSe?: unknown[];
  /** `GET /api/admin/can-xu-ly` → data.chuaCoAnh */
  chuaCoAnh?: unknown[];
  /**
   * BB-285 — `GET /api/admin/can-xu-ly` → data.chuaCoHanMuc: bộ ảnh
   * `app.gallery_quota()` trả null (58 bộ đo 27/09/2026). Cùng lý do với
   * `chuaCoAnh`: khách mở link ra không chọn được ảnh nào, chỉ gọi điện hỏi.
   */
  chuaCoHanMuc?: unknown[];
  /** `GET /api/admin/dashboard` → data.stats.dueSoon */
  dueSoon?: number;
  /** `GET /api/admin/dashboard` → data.stats.overdue */
  overdue?: number;
  /**
   * BB-285 — `GET /api/admin/can-xu-ly` → data.canhBaoLark: số bộ Lark cột
   * "Cảnh Báo" đang đỏ hoặc tím (docs/21). `due_at` chỉ có ở 2/491 bộ nên
   * `dueSoon`/`overdue` gần như luôn 0 — cột Cảnh Báo của Lark là tín hiệu
   * thật CSKH đang dùng để biết việc gấp.
   */
  canhBaoLark?: number;
  /**
   * BB-312 — `GET /api/admin/can-xu-ly` → data.choMoLai: số bộ ảnh đang có
   * yêu cầu "xin mở lại" CHƯA XỬ LÝ (xem src/lib/gallery/yeu-cau-mo-lai.ts).
   * Trước bản vá này yêu cầu chỉ nằm lẫn trong Dòng thời gian hoạt động của
   * từng bộ — không chỗ nào tổng hợp lại để CSKH biết đang có bao nhiêu việc
   * đang chờ trên toàn chi nhánh.
   */
  choMoLai?: number;
  /**
   * BB-344 — `GET /api/admin/can-xu-ly` → data.khachGuiAnhChon: số BỘ ẢNH trong tab
   * "Khách gửi ảnh chọn" (BB-337) — đợt 1 chờ xác nhận + đợt mua thêm ≥ 2 + khách
   * nhờ studio chọn giúp, mỗi bộ một dòng. Lấy từ `layKhachGuiAnhChon`
   * (src/lib/gallery/khach-gui-anh-chon.ts), CÙNG hàm với tab, nên số ở đây luôn
   * bằng số dòng của tab. Thay hai trường cũ `choDotChon` + `choStudioChon` (BB-321:
   * đếm theo đợt, thiếu đợt 1).
   */
  khachGuiAnhChon?: number;
}

/**
 * MỘT công thức duy nhất — huy hiệu sidebar (`admin-layout-shell.tsx`) và
 * khối "Cần xử lý ngay" (`dashboard.tsx`) đều gọi hàm này, không tính lại ở
 * nơi khác. Hỏng/thiếu dữ liệu thì coi là 0, không throw — huy hiệu ẩn thay
 * vì sập trang.
 */
export function demSoCanXuLy(d: CanXuLyTongHop | null | undefined): number {
  if (!d) return 0;
  return (
    (d.driveChuaChiaSe?.length ?? 0) +
    (d.chuaCoAnh?.length ?? 0) +
    (d.chuaCoHanMuc?.length ?? 0) +
    (d.dueSoon ?? 0) +
    (d.overdue ?? 0) +
    (d.canhBaoLark ?? 0) +
    (d.choMoLai ?? 0) +
    (d.khachGuiAnhChon ?? 0)
  );
}

export interface DongCanXuLy {
  key: string;
  /** Tên loại việc, hiển thị trên dòng. */
  nhan: string;
  soLuong: number;
  /** Token màu CSS cho chấm tròn đầu dòng. */
  mauCham: string;
  /** Bấm dòng đi đâu — trang có khối/bộ lọc tương ứng để xử lý. */
  href: string;
}

/**
 * Liệt kê từng dòng cho khối "Cần xử lý ngay" — CHỈ loại có số > 0 (đúng quy
 * ước đã có ở `can-xu-ly.tsx`: "Không có gì thì khối tự ẩn"). Tổng
 * `soLuong` của mảng trả về LUÔN bằng `demSoCanXuLy(d)` — cùng một `d`, cùng
 * phép cộng, chỉ khác là hàm này giữ lại từng số hạng.
 */
export function dongCanXuLy(d: CanXuLyTongHop | null | undefined): DongCanXuLy[] {
  if (!d) return [];
  const tatCa: DongCanXuLy[] = [
    {
      key: "drive-chua-chia-se",
      nhan: "Bộ ảnh lỗi tải Drive",
      soLuong: d.driveChuaChiaSe?.length ?? 0,
      mauCham: "var(--bb-danger)",
      // can-xu-ly.tsx (trang danh sách bộ ảnh) hiện đúng nhóm này, mở sẵn.
      href: "/admin/galleries",
    },
    {
      key: "chua-co-anh",
      nhan: "Bộ ảnh chưa có ảnh",
      soLuong: d.chuaCoAnh?.length ?? 0,
      mauCham: "var(--bb-urgent)",
      href: "/admin/galleries",
    },
    {
      key: "sap-het-han-chon",
      nhan: "Sắp hết hạn chọn",
      soLuong: (d.dueSoon ?? 0) + (d.overdue ?? 0),
      mauCham: "var(--bb-warning)",
      // Chưa có bộ lọc urgency riêng ở /admin/galleries — trỏ về danh sách
      // chung, gần nhất với nơi CSKH sửa được (mở từng bộ, đổi hạn).
      href: "/admin/galleries",
    },
    {
      key: "chua-co-han-muc",
      nhan: "Chưa có hạn mức",
      soLuong: d.chuaCoHanMuc?.length ?? 0,
      mauCham: "var(--bb-urgent)",
      href: "/admin/galleries",
    },
    {
      key: "canh-bao-lark",
      nhan: "Lark báo đỏ/tím",
      soLuong: d.canhBaoLark ?? 0,
      mauCham: "var(--bb-danger)",
      href: "/admin/galleries",
    },
    {
      key: "cho-mo-lai",
      nhan: "Khách xin mở lại",
      soLuong: d.choMoLai ?? 0,
      mauCham: "var(--bb-warning)",
      href: "/admin/viec-can-xu-ly?tab=yeu-cau-mo-lai",
    },
    {
      // BB-344: MỘT dòng cho tab "Khách gửi ảnh chọn" — số = số dòng của tab, bấm mở đúng tab đó.
      key: "khach-gui-anh-chon",
      nhan: "Khách gửi ảnh chọn",
      soLuong: d.khachGuiAnhChon ?? 0,
      mauCham: "var(--bb-urgent)",
      href: "/admin/viec-can-xu-ly?tab=khach-mua-them",
    },
  ];
  return tatCa.filter((dong) => dong.soLuong > 0);
}
