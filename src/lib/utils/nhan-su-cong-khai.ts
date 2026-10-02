/**
 * BB-354 — màn Nhân sự từng liệt kê "Fixture DANHGIA5-… Chủ studio" / "… Quản lý chi
 * nhánh": tài khoản do phép thử e2e dựng trên cùng cơ sở dữ liệu, bị bỏ lại khi một
 * lượt chạy dừng giữa chừng. Cùng cách BB-328 ẩn chi nhánh Fixture khỏi trang gốc.
 *
 * Mọi fixture nhân sự trong `tests/**` đặt tên bắt đầu bằng "Fixture". Tên nhân viên
 * thật không bắt đầu bằng chữ này; "Fixtures Lane" hay tên có chữ ở giữa vẫn được giữ.
 */
const TEN_FIXTURE = /^\s*fixture\b/i;

export function laNhanSuThat(p: { fullName: string | null | undefined }): boolean {
  return !TEN_FIXTURE.test(p.fullName ?? "");
}
