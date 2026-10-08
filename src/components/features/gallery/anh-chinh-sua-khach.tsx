/**
 * BB-371 — khối "Ảnh đã chỉnh" trên màn khách: xem + duyệt ảnh chỉnh NGAY TRONG
 * APP (trước đây chỉ có link "Mở thư mục ảnh đã chỉnh" — mở Drive, rời app).
 *
 * BB-401 (anh 08/10) — DUYỆT TỪNG TẤM ngay trong màn xem lớn. Trước bản này, bảng
 * ghi chú của một tấm chỉ hiện khi ba mẹ đã bấm "Yêu cầu sửa" Ở DƯỚI LƯỚI rồi mới
 * mở ảnh (`cheDo === "sua"`); mở ảnh thẳng — đường ba mẹ thật sự đi, kể cả nút thanh
 * đáy — thì màn lớn chỉ có so sánh + tiến/lùi, và không có "Duyệt tấm này" nào.
 * Nay màn lớn luôn có thanh hành động CỐ ĐỊNH với tấm đang xem:
 *
 *   · "Duyệt tấm này" · "Cần sửa tấm này" (mở bảng ghi chú CỦA TẤM ĐANG XEM: ghi chú,
 *     khoanh vùng, ảnh minh hoạ tải từ máy — nén phía máy, nhiều ảnh);
 *   · "Duyệt cả bộ" (hỏi lại một chạm, nói rõ còn bao nhiêu tấm chưa duyệt / đang xin sửa);
 *   · "Gửi yêu cầu sửa (n)" khi có ≥1 tấm xin sửa → tóm tắt → lời xin lỗi anh chốt +
 *     "khoảng N ngày". Duyệt hết → lời cảm ơn.
 *
 * Trạng thái từng tấm hiện trên tấm (màn lớn), trên dải ảnh nhỏ và trên lưới. Bản
 * nháp giữ trên máy (localStorage) tới khi gửi. Phần thuần ở `duyet-tung-tam.ts`.
 *
 * Giọng Bean nhẹ nhàng: ba mẹ bấm "Cần sửa" thường là đang không vui — câu đầu tiên
 * là Bean nhận phần chưa đúng về mình, rồi mới hướng dẫn.
 */

"use client";

import React from "react";
import { vi } from "@/i18n";
import { cn } from "@/components/ui/utils";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";
import { urlAnh, urlAnhDuPhong } from "@/lib/utils/anh-lh3";
import { giuA } from "@/lib/utils/giu-a";
import { formatNgayVN, formatTien } from "@/lib/utils/dinh-dang";
import { TOI_DA_ANH_MAU, type VungKhoanh } from "@/lib/anh-chinh-sua/nhan-dien";
import { AnhKhoanhVung } from "./anh-khoanh-vung";
import { NutXemTrongNha } from "./xem-trong-nha";
import { KHOA_TRONG_GOI, type TrangThaiDuyetDot } from "@/lib/anh-chinh-sua/theo-dot";
import { cauHanSua } from "@/lib/anh-chinh-sua/han-sua";
import {
  chonAnhMoiIn,
  chonSanPhamGoiY,
  hienLoiMoiInThem,
  type SanPhamGoiY,
  tomTatVongSua,
} from "@/lib/anh-chinh-sua/vong-duyet";
import {
  boAnhMinhHoa,
  boQuyet,
  boVung,
  buocSauDuyet,
  datDuyet,
  datSua,
  demNhap,
  docNhapLuu,
  ghepNhapMayChu,
  guiAnhMinhHoa,
  guiKeHoach,
  keHoachDuyetCaBo,
  keHoachGui,
  khoaLuuNhap,
  kiemTepAnhMinhHoa,
  luuDuyetTam,
  nenAnhNeuCan,
  nhapGhiXuongMay,
  suaGhiChu,
  tamChuaQuyetKeTiep,
  themAnhMinhHoa,
  themVung,
  trangThaiTam,
  type DemNhap,
  type NhapDuyet,
  type NhapTam,
  type TrangThaiTam,
} from "@/lib/anh-chinh-sua/duyet-tung-tam";

const t = vi.gallery.anhChinh;
const dien = (s: string, n: number) => s.replace("{n}", String(n));

interface AnhNho {
  id: string;
  fileName: string;
  width: number | null;
  height: number | null;
  maTepDrive: string | null;
}
export interface AnhChinh extends AnhNho {
  goc: AnhNho | null;
  /** BB-377 — đợt: "goc" (trong gói) | "dot:N" | "mt:<id>" (mua thêm). */
  khoa: string;
}
interface NhomDot {
  khoa: string;
  nhan: string;
  soAnh: number;
  trangThai: TrangThaiDuyetDot;
  duocQuyet: boolean;
}
interface DuLieu {
  trangThai: string;
  duocQuyet: boolean;
  /** BB-377 — đã áp 0095: mỗi đợt mua thêm duyệt riêng. */
  theoDot?: boolean;
  anh: AnhChinh[];
  nhom?: NhomDot[];
  vongSua: {
    round: number;
    note: string;
    createdAt: string;
    resolved: boolean;
    khoa?: string;
    nhan?: string;
    /** Từng tấm ba mẹ đã xin sửa trong vòng (0091; chưa áp → rỗng). */
    items?: { photoId: string; note: string; marks: VungKhoanh[]; soAnhMau: number }[];
  }[];
  tinhNang: { vungKhoanh: boolean; anhMau: boolean };
  /** BB-384 — có phải người nhận link chính (được duyệt / xin sửa / mời in thêm). */
  laChu?: boolean;
  /** BB-387 — số ngày Bean ước tính gửi lại ảnh sửa (Cài đặt `gallery.revision_days_estimate`). */
  soNgaySua?: number;
  /**
   * BB-401 vòng 2 — tấm ba mẹ đã bấm "Duyệt tấm này", lưu trên máy chủ (0108). `null`/thiếu =
   * chưa áp 0108 → dấu duyệt chỉ giữ trên máy này (localStorage).
   */
  daDuyetTam?: string[] | null;
}

/** Kết quả sau khi gửi — hiện lời xin lỗi (có tấm xin sửa) hoặc lời cảm ơn (duyệt hết). */
export type KetQuaDuyet =
  | { loai: "sua"; lan: number; tam: { ten: string; ghiChu: string }[]; ghiChuChung: string; soNgaySua?: number }
  | { loai: "duyet" };

/**
 * BB-401 vòng 3 — lời xin lỗi / cảm ơn đang hiện, giữ NGOÀI state của khối. Gửi xong, màn cha
 * nạp lại bộ ảnh KHÔNG `silent` (`loadGallery()` → màn chờ) nên khối này bị gỡ rồi dựng lại;
 * state riêng mất và lời xin lỗi biến mất trước khi ba mẹ kịp đọc (e2e bb-401/384/371/377 đỏ
 * 08/10). Biến cấp mô-đun sống theo TAB trình duyệt; xoá khi ba mẹ bấm "Về bộ ảnh".
 */
let ketQuaDangHien: KetQuaDuyet | null = null;

const tiLeCua = (a: AnhNho) => (a.width && a.height ? a.height / a.width : null);

const NHAN_TRANG_THAI: Record<TrangThaiTam, string> = {
  da_duyet: t.ttDaDuyet,
  xin_sua: t.ttXinSua,
  chua_xem: t.ttChuaXem,
  da_xem: t.ttDaXem,
};
const MAU_TRANG_THAI: Record<TrangThaiTam, string> = {
  da_duyet: "bg-primary text-primary-foreground",
  xin_sua: "bg-heart text-white",
  chua_xem: "bg-black/60 text-white",
  da_xem: "bg-black/40 text-white",
};

/** Chip trạng thái của một tấm (trên ảnh lớn, dải ảnh nhỏ, lưới). */
function ChipTrangThai({ tt, testId, className }: { tt: TrangThaiTam; testId: string; className?: string }) {
  return (
    <span
      data-testid={testId}
      data-trang-thai={tt}
      className={cn(
        "pointer-events-none inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        MAU_TRANG_THAI[tt],
        className,
      )}
    >
      {tt === "da_duyet" ? "✓ " : tt === "xin_sua" ? "✎ " : ""}
      {NHAN_TRANG_THAI[tt]}
    </span>
  );
}

/** Tóm tắt một tấm xin sửa thành một dòng (ghi chú · khoanh n vùng · kèm n ảnh). */
function moTaTamSua(m: NhapTam): string {
  return (
    [
      m.ghiChu.trim(),
      m.vung.length ? dien(t.daKhoanh, m.vung.length) : "",
      m.anhMau.length ? dien(t.kemAnhMau, m.anhMau.length) : "",
    ]
      .filter(Boolean)
      .join(" · ") || t.canSuaTamNay
  );
}

function docLuu(khoa: string): unknown {
  try {
    const s = window.localStorage.getItem(khoa);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function ghiLuu(khoa: string, giaTri: unknown | null) {
  try {
    if (giaTri === null) window.localStorage.removeItem(khoa);
    else window.localStorage.setItem(khoa, JSON.stringify(giaTri));
  } catch {
    // Chế độ riêng tư / bị chặn bộ nhớ: bản nháp chỉ sống trong phiên này.
  }
}

export function AnhChinhSuaKhach({
  onDaQuyet,
  moiInThem,
  onGiuMo,
  onXemTuong,
}: {
  /** Sau khi ba mẹ duyệt / gửi yêu cầu sửa — màn cha tải lại bộ ảnh. */
  onDaQuyet: (ketQua: { quyetDinh: "approve" | "revise"; lan?: number }) => void | Promise<void>;
  /**
   * BB-384 / bh-04 — lời mời in thêm ĐÚNG LÚC ba mẹ duyệt cho in (không còn tấm xin
   * sửa): danh mục sản phẩm (giá từ dữ liệu) và lối vào màn chọn thêm (null = chưa mở).
   */
  moiInThem?: { danhMuc: readonly SanPhamGoiY[]; onChonInThem: (() => void) | null };
  /**
   * BB-401 — đang hiện lời xin lỗi / cảm ơn sau khi gửi: màn cha GIỮ khối này dù bộ ảnh
   * đã đổi trạng thái (nạp lại do sự kiện tức thì) cho tới khi ba mẹ đóng.
   */
  onGiuMo?: (giu: boolean) => void;
  /** BB-400 vòng 4 — "Xem trên tường / bàn nhà" với ảnh ĐÃ CHỈNH đang xem (nút cố định ở màn lớn). */
  onXemTuong?: (anh: { id: string; fileName: string; width: number | null; height: number | null }) => void;
}) {
  const [duLieu, setDuLieu] = React.useState<DuLieu | null>(null);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [mo, setMo] = React.useState<number | null>(null);
  const [soSanh, setSoSanh] = React.useState(false);
  const [viTri, setViTri] = React.useState(50);
  const [nhap, setNhap] = React.useState<NhapDuyet>({});
  const [daXem, setDaXem] = React.useState<ReadonlySet<string>>(() => new Set());
  const [dangGhiChu, setDangGhiChu] = React.useState(false);
  const [dangKhoanh, setDangKhoanh] = React.useState(false);
  const [hop, setHop] = React.useState<null | "tom_tat" | "duyet_ca_bo">(null);
  const [ghiChuChung, setGhiChuChung] = React.useState("");
  const [ban, setBan] = React.useState(false);
  const [loiGui, setLoiGui] = React.useState<string | null>(null);
  const [dangTaiAnh, setDangTaiAnh] = React.useState(false);
  // Khởi từ bản giữ chung (xem `ketQuaDangHien`): khối bị dựng lại giữa chừng vẫn hiện tiếp.
  const [ketQua, setKetQuaState] = React.useState<KetQuaDuyet | null>(() => ketQuaDangHien);
  const setKetQua = (kq: KetQuaDuyet | null) => {
    ketQuaDangHien = kq;
    setKetQuaState(kq);
  };
  /** Máy chủ báo chưa áp 0108 khi lưu — từ đó giữ dấu duyệt trên máy (không lỗi). */
  const [mayChuTat, setMayChuTat] = React.useState(false);

  const songRef = React.useRef(true);
  const tai = React.useCallback(async () => {
    try {
      const res = await goiApiKhach("/api/g/anh-chinh-sua", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!songRef.current) return;
      if (!res.ok || !json?.data) {
        setLoi(json?.error?.message ?? t.loiTai);
        return;
      }
      setDuLieu(json.data as DuLieu);
    } catch {
      if (songRef.current) setLoi(t.loiTai);
    }
  }, []);
  React.useEffect(() => {
    songRef.current = true;
    void tai();
    return () => {
      songRef.current = false;
    };
  }, [tai]);

  const anh = React.useMemo(() => duLieu?.anh ?? [], [duLieu]);
  const ids = React.useMemo(() => anh.map((a) => a.id), [anh]);
  const khoaLuu = ids.length > 0 ? khoaLuuNhap(ids) : null;

  // BB-401 vòng 2 — có máy chủ (đã áp 0108): dấu "Đã duyệt" lấy từ máy chủ (mở máy khác vẫn
  // thấy); máy này chỉ giữ ghi chú xin sửa chưa gửi. Chưa áp: giữ cả dấu duyệt trên máy.
  const coMayChu = Array.isArray(duLieu?.daDuyetTam) && !mayChuTat;

  // Bản nháp trên máy: nạp MỘT lần cho mỗi tập ảnh, rồi ghi mỗi khi đổi.
  const daNapRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!khoaLuu || daNapRef.current === khoaLuu) return;
    daNapRef.current = khoaLuu;
    const luu = docNhapLuu(docLuu(khoaLuu), ids);
    const mayChu = duLieu?.daDuyetTam;
    setNhap(Array.isArray(mayChu) ? ghepNhapMayChu(luu.nhap, mayChu.filter((id) => ids.includes(id))) : luu.nhap);
    setDaXem(new Set([...luu.daXem, ...(Array.isArray(mayChu) ? mayChu : [])].filter((id) => ids.includes(id))));
  }, [khoaLuu, ids, duLieu]);
  React.useEffect(() => {
    if (!khoaLuu || daNapRef.current !== khoaLuu) return;
    const ghi = nhapGhiXuongMay(nhap, coMayChu);
    const coGi = Object.keys(ghi).length > 0 || daXem.size > 0;
    ghiLuu(khoaLuu, coGi ? { nhap: ghi, daXem: [...daXem] } : null);
  }, [khoaLuu, nhap, daXem, coMayChu]);

  /**
   * Lưu dấu duyệt lên máy chủ NGAY khi bấm (giao diện đã đổi trước — optimistic). Lỗi → hoàn tác
   * đúng tấm đó về trạng thái cũ (nếu ba mẹ chưa bấm gì khác lên tấm ấy) + báo nhẹ.
   */
  function luuLenMayChu(id: string, duyet: boolean, truoc: NhapTam | undefined) {
    if (!coMayChu) return;
    void luuDuyetTam(id, duyet, goiApiKhach, t.loiLuuDuyet).then((kq) => {
      if (!songRef.current) return;
      if (!kq.ok) {
        setNhap((n) => {
          const hienTai = n[id];
          if (hienTai?.trangThai !== (duyet ? "duyet" : "sua")) return n;
          // Chỉ trả TRẠNG THÁI về như cũ; ghi chú ba mẹ vừa gõ trong lúc chờ vẫn giữ.
          return truoc ? { ...n, [id]: { ...hienTai, trangThai: truoc.trangThai } } : boQuyet(n, id);
        });
        if (!duyet) setDangGhiChu(false);
        setLoiGui(giuA(t.loiLuuDuyet));
      } else if (!kq.luuMayChu) {
        setMayChuTat(true);
      }
    });
  }

  const dangMo = mo !== null ? anh[mo] : undefined;
  // Mở tấm nào thì tấm đó "đã xem".
  React.useEffect(() => {
    if (!dangMo) return;
    setDaXem((s) => (s.has(dangMo.id) ? s : new Set([...s, dangMo.id])));
  }, [dangMo]);

  // --- Vòng duyệt -----------------------------------------------------------
  const nhom = React.useMemo(() => duLieu?.nhom ?? [], [duLieu]);
  const coMuaThem = nhom.some((n) => n.khoa !== KHOA_TRONG_GOI);
  // Đã áp 0095: mỗi đợt một vòng duyệt riêng. Chưa áp: một quyết định cho cả bộ.
  const quyetTheoDot = !!duLieu?.theoDot && coMuaThem;
  const khoaVong = React.useCallback((a: AnhChinh) => (quyetTheoDot ? a.khoa : KHOA_TRONG_GOI), [quyetTheoDot]);
  const vongMo = React.useMemo(() => {
    if (!duLieu) return new Set<string>();
    if (quyetTheoDot) return new Set(nhom.filter((n) => n.duocQuyet).map((n) => n.khoa));
    return new Set(duLieu.duocQuyet ? [KHOA_TRONG_GOI] : []);
  }, [duLieu, nhom, quyetTheoDot]);
  const trangThaiVong = (khoa: string): TrangThaiDuyetDot => {
    const n = nhom.find((x) => x.khoa === khoa);
    if (n) return n.trangThai;
    const s = duLieu?.trangThai;
    return s === "awaiting_approval" ? "cho_duyet" : s === "approved" || s === "delivered" ? "da_duyet" : "dang_sua";
  };
  const anhMo = anh.filter((a) => vongMo.has(khoaVong(a)));
  const idsMo = anhMo.map((a) => a.id);
  const dem = demNhap(idsMo, nhap, daXem);
  const nhanDot = (khoa: string) => (khoa === KHOA_TRONG_GOI ? t.trongGoi : nhom.find((n) => n.khoa === khoa)?.nhan ?? t.trongGoi);

  // --- Thao tác -------------------------------------------------------------
  function moAnh(i: number) {
    setMo(i);
    setLoiGui(null);
    setDangKhoanh(false);
    // Đổi tấm: bảng ghi chú chỉ còn mở nếu tấm MỚI cũng đang xin sửa (ghi chú của đúng tấm đó).
    const id = anh[i]?.id;
    setDangGhiChu((g) => g && !!id && nhap[id]?.trangThai === "sua");
  }
  function duyetTam(id: string) {
    const truoc = nhap[id];
    const moi = datDuyet(nhap, id);
    if (truoc?.trangThai !== "duyet") luuLenMayChu(id, true, truoc);
    setNhap(moi);
    setDangGhiChu(false);
    setDangKhoanh(false);
    setLoiGui(null);
    // Phản hồi tức thì: sang tấm kế chưa quyết; duyệt hết (không tấm nào xin sửa) → hỏi duyệt cả bộ.
    const sau = buocSauDuyet(idsMo, moi, id);
    if (sau.toi) moAnh(anh.findIndex((a) => a.id === sau.toi));
    else if (sau.hoiDuyetCaBo) setHop("duyet_ca_bo");
  }
  function canSuaTam(id: string) {
    const truoc = nhap[id];
    // Bỏ dấu duyệt trên máy chủ khi ba mẹ đổi ý sang "Cần sửa".
    if (truoc?.trangThai === "duyet") luuLenMayChu(id, false, truoc);
    setNhap((n) => datSua(n, id));
    setDangGhiChu(true);
    setSoSanh(false);
    setLoiGui(null);
  }
  function boYeuCauSua(id: string) {
    setNhap((n) => boQuyet(n, id));
    setDangGhiChu(false);
    setDangKhoanh(false);
  }

  async function chonAnhMinhHoa(id: string, tep: File[]) {
    setLoiGui(null);
    const conCho = TOI_DA_ANH_MAU - (nhap[id]?.anhMau.length ?? 0);
    if (tep.length > conCho) setLoiGui(giuA(t.toiDaAnhMinhHoa));
    const lay = tep.slice(0, Math.max(0, conCho));
    if (lay.length === 0) return;
    setDangTaiAnh(true);
    try {
      for (const f of lay) {
        if (kiemTepAnhMinhHoa(f) === "loai") {
          setLoiGui(giuA(t.loiAnhMinhHoaLoai));
          continue;
        }
        const nen = await nenAnhNeuCan(f);
        if (kiemTepAnhMinhHoa(nen)) {
          setLoiGui(giuA(t.loiAnhMinhHoaDungLuong));
          continue;
        }
        const kq = await guiAnhMinhHoa(nen, goiApiKhach, t.loiAnhMau);
        if ("loi" in kq) {
          setLoiGui(kq.loi);
          continue;
        }
        let xem: string | undefined;
        try {
          xem = URL.createObjectURL(nen);
        } catch {
          xem = undefined;
        }
        setNhap((n) => themAnhMinhHoa(n, id, { duongDan: kq.duongDan, xem }));
      }
    } finally {
      setDangTaiAnh(false);
    }
  }

  function hienKetQua(kq: KetQuaDuyet, quyetDinh: "approve" | "revise", lan?: number) {
    if (khoaLuu) ghiLuu(khoaLuu, null);
    setNhap({});
    setDaXem(new Set());
    setGhiChuChung("");
    setHop(null);
    setMo(null);
    setDangGhiChu(false);
    setDangKhoanh(false);
    setKetQua(kq);
    onGiuMo?.(true);
    void (async () => {
      await onDaQuyet({ quyetDinh, lan });
      await tai();
    })();
  }

  async function guiYeuCauSua() {
    if (!duLieu) return;
    const cacThan = keHoachGui({
      anh: anh.map((a) => ({ id: a.id, fileName: a.fileName, khoaVong: khoaVong(a) })),
      nhap,
      vongMo,
      ghiChuChung,
    });
    if (!cacThan.some((c) => c.decision === "revise")) {
      setLoiGui(t.canChonTam);
      return;
    }
    setBan(true);
    setLoiGui(null);
    try {
      const kq = await guiKeHoach(cacThan, goiApiKhach, vi.gallery.loiBean.guiChuaDuoc);
      if (!kq.ok) {
        setLoiGui(kq.loi);
        // Lượt trước đã ghi (vd. duyệt một đợt) — tải lại cho đúng trạng thái.
        if (kq.daDuyet || kq.daSua) await tai();
        return;
      }
      const tenCua = new Map(anh.map((a) => [a.id, a.fileName]));
      hienKetQua(
        {
          loai: "sua",
          lan: kq.lan ?? 1,
          tam: Object.entries(nhap)
            .filter(([id, m]) => m.trangThai === "sua" && idsMo.includes(id))
            .map(([id, m]) => ({ ten: tenCua.get(id) ?? id, ghiChu: moTaTamSua(m) })),
          ghiChuChung: ghiChuChung.trim(),
          soNgaySua: duLieu.soNgaySua,
        },
        "revise",
        kq.lan ?? undefined,
      );
    } finally {
      setBan(false);
    }
  }

  async function duyetCaBo() {
    const cacThan = keHoachDuyetCaBo({
      anh: anh.map((a) => ({ id: a.id, fileName: a.fileName, khoaVong: khoaVong(a) })),
      vongMo,
    });
    if (cacThan.length === 0) return;
    setBan(true);
    setLoiGui(null);
    try {
      const kq = await guiKeHoach(cacThan, goiApiKhach, vi.gallery.loiBean.guiChuaDuoc);
      if (!kq.ok) {
        setLoiGui(kq.loi);
        if (kq.daDuyet) await tai();
        return;
      }
      hienKetQua({ loai: "duyet" }, "approve");
    } finally {
      setBan(false);
    }
  }

  const ketQuaView = ketQua ? (
    <KetQuaGuiView
      ketQua={ketQua}
      onDong={() => {
        setKetQua(null);
        onGiuMo?.(false);
      }}
    />
  ) : null;

  // BB-388 — thanh đáy "Xem & duyệt N ảnh chỉnh" hiện NGAY khi bộ ảnh tải xong (số ảnh chỉnh có
  // sẵn trong dữ liệu bộ), còn khối này tự tải ảnh chỉnh thêm ~1–2 giây. Nút cuộn tới
  // `#anh-da-chinh`: nếu chỉ khối đã tải mới mang id thì bấm sớm là KHÔNG có gì xảy ra (e2e
  // bb-384 ca 3). Ô "đang tải"/lỗi giữ cùng id để nút luôn đưa ba mẹ tới đúng chỗ.
  if (loi)
    return (
      <>
        <p id="anh-da-chinh" className="rounded-2xl border border-border bg-surface p-5 text-sm text-heart">
          {loi}
        </p>
        {ketQuaView}
      </>
    );
  if (!duLieu)
    return (
      <>
        <p id="anh-da-chinh" className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted-foreground">
          {t.dangTai}
        </p>
        {ketQuaView}
      </>
    );
  // Sau khi gửi xin sửa, bộ sang "đang sửa" và ba mẹ không còn thấy ảnh chỉnh — lời xin lỗi vẫn ở lại.
  if (anh.length === 0) return ketQuaView;

  const coTheQuyet = anhMo.length > 0;
  const laChu = duLieu.laChu ?? false;
  const choDuyetMaKhongPhaiChu = !laChu && (duLieu.trangThai === "awaiting_approval" || nhom.some((n) => n.trangThai === "cho_duyet"));

  const luoi = (ds: AnhChinh[]) => (
    <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
      {ds.map((a) => {
        const i = anh.indexOf(a);
        const tt = trangThaiTam(nhap, a.id, daXem);
        const moVong = vongMo.has(khoaVong(a));
        return (
          <li key={a.id} className="relative">
            <button
              type="button"
              onClick={() => {
                moAnh(i);
                setSoSanh(false);
              }}
              data-testid="o-anh-chinh"
              data-khoa={a.khoa}
              data-trang-thai={tt}
              aria-label={a.fileName}
              className={cn(
                "block aspect-square w-full overflow-hidden rounded-lg bg-surface-2",
                tt === "xin_sua" && "ring-2 ring-heart ring-offset-2",
                tt === "da_duyet" && "ring-2 ring-primary ring-offset-2",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive, không qua next/image */}
              <img
                src={urlAnh(a, 400)}
                alt={a.fileName}
                loading="lazy"
                className="h-full w-full object-cover"
                onError={(e) => {
                  const du = urlAnhDuPhong(a.id, 400);
                  if (!e.currentTarget.src.endsWith(du)) e.currentTarget.src = du;
                }}
              />
            </button>
            {moVong && <ChipTrangThai tt={tt} testId="trang-thai-o-anh" className="absolute left-1.5 top-1.5" />}
            {/* BB-405 — "Xem trong nhà" ngay trên ô ảnh đã chỉnh (góc dưới trái, như lưới chọn). */}
            {onXemTuong && (
              <NutXemTrongNha
                thuTu={i}
                onBam={() => onXemTuong({ id: a.id, fileName: a.fileName, width: a.width, height: a.height })}
              />
            )}
          </li>
        );
      })}
    </ul>
  );

  const lichSuTam = dangMo
    ? duLieu.vongSua.flatMap((v) =>
        (v.items ?? [])
          .filter((it) => it.photoId === dangMo.id)
          .map((it) => ({ lan: v.round, daSua: v.resolved, ghiChu: it.note, soAnhMau: it.soAnhMau })),
      )
    : [];

  return (
    <section
      id="anh-da-chinh"
      data-testid="khoi-anh-chinh"
      className="space-y-4 rounded-2xl border border-border bg-surface p-5"
    >
      <div>
        <h2 className="kh-h3">{t.tieuDe}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{giuA(`${dien(t.moDau, anh.length)} ${t.goiYTungTam}`)}</p>
      </div>

      {coMuaThem
        ? nhom.map((n) => {
            const ds = anh.filter((a) => a.khoa === n.khoa);
            if (ds.length === 0) return null;
            return (
              <div key={n.khoa} className="space-y-2" data-testid="nhom-anh-chinh" data-khoa={n.khoa}>
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs",
                      n.khoa === KHOA_TRONG_GOI ? "bg-surface-2 text-foreground" : "bg-primary/10 text-primary",
                    )}
                    data-testid="nhan-dot"
                  >
                    {n.khoa === KHOA_TRONG_GOI ? t.trongGoi : n.nhan}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{dien(t.soTam, ds.length)}</span>
                  {quyetTheoDot && n.trangThai === "da_duyet" && (
                    <span className="text-xs font-normal text-muted-foreground">· {t.daDuyetDot}</span>
                  )}
                </h3>
                {luoi(ds)}
              </div>
            );
          })
        : luoi(anh)}

      {coTheQuyet && (
        <div className="space-y-2 border-t border-border pt-3" data-testid="thanh-duyet-khoi">
          <p className="text-xs text-muted-foreground" data-testid="dem-duyet-khoi">
            {t.demTomTat
              .replace("{duyet}", String(dem.duyet))
              .replace("{sua}", String(dem.sua))
              .replace("{chua}", String(dem.chuaQuyet))}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={ban}
              data-testid="nut-bat-dau-duyet"
              onClick={() => {
                const dau = anhMo[tamChuaQuyetKeTiep(idsMo, nhap, idsMo.length - 1) ?? 0];
                if (!dau) return;
                moAnh(anh.indexOf(dau));
                setSoSanh(false);
              }}
              className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              {t.batDauDuyet}
            </button>
            <button
              type="button"
              disabled={ban}
              data-testid="nut-duyet-ca-bo-khoi"
              onClick={() => setHop("duyet_ca_bo")}
              className="h-10 rounded-full border border-border px-5 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-40"
            >
              {t.duyetCaBo}
            </button>
            {dem.sua > 0 && (
              <button
                type="button"
                disabled={ban}
                data-testid="nut-gui-yeu-cau-sua-khoi"
                onClick={() => setHop("tom_tat")}
                className="h-10 rounded-full bg-heart px-5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
              >
                {dien(t.guiYeuCauSo, dem.sua)}
              </button>
            )}
          </div>
          {!dangMo && !hop && loiGui && <p className="text-xs text-heart">{loiGui}</p>}
        </div>
      )}
      {choDuyetMaKhongPhaiChu && <p className="text-xs text-muted-foreground">{giuA(t.chiNguoiChinh)}</p>}

      {/* BB-384 — lịch sử các lần sửa THEO TỪNG TẤM: lần, ghi chú, vùng khoanh, ảnh mẫu,
          trạng thái Bean đã sửa / đang sửa. Vòng không có chi tiết (chưa áp 0091 / bản cũ)
          hiện nguyên chữ ba mẹ đã viết. */}
      {duLieu.vongSua.length > 0 && (
        <div className="space-y-3 border-t border-border pt-3" data-testid="lich-su-sua-theo-tam">
          <p className="text-xs font-medium">{t.lichSuTieuDe}</p>
          <ul className="space-y-3">
            {duLieu.vongSua.map((v) => {
              const items = v.items ?? [];
              const chung = tomTatVongSua(v.note).ghiChuChung;
              return (
                <li key={v.round} className="text-xs" data-testid="vong-sua-khach" data-lan={v.round}>
                  <span className="text-muted-foreground">
                    {dien(t.lanSua, v.round)} · {formatNgayVN(v.createdAt)} ·{" "}
                    <span className={v.resolved ? "" : "font-medium text-foreground"}>
                      {v.resolved ? t.beanDaSua : t.beanDangSua}
                    </span>
                    {coMuaThem && v.khoa && v.khoa !== KHOA_TRONG_GOI ? ` · ${v.nhan}` : ""}
                  </span>
                  {items.length > 0 ? (
                    <ul className="mt-1.5 space-y-1.5">
                      {items.map((it) => {
                        const a = anh.find((x) => x.id === it.photoId);
                        return (
                          <li key={it.photoId} className="flex items-start gap-2" data-testid="muc-sua-khach">
                            {a && (
                              <button
                                type="button"
                                onClick={() => moAnh(anh.indexOf(a))}
                                className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-surface-2"
                                aria-label={a.fileName}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive */}
                                <img src={urlAnh(a, 200)} alt="" className="h-full w-full object-cover" />
                              </button>
                            )}
                            <span className="min-w-0">
                              <span className="font-medium">{a?.fileName ?? ""}</span>
                              {it.note ? <span className="block whitespace-pre-line">{it.note}</span> : null}
                              <span className="block text-muted-foreground">
                                {[
                                  it.marks.length ? dien(t.daKhoanh, it.marks.length) : "",
                                  it.soAnhMau ? dien(t.kemAnhMau, it.soAnhMau) : "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                      {chung && (
                        <li className="whitespace-pre-line text-muted-foreground">
                          {t.canSuaChung}: {chung}
                        </li>
                      )}
                    </ul>
                  ) : (
                    <span className="mt-0.5 block whitespace-pre-line">{v.note}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* bh-04 — mời in thêm ĐÚNG LÚC ba mẹ vừa duyệt cho in và không còn tấm xin sửa. */}
      {moiInThem &&
        hienLoiMoiInThem({
          status: duLieu.trangThai,
          coVongSuaMo: duLieu.vongSua.some((v) => !v.resolved),
          laChu,
        }) && (
          <LoiMoiInThem
            anh={chonAnhMoiIn(
              anh.filter((a) => a.khoa === KHOA_TRONG_GOI),
              new Set(duLieu.vongSua.flatMap((v) => (v.items ?? []).map((it) => it.photoId))),
            )}
            sanPham={chonSanPhamGoiY(moiInThem.danhMuc)}
            onChon={moiInThem.onChonInThem}
          />
        )}

      {dangMo && mo !== null && (
        <XemLonDuyet
          anh={anh}
          viTriMo={mo}
          nhap={nhap}
          daXem={daXem}
          dem={dem}
          moVong={vongMo.has(khoaVong(dangMo))}
          trangThaiVong={trangThaiVong(khoaVong(dangMo))}
          laChu={laChu}
          tinhNang={duLieu.tinhNang}
          nhanDot={coMuaThem ? nhanDot(dangMo.khoa) : null}
          lichSuTam={lichSuTam}
          soSanh={soSanh}
          viTriSoSanh={viTri}
          dangGhiChu={dangGhiChu}
          dangKhoanh={dangKhoanh}
          dangTaiAnh={dangTaiAnh}
          ban={ban}
          loi={hop ? null : loiGui}
          xemTuong={onXemTuong}
          hanh={{
            dong: () => {
              setMo(null);
              setDangGhiChu(false);
              setDangKhoanh(false);
            },
            diToi: moAnh,
            batTatSoSanh: () => {
              setSoSanh((s) => !s);
              setDangKhoanh(false);
            },
            datViTriSoSanh: setViTri,
            duyetTam,
            canSuaTam,
            duyetCaBo: () => setHop("duyet_ca_bo"),
            guiYeuCau: () => {
              setDangGhiChu(false);
              setDangKhoanh(false);
              setHop("tom_tat");
            },
            ghiChu: (id, s) => setNhap((n) => suaGhiChu(n, id, s)),
            batTatKhoanh: () => setDangKhoanh((k) => !k),
            themVung: (id, v) => setNhap((n) => themVung(n, id, v)),
            boVung: (id, i) => setNhap((n) => boVung(n, id, i)),
            chonAnhMinhHoa: (id, tep) => void chonAnhMinhHoa(id, tep),
            boAnhMinhHoa: (id, d) => setNhap((n) => boAnhMinhHoa(n, id, d)),
            boYeuCauSua,
            xongGhiChu: () => {
              setDangGhiChu(false);
              setDangKhoanh(false);
            },
          }}
        />
      )}

      {hop === "tom_tat" && (
        <TomTatGuiSua
          anh={anhMo}
          nhap={nhap}
          dem={dem}
          ghiChuChung={ghiChuChung}
          ban={ban}
          loi={loiGui}
          onGhiChuChung={setGhiChuChung}
          onSuaLai={(id) => {
            setHop(null);
            moAnh(anh.findIndex((a) => a.id === id));
            setDangGhiChu(true);
            setSoSanh(false);
          }}
          onGui={() => void guiYeuCauSua()}
          onXemLai={() => {
            setHop(null);
            setLoiGui(null);
          }}
        />
      )}
      {hop === "duyet_ca_bo" && (
        <HopDuyetCaBo
          dem={dem}
          ban={ban}
          loi={loiGui}
          onDuyet={() => void duyetCaBo()}
          onXemLai={() => {
            setHop(null);
            setLoiGui(null);
          }}
        />
      )}
      {ketQuaView}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Màn xem lớn — KHÔNG dùng hook: toàn bộ trạng thái do `AnhChinhSuaKhach` giữ, nên phép thử
// dựng được với đúng dữ liệu cần thử (tấm đang xem, bản nháp) mà không giả lập React.
// ---------------------------------------------------------------------------

export interface HanhXemLon {
  dong: () => void;
  diToi: (i: number) => void;
  batTatSoSanh: () => void;
  datViTriSoSanh: (v: number) => void;
  duyetTam: (id: string) => void;
  canSuaTam: (id: string) => void;
  duyetCaBo: () => void;
  guiYeuCau: () => void;
  ghiChu: (id: string, s: string) => void;
  batTatKhoanh: () => void;
  themVung: (id: string, v: VungKhoanh) => void;
  boVung: (id: string, i: number) => void;
  chonAnhMinhHoa: (id: string, tep: File[]) => void;
  boAnhMinhHoa: (id: string, duongDan: string) => void;
  boYeuCauSua: (id: string) => void;
  xongGhiChu: () => void;
}

export interface PropsXemLon {
  anh: readonly AnhChinh[];
  viTriMo: number;
  nhap: NhapDuyet;
  daXem: ReadonlySet<string>;
  dem: DemNhap;
  /** Vòng duyệt của tấm đang xem còn mở VÀ ba mẹ là người quyết. */
  moVong: boolean;
  trangThaiVong: TrangThaiDuyetDot;
  laChu: boolean;
  tinhNang: { vungKhoanh: boolean; anhMau: boolean };
  /** Nhãn đợt của tấm (null = bộ không có ảnh mua thêm). */
  nhanDot: string | null;
  lichSuTam: { lan: number; daSua: boolean; ghiChu: string; soAnhMau: number }[];
  soSanh: boolean;
  viTriSoSanh: number;
  dangGhiChu: boolean;
  dangKhoanh: boolean;
  dangTaiAnh: boolean;
  ban: boolean;
  loi: string | null;
  hanh: HanhXemLon;
  /** BB-400 vòng 4 — nút "Trên tường" cố định ở đầu màn lớn (cùng tên, cùng góc với lưới chọn). */
  xemTuong?: (anh: { id: string; fileName: string; width: number | null; height: number | null }) => void;
}

export function XemLonDuyet(p: PropsXemLon) {
  const a = p.anh[p.viTriMo];
  if (!a) return null;
  const tt = trangThaiTam(p.nhap, a.id, p.daXem);
  const muc = p.nhap[a.id];
  const dangSua = muc?.trangThai === "sua";
  const duocQuyet = p.moVong && p.laChu;
  const moBangGhiChu = duocQuyet && p.dangGhiChu && dangSua;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={a.fileName}
      data-testid="xem-lon-anh-chinh"
      data-photo-id={a.id}
      className="fixed inset-0 z-50 flex flex-col text-white"
      style={{ background: "rgba(18, 16, 14, 0.97)" }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
        <span className="min-w-0 truncate opacity-80" data-testid="dem-tam-xem-lon">
          {t.tamThu.replace("{i}", String(p.viTriMo + 1)).replace("{n}", String(p.anh.length))} · {a.fileName}
          {p.nhanDot && (
            <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[11px]" data-testid="nhan-dot-xem-lon">
              {p.nhanDot}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {p.xemTuong && (
            // BB-405 — cùng nút "Xem trong nhà" (ngôi nhà) với lưới chọn và màn xem lớn.
            <NutXemTrongNha
              kieu="thanh-toi"
              onBam={() => p.xemTuong?.({ id: a.id, fileName: a.fileName, width: a.width, height: a.height })}
            />
          )}
          <button type="button" onClick={p.hanh.dong} className="shrink-0 rounded-full px-3 py-1.5 hover:bg-white/10">
            {t.dong}
          </button>
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto px-2">
        <div className="relative w-full max-w-3xl">
          {p.soSanh && a.goc ? (
            <TruocSau anh={a} goc={a.goc} viTri={p.viTriSoSanh} onViTri={p.hanh.datViTriSoSanh} />
          ) : (
            // Giới hạn CHIỀU NGANG theo tỉ lệ ảnh (không chặn chiều cao): khung giữ đúng tỉ lệ nên
            // vòng khoanh nằm đúng chỗ ba mẹ chạm, kể cả ảnh dọc trên điện thoại.
            <div
              className="mx-auto w-full"
              style={{ maxWidth: `calc(${moBangGhiChu ? 32 : 50}vh / ${tiLeCua(a) ?? 1})` }}
            >
              <AnhKhoanhVung
                key={a.id}
                src={urlAnh(a, 1600)}
                srcDuPhong={urlAnhDuPhong(a.id, 1600)}
                alt={a.fileName}
                tiLe={tiLeCua(a)}
                vung={dangSua ? muc.vung : []}
                dangKhoanh={p.dangKhoanh && dangSua && duocQuyet}
                onThem={(v) => p.hanh.themVung(a.id, v)}
                onBo={(i) => p.hanh.boVung(a.id, i)}
                className="w-full"
              />
            </div>
          )}
          {p.moVong && (
            <ChipTrangThai tt={tt} testId="trang-thai-tam-xem-lon" className="absolute left-1/2 top-2 -translate-x-1/2 shadow" />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-4 pt-2 text-sm">
        <button
          type="button"
          disabled={p.viTriMo === 0}
          onClick={() => p.hanh.diToi(p.viTriMo - 1)}
          data-testid="nut-tam-truoc"
          className="rounded-full border border-white/30 px-3 py-1.5 disabled:opacity-30"
        >
          {t.truocDo}
        </button>
        {a.goc ? (
          <button
            type="button"
            onClick={p.hanh.batTatSoSanh}
            data-testid="nut-so-sanh-goc"
            className="rounded-full bg-white/90 px-4 py-1.5 font-medium text-black"
          >
            {p.soSanh ? t.tatSoSanh : t.soSanh}
          </button>
        ) : (
          <span className="text-xs opacity-70">{giuA(t.khongCoGoc)}</span>
        )}
        <button
          type="button"
          disabled={p.viTriMo === p.anh.length - 1}
          onClick={() => p.hanh.diToi(p.viTriMo + 1)}
          data-testid="nut-tam-sau"
          className="rounded-full border border-white/30 px-3 py-1.5 disabled:opacity-30"
        >
          {t.tiepTheo}
        </button>
      </div>

      {!moBangGhiChu && (
        <>
          {/* Dải ảnh nhỏ: trạng thái từng tấm ngay dưới tay, chạm để nhảy tới. */}
          <ul className="mx-auto flex w-full max-w-3xl gap-1.5 overflow-x-auto px-4 py-2" data-testid="dai-anh-nho">
            {p.anh.map((x, i) => {
              const ttx = trangThaiTam(p.nhap, x.id, p.daXem);
              return (
                <li key={x.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => p.hanh.diToi(i)}
                    aria-label={x.fileName}
                    aria-current={i === p.viTriMo ? "true" : undefined}
                    data-testid="o-dai-anh"
                    data-trang-thai={ttx}
                    className={cn(
                      "relative block h-12 w-12 overflow-hidden rounded-md bg-white/10",
                      i === p.viTriMo ? "ring-2 ring-white" : "opacity-70",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive */}
                    <img src={urlAnh(x, 200)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {(ttx === "da_duyet" || ttx === "xin_sua") && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                          ttx === "da_duyet" ? "bg-primary text-primary-foreground" : "bg-heart text-white",
                        )}
                      >
                        {ttx === "da_duyet" ? "✓" : "✎"}
                      </span>
                    )}
                    {ttx === "chua_xem" && (
                      <span aria-hidden="true" className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-white" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {p.lichSuTam.length > 0 && (
            <div className="mx-auto w-full max-w-3xl px-4" data-testid="lich-su-tam-xem-lon">
              <div className="rounded-2xl bg-white/10 p-2.5 text-xs">
                <p className="mb-0.5 font-medium">{t.lichSuTam}</p>
                <ul className="space-y-0.5">
                  {p.lichSuTam.map((l) => (
                    <li key={l.lan} className="line-clamp-2">
                      <span className="opacity-70">
                        {dien(t.lanSua, l.lan)} · {l.daSua ? t.beanDaSua : t.beanDangSua}
                      </span>
                      {l.ghiChu ? ` — ${l.ghiChu}` : ""}
                      {l.soAnhMau ? ` · ${dien(t.kemAnhMau, l.soAnhMau)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        {moBangGhiChu ? (
          <BangGhiChuTam
            anh={a}
            viTri={p.viTriMo}
            tong={p.anh.length}
            muc={muc}
            tinhNang={p.tinhNang}
            dangKhoanh={p.dangKhoanh}
            dangTaiAnh={p.dangTaiAnh}
            loi={p.loi}
            hanh={p.hanh}
          />
        ) : duocQuyet ? (
          <div className="mx-auto max-w-3xl space-y-2" data-testid="thanh-duyet-tam">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={p.ban}
                aria-pressed={tt === "da_duyet"}
                onClick={() => p.hanh.duyetTam(a.id)}
                data-testid="nut-duyet-tam"
                className={cn(
                  "h-12 rounded-full border text-sm font-medium transition disabled:opacity-40",
                  tt === "da_duyet" ? "border-primary bg-primary text-primary-foreground" : "border-white/40",
                )}
              >
                <span aria-hidden="true">✓ </span>
                {t.duyetTamNay}
              </button>
              <button
                type="button"
                disabled={p.ban}
                aria-pressed={tt === "xin_sua"}
                onClick={() => p.hanh.canSuaTam(a.id)}
                data-testid="nut-can-sua-tam"
                className={cn(
                  "h-12 rounded-full border text-sm font-medium transition disabled:opacity-40",
                  tt === "xin_sua" ? "border-heart bg-heart text-white" : "border-white/40",
                )}
              >
                <span aria-hidden="true">✎ </span>
                {t.canSuaTamNay}
              </button>
            </div>
            {dangSua && muc && (
              <button
                type="button"
                onClick={() => p.hanh.canSuaTam(a.id)}
                data-testid="tom-tat-ghi-chu-tam"
                className="block w-full truncate rounded-xl bg-white/10 px-3 py-1.5 text-left text-xs"
              >
                {moTaTamSua(muc)}
              </button>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={p.ban}
                onClick={p.hanh.duyetCaBo}
                data-testid="nut-duyet-ca-bo"
                className="h-10 rounded-full border border-white/30 px-4 text-sm font-medium disabled:opacity-40"
              >
                {t.duyetCaBo}
              </button>
              <span className="min-w-0 flex-1 truncate text-center text-[11px] opacity-70" data-testid="dem-duyet-tam">
                {t.demTomTat
                  .replace("{duyet}", String(p.dem.duyet))
                  .replace("{sua}", String(p.dem.sua))
                  .replace("{chua}", String(p.dem.chuaQuyet))}
              </span>
              {p.dem.sua > 0 && (
                <button
                  type="button"
                  disabled={p.ban}
                  onClick={p.hanh.guiYeuCau}
                  data-testid="nut-gui-yeu-cau-sua"
                  className="h-10 rounded-full bg-white px-4 text-sm font-medium text-black disabled:opacity-40"
                >
                  {dien(t.guiYeuCauSo, p.dem.sua)}
                </button>
              )}
            </div>
            {p.loi && <p className="text-xs text-[#ffb4bf]">{p.loi}</p>}
          </div>
        ) : (
          <p className="text-center text-xs opacity-80" data-testid="vong-khong-mo">
            {!p.laChu && p.trangThaiVong === "cho_duyet"
              ? giuA(t.chiNguoiChinh)
              : p.trangThaiVong === "da_duyet"
                ? t.daDuyetDot
                : p.trangThaiVong === "dang_sua"
                  ? t.beanDangSua
                  : ""}
          </p>
        )}
      </div>
    </div>
  );
}

/** Bảng ghi chú CỦA TẤM ĐANG XEM: ghi chú, khoanh vùng, ảnh minh hoạ. */
function BangGhiChuTam({
  anh: a,
  viTri,
  tong,
  muc,
  tinhNang,
  dangKhoanh,
  dangTaiAnh,
  loi,
  hanh,
}: {
  anh: AnhChinh;
  viTri: number;
  tong: number;
  muc: NhapTam;
  tinhNang: { vungKhoanh: boolean; anhMau: boolean };
  dangKhoanh: boolean;
  dangTaiAnh: boolean;
  loi: string | null;
  hanh: HanhXemLon;
}) {
  return (
    <div
      className="mx-auto max-h-[46vh] max-w-3xl space-y-2 overflow-y-auto rounded-2xl bg-white p-3 text-sm text-black"
      data-testid="bang-sua-tam"
      data-photo-id={a.id}
    >
      <p className="text-xs font-medium text-black/60">
        {t.tamThu.replace("{i}", String(viTri + 1)).replace("{n}", String(tong))} · {a.fileName}
      </p>
      <p className="text-xs text-black/70">{giuA(t.ghiChuMoDau)}</p>
      <textarea
        name="ghiChuTam"
        rows={3}
        maxLength={1000}
        aria-label={t.ghiChuTam}
        placeholder={t.ghiChuTamGoiY}
        value={muc.ghiChu}
        onChange={(e) => hanh.ghiChu(a.id, e.target.value)}
        data-testid="ghi-chu-tam"
        className="w-full rounded-xl border border-black/15 px-3 py-2 text-base sm:text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        {tinhNang.vungKhoanh && (
          <button
            type="button"
            onClick={hanh.batTatKhoanh}
            aria-pressed={dangKhoanh}
            data-testid="nut-khoanh-vung"
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              dangKhoanh ? "border-heart bg-heart text-white" : "border-black/20",
            )}
          >
            {dangKhoanh ? t.xongKhoanh : t.khoanhVung}
          </button>
        )}
        {muc.vung.length > 0 && <span className="text-xs text-black/60">{dien(t.soVung, muc.vung.length)}</span>}
        {tinhNang.anhMau && muc.anhMau.length < TOI_DA_ANH_MAU && (
          <label
            className={cn(
              "cursor-pointer rounded-full border border-black/20 px-3 py-1.5 text-xs font-medium",
              dangTaiAnh && "opacity-60",
            )}
            data-testid="nut-them-anh-minh-hoa"
          >
            {dangTaiAnh ? t.dangTaiAnh : t.themAnhMinhHoa}
            <input
              type="file"
              name="anhMinhHoa"
              multiple
              // iPhone tự đổi HEIC sang JPEG khi trang chỉ nhận JPEG/PNG/WEBP — máy tính của
              // thợ chỉnh đọc được ảnh minh hoạ.
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={dangTaiAnh}
              data-testid="o-chon-anh-minh-hoa"
              onChange={(e) => {
                const tep = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (tep.length) hanh.chonAnhMinhHoa(a.id, tep);
              }}
            />
          </label>
        )}
      </div>
      {dangKhoanh && <p className="text-xs text-black/60">{giuA(t.khoanhHuongDan)}</p>}
      {tinhNang.anhMau && muc.anhMau.length === 0 && <p className="text-xs text-black/60">{giuA(t.anhMinhHoaGoiY)}</p>}
      {muc.anhMau.length > 0 && (
        <ul className="flex flex-wrap gap-2" data-testid="anh-minh-hoa-tam">
          {muc.anhMau.map((am, i) => (
            <li key={am.duongDan} className="relative">
              {am.xem ? (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh ba mẹ vừa chọn trên máy
                <img src={am.xem} alt="" className="h-14 w-14 rounded-lg object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-black/5 text-[11px] text-black/60">
                  {dien(t.anhMinhHoaSo, i + 1)}
                </span>
              )}
              <button
                type="button"
                aria-label={t.boAnhMinhHoa}
                onClick={() => hanh.boAnhMinhHoa(a.id, am.duongDan)}
                className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full bg-black text-xs leading-6 text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {loi && <p className="text-xs text-heart">{loi}</p>}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => hanh.boYeuCauSua(a.id)}
          data-testid="nut-bo-yeu-cau-sua"
          className="rounded-full px-2 py-1.5 text-xs font-medium text-black/60 underline-offset-2 hover:underline"
        >
          {t.boYeuCauSuaTam}
        </button>
        <button
          type="button"
          onClick={hanh.xongGhiChu}
          data-testid="nut-xong-ghi-chu"
          className="h-10 rounded-full bg-black px-6 text-sm font-medium text-white"
        >
          {t.xongGhiChu}
        </button>
      </div>
      <p className="text-[11px] text-black/50">{giuA(t.nhapGiuTrenMay)}</p>
    </div>
  );
}

/** Lớp hộp nổi dùng chung (bảng đáy trên điện thoại, hộp giữa trên máy tính). */
function HopNoi({ testId, nhan, children }: { testId: string; nhan: string; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={nhan}
      data-testid={testId}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
    >
      <div className="max-h-[88vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-3xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground shadow-xl sm:rounded-3xl">
        {children}
      </div>
    </div>
  );
}

/** Tóm tắt trước khi gửi yêu cầu sửa: từng tấm + ghi chú, sửa lại được. */
export function TomTatGuiSua({
  anh,
  nhap,
  dem,
  ghiChuChung,
  ban,
  loi,
  onGhiChuChung,
  onSuaLai,
  onGui,
  onXemLai,
}: {
  anh: readonly AnhChinh[];
  nhap: NhapDuyet;
  dem: DemNhap;
  ghiChuChung: string;
  ban: boolean;
  loi: string | null;
  onGhiChuChung: (s: string) => void;
  onSuaLai: (id: string) => void;
  onGui: () => void;
  onXemLai: () => void;
}) {
  const sua = anh.filter((a) => nhap[a.id]?.trangThai === "sua");
  return (
    <HopNoi testId="tom-tat-gui-sua" nhan={t.tomTatTieuDe}>
      <p className="kh-h3">{giuA(t.tomTatTieuDe)}</p>
      <p className="text-sm text-muted-foreground" data-testid="so-tam-can-sua">
        {dien(t.daNhanSoTam, sua.length)}
      </p>
      <ul className="space-y-2" data-testid="tom-tat-cac-tam">
        {sua.map((a) => (
          <li key={a.id} className="flex items-start gap-3 rounded-xl bg-surface-2 p-2" data-testid="tom-tat-tam">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive */}
            <img src={urlAnh(a, 200)} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium">{a.fileName}</p>
              <p className="whitespace-pre-line text-muted-foreground">{moTaTamSua(nhap[a.id]!)}</p>
            </div>
            <button
              type="button"
              onClick={() => onSuaLai(a.id)}
              className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium"
            >
              {t.suaLai}
            </button>
          </li>
        ))}
      </ul>
      {(dem.duyet > 0 || dem.chuaQuyet > 0) && (
        <p className="text-xs text-muted-foreground">
          {[dem.duyet > 0 ? dien(t.tomTatDaDuyet, dem.duyet) : "", dem.chuaQuyet > 0 ? dien(t.tomTatChuaDuyet, dem.chuaQuyet) : ""]
            .filter(Boolean)
            .map((c) => giuA(c))
            .join(" ")}
        </p>
      )}
      <label htmlFor="ghi-chu-chung-sua" className="block text-xs text-muted-foreground">
        {t.ghiChuChung}
      </label>
      <textarea
        id="ghi-chu-chung-sua"
        name="ghiChuChung"
        rows={2}
        maxLength={1000}
        value={ghiChuChung}
        onChange={(e) => onGhiChuChung(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base focus:outline-hidden focus:ring-1 focus:ring-primary sm:text-sm"
      />
      {loi && <p className="text-xs text-heart">{loi}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={ban}
          onClick={onXemLai}
          data-testid="nut-xem-lai"
          className="h-11 rounded-full px-5 text-sm font-medium text-muted-foreground hover:bg-surface-2 disabled:opacity-40"
        >
          {t.xemLai}
        </button>
        <button
          type="button"
          disabled={ban || sua.length === 0}
          onClick={onGui}
          data-testid="nut-xac-nhan-gui-sua"
          className="h-11 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {ban ? t.dangGui : t.guiYeuCau}
        </button>
      </div>
    </HopNoi>
  );
}

/** "Duyệt cả bộ" — xác nhận một chạm, nói rõ còn bao nhiêu tấm chưa duyệt / đang xin sửa. */
export function HopDuyetCaBo({
  dem,
  ban,
  loi,
  onDuyet,
  onXemLai,
}: {
  dem: DemNhap;
  ban: boolean;
  loi: string | null;
  onDuyet: () => void;
  onXemLai: () => void;
}) {
  return (
    <HopNoi testId="hop-duyet-ca-bo" nhan={t.duyetCaBoTieuDe}>
      <p className="kh-h3">{giuA(t.duyetCaBoTieuDe)}</p>
      <p className="text-sm" data-testid="duyet-ca-bo-dem">
        {t.duyetCaBoMoTa
          .replace("{tong}", String(dem.tong))
          .replace("{duyet}", String(dem.duyet))
          .replace("{chua}", String(dem.chuaQuyet))}
      </p>
      {dem.sua > 0 && (
        <p className="text-sm text-heart" data-testid="duyet-ca-bo-co-sua">
          {giuA(dien(t.duyetCaBoCoSua, dem.sua))}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{giuA(t.duyetCaBoSauDo)}</p>
      {loi && <p className="text-xs text-heart">{loi}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={ban}
          onClick={onXemLai}
          className="h-11 rounded-full px-5 text-sm font-medium text-muted-foreground hover:bg-surface-2 disabled:opacity-40"
        >
          {t.xemLai}
        </button>
        <button
          type="button"
          disabled={ban}
          onClick={onDuyet}
          data-testid="nut-xac-nhan-duyet-ca-bo"
          className="h-11 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {ban ? t.dangGui : t.xacNhanDuyetCaBo}
        </button>
      </div>
    </HopNoi>
  );
}

/** Sau khi gửi: lời xin lỗi đúng câu anh chốt + "khoảng N ngày" — hoặc lời cảm ơn khi duyệt hết. */
export function KetQuaGuiView({ ketQua, onDong }: { ketQua: KetQuaDuyet; onDong: () => void }) {
  if (ketQua.loai === "duyet") {
    return (
      <HopNoi testId="cam-on-da-duyet" nhan={t.camOnTieuDe}>
        <p className="kh-h3">{giuA(t.camOnTieuDe)}</p>
        <p className="text-sm text-muted-foreground">{giuA(t.camOnMoTa)}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDong}
            className="h-11 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t.veBoAnh}
          </button>
        </div>
      </HopNoi>
    );
  }
  return (
    <HopNoi testId="xac-nhan-da-gui-sua" nhan={dien(t.daNhanTieuDe, ketQua.lan)}>
      <p className="kh-h3">{giuA(dien(t.daNhanTieuDe, ketQua.lan))}</p>
      <p className="text-sm" data-testid="loi-xin-loi-sua">
        {giuA(t.suaLoiBean)}
      </p>
      <p className="text-sm text-muted-foreground" data-testid="han-sua">
        {giuA(cauHanSua(ketQua.soNgaySua))}
      </p>
      {ketQua.tam.length > 0 && (
        <div className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
          <p className="text-muted-foreground">{dien(t.daNhanSoTam, ketQua.tam.length)}</p>
          <ul className="list-disc pl-5">
            {ketQua.tam.map((x) => (
              <li key={x.ten}>
                <span className="font-medium">{x.ten}</span> — {x.ghiChu}
              </li>
            ))}
          </ul>
          {ketQua.ghiChuChung && (
            <p>
              <span className="text-muted-foreground">{t.daNhanGhiChuChung}</span>{" "}
              <span className="whitespace-pre-line">{ketQua.ghiChuChung}</span>
            </p>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDong}
          data-testid="nut-dong-ket-qua"
          className="h-11 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t.veBoAnh}
        </button>
      </div>
    </HopNoi>
  );
}

/** Thanh trượt trước/sau: ảnh đã chỉnh nằm dưới, ảnh gốc phủ lên phần bên trái. */
function TruocSau({
  anh,
  goc,
  viTri,
  onViTri,
}: {
  anh: AnhNho;
  goc: AnhNho;
  viTri: number;
  onViTri: (v: number) => void;
}) {
  const tiLe = tiLeCua(anh) ?? tiLeCua(goc) ?? 1.5;
  return (
    <div
      className="relative mx-auto w-full select-none"
      style={{ aspectRatio: `1 / ${tiLe}`, maxWidth: `calc(50vh / ${tiLe})` }}
      data-testid="so-sanh-truoc-sau"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive */}
      <img src={urlAnh(anh, 1600)} alt={vi.gallery.anhChinh.sau} className="absolute inset-0 h-full w-full object-contain" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - viTri}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive */}
        <img src={urlAnh(goc, 1600)} alt={vi.gallery.anhChinh.truoc} className="absolute inset-0 h-full w-full object-contain" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${viTri}%` }} />
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px]">
        {vi.gallery.anhChinh.truoc}
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px]">
        {vi.gallery.anhChinh.sau}
      </span>
      <input
        type="range"
        name="soSanh"
        min={0}
        max={100}
        value={viTri}
        onChange={(e) => onViTri(Number(e.target.value))}
        aria-label={vi.gallery.anhChinh.keoSoSanh}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        data-testid="thanh-truot-so-sanh"
      />
    </div>
  );
}

/** bh-04 — lời mời in thêm sau khi ba mẹ duyệt cho in: 3 tấm đã chỉnh + sản phẩm in có giá trong danh mục. */
function LoiMoiInThem({
  anh,
  sanPham,
  onChon,
}: {
  anh: AnhNho[];
  sanPham: SanPhamGoiY[];
  onChon: (() => void) | null;
}) {
  if (anh.length === 0) return null;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4" data-testid="loi-moi-in-them">
      <div>
        <p className="kh-h3">{giuA(t.moiInTieuDe)}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{giuA(t.moiInMoTa)}</p>
      </div>
      <ul className="grid grid-cols-3 gap-1.5">
        {anh.map((a) => (
          <li key={a.id} className="aspect-square overflow-hidden rounded-lg bg-surface-2" data-testid="anh-moi-in">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive */}
            <img src={urlAnh(a, 400)} alt={a.fileName} loading="lazy" className="h-full w-full object-cover" />
          </li>
        ))}
      </ul>
      {sanPham.length > 0 && (
        <ul className="space-y-1 text-sm" data-testid="san-pham-moi-in">
          {sanPham.map((sp) => (
            <li key={sp.productId} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                {sp.name}
                {sp.size ? ` · ${sp.size}` : ""}
              </span>
              <span className="shrink-0 text-muted-foreground">{t.moiInGia.replace("{gia}", formatTien(sp.unitPrice))}</span>
            </li>
          ))}
        </ul>
      )}
      {onChon && (
        <button
          type="button"
          onClick={onChon}
          data-testid="nut-moi-in-them"
          className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          {t.moiInNut}
        </button>
      )}
    </div>
  );
}
