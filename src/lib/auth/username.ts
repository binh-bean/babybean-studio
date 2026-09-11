/**
 * Tên tài khoản cho nhân viên không dùng email.
 *
 * OWNER: SEC-ARCH. Task BB-063.
 * Spec: docs/13-quyet-dinh-van-hanh.md §8
 *
 * Supabase Auth bắt buộc mỗi tài khoản phải có một email, nhưng thợ ảnh và
 * retoucher ở studio thường không dùng email. Chủ studio nhập tên tài khoản,
 * hệ thống lưu một địa chỉ nội bộ phía sau.
 *
 * Địa chỉ đó KHÔNG nhận được thư. Nó chỉ là định danh, nên chức năng gửi mail
 * đặt lại mật khẩu không dùng được cho những tài khoản này — chủ studio đặt hộ.
 */

/** Tên miền chỉ để định danh, không có hòm thư nào ở đây. */
export const STAFF_DOMAIN = "staff.babybeanstudio.vn";

/**
 * Chữ thường, số, chấm, gạch dưới, gạch ngang. Phải bắt đầu bằng chữ cái.
 * Không dấu — người nhập trên bàn phím điện thoại giữa ca chụp không nên phải
 * gõ dấu, và địa chỉ email sinh ra từ nó cũng không nhận được ký tự có dấu.
 */
const USERNAME_RE = /^[a-z][a-z0-9._-]{2,29}$/;

export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value);
}

/** Người ta gõ gì cũng được, ta chuẩn hoá trước khi so. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmailLike(value: string): boolean {
  return value.includes("@");
}

/**
 * Đổi thứ người dùng gõ ở ô đăng nhập thành email mà Supabase hiểu.
 *
 * Gõ email thật thì giữ nguyên. Gõ tên tài khoản thì ghép tên miền nội bộ.
 * Nhờ vậy một màn đăng nhập phục vụ được cả hai kiểu nhân viên.
 */
export function toAuthEmail(identifier: string): string {
  const value = normalizeUsername(identifier);
  return isEmailLike(value) ? value : `${value}@${STAFF_DOMAIN}`;
}

/** Ngược lại: cái gì hiển thị cho người xem trong danh sách nhân sự. */
export function toDisplayIdentifier(authEmail: string): string {
  const value = normalizeUsername(authEmail);
  return value.endsWith(`@${STAFF_DOMAIN}`)
    ? value.slice(0, -`@${STAFF_DOMAIN}`.length)
    : value;
}

/**
 * Mật khẩu nhân viên: tối thiểu 10 ký tự — docs/12-security.md §3.
 *
 * Không bắt buộc ký tự đặc biệt: quy tắc rườm rà đẩy người ta tới chỗ viết mật
 * khẩu ra giấy dán màn hình, và độ dài mới là thứ thật sự chống dò.
 */
export const MIN_PASSWORD_LENGTH = 10;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} ký tự trở lên`;
  }
  if (/^\d+$/.test(password)) {
    return "Mật khẩu không được chỉ gồm chữ số";
  }
  return null;
}
