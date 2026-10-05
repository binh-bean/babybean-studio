"use client";

/**
 * BB-342 — `useCapNhatTucThi(phamVi, khiCoSuKien)`: một hook dùng chung cho
 * mọi màn cần tự cập nhật khi phía bên kia vừa làm gì — không cần F5.
 *
 * OWNER: DEV-FE.
 *
 *   phamVi "khach"     → kênh của bộ ảnh trong phiên khách (GET /api/g/tuc-thi)
 *   phamVi "nhan-vien" → kênh các chi nhánh của nhân viên (GET /api/admin/tuc-thi)
 *
 * Tên kênh là HMAC do máy chủ cấp (src/lib/supabase/tuc-thi.ts); trình duyệt
 * không tự tính được, nên không nghe nhầm được bộ của nhà khác.
 *
 * ---------------------------------------------------------------------------
 * Một kết nối cho cả trang
 * ---------------------------------------------------------------------------
 * Nhiều khối trên cùng màn (huy hiệu menu, danh sách, chi tiết…) cùng gọi hook
 * này. Chúng dùng CHUNG một "trạm" theo phạm vi: một websocket, một lượt hỏi
 * tên kênh. Khối cuối cùng rời đi thì trạm đóng sau 5 giây (đủ để chuyển trang
 * trong khu quản trị mà không phải nối lại).
 *
 * ---------------------------------------------------------------------------
 * Lưới đỡ khi mất Realtime
 * ---------------------------------------------------------------------------
 *  · Trạm chưa nối được / rớt: mỗi 30 giây hỏi lại một lần — CHỈ khi tab đang
 *    hiện (tab ẩn thì không ai nhìn, không tốn lượt gọi).
 *  · Tab hiện lại sau khi ẩn ≥ 3 giây, mạng có lại, hoặc Realtime nối lại sau
 *    khi rớt: tải lại ngay — sự kiện trong khoảng mất kết nối không phát lại.
 *
 * `khiCoSuKien` là hàm tải lại của chính màn đó; nó luôn đọc qua API (nơi kiểm
 * quyền), sự kiện chỉ là cái chuông báo "có gì mới".
 */

import { useEffect, useRef } from "react";
import { TEN_SU_KIEN_TUC_THI, laLoaiHopLe, type SuKienTucThi } from "@/lib/utils/tuc-thi-su-kien";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";

export type PhamViTucThi = "khach" | "nhan-vien";

/** Loại giả do chính hook sinh ra khi tải lại theo lưới đỡ (không phải từ máy chủ). */
export const LOAI_HOI_LAI = "hoi_lai";

export const CHU_KY_HOI_LAI_MS = 30_000;
const AN_TOI_THIEU_MS = 3_000;
const DONG_TRE_MS = 5_000;

// ---------------------------------------------------------------------------
// Trạm: phần không dính React — tách ra để thử được bằng một kênh giả.
// ---------------------------------------------------------------------------

/** Phần nhỏ nhất của một kênh Realtime mà trạm cần. */
export interface KenhToiThieu {
  on(
    loai: "broadcast",
    loc: { event: string },
    cb: (tin: { payload?: unknown }) => void,
  ): KenhToiThieu;
  subscribe(cb: (trangThai: string) => void): unknown;
}

export interface KetNoiToiThieu {
  channel(ten: string): KenhToiThieu;
  disconnect(): void;
}

export interface PhuThuocTram {
  layTenKenh: () => Promise<string[]>;
  taoKetNoi: () => Promise<KetNoiToiThieu>;
}

export interface Tram {
  /** true khi MỌI kênh đã SUBSCRIBED. */
  daNoi(): boolean;
  nghe(cb: (sk: SuKienTucThi) => void): () => void;
  /** Báo khi Realtime nối lại SAU một lần rớt (để tải bù). */
  ngheNoiLai(cb: () => void): () => void;
  dong(): void;
}

export function taoTram(phuThuoc: PhuThuocTram): Tram {
  const nguoiNghe = new Set<(sk: SuKienTucThi) => void>();
  const ngheNoiLai = new Set<() => void>();
  const trangThaiKenh = new Map<string, string>();
  let daTungRot = false;
  let ketNoi: KetNoiToiThieu | null = null;
  let daDong = false;

  const daNoi = () =>
    trangThaiKenh.size > 0 && [...trangThaiKenh.values()].every((s) => s === "SUBSCRIBED");

  void (async () => {
    try {
      const tenKenh = await phuThuoc.layTenKenh();
      if (daDong || tenKenh.length === 0) return;
      ketNoi = await phuThuoc.taoKetNoi();
      if (daDong) {
        ketNoi.disconnect();
        return;
      }
      for (const ten of tenKenh) {
        trangThaiKenh.set(ten, "DANG_NOI");
        ketNoi
          .channel(ten)
          .on("broadcast", { event: TEN_SU_KIEN_TUC_THI }, (tin) => {
            const p = (tin?.payload ?? {}) as { loai?: unknown; galleryId?: unknown };
            if (!laLoaiHopLe(p.loai)) return; // tin rác trên kênh công khai — bỏ
            const sk: SuKienTucThi = { loai: p.loai };
            if (typeof p.galleryId === "string") sk.galleryId = p.galleryId;
            for (const cb of [...nguoiNghe]) cb(sk);
          })
          .subscribe((trangThai) => {
            const truoc = daNoi();
            trangThaiKenh.set(ten, trangThai);
            if (trangThai !== "SUBSCRIBED") daTungRot = daTungRot || truoc;
            if (!truoc && daNoi() && daTungRot) {
              daTungRot = false;
              for (const cb of [...ngheNoiLai]) cb();
            }
          });
      }
    } catch {
      // Không lấy được tên kênh / không mở được websocket: daNoi() = false,
      // lưới đỡ 30 giây của hook lo phần còn lại.
    }
  })();

  return {
    daNoi,
    nghe(cb) {
      nguoiNghe.add(cb);
      return () => nguoiNghe.delete(cb);
    },
    ngheNoiLai(cb) {
      ngheNoiLai.add(cb);
      return () => ngheNoiLai.delete(cb);
    },
    dong() {
      daDong = true;
      ketNoi?.disconnect();
      ketNoi = null;
      trangThaiKenh.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Sổ trạm dùng chung theo phạm vi (đếm số khối đang dùng).
// ---------------------------------------------------------------------------

const DUONG_TEN_KENH: Record<PhamViTucThi, string> = {
  khach: "/api/g/tuc-thi",
  "nhan-vien": "/api/admin/tuc-thi",
};

async function layTenKenhTuApi(phamVi: PhamViTucThi): Promise<string[]> {
  const res = await goiApiKhach(DUONG_TEN_KENH[phamVi], { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as { data?: { kenh?: unknown } } | null;
  const kenh = json?.data?.kenh;
  return Array.isArray(kenh) ? kenh.filter((k): k is string => typeof k === "string") : [];
}

async function moKetNoiSupabase(): Promise<KetNoiToiThieu> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Thiếu cấu hình Supabase");
  // Nạp lười: thư viện websocket chỉ tải khi màn thật sự cần, không nằm trong
  // gói JS đầu tiên của màn khách.
  const { RealtimeClient } = await import("@supabase/realtime-js");
  const diaChi = new URL("realtime/v1", url.endsWith("/") ? url : `${url}/`);
  diaChi.protocol = diaChi.protocol.replace("http", "ws");
  const rc = new RealtimeClient(diaChi.href, { params: { apikey: anon } });
  return rc as unknown as KetNoiToiThieu;
}

const soTram = new Map<string, { tram: Tram; soNguoiDung: number; hen: ReturnType<typeof setTimeout> | null }>();

function muonTram(phamVi: PhamViTucThi, khoa: string, tenKenhCoSan?: readonly string[]): Tram {
  const ma = `${phamVi}|${khoa}`;
  let o = soTram.get(ma);
  if (!o) {
    // BB-334B — trang gia đình đã có sẵn tên kênh (trong `GET /api/k/<mã>`):
    // nghe thẳng, không hỏi lại `/api/g/tuc-thi` (phiên gia đình không có bộ).
    const layTenKenh = tenKenhCoSan
      ? () => Promise.resolve([...tenKenhCoSan])
      : () => layTenKenhTuApi(phamVi);
    o = {
      tram: taoTram({ layTenKenh, taoKetNoi: moKetNoiSupabase }),
      soNguoiDung: 0,
      hen: null,
    };
    soTram.set(ma, o);
  }
  if (o.hen) {
    clearTimeout(o.hen);
    o.hen = null;
  }
  o.soNguoiDung += 1;
  return o.tram;
}

function traTram(phamVi: PhamViTucThi, khoa: string): void {
  const ma = `${phamVi}|${khoa}`;
  const o = soTram.get(ma);
  if (!o) return;
  o.soNguoiDung -= 1;
  if (o.soNguoiDung > 0) return;
  o.hen = setTimeout(() => {
    if (o.soNguoiDung > 0) return;
    o.tram.dong();
    soTram.delete(ma);
  }, DONG_TRE_MS);
}

// ---------------------------------------------------------------------------
// Gộp sự kiện dồn dập
// ---------------------------------------------------------------------------

/** Cửa sổ gộp mặc định: sự kiện dồn trong 1,5 giây chỉ tải lại hai lần (đầu + cuối). */
export const GOP_MAC_DINH_MS = 1_500;

/**
 * Lần đầu gọi ngay; mọi lần tới trong `ms` sau đó gộp thành ĐÚNG MỘT lần gọi
 * ở cuối cửa sổ (mang sự kiện mới nhất). Không gộp thì một đợt "nhắc khách"
 * tự động cho 50 bộ ảnh lúc 8h sáng thành 50 lượt tải lại × mỗi khối × mỗi
 * nhân viên đang mở máy — tự bắn sập chính mình.
 */
export function taoBoGop<T>(goi: (x: T) => void, ms: number): { day: (x: T) => void; huy: () => void } {
  let hen: ReturnType<typeof setTimeout> | null = null;
  let choCuoi: { x: T } | null = null;
  const moCua = () => {
    hen = setTimeout(() => {
      hen = null;
      if (choCuoi) {
        const { x } = choCuoi;
        choCuoi = null;
        goi(x);
        moCua();
      }
    }, ms);
  };
  return {
    day(x: T) {
      if (ms <= 0) return goi(x);
      if (hen) {
        choCuoi = { x };
        return;
      }
      goi(x);
      moCua();
    },
    huy() {
      if (hen) clearTimeout(hen);
      hen = null;
      choCuoi = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface TuyChonTucThi {
  /** false = chưa bật (vd chưa đăng nhập xong phiên khách). Mặc định true. */
  bat?: boolean;
  /**
   * Chỉ nhận sự kiện của đúng bộ ảnh này (trang chi tiết). Sự kiện của lưới
   * đỡ (`LOAI_HOI_LAI`) không mang id nên luôn qua.
   */
  galleryId?: string;
  /**
   * Đổi khoá thì mở trạm MỚI (hỏi lại tên kênh). Màn khách truyền id bộ ảnh:
   * ba mẹ chuyển sang buổi chụp khác (link theo khách, BB-130) thì phiên —
   * và kênh — đổi theo.
   */
  khoa?: string;
  /** Cửa sổ gộp sự kiện dồn dập (ms). Mặc định 1.500; 0 = không gộp. */
  gopMs?: number;
  /**
   * BB-334B — tên kênh máy chủ ĐÃ cấp sẵn (trang gia đình: `kenhTucThi` của
   * `GET /api/k/<mã>`, kênh của mọi bộ đang hiện). Có thì không hỏi API tên kênh.
   */
  tenKenh?: readonly string[];
}

export function useCapNhatTucThi(
  phamVi: PhamViTucThi,
  khiCoSuKien: (sk: SuKienTucThi) => void,
  tuyChon: TuyChonTucThi = {},
): void {
  const goiLai = useRef(khiCoSuKien);
  goiLai.current = khiCoSuKien;
  const bat = tuyChon.bat ?? true;
  const galleryId = tuyChon.galleryId;
  const khoa = tuyChon.khoa ?? "";
  const gopMs = tuyChon.gopMs ?? GOP_MAC_DINH_MS;
  const tenKenh = tuyChon.tenKenh;
  // Khoá trạm gồm cả danh sách kênh: nhà có bộ mới → mở trạm mới đúng kênh.
  const khoaKenh = tenKenh ? `${khoa}#${tenKenh.join(",")}` : khoa;
  const tenKenhRef = useRef(tenKenh);
  tenKenhRef.current = tenKenh;

  useEffect(() => {
    if (!bat || typeof window === "undefined") return;
    const tram = muonTram(phamVi, khoaKenh, tenKenhRef.current);
    const boGop = taoBoGop<SuKienTucThi>((sk) => goiLai.current(sk), gopMs);
    const bao = (sk: SuKienTucThi) => {
      if (galleryId && sk.galleryId && sk.galleryId !== galleryId) return;
      boGop.day(sk);
    };
    const taiBu = () => bao({ loai: LOAI_HOI_LAI });

    const boNghe = tram.nghe(bao);
    const boNgheNoiLai = tram.ngheNoiLai(taiBu);

    const hoiLai = setInterval(() => {
      if (document.visibilityState === "visible" && !tram.daNoi()) taiBu();
    }, CHU_KY_HOI_LAI_MS);

    let anLuc = 0;
    const khiDoiHien = () => {
      if (document.visibilityState === "hidden") {
        anLuc = Date.now();
      } else if (anLuc && Date.now() - anLuc >= AN_TOI_THIEU_MS) {
        anLuc = 0;
        taiBu();
      }
    };
    document.addEventListener("visibilitychange", khiDoiHien);
    window.addEventListener("online", taiBu);

    return () => {
      boNghe();
      boNgheNoiLai();
      boGop.huy();
      clearInterval(hoiLai);
      document.removeEventListener("visibilitychange", khiDoiHien);
      window.removeEventListener("online", taiBu);
      traTram(phamVi, khoaKenh);
    };
  }, [phamVi, bat, galleryId, khoaKenh, gopMs]);
}
