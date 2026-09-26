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
 * Mã link CHỈ hiện MỘT LẦN — y hệt link CSKH tạo (`share-link/route.ts`):
 * component giữ nó trong state, KHÔNG tự tải lại được sau khi rời trang.
 */

import React from "react";

interface NguoiDaMoi {
  id: string;
  nhan: string;
  trangThai: string;
  createdAt: string;
}

const NHAN_TRANG_THAI: Record<string, string> = {
  active: "Đang xem",
  revoked: "Đã thu hồi",
  expired: "Hết hạn",
};

export function MoiNguoiThan() {
  const [ds, setDs] = React.useState<NguoiDaMoi[] | null>(null);
  const [mo, setMo] = React.useState(false);
  const [nhan, setNhan] = React.useState("");
  const [dangTao, setDangTao] = React.useState(false);
  const [dangThuHoi, setDangThuHoi] = React.useState<string | null>(null);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [linkVuaTao, setLinkVuaTao] = React.useState<{ nhan: string; diaChi: string } | null>(null);
  const [daSaoChep, setDaSaoChep] = React.useState(false);

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

  async function taoLink() {
    const nhanSach = nhan.trim();
    if (!nhanSach) {
      setLoi("Ba mẹ đặt cho em một nhãn, ví dụ “Bà nội” nhé");
      return;
    }
    setDangTao(true);
    setLoi(null);
    try {
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
        setLoi(json?.error?.message ?? "Chưa tạo được link, ba mẹ thử lại giúp em nhé");
        return;
      }
      setLinkVuaTao({ nhan: json.data.nhan, diaChi: json.data.diaChiDayDu });
      setNhan("");
      setDaSaoChep(false);
      await taiLai();
    } catch {
      setLoi("Không kết nối được, ba mẹ thử lại giúp em nhé");
    } finally {
      setDangTao(false);
    }
  }

  async function saoChepLink() {
    if (!linkVuaTao) return;
    try {
      await navigator.clipboard.writeText(linkVuaTao.diaChi);
      setDaSaoChep(true);
    } catch {
      setLoi("Không sao chép được, ba mẹ bôi đen và chép tay giúp em nhé");
    }
  }

  async function chiaSeLink() {
    if (!linkVuaTao) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Xem ảnh cùng gia đình", url: linkVuaTao.diaChi });
      } catch {
        // Người dùng bấm huỷ hộp chia sẻ — không phải lỗi, không báo gì thêm.
      }
    } else {
      await saoChepLink();
    }
  }

  async function thuHoi(id: string, nhanNguoi: string) {
    if (!window.confirm(`Thu hồi link đã gửi cho "${nhanNguoi}"? Người đó sẽ không mở được nữa.`)) {
      return;
    }
    setDangThuHoi(id);
    setLoi(null);
    try {
      const res = await fetch(`/api/g/moi-nguoi-than?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setLoi(json?.error?.message ?? "Chưa thu hồi được, ba mẹ thử lại giúp em nhé");
        return;
      }
      await taiLai();
    } catch {
      setLoi("Không kết nối được, ba mẹ thử lại giúp em nhé");
    } finally {
      setDangThuHoi(null);
    }
  }

  const dangHoatDong = (ds ?? []).filter((d) => d.trangThai === "active");

  return (
    <>
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
          <p className="font-display text-lg font-light leading-tight">Mời ông bà cùng xem</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dangHoatDong.length > 0
              ? `Đã mời ${dangHoatDong.length} người — ông bà chỉ xem và mua thêm, không chọn ảnh.`
              : "Gửi link riêng cho ông bà xem ảnh, không cần chọn hộ ba mẹ."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMo(true);
            setLoi(null);
            setLinkVuaTao(null);
          }}
          className="h-10 shrink-0 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Mời
        </button>
      </div>

      {mo && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-8">
            <div>
              <h2 className="font-display text-2xl font-light leading-tight">Mời ông bà cùng xem</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Ông bà xem được ảnh và gửi yêu cầu mua thêm — không chọn ảnh, không thấy tiền của ba mẹ.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMo(false)}
              className="h-9 shrink-0 rounded-full border border-border px-4 text-xs font-medium transition hover:bg-surface-2"
            >
              Đóng
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-8">
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
                    onClick={() => void saoChepLink()}
                    className="h-9 flex-1 rounded-full border border-border text-xs font-medium transition hover:bg-surface-2"
                  >
                    {daSaoChep ? "Đã sao chép" : "Sao chép link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void chiaSeLink()}
                    className="h-9 flex-1 rounded-full bg-primary text-xs font-medium text-primary-foreground transition hover:opacity-90"
                  >
                    Chia sẻ
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Chép giúp em ngay — link chỉ hiện được đúng một lần này thôi ạ.
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

            <h3 className="mb-2 text-sm font-medium">Đã mời ({(ds ?? []).length})</h3>
            {!ds || ds.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa mời ai. Tạo link đầu tiên ở trên nhé.</p>
            ) : (
              <ul className="space-y-2">
                {ds.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.nhan}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {NHAN_TRANG_THAI[d.trangThai] ?? d.trangThai} ·{" "}
                        {new Date(d.createdAt).toLocaleDateString("vi-VN")}
                      </p>
                    </div>
                    {d.trangThai === "active" && (
                      <button
                        type="button"
                        disabled={dangThuHoi === d.id}
                        onClick={() => void thuHoi(d.id, d.nhan)}
                        className="h-8 shrink-0 rounded-full border border-border px-3 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-40"
                      >
                        {dangThuHoi === d.id ? "Đang thu hồi…" : "Thu hồi"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
