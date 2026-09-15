/**
 * Tải ảnh về máy khách — BB-156.
 *
 * OWNER: DEV-FE.
 *
 * ---------------------------------------------------------------------------
 * Vì sao tải theo LÔ chứ không bắn hết một lượt
 * ---------------------------------------------------------------------------
 * Chủ studio chốt 15.09.2026: tải cả bộ, KHÔNG nén, "xếp lượt tải dần 10 đến 20
 * ảnh một lượt, hết thì tự tải tiếp đến khi hết".
 *
 * Đó cũng là cách duy nhất chạy được. Một bộ có tới 1.235 ảnh; bắn 1.235 lượt
 * tải cùng lúc thì trình duyệt chặn sau vài chục cái, và điện thoại hết bộ nhớ
 * trước khi kịp lưu. Tải từng lô, lô xong mới tới lô sau, thì mỗi lúc chỉ có
 * một ảnh nằm trong bộ nhớ.
 *
 * ---------------------------------------------------------------------------
 * Vì sao tự tải bằng fetch thay vì để trình duyệt tự đi
 * ---------------------------------------------------------------------------
 * Vì phải BÁO ĐƯỢC khi máy khách hết chỗ. Thả một thẻ <a download> ra thì trình
 * duyệt nuốt lỗi, app không biết gì để nói với ba mẹ. Tự fetch rồi tự lưu thì
 * bắt được lỗi và nói thẳng: "máy đã hết dung lượng, còn 812 ảnh chưa tải".
 */

export interface AnhCanTai {
  id: string;
  fileName: string;
}

export interface TienDoTai {
  daXong: number;
  tong: number;
  dangTai: string | null;
  loi: string | null;
  hetChoTrongMay: boolean;
}

/** Số ảnh mỗi lô. Trong khoảng chủ studio chốt: 10–20. */
export const SO_ANH_MOI_LO = 15;

/** Đổi số byte thành chữ đọc được: 6.9 GB, 412 MB. */
export function doDocDuocDungLuong(byte: number | null | undefined): string {
  const n = Number(byte ?? 0);
  if (!n) return "chưa rõ";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * Nhận diện lỗi HẾT CHỖ trên máy khách.
 *
 * Mỗi trình duyệt gọi một kiểu, nên soi cả tên lẫn lời: QuotaExceededError của
 * chuẩn, NS_ERROR_FILE_NO_DEVICE_SPACE của Firefox, và câu "disk" / "space" mà
 * Chrome trả ra.
 */
export function laLoiHetCho(err: unknown): boolean {
  const ten = (err as { name?: string } | null)?.name ?? "";
  const loi = String((err as { message?: string } | null)?.message ?? err ?? "").toLowerCase();
  return (
    ten === "QuotaExceededError" ||
    ten === "NS_ERROR_FILE_NO_DEVICE_SPACE" ||
    loi.includes("quota") ||
    loi.includes("no space") ||
    loi.includes("disk full") ||
    loi.includes("not enough space")
  );
}

/** Lưu một blob xuống máy bằng một thẻ neo tạm. */
function luuXuongMay(blob: Blob, tenTep: string): void {
  const dia = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = dia;
    a.download = tenTep;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Thu hồi ngay: mỗi địa chỉ tạm giữ nguyên cả tấm ảnh trong bộ nhớ, và một
    // bộ 1.235 ảnh thì đó là vài GB không ai dọn.
    setTimeout(() => URL.revokeObjectURL(dia), 10_000);
  }
}

/**
 * Tải một danh sách ảnh, theo lô, tuần tự trong từng lô.
 *
 * Dừng ngay khi máy hết chỗ — tải tiếp chỉ làm ba mẹ chờ thêm để nhận thêm lỗi.
 * Trả về số ảnh đã tải xong.
 */
export async function taiTheoLo(
  danhSach: AnhCanTai[],
  capNhat: (tienDo: TienDoTai) => void,
  dungLai: () => boolean,
): Promise<number> {
  let xong = 0;

  for (let i = 0; i < danhSach.length; i += SO_ANH_MOI_LO) {
    const lo = danhSach.slice(i, i + SO_ANH_MOI_LO);

    for (const anh of lo) {
      if (dungLai()) {
        capNhat({ daXong: xong, tong: danhSach.length, dangTai: null, loi: null, hetChoTrongMay: false });
        return xong;
      }

      capNhat({ daXong: xong, tong: danhSach.length, dangTai: anh.fileName, loi: null, hetChoTrongMay: false });

      try {
        // Không gửi cỡ: ?tai=1 luôn trả ảnh GỐC trên Drive (BB-161).
        const res = await fetch(`/api/img/${anh.id}?tai=1`, { cache: "no-store" });
        if (!res.ok) throw new Error(`máy chủ trả ${res.status}`);
        const blob = await res.blob();
        luuXuongMay(blob, anh.fileName);
        xong += 1;
      } catch (err) {
        const hetCho = laLoiHetCho(err);
        capNhat({
          daXong: xong,
          tong: danhSach.length,
          dangTai: null,
          loi: hetCho
            ? `Máy đã hết dung lượng. Đã tải ${xong}/${danhSach.length} ảnh — dọn bớt chỗ rồi bấm tải tiếp, những ảnh đã tải sẽ không tải lại.`
            : `Không tải được ảnh ${anh.fileName}. Đã tải ${xong}/${danhSach.length}.`,
          hetChoTrongMay: hetCho,
        });
        if (hetCho) return xong;
      }
    }
  }

  capNhat({ daXong: xong, tong: danhSach.length, dangTai: null, loi: null, hetChoTrongMay: false });
  return xong;
}
