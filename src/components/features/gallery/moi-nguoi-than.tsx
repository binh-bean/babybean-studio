"use client";

/**
 * "Mời ông bà cùng xem" — ba mẹ tự mời người thân xem (và mua thêm) bộ ảnh,
 * KHÔNG chọn ảnh, KHÔNG thấy tiền của ba mẹ.
 *
 * OWNER: DEV-FE. Task BB-254. Chủ studio chốt 26/09/2026:
 *
 *     "ba mẹ tự mời trong app; ông bà/người thân được mời thì XEM và MUA…
 *      Ông bà KHÔNG chọn ảnh, không thấy tiền hợp đồng/tiền phát sinh của ba
 *      mẹ, không tải ảnh gốc, không mời tiếp người khác."
 *
 * Gọi `/api/g/moi-nguoi-than` (POST tạo, GET liệt kê, DELETE thu hồi) — route
 * đó tự chặn 403 nếu phiên gọi là viewer; ở đây chỉ RENDER cho phiên không
 * phải viewer (`gallery-app.tsx` truyền vào theo `duocChon`), không phải
 * ranh giới an ninh thật.
 *
 * BB-338 (anh báo 01/10/2026): "thoát ra vào lại thì không thấy link để gửi
 * hoặc kiểm tra, chỉ có thu hồi". Route nay lưu bản mã hoá (khuôn BB-201) và
 * GET trả lại địa chỉ cho link CÒN SỐNG — mỗi dòng đang xem có Chép, Chia sẻ,
 * Thu hồi. Link tạo trước bản vá (máy chủ không còn địa chỉ) có "Tạo lại
 * link": thu hồi link cũ rồi tạo link mới cùng nhãn.
 */

import React from "react";
import { formatNgayVN } from "@/lib/utils/dinh-dang";
import { giuA } from "@/lib/utils/giu-a";
import { ChevronRight, UserPlus } from "lucide-react";
import { useNutBackDong } from "./use-nut-back-dong";

interface NguoiDaMoi {
  id: string;
  nhan: string;
  trangThai: string;
  createdAt: string;
  /** BB-338 — địa chỉ đầy đủ của link còn sống; null = không hiện lại được. */
  diaChiDayDu?: string | null;
  duongDan?: string | null;
}

const NHAN_TRANG_THAI: Record<string, string> = {
  active: "Đang xem",
  revoked: "Đã thu hồi",
  expired: "Hết hạn",
};

/**
 * BB-330 — link mời LUÔN là địa chỉ tuyệt đối tới đúng bộ ảnh (`…/g/<mã>`).
 * Máy chủ thiếu `NEXT_PUBLIC_APP_URL` thì `diaChiDayDu` chỉ còn đường dẫn
 * tương đối "/g/<mã>" — chép vào Zalo thành chữ vô nghĩa. Ghép với địa chỉ
 * trang đang mở (cùng tên miền của app) thay vì tin mù.
 */
export function diaChiTuyetDoi(diaChiDayDu: string | undefined, duongDan: string): string {
  const goc = diaChiDayDu && /^https?:\/\//.test(diaChiDayDu) ? diaChiDayDu : duongDan;
  try {
    return new URL(goc, window.location.href).href;
  } catch {
    return goc;
  }
}

/**
 * BB-355 — bản vẽ "Màn khách v8": lối vào màn mời có BA kiểu, cùng một màn mời.
 *   · "nut-bia"  — nút viền thứ hai trên bìa (đang chọn ảnh), thay khối mời đứng
 *                  giữa hàng chip và lưới.
 *   · "hang"     — hàng cuối của thẻ tiến độ gộp (đã gửi, chờ Bean xác nhận).
 *   · "the"      — thẻ cũ (màn Đã giao, đứng SAU lưới).
 * Màn mời mở dạng tấm trượt từ đáy (điện thoại) / tấm bên phải (máy tính).
 */
export type KieuLoiVaoMoi = "the" | "nut-bia" | "hang";

export function MoiNguoiThan({ kieu = "the" }: { kieu?: KieuLoiVaoMoi } = {}) {
  const [ds, setDs] = React.useState<NguoiDaMoi[] | null>(null);
  const [mo, setMo] = React.useState(false);
  const [nhan, setNhan] = React.useState("");
  const [dangTao, setDangTao] = React.useState(false);
  const [dangThuHoi, setDangThuHoi] = React.useState<string | null>(null);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [linkVuaTao, setLinkVuaTao] = React.useState<{ nhan: string; diaChi: string } | null>(null);
  const [daSaoChep, setDaSaoChep] = React.useState<string | null>(null);
  const [dangTaoLai, setDangTaoLai] = React.useState<string | null>(null);

  const dongRef = React.useRef(false);

  const taiLai = React.useCallback(async () => {
    try {
      const res = await fetch("/api/g/moi-nguoi-than", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        data?: { items?: NguoiDaMoi[] };
      } | null;
      if (!dongRef.current) setDs(json?.data?.items ?? []);
    } catch {
      // Mạng lỗi — không chặn phần còn lại của màn hình.
    }
  }, []);

  React.useEffect(() => {
    dongRef.current = false;
    void taiLai();
    return () => {
      dongRef.current = true;
    };
  }, [taiLai]);

  /** Gọi POST tạo link; trả về link mới hoặc null (đã báo lỗi). */
  async function goiTaoLink(nhanSach: string): Promise<{ nhan: string; diaChi: string } | null> {
    const res = await fetch("/api/g/moi-nguoi-than", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nhan: nhanSach }),
    });
    const json = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      data?: { nhan: string; diaChiDayDu: string; duongDan: string };
    } | null;
    if (!res.ok || !json?.data) {
      setLoi(json?.error?.message ?? "Bean chưa tạo được link, ba mẹ thử lại giúp Bean nhé ạ.");
      return null;
    }
    return { nhan: json.data.nhan, diaChi: diaChiTuyetDoi(json.data.diaChiDayDu, json.data.duongDan) };
  }

  async function goiThuHoi(id: string): Promise<boolean> {
    const res = await fetch(`/api/g/moi-nguoi-than?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setLoi(json?.error?.message ?? "Bean chưa thu hồi được, ba mẹ thử lại giúp Bean nhé ạ.");
      return false;
    }
    return true;
  }

  async function taoLink() {
    const nhanSach = nhan.trim();
    if (!nhanSach) {
      setLoi("Ba mẹ đặt giúp Bean một nhãn, ví dụ “Bà nội” nhé ạ.");
      return;
    }
    setDangTao(true);
    setLoi(null);
    try {
      const moi = await goiTaoLink(nhanSach);
      if (!moi) return;
      setLinkVuaTao(moi);
      setNhan("");
      setDaSaoChep(null);
      await taiLai();
    } catch {
      setLoi("Không kết nối được, ba mẹ thử lại giúp Bean nhé ạ.");
    } finally {
      setDangTao(false);
    }
  }

  /** Link tạo trước BB-338: máy chủ không còn địa chỉ — thu hồi rồi tạo lại cùng nhãn. */
  async function taoLai(d: NguoiDaMoi) {
    if (!window.confirm(`Tạo link mới cho "${d.nhan}"? Link cũ sẽ ngừng mở được, ba mẹ gửi lại link mới giúp Bean nhé ạ.`)) {
      return;
    }
    setDangTaoLai(d.id);
    setLoi(null);
    try {
      if (!(await goiThuHoi(d.id))) return;
      const moi = await goiTaoLink(d.nhan);
      if (moi) {
        setLinkVuaTao(moi);
        setDaSaoChep(null);
      }
      await taiLai();
    } catch {
      setLoi("Không kết nối được, ba mẹ thử lại giúp Bean nhé ạ.");
    } finally {
      setDangTaoLai(null);
    }
  }

  async function saoChep(diaChi: string) {
    try {
      await navigator.clipboard.writeText(diaChi);
      setDaSaoChep(diaChi);
    } catch {
      setLoi("Bean chưa sao chép được. Ba mẹ bôi đen rồi chép tay giúp Bean nhé ạ.");
    }
  }

  async function chiaSe(diaChi: string) {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Xem ảnh cùng gia đình", url: diaChi });
      } catch {
        // Người dùng bấm huỷ hộp chia sẻ — không phải lỗi, không báo gì thêm.
      }
    } else {
      await saoChep(diaChi);
    }
  }

  async function thuHoi(id: string, nhanNguoi: string) {
    if (!window.confirm(`Thu hồi link đã gửi cho "${nhanNguoi}"? Người đó sẽ không mở được nữa ạ.`)) {
      return;
    }
    setDangThuHoi(id);
    setLoi(null);
    try {
      if (!(await goiThuHoi(id))) return;
      setLinkVuaTao(null);
      await taiLai();
    } catch {
      setLoi("Không kết nối được, ba mẹ thử lại giúp Bean nhé ạ.");
    } finally {
      setDangThuHoi(null);
    }
  }

  // BB-338 mục 2e — nút back của điện thoại đóng màn mời, không thoát hẳn app.
  const dongMan = useNutBackDong(mo, () => setMo(false));

  const dangHoatDong = (ds ?? []).filter((d) => d.trangThai === "active");

  const moMan = () => {
    setMo(true);
    setLoi(null);
    setLinkVuaTao(null);
  };

  const loiVao =
    kieu === "nut-bia" ? (
      <button
        type="button"
        data-testid="nut-moi-ong-ba-bia"
        onClick={moMan}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#e5dcd2] bg-white px-6 text-[14px] font-medium text-[#2e2a27] transition hover:bg-[#2e2a27]/5 @[64rem]:h-[52px] @[64rem]:w-auto"
      >
        <UserPlus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        Mời ông bà cùng xem
      </button>
    ) : kieu === "hang" ? (
      <button
        type="button"
        data-testid="hang-moi-ong-ba"
        onClick={moMan}
        className="flex h-11 w-full items-center gap-2.5 border-t border-[#e5dcd2] text-left text-[14px] font-medium text-[#2e2a27] lg:h-11 lg:w-auto lg:shrink-0 lg:gap-2 lg:rounded-full lg:border lg:bg-white lg:px-5"
      >
        <UserPlus className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
        <span className="flex-1 lg:flex-none">Mời ông bà cùng xem</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#6b6057] lg:hidden" strokeWidth={1.8} aria-hidden="true" />
      </button>
    ) : null;

  return (
    <>
      {loiVao ?? (
      <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-5">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/san-pham/moi-ong-ba-320.webp"
            srcSet="/san-pham/moi-ong-ba-320.webp 320w, /san-pham/moi-ong-ba-640.webp 640w"
            sizes="56px"
            alt=""
            loading="lazy"
            width={56}
            height={56}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="kh-h3">Mời ông bà cùng xem</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dangHoatDong.length > 0
              ? `Đã mời ${dangHoatDong.length} người. Ông bà xem ảnh, thả tim tấm mình thích và đặt mua thêm ạ.`
              : "Gửi link riêng để ông bà cùng xem ảnh ạ."}
          </p>
        </div>
        <button
          type="button"
          onClick={moMan}
          className="h-10 shrink-0 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Mời
        </button>
      </div>
      )}

      {mo && (
        // BB-355 — tấm trượt: điện thoại trượt lên từ đáy (cao tối đa 88%), máy tính
        // là tấm bên phải rộng 480px; nền mờ phía sau bấm vào là đóng.
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-stretch lg:justify-end">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={dongMan}
            className="absolute inset-0 bg-[#2e2a27]/35"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tieu-de-moi-ong-ba"
            data-testid="tam-moi-ong-ba"
            className="relative flex max-h-[88svh] w-full flex-col rounded-t-[20px] bg-background shadow-[0_-8px_32px_rgba(46,42,39,0.18)] motion-safe:animate-[tam-truot-len_280ms_ease-out] lg:h-full lg:max-h-none lg:w-[480px] lg:rounded-none lg:motion-safe:animate-[tam-truot-trai_280ms_ease-out]"
          >
          <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[#e5dcd2] lg:hidden" />
          <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4 sm:px-8">
            <div>
              <h2 id="tieu-de-moi-ong-ba" className="kh-h2">Mời ông bà cùng xem</h2>
              {/* BB-362 — "ạ." từng mở đầu dòng 2 ở 1440: gắn "ạ" vào chữ trước bằng giuA. */}
              <p className="mt-0.5 text-pretty text-xs text-muted-foreground">
                {giuA("Ông bà xem ảnh, thả tim tấm mình thích để đặt mua thêm ạ. Danh sách ảnh trong gói vẫn do ba mẹ chọn.")}
              </p>
            </div>
            <button
              type="button"
              onClick={dongMan}
              className="h-9 shrink-0 rounded-full border border-border px-4 text-xs font-medium transition hover:bg-surface-2"
            >
              Đóng
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-4 sm:px-8">
            {loi && (
              <p className="mb-3 rounded-xl bg-heart/10 p-3 text-xs text-heart">{loi}</p>
            )}

            {linkVuaTao && (
              <div className="mb-5 space-y-2.5 rounded-2xl border border-moss/40 bg-moss/5 p-4">
                <p className="text-sm font-medium">
                  Đã tạo link cho &ldquo;{linkVuaTao.nhan}&rdquo;
                </p>
                <p className="break-all rounded-lg bg-surface-2 p-2.5 text-xs text-muted-foreground">
                  {linkVuaTao.diaChi}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saoChep(linkVuaTao.diaChi)}
                    className="h-9 flex-1 rounded-full border border-border text-xs font-medium transition hover:bg-surface-2"
                  >
                    {daSaoChep === linkVuaTao.diaChi ? "Đã sao chép" : "Sao chép link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void chiaSe(linkVuaTao.diaChi)}
                    className="h-9 flex-1 rounded-full bg-primary text-xs font-medium text-primary-foreground transition hover:opacity-90"
                  >
                    Chia sẻ
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Ba mẹ vào lại lúc nào cũng thấy link này trong danh sách bên dưới ạ.
                </p>
              </div>
            )}

            <div className="mb-5 flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="nhan-nguoi-than" className="mb-1 block text-xs text-muted-foreground">
                  Nhãn để ba mẹ nhớ ai giữ link nào
                </label>
                <input
                  id="nhan-nguoi-than"
                  name="nhan"
                  type="text"
                  value={nhan}
                  onChange={(e) => setNhan(e.target.value)}
                  maxLength={40}
                  placeholder="Ví dụ: Bà nội"
                  disabled={dangTao}
                  className="h-10 w-full rounded-full border border-border bg-surface px-4 text-sm outline-none focus:border-foreground"
                />
              </div>
              <button
                type="button"
                disabled={dangTao || nhan.trim().length === 0}
                onClick={() => void taoLink()}
                className="h-10 shrink-0 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                {dangTao ? "Đang tạo…" : "Tạo link"}
              </button>
            </div>

            <h3 className="kh-caption mb-2 font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Đã mời ({(ds ?? []).length})
            </h3>
            {!ds || ds.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ba mẹ chưa mời ai. Tạo link đầu tiên ở trên nhé ạ.</p>
            ) : (
              <ul className="space-y-2">
                {ds.map((d) => {
                  const song = d.trangThai === "active";
                  const diaChi = song && d.diaChiDayDu ? diaChiTuyetDoi(d.diaChiDayDu, d.duongDan ?? d.diaChiDayDu) : null;
                  return (
                    <li
                      key={d.id}
                      data-testid="dong-nguoi-da-moi"
                      className="space-y-2.5 rounded-xl border border-border bg-surface p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.nhan}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {NHAN_TRANG_THAI[d.trangThai] ?? d.trangThai} ·{" "}
                            {formatNgayVN(d.createdAt)}
                          </p>
                        </div>
                        {song && (
                          <button
                            type="button"
                            disabled={dangThuHoi === d.id || dangTaoLai === d.id}
                            onClick={() => void thuHoi(d.id, d.nhan)}
                            className="h-8 shrink-0 rounded-full border border-border px-3 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-40"
                          >
                            {dangThuHoi === d.id ? "Đang thu hồi…" : "Thu hồi"}
                          </button>
                        )}
                      </div>
                      {song && diaChi && (
                        <>
                          <p data-testid="link-nguoi-da-moi" className="break-all rounded-lg bg-surface-2 p-2 text-[11px] text-muted-foreground">
                            {diaChi}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void saoChep(diaChi)}
                              className="h-8 flex-1 rounded-full border border-border text-xs font-medium transition hover:bg-surface-2"
                            >
                              {daSaoChep === diaChi ? "Đã chép" : "Chép link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void chiaSe(diaChi)}
                              className="h-8 flex-1 rounded-full bg-primary text-xs font-medium text-primary-foreground transition hover:opacity-90"
                            >
                              Chia sẻ
                            </button>
                          </div>
                        </>
                      )}
                      {song && !diaChi && (
                        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 p-2">
                          <p className="text-[11px] text-muted-foreground">
                            Link này tạo trước khi Bean lưu được địa chỉ ạ.
                          </p>
                          <button
                            type="button"
                            disabled={dangTaoLai === d.id || dangThuHoi === d.id}
                            onClick={() => void taoLai(d)}
                            className="h-8 shrink-0 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                          >
                            {dangTaoLai === d.id ? "Đang tạo…" : "Tạo lại link"}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          </div>
        </div>
      )}
    </>
  );
}
