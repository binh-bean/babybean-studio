/**
 * Băm mã link gửi khách.
 *
 * Cột `share_links.token_hash` giữ SHA-256 dạng hex của mã 22 ký tự trên thanh
 * địa chỉ. Mã trần KHÔNG bao giờ nằm trong cơ sở dữ liệu — sau khi bỏ mã PIN
 * (BB-169), chuỗi đó là thứ **duy nhất** che ảnh của một nhà.
 *
 * Hàm này đứng riêng vì nay có HAI đường cần băm: đường đăng nhập
 * (`/api/auth/gallery`) và đường so mã với phiên (`/api/g/gallery`, BB-187).
 * Hai bản sao chép của cùng một phép băm là chỗ trôi nhau về sau — trôi ở đây
 * nghĩa là mọi link đều không mở được, hoặc tệ hơn, mọi link đều so trượt và
 * chốt BB-187 im lặng ngừng chặn.
 */
export async function bamMaLink(maTran: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(maTran));
  return Buffer.from(buf).toString("hex");
}
