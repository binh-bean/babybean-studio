"use client";

/**
 * "Tấm này in ra cái gì" — bảng bên cạnh ảnh đang xem lớn.
 *
 * OWNER: DEV-FE. Chủ studio 22/09/2026, chỉ thẳng vào ảnh chụp màn hình:
 *
 *     "Phần đánh dấu màu xanh là phần chọn ảnh làm ảnh gì. Ví dụ ảnh phóng
 *      trong gói là 40x60 gỗ thì ở đó hiển thị 'trong gói có 01 ảnh 40x60
 *      gỗ…', hoặc mua thêm chọn…"
 *
 * ---------------------------------------------------------------------------
 * Vì sao đặt ở màn xem lớn chứ không ở lưới ảnh
 * ---------------------------------------------------------------------------
 * Câu hỏi "tấm này in cỡ nào, chất liệu gì" chỉ trả lời được khi đang nhìn KỸ
 * một tấm. Ở lưới 460 ảnh thì ba mẹ đang so sánh, chưa quyết. Cùng lý do với ô
 * ghi chú cho thợ chỉnh ảnh (BB-180) đã đặt ở đây từ trước.
 *
 * Màn xem lớn cũng đang bỏ trống hai bên ảnh trên máy tính — chỗ ấy vốn chỉ để
 * bấm-ra-ngoài-thì-đóng.
 *
 * ---------------------------------------------------------------------------
 * Hai phần, theo đúng thứ tự ba mẹ nghĩ
 * ---------------------------------------------------------------------------
 *  1. **Trong gói** — những suất đã trả tiền rồi, còn trống mấy suất. Đây là
 *     thứ phải hiện TRƯỚC: dùng hết suất trong gói rồi mới nên bán thêm.
 *  2. **Mua thêm** — bày theo ba nhóm chủ studio gọi tên (ảnh in/ảnh phóng,
 *     album, khung), trong nhóm phân theo chất liệu và kích thước.
 *
 * Cả hai đều gắn vào ĐÚNG tấm đang xem. Không có chỗ nào chọn "sản phẩm chung
 * chung" nữa — thợ in phải biết in tấm nào.
 */

import React from "react";
import { cn } from "@/components/ui/utils";
import { THU_TU_NHOM, TEN_NHOM, type NhomSanPham } from "@/lib/products/nhom-san-pham";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatKichThuoc } from "@/lib/utils/dinh-dang";

export interface SuatTrongGoi {
  galleryItemId: string;
  name: string;
  /** Tổng số suất của dòng hàng này trong hợp đồng. */
  quantity: number;
  /** Đã đặt ảnh vào bao nhiêu suất (của MỌI tấm, không riêng tấm đang xem). */
  daDat: number;
  /** Tấm đang xem có nằm trong dòng hàng này không. */
  coAnhNay: boolean;
}

export interface MonMuaThem {
  productId: string;
  name: string;
  material: string | null;
  size: string | null;
  unitPrice: number;
  nhom: NhomSanPham;
  canGanAnh: boolean;
  /** Số lượng đang đặt CHO TẤM ĐANG XEM. */
  soLuong: number;
}

export interface AlbumDaMua {
  addonId: string;
  name: string;
  /** Tấm đang xem đã nằm trong album này chưa. */
  coAnhNay: boolean;
  /** Tổng số ảnh đã đưa vào album này. */
  soAnh: number;
}

/**
 * Album nằm sẵn TRONG GÓI — ba mẹ đã trả tiền từ lúc ký hợp đồng.
 *
 * Chủ studio 22/09/2026: "album không phải là một ảnh, và ảnh ở trong gói đã
 * mua rồi". Trước đây cuốn album trong gói bị xếp chung với suất ảnh in, nên
 * "Album (Ultra HD) ×1" hiện thành "Còn 1 suất" rồi "Đã dùng hết suất" ngay sau
 * tấm đầu tiên — ba mẹ mất đường đưa tấm thứ hai vào cuốn của chính mình.
 *
 * Khác `AlbumDaMua` ở chỗ nó gắn vào dòng hợp đồng (`gallery_items`) chứ không
 * phải dòng mua thêm, nên ảnh đi vào `selection_placements`.
 */
export interface AlbumTrongGoi {
  galleryItemId: string;
  name: string;
  coAnhNay: boolean;
  soAnh: number;
}

export interface BangSanPhamCuaAnhProps {
  /** Suất in/khung trong gói: mỗi suất đúng MỘT tấm. */
  suatTrongGoi: SuatTrongGoi[];
  /** Album có sẵn trong hợp đồng — mỗi cuốn nhận nhiều ảnh. */
  albumTrongGoi: AlbumTrongGoi[];
  /** Album ba mẹ ĐÃ mua thêm — mỗi cái nhận nhiều ảnh. */
  albumDaMua: AlbumDaMua[];
  monMuaThem: MonMuaThem[];
  /** Tấm đang xem đã được ba mẹ chọn chưa — chưa chọn thì chưa đặt in được. */
  anhDaChon: boolean;
  khoa: boolean;
  dangLuu: boolean;
  onDatVaoGoi: (galleryItemId: string, dat: boolean) => void;
  onDatVaoAlbum: (addonId: string, dat: boolean) => void;
  onDatMuaThem: (productId: string, soLuong: number) => void;
  /** Mua một album mới (không gắn ảnh — ảnh đưa vào sau). */
  onMuaAlbum: (productId: string, soLuong: number) => void;
  /** Album trong bảng giá, để ba mẹ mua thêm một cuốn. */
  albumBanDuoc: MonMuaThem[];
  /**
   * BB-217 — mở màn "treo ảnh của con lên tường" cho đúng tấm đang xem.
   *
   * `undefined` thì nút không hiện (ví dụ danh mục chưa có sản phẩm ảnh in
   * nào để treo — không có gì để ướm lên tường).
   */
  onXemTuong?: () => void;
  /**
   * BB-279 — ĐƯỜNG THỨ HAI vào cửa hàng: mở thẳng bộ cấu hình của nhóm này
   * (`cua-hang.tsx`) với tấm đang xem đã chọn sẵn, thay vì liệt kê phẳng từng
   * sản phẩm ở đây (đó chính là "danh mục tràn lan" chủ studio muốn bỏ).
   *
   * `undefined` thì không hiện nút — dùng khi màn gọi component này chưa nối
   * cửa hàng mới (vd. còn nơi khác dùng bảng này trước khi BB-279 gộp xong).
   */
  onDatInTamNay?: (nhom: NhomSanPham) => void;
  /**
   * BB-293 vòng 2 mục #3 — giám đốc: cột phải màn xem lớn MÁY TÍNH đổi từ
   * nền tối đặc sang nền KÍNH SÁNG (đúng bản vẽ BB-285
   * `xem-lon-dat-in-dien-thoai.png`) — component này vốn chỉ có MỘT tông chữ
   * trắng (dựng cho tấm trượt tối trên điện thoại). `tong="sang"` đổi toàn
   * bộ chữ/nền phụ sang tông sáng (#2E2A27 / #6b6057 trên nền kem); mặc định
   * `"toi"` giữ NGUYÊN hành vi cũ cho tấm trượt điện thoại — không đổi gì ở
   * đó.
   */
  tong?: "sang" | "toi";
}

export function BangSanPhamCuaAnh({
  suatTrongGoi,
  albumTrongGoi,
  albumDaMua,
  monMuaThem,
  albumBanDuoc,
  anhDaChon,
  khoa,
  dangLuu,
  onDatVaoGoi,
  // BB-202: không còn dùng ở đây (xem ghi chú tại chỗ hiện albumDaMua bên
  // dưới) — giữ lại trong interface để không phải sửa mọi nơi gọi component
  // này, đổi tên có gạch dưới để qua luật no-unused-vars của dự án.
  onDatVaoAlbum: _onDatVaoAlbum,
  onDatMuaThem,
  onMuaAlbum,
  onXemTuong,
  onDatInTamNay,
  tong = "toi",
}: BangSanPhamCuaAnhProps) {
  const [nhomDangMo, setNhomDangMo] = React.useState<NhomSanPham | null>(null);
  const sang = tong === "sang";

  /**
   * Bảng lớp CSS theo tông — tính một lần, dùng lại khắp component. Giữ
   * NGUYÊN các chuỗi lớp cũ (tông "toi") ở nhánh else của mỗi khoá, để hành
   * vi tấm trượt điện thoại không đổi một chút nào.
   */
  const T = {
    // Chữ chính (thay `text-white` gốc trên thẻ bọc ngoài).
    chuChinh: sang ? "text-[#2E2A27]" : "text-white",
    // Chữ phụ/nhạt — thay mọi biến thể `text-white/xx`.
    chuMo: sang ? "text-[#6b6057]" : "text-white/55",
    chuMoNhat: sang ? "text-[#8a8078]" : "text-white/50",
    chuMoHon: sang ? "text-[#6b6057]" : "text-white/60",
    chuMoNua: sang ? "text-[#6b6057]" : "text-white/70",
    // Thẻ/nút nền mờ (`bg-white/10 hover:bg-white/15`) — trên nền sáng đổi
    // thành lớp mực rất nhạt để vẫn phân biệt được với nền.
    theNen: sang
      ? "bg-[#2E2A27]/[0.05] hover:bg-[#2E2A27]/[0.09]"
      : "bg-white/10 hover:bg-white/15",
    theNenTinh: sang ? "bg-[#2E2A27]/[0.05]" : "bg-white/10",
    // Dòng lồng bên trong một khối đã mở (`bg-black/25`) — trên nền sáng
    // dùng thẻ trắng thật + viền mảnh thay vì lớp đen mờ (sẽ ngược tông).
    dongLong: sang ? "bg-white ring-1 ring-[#e5dcd2]" : "bg-black/25",
    vienNhat: sang ? "ring-1 ring-[#e5dcd2]" : "ring-1 ring-white/10",
  };

  if (!anhDaChon) {
    return (
      <p className={cn("text-xs leading-relaxed", T.chuMoHon)}>
        Ba mẹ thả tim chọn tấm này trước, rồi mới đặt in được.
      </p>
    );
  }

  const theoNhom = (nhom: NhomSanPham) => monMuaThem.filter((m) => m.nhom === nhom);
  const daDatTrongNhom = (nhom: NhomSanPham) =>
    theoNhom(nhom).reduce((n, m) => n + m.soLuong, 0);

  return (
    <div className={cn("space-y-4", T.chuChinh)}>
      {/*
        BB-217 — lối vào chính của màn bán hàng "treo lên tường". Chủ studio:
        ba mẹ mua ảnh treo tường khi THẤY nó trên tường nhà mình, nên nút này
        phải nổi bật, ở TRÊN mọi danh mục khác — không chờ cuộn xuống mới thấy.
        Chỉ hiện khi có sản phẩm ảnh in để treo (không có thì màn kia trống trơn).
      */}
      {/*
        BB-287 — báo cáo chấm mục #11: gradient đỏ rượu viền vàng không nằm
        trong bảng màu (#FBF7F2/#2E2A27/#C4645A/#E8A598/#4F5B45/#7FA99B) và
        "nhìn rất sến". Đổi về nền tối #2E2A27 (mực), chữ kem — đúng tông thẻ
        "Xem trên tường" theo hệ thiết kế, không còn amber/rose ngoài bảng.
      */}
      {onXemTuong && (
        <button
          type="button"
          onClick={onXemTuong}
          className="flex w-full items-center justify-between gap-2 rounded-xl bg-[#2E2A27] px-3.5 py-3 text-left ring-1 ring-white/10 transition hover:bg-[#3a352f]"
        >
          <span>
            <span className="block text-sm font-semibold text-[#FBF7F2]">Xem trên tường nhà mình</span>
            <span className="block text-[11px] text-[#FBF7F2]/70">Ướm đúng cỡ, đúng chất liệu, giá thật</span>
          </span>
          <span className="shrink-0 text-base leading-none text-[#FBF7F2]">→</span>
        </button>
      )}

      {/* ---------- 1. TRONG GÓI ---------- */}
      {suatTrongGoi.length > 0 && (
        <section>
          <h3 className={cn("kh-eyebrow mb-1.5", T.chuMoNhat)}>
            Trong gói
          </h3>
          <ul className="space-y-1.5">
            {suatTrongGoi.map((sp) => {
              const conTrong = sp.quantity - sp.daDat;
              return (
                <li key={sp.galleryItemId}>
                  <button
                    type="button"
                    disabled={khoa || dangLuu || (!sp.coAnhNay && conTrong <= 0)}
                    onClick={() => onDatVaoGoi(sp.galleryItemId, !sp.coAnhNay)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors",
                      sp.coAnhNay
                        ? "bg-[#7FA99B]/20 ring-1 ring-[#7FA99B]/50"
                        : T.theNen,
                      (khoa || dangLuu) && "opacity-60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{sp.name}</span>
                      {/*
                        Nói bằng SỐ SUẤT còn trống, không nói "đã dùng x/y".
                        Ba mẹ đang hỏi "tôi còn được in mấy tấm nữa", chứ không
                        hỏi một tỉ lệ.
                      */}
                      <span className={cn("block", T.chuMo)}>
                        {sp.coAnhNay
                          ? "Đang chọn tấm này"
                          : conTrong > 0
                            ? `Còn ${conTrong} suất`
                            : "Đã dùng hết suất"}
                      </span>
                    </span>
                    <span className="shrink-0 text-base leading-none">
                      {sp.coAnhNay ? "✓" : conTrong > 0 ? "+" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---------- 2. ALBUM ---------- */}
      {(albumTrongGoi.length > 0 || albumDaMua.length > 0 || albumBanDuoc.length > 0) && (
        <section>
          <h3 className={cn("kh-eyebrow mb-1.5", T.chuMoNhat)}>
            Album
          </h3>

          {/*
            Album KHÔNG có "suất" như ảnh in.

            Một cuốn album nhận bao nhiêu tấm là tuỳ ba mẹ, nên ở đây không đếm
            ngược số suất còn lại như phần trong gói — chỉ nói cuốn đó đang có
            mấy tấm. Chặn theo số tờ là việc của studio lúc dựng cuốn, không
            phải việc của màn chọn ảnh.
          */}
          {/*
            Album TRONG GÓI trước, album MUA THÊM sau — cùng luật với phần
            "Trong gói" ở trên: thứ đã trả tiền rồi phải xài hết trước khi bán
            thêm. Hai loại đi hai bảng khác nhau nên phải có hai nhánh, nhưng ba
            mẹ nhìn thấy chúng như nhau: một cuốn album, đang có mấy tấm.
          */}
          <ul className="space-y-1.5">
            {albumTrongGoi.map((al) => (
              <li key={al.galleryItemId}>
                <button
                  type="button"
                  disabled={khoa || dangLuu}
                  onClick={() => onDatVaoGoi(al.galleryItemId, !al.coAnhNay)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors",
                    al.coAnhNay
                      ? "bg-[#7FA99B]/20 ring-1 ring-[#7FA99B]/50"
                      : T.theNen,
                    (khoa || dangLuu) && "opacity-60",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {al.name}
                      <span
                        className={cn(
                          "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-normal",
                          sang ? "bg-[#2E2A27]/[0.08] text-[#6b6057]" : "bg-white/15 text-white/70",
                        )}
                      >
                        trong gói
                      </span>
                    </span>
                    <span className={cn("block", T.chuMo)}>
                      {al.coAnhNay ? "Đã có tấm này" : `Đang có ${al.soAnh} tấm`}
                    </span>
                  </span>
                  <span className="shrink-0 text-base leading-none">
                    {al.coAnhNay ? "✓" : "+"}
                  </span>
                </button>
              </li>
            ))}

            {/*
              BB-202 — chủ studio 26/09/2026: "mua thêm album trong cửa hàng =
              CHỈ ĐẶT MUA, CSKH trao đổi ảnh/bìa sau — KHÔNG bắt đưa ảnh vào
              album." Trước đây dòng này là một NÚT bấm để tự đưa/gỡ ảnh
              (`onDatVaoAlbum`), giờ chỉ còn hiện TRẠNG THÁI đã mua, không còn
              bấm được — route `/api/g/placements` cũng đã từ chối luồng này
              (409) nếu có nơi nào còn gọi tới.
            */}
            {albumDaMua.map((al) => (
              <li
                key={al.addonId}
                className={cn("flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs", T.theNenTinh)}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{al.name}</span>
                  <span className={cn("block", T.chuMo)}>
                    Đã đặt mua — studio sẽ trao đổi với ba mẹ về ảnh và bìa
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {albumBanDuoc.length > 0 && (
            // BB-287 mục #11 — tam giác ▶ mặc định của trình duyệt thay bằng
            // › xoay 90° khi mở (`list-none` + `::marker`/`-webkit-details-marker`
            // ẩn dấu gốc, `group-open:rotate-90` xoay dấu tự vẽ).
            <details className="group mt-1.5">
              <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium marker:content-none [&::-webkit-details-marker]:hidden", T.theNen)}>
                <span>Mua thêm một cuốn album</span>
                <span aria-hidden className="text-sm leading-none transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <ul className="mt-1 space-y-1">
                {albumBanDuoc.map((al) => (
                  <li
                    key={al.productId}
                    className={cn("flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5", T.dongLong)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs">{al.name}</span>
                      <span className={cn("block text-[11px]", T.chuMo)}>
                        {formatCurrencyVND(al.unitPrice)}
                        {al.size ? ` · ${formatKichThuoc(al.size)}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={khoa || dangLuu}
                      onClick={() => onMuaAlbum(al.productId, al.soLuong + 1)}
                      className={cn("h-7 rounded-full px-3 text-xs disabled:opacity-30", T.theNen)}
                    >
                      Mua
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/*
        ---------- 3. MUA THÊM ----------

        BB-279 — chủ studio 27/09/2026: "danh mục quá tràn lan tôi muốn tối
        giản". Trước đây mỗi nhóm mở ra một danh sách PHẲNG từng sản phẩm
        (size × chất liệu, có nhóm tới hàng chục dòng) — đúng thứ "tràn lan"
        bị chê. Từ BB-279, đây là ĐƯỜNG THỨ HAI vào cửa hàng: một nút gọn mở
        thẳng bộ cấu hình (nhóm → kích thước → chất liệu → số lượng → giá) của
        `cua-hang.tsx`, với tấm đang xem đã chọn sẵn — không liệt kê lại từng
        sản phẩm ở đây nữa.

        Nếu màn gọi component này chưa nối `onDatInTamNay` (chưa nâng cấp),
        giữ nguyên danh sách phẳng cũ làm phương án dự phòng — không để mất
        hẳn đường mua khi một nơi gọi còn sót lại bản cũ.
      */}
      <section>
        <h3 className={cn("kh-eyebrow mb-1.5", T.chuMoNhat)}>
          Mua thêm cho tấm này
        </h3>
        {onDatInTamNay ? (
          <div className="space-y-1.5">
            {THU_TU_NHOM.map((nhom) => {
              const ds = theoNhom(nhom);
              if (ds.length === 0) return null;
              const daDat = daDatTrongNhom(nhom);
              // BB-289 lượt 2 — bản vẽ `xem-lon-dat-in-dien-thoai.png` ghi
              // "từ <giá thấp nhất> ₫" ngay trên hàng mở nhóm, để ba mẹ biết
              // khoảng giá trước khi bấm mở cửa hàng — giá thấp nhất trong
              // ĐÚNG nhóm này, không phải giá cố định.
              const giaThapNhat = Math.min(...ds.map((m) => m.unitPrice));

              return (
                <button
                  key={nhom}
                  type="button"
                  disabled={khoa || dangLuu}
                  onClick={() => onDatInTamNay(nhom)}
                  className={cn("flex w-full items-center justify-between gap-2 rounded-full px-4 py-2.5 text-left text-xs transition-colors disabled:opacity-40", T.theNen)}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{TEN_NHOM[nhom]}</span>
                    <span className={cn("block", T.chuMo)}>
                      {daDat > 0 ? `Đang đặt ${daDat}` : `từ ${formatCurrencyVND(giaThapNhat)}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-base leading-none">›</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1.5">
            {THU_TU_NHOM.map((nhom) => {
              const ds = theoNhom(nhom);
              if (ds.length === 0) return null;
              const dangMo = nhomDangMo === nhom;
              const daDat = daDatTrongNhom(nhom);

              return (
                <div key={nhom} className={cn("rounded-xl", T.theNenTinh)}>
                  <button
                    type="button"
                    onClick={() => setNhomDangMo(dangMo ? null : nhom)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium"
                  >
                    <span>{TEN_NHOM[nhom]}</span>
                    <span className={cn("flex items-center gap-2", T.chuMo)}>
                      {daDat > 0 && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px]",
                            sang ? "bg-[#7FA99B]/25 text-[#2f4a40]" : "bg-[#7FA99B]/25 text-[#cfe6dd]",
                          )}
                        >
                          {daDat}
                        </span>
                      )}
                      <span>{dangMo ? "−" : "+"}</span>
                    </span>
                  </button>

                  {dangMo && (
                    <ul className="space-y-1 px-2 pb-2">
                      {ds.map((m) => (
                        <li
                          key={m.productId}
                          className={cn("flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5", T.dongLong)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs">{m.name}</span>
                            <span className={cn("block text-[11px]", T.chuMo)}>
                              {formatCurrencyVND(m.unitPrice)}
                              {m.size ? ` · ${formatKichThuoc(m.size)}` : ""}
                            </span>
                          </span>

                          <span className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={`Bớt ${m.name}`}
                              disabled={khoa || dangLuu || m.soLuong === 0}
                              onClick={() => onDatMuaThem(m.productId, Math.max(0, m.soLuong - 1))}
                              className={cn("h-7 w-7 rounded-full text-sm disabled:opacity-30", T.theNenTinh)}
                            >
                              −
                            </button>
                            <span className="w-5 text-center text-xs tabular-nums">{m.soLuong}</span>
                            <button
                              type="button"
                              aria-label={`Thêm ${m.name}`}
                              disabled={khoa || dangLuu}
                              onClick={() => onDatMuaThem(m.productId, m.soLuong + 1)}
                              className={cn("h-7 w-7 rounded-full text-sm disabled:opacity-30", T.theNenTinh)}
                            >
                              +
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
