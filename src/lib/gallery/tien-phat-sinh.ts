/**
 * Tính tiền phát sinh — các hàm THUẦN cho màn quản trị (BB-320).
 *
 * Hai việc chủ dự án giao:
 *
 *  A. CSKH sửa dòng hàng ở mọi trạng thái trừ "lưu trữ". Sau khi sửa hạn mức, số
 *     ảnh vượt và số tiền phát sinh phải HIỆN LẠI theo hạn mức MỚI — nhưng con số
 *     khách đã nhìn thấy lúc chốt (`snapshot_extra_amount`) KHÔNG đổi, vì khách
 *     trả theo số đó (xem chú thích ở payments/route.ts). Nên hai con số nằm
 *     cạnh nhau, không thay nhau: `tinhPhatSinhTheoHanMuc` chỉ là số THEO HẠN MỨC
 *     HIỆN TẠI để CSKH đối chiếu.
 *
 *  B. "Giảm giá %" khi ghi nhận thu tiền. Sổ thanh toán chỉ ghi thêm; phần giảm
 *     là MỘT DÒNG RIÊNG (`payment_method = 'giam_gia'`, số dương = ghi có cho
 *     khách) có người ghi và lý do, để số còn thiếu về đúng 0 khi khách trả đủ
 *     phần sau giảm. `tinhGiamGia` là công thức duy nhất — màn hình dùng nó để
 *     gợi ý, route dùng nó để ghi; không hai bên tính hai kiểu.
 */

/** BB-344 — câu hiện (màn hình) và trả về (máy chủ) khi bộ ảnh chưa có khoản nào cần thu. */
export const CAU_CHUA_PHAT_SINH_TIEN = "Chưa phát sinh tiền cần thu";

/** Loại dòng sổ dành cho phần giảm giá (cột `gallery_payments.payment_method`, không cần cột mới). */
export const HINH_THUC_GIAM_GIA = "giam_gia";

/** Làm tròn về nghìn đồng gần nhất (nửa nghìn làm tròn lên). */
export function lamTronNghin(soTien: number): number {
  return Math.round(soTien / 1000) * 1000;
}

export interface KetQuaGiamGia {
  /** Số tiền khách phải trả sau giảm, đã làm tròn nghìn đồng. */
  soTienGoiY: number;
  /** Phần được giảm = còn thiếu − số tiền gợi ý. Luôn ≥ 0. */
  soTienGiam: number;
}

/**
 * Giảm `phanTram`% trên số CÒN THIẾU.
 *
 * Số tiền gợi ý = còn thiếu × (1 − %/100), làm tròn nghìn đồng; phần giảm là phần
 * còn lại, nên gợi ý + giảm luôn đúng bằng số còn thiếu — không lệch một đồng.
 *
 * Trả null khi không tính được: còn thiếu ≤ 0 (không còn gì để giảm), % ngoài
 * (0, 100] hoặc không phải số.
 */
export function tinhGiamGia(conThieu: number, phanTram: number): KetQuaGiamGia | null {
  if (!Number.isFinite(conThieu) || conThieu <= 0) return null;
  if (!Number.isFinite(phanTram) || phanTram <= 0 || phanTram > 100) return null;
  const goiY = Math.min(conThieu, Math.max(0, lamTronNghin(conThieu * (1 - phanTram / 100))));
  return { soTienGoiY: goiY, soTienGiam: conThieu - goiY };
}

/**
 * Số ảnh vượt và tiền phát sinh THEO HẠN MỨC HIỆN TẠI.
 *
 * - `hanMuc` null = chưa biết hạn mức → không kết luận (trả null), giống báo cáo
 *   vượt hạn mức: chưa đủ dữ liệu thì không đoán.
 * - Ảnh khách đã mua thêm (sản phẩm `edited_photo`) trừ khỏi số ảnh vượt, đúng
 *   như `v_over_quota_unbilled`.
 */
export function tinhPhatSinhTheoHanMuc(input: {
  soAnhDaChon: number;
  hanMuc: number | null;
  giaAnhVuot: number;
  anhDaMuaThem?: number;
}): { anhVuot: number; tien: number } | null {
  if (input.hanMuc === null || !Number.isFinite(input.hanMuc)) return null;
  const vuot = Math.max(0, input.soAnhDaChon - input.hanMuc);
  const anhVuot = Math.max(0, vuot - Math.max(0, input.anhDaMuaThem ?? 0));
  return { anhVuot, tien: anhVuot * Math.max(0, input.giaAnhVuot) };
}

/**
 * Câu báo sau khi CSKH đổi hạn mức: nói số ảnh vượt / tiền theo hạn mức MỚI và
 * nhắc rằng số lúc khách chốt giữ nguyên (không bị đổi ngầm).
 */
export function cauBaoSauDoiHanMuc(input: {
  hanMucTruoc: number | null;
  hanMucSau: number | null;
  soAnhDaChon: number;
  giaAnhVuot: number;
  anhDaMuaThem?: number;
  /** `snapshot_extra_amount` — số khách đã nhìn thấy lúc chốt. */
  soTienLucChot: number;
  dinhDangTien: (n: number) => string;
}): string | null {
  if (input.hanMucTruoc === input.hanMucSau) return null;
  const truoc = input.hanMucTruoc ?? "chưa biết";
  const sau = input.hanMucSau ?? "chưa biết";
  let cau = `Hạn mức đã đổi: ${truoc} → ${sau} ảnh.`;
  const moi = tinhPhatSinhTheoHanMuc({
    soAnhDaChon: input.soAnhDaChon,
    hanMuc: input.hanMucSau,
    giaAnhVuot: input.giaAnhVuot,
    anhDaMuaThem: input.anhDaMuaThem,
  });
  if (moi && input.soAnhDaChon > 0) {
    cau +=
      moi.anhVuot > 0
        ? ` Khách đã chọn ${input.soAnhDaChon} ảnh, nay vượt ${moi.anhVuot} ảnh = ${input.dinhDangTien(moi.tien)}.`
        : ` Khách đã chọn ${input.soAnhDaChon} ảnh, nay không còn vượt hạn mức.`;
    if (input.soTienLucChot > 0 && moi.tien !== input.soTienLucChot) {
      cau += ` Số khách nhìn thấy lúc chốt (${input.dinhDangTien(input.soTienLucChot)}) giữ nguyên.`;
    }
  }
  return `${cau} Nhớ báo lại cho khách.`;
}

/**
 * Số tiền còn phải thu của một bộ vượt hạn mức SAU KHI trừ mọi khoản đã ghi có
 * (tiền đã thu + phần giảm giá) — dùng cho báo cáo "vượt hạn mức, chưa thu tiền".
 * Không âm: khách trả dư thì bộ đó không còn "chưa thu" (khoản dư là chuyện khác).
 */
export function tienConPhaiThuSauGhiCo(tienChuaThuTheoAnh: number, daGhiCo: number): number {
  return Math.max(0, tienChuaThuTheoAnh - Math.max(0, daGhiCo));
}

/**
 * BB-327 — số còn phải thu của MỘT bộ trong danh sách "Ảnh vượt hạn mức".
 *
 * Chủ studio 29/09/2026: bộ đã xác nhận thanh toán vẫn nằm trong danh sách.
 * Nguyên nhân: danh sách tính "phải thu" theo ảnh vượt × giá ảnh HIỆN TẠI
 * (view `v_over_quota_unbilled`), còn màn chi tiết + sổ thu tiền tính theo số
 * khách NHÌN THẤY LÚC CHỐT (`snapshot_extra_amount`). Giá ảnh thêm đổi (vd
 * 40.000 → 50.000) hoặc hạn mức đổi sau khi chốt là hai con số lệch nhau: CSKH
 * thu đủ theo số lúc chốt, chi tiết báo "đã thu đủ", danh sách vẫn đòi phần
 * chênh. Nay danh sách dùng CÙNG số với sổ thu: số lúc chốt khi có (> 0); chưa
 * chốt hoặc lúc chốt chưa biết hạn mức (0) thì mới lùi về số theo ảnh.
 */
export function tienVuotHanMucConPhaiThu(p: {
  tienTheoAnh: number;
  tienLucChot: number | null | undefined;
  daGhiCo: number;
  /** BB-348 — xem `TienHanMucDaQuyDoi`. Bỏ trống = bộ chưa có dòng hạn mức nào do thanh toán. */
  quyDoi?: TienHanMucDaQuyDoi;
}): number {
  return tienConPhaiThuSauGhiCo(tienVuotHanMucPhaiThu(p), p.daGhiCo);
}

/**
 * BB-348 — giá trị (đồng) của các dòng "Ảnh chỉnh thêm" mà app TỰ thêm vào hạn mức
 * khi CSKH xác nhận thanh toán (`han-muc-thanh-toan.ts`).
 *
 * Vì sao cần: dòng đó làm hạn mức tăng N, nên "số theo ảnh" (`v_over_quota_unbilled`)
 * tự giảm N ảnh — trong khi khoản tiền trả cho N ảnh đó VẪN nằm trong `daGhiCo`.
 * Không cộng lại thì N ảnh bị trừ HAI LẦN (một lần qua hạn mức, một lần qua tiền
 * đã thu) và số còn phải thu ra thấp hơn thật. Cộng lại đúng giá trị đó thì việc
 * tăng hạn mức KHÔNG làm đổi số tiền nào — nó chỉ đổi con số hạn mức hiển thị.
 *
 *   · `tatCa`     — mọi dòng như vậy; số theo ảnh luôn tính trên hạn mức HIỆN TẠI.
 *   · `truocChot` — chỉ những dòng tạo TRƯỚC lúc khách chốt: số lúc chốt
 *     (`snapshot_extra_amount`) chụp hạn mức lúc đó, nên chỉ thiếu đúng những dòng này.
 */
export interface TienHanMucDaQuyDoi {
  tatCa: number;
  truocChot: number;
}

/** Phần vượt hạn mức phải thu, CHƯA trừ khoản ghi có (số lúc chốt khi có, không thì số theo ảnh). */
export function tienVuotHanMucPhaiThu(p: {
  tienTheoAnh: number;
  tienLucChot: number | null | undefined;
  quyDoi?: TienHanMucDaQuyDoi;
}): number {
  const lucChot = Number(p.tienLucChot ?? 0);
  return Number.isFinite(lucChot) && lucChot > 0
    ? lucChot + Math.max(0, p.quyDoi?.truocChot ?? 0)
    : p.tienTheoAnh + Math.max(0, p.quyDoi?.tatCa ?? 0);
}

/**
 * BB-348 — bao nhiêu ảnh vượt đã được TRẢ ĐỦ tiền, tức hạn mức phải tăng bấy nhiêu.
 *
 * Chọn "chỉ cộng số ảnh đã trả đủ" (không chờ trả hết): khách trả trước 3/5 ảnh thì
 * hạn mức tăng 3, còn 2 ảnh vẫn nằm trong báo cáo đòi tiền — khớp từng đồng với
 * `tienCanThuCuaBo`. Ảnh trả dở (lẻ tiền) chưa tính: làm tròn LÊN số ảnh còn nợ.
 *
 * Tiền ghi có trừ vào phần VƯỢT HẠN MỨC trước (đúng như báo cáo "Ảnh vượt hạn mức"
 * đang trừ), đợt mua thêm không chen vào đây.
 *
 * Hàm tính MỤC TIÊU (tổng số ảnh do thanh toán), không phải phần cộng thêm: gọi lại
 * bao nhiêu lần cũng ra cùng số, và dòng đính chính (âm) làm mục tiêu giảm xuống.
 */
export function soAnhHanMucTheoThanhToan(p: {
  /** Số ảnh vượt tính trên hạn mức KHÔNG kể dòng do thanh toán (đã trừ ảnh mua thêm). */
  anhVuotGoc: number;
  /** Phần vượt hạn mức còn phải thu sau mọi khoản ghi có (`tienVuotHanMucConPhaiThu`). */
  conThieuVuot: number;
  giaMotAnh: number;
}): number {
  const vuot = Math.max(0, Math.floor(Number.isFinite(p.anhVuotGoc) ? p.anhVuotGoc : 0));
  if (vuot === 0 || !Number.isFinite(p.giaMotAnh) || p.giaMotAnh <= 0) return 0;
  const conThieu = Math.max(0, Number.isFinite(p.conThieuVuot) ? p.conThieuVuot : 0);
  const anhConNo = Math.ceil(conThieu / p.giaMotAnh);
  return Math.min(vuot, Math.max(0, vuot - anhConNo));
}

/**
 * BB-344 — SỐ TIỀN CÒN PHẢI THU của một bộ ảnh: một con số cho khối "Xác nhận
 * thanh toán" ở chi tiết bộ ảnh (nút có bấm được không) lẫn route ghi thu (có
 * nhận dòng tiền không). Luật chủ studio: "nếu không phát sinh thì khối không
 * nhấn được".
 *
 * = (phần vượt hạn mức, đúng công thức báo cáo Ảnh vượt hạn mức:
 *    `tienVuotHanMucConPhaiThu` — số lúc chốt, chưa chốt thì số theo ảnh)
 *   + (các đợt MUA THÊM đã xác nhận, `tienDotMuaThem`)
 *   − mọi khoản đã ghi có (tiền thu + giảm giá). Không âm.
 *
 * Đợt mua thêm đã thanh toán rồi thì khoản thu nằm trong `daGhiCo` nên tự trừ
 * hết — không cần cờ "đã thanh toán" riêng (luật số dư = 0 của BB-332).
 */
export function tienCanThuCuaBo(p: {
  tienTheoAnh: number;
  tienLucChot: number | null | undefined;
  /** BB-360 — TIỀN ẢNH của phần mua thêm (đợt ≥ 2 `tien_anh` + "Edit file" mọi đợt). Luôn thu qua app. */
  tienDotMuaThem: number;
  /** BB-360 — xem `tienSanPhamTinhVaoPhaiThu`. */
  tienSanPham?: number;
  thuSanPhamQuaApp?: boolean;
  daGhiCo: number;
  /** BB-348 — xem `TienHanMucDaQuyDoi`. */
  quyDoi?: TienHanMucDaQuyDoi;
}): number {
  return tienConPhaiThuSauGhiCo(tongPhaiThuCuaBo(p), p.daGhiCo);
}

/**
 * BB-351 — TỔNG PHẢI THU (chưa trừ khoản ghi có): phần vượt hạn mức + đợt mua thêm đã xác
 * nhận. Là "Phải thu" duy nhất cho mọi màn hình; "còn thiếu" = tổng này − đã ghi có. Không
 * dùng riêng `snapshot_extra_amount`: số đó chỉ là lượt chốt mới nhất, thiếu phần hạn mức
 * đã quy đổi trước đó và các đợt mua thêm — chính là lỗi "khách trả DƯ" vòng 7.
 */
export function tongPhaiThuCuaBo(p: {
  tienTheoAnh: number;
  tienLucChot: number | null | undefined;
  /** BB-360 — TIỀN ẢNH của phần mua thêm (luôn thu qua app). */
  tienDotMuaThem: number;
  /** BB-360 — tiền SẢN PHẨM (ảnh in / khung / album) mọi đợt; chỉ cộng khi `thuSanPhamQuaApp`. */
  tienSanPham?: number;
  thuSanPhamQuaApp?: boolean;
  quyDoi?: TienHanMucDaQuyDoi;
}): number {
  const vuot = tienVuotHanMucPhaiThu({ tienTheoAnh: p.tienTheoAnh, tienLucChot: p.tienLucChot, quyDoi: p.quyDoi });
  const dot = Number.isFinite(p.tienDotMuaThem) ? Math.max(0, p.tienDotMuaThem) : 0;
  return vuot + dot + tienSanPhamTinhVaoPhaiThu(p.tienSanPham ?? 0, p.thuSanPhamQuaApp === true);
}

/**
 * BB-360 — khoá cài đặt (bảng `settings`, `branch_id` null): app có THU tiền sản phẩm mua thêm
 * (ảnh in / khung / album) không. Anh chốt 02/10/2026: hiện thu qua Lark, "sau này mới chuyển
 * sang thu trong app" → MẶC ĐỊNH TẮT. Thiếu dòng / đọc hụt / giá trị lạ = tắt.
 */
export const KHOA_THU_SAN_PHAM_QUA_APP = "thanh_toan.thu_san_pham_qua_app";

/**
 * BB-360 — CHỖ RẼ NHÁNH DUY NHẤT của cờ `thanh_toan.thu_san_pham_qua_app`. Màn hình không rẽ:
 *   · bật  → tiền sản phẩm nằm trong "Phải thu / Còn thiếu / amountToCollect" (như BB-359);
 *   · tắt  → 0 ở đó; phần này hiện riêng một dòng "Sản phẩm mua thêm: X ₫ · thu qua Lark".
 */
export function tienSanPhamTinhVaoPhaiThu(tienSanPham: number, thuSanPhamQuaApp: boolean): number {
  if (!thuSanPhamQuaApp) return 0;
  return Number.isFinite(tienSanPham) ? Math.max(0, tienSanPham) : 0;
}

/** BB-360 — phần sản phẩm thu NGOÀI app (qua Lark): bù đúng phần `tienSanPhamTinhVaoPhaiThu` bỏ ra. */
export function tienSanPhamThuQuaLark(tienSanPham: number, thuSanPhamQuaApp: boolean): number {
  const tong = Number.isFinite(tienSanPham) ? Math.max(0, tienSanPham) : 0;
  return tong - tienSanPhamTinhVaoPhaiThu(tong, thuSanPhamQuaApp);
}

/** BB-360 — đọc giá trị cờ đã lưu: chỉ đúng `true` (boolean) mới là bật. */
export function laBatThuSanPhamQuaApp(value: unknown): boolean {
  return value === true;
}

/**
 * BB-363 — anh chốt 02/10/2026: cờ KHÔNG hồi tố. Lúc cờ được BẬT, máy chủ ghi mốc hiệu lực vào
 * khoá này (`settings`, chuỗi ISO; route PATCH /api/admin/settings ghi, không sửa tay được).
 * Chỉ sản phẩm của giỏ CHỐT TỪ MỐC ĐÓ trở đi mới thu qua app; bộ chốt trước vẫn "thu qua Lark"
 * — không hiện "còn thiếu" cho khoản đã thu ngoài app.
 */
export const KHOA_THU_SAN_PHAM_QUA_APP_TU = "thanh_toan.thu_san_pham_qua_app_tu";

/** Đọc mốc hiệu lực đã lưu: chuỗi ngày hợp lệ → ISO; mọi thứ khác → null. */
export function docMocThuSanPhamQuaApp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * BB-363 — CHỖ RẼ NHÁNH DUY NHẤT theo mốc hiệu lực: tiền sản phẩm của MỘT giỏ (đợt 1 = lúc lượt
 * chọn chính chốt; đợt ≥ 2 = lúc đợt đó được gửi) có thu qua app không.
 *   · cờ tắt                        → không (thu qua Lark);
 *   · cờ bật nhưng thiếu mốc        → không (an toàn: không bao giờ đòi tiền hồi tố);
 *   · giỏ chưa có lúc chốt          → không (chưa phải khoản phải thu);
 *   · lúc chốt ≥ mốc                → CÓ; trước mốc → không.
 */
export function sanPhamThuTrongApp(
  co: { bat: boolean; tu: string | null },
  chotLuc: string | null | undefined,
): boolean {
  if (!co.bat || !co.tu || !chotLuc) return false;
  const moc = Date.parse(co.tu);
  const luc = Date.parse(chotLuc);
  return Number.isFinite(moc) && Number.isFinite(luc) && luc >= moc;
}
