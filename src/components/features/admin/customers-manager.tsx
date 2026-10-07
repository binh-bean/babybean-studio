"use client";

/**
 * Màn Khách hàng — BB-061.
 *
 * OWNER: DEV-FE.
 *
 * ---------------------------------------------------------------------------
 * Vì sao tra theo SỐ ĐIỆN THOẠI là việc chính
 * ---------------------------------------------------------------------------
 * CSKH nhận điện thoại, và thứ duy nhất họ cầm trong tay là số gọi đến. Trước
 * màn này, đường tra duy nhất là ô tìm ở danh sách bộ ảnh — nên khách gọi
 * TRƯỚC khi có bộ ảnh thì tra không ra, và nhân viên phải mở Lark.
 *
 * Người ta đọc số cho nhau kiểu "0938 125 568", dán vào có khi thành
 * "(+84) 938125568". Nên ô tìm bỏ hết ký tự không phải số rồi mới so — giống
 * đúng cách cột `phone_normalized` được sinh ra bên cơ sở dữ liệu.
 *
 * ---------------------------------------------------------------------------
 * Hai thứ màn hình phải NÓI RA thay vì để người dùng đoán
 * ---------------------------------------------------------------------------
 *  1. Hồ sơ đến từ Lark thì tên, số và ghi chú sẽ bị lần đồng bộ sau ghi đè.
 *     Không nói ra thì CSKH sửa số sai, hôm sau số cũ quay lại, và họ kết luận
 *     là app hỏng.
 *  2. Cùng một số có thể có hồ sơ ở chi nhánh khác — chống trùng chỉ chặn
 *     trong PHẠM VI một chi nhánh (uq_customers_phone_branch).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input, Card, Spinner, Badge, Avatar, AvatarFallback } from "@/components/ui";
import { GALLERY_STATUS_LABEL } from "@/lib/gallery-status";
import { formatNgayVN, formatSdt, tenGoiBe, formatSo, formatTien } from "@/lib/utils/dinh-dang";
import { mauAvatarStyle } from "@/lib/utils/mau-avatar";
import { vi } from "@/i18n/vi";
import { Phone as PhoneIcon, Copy as CopyIcon } from "lucide-react";
import { hienTieuDeBoAnh } from "@/lib/utils/ma-hoa-don";

const t = vi.admin.khachHang;

interface DongKhach {
  id: string;
  fullName: string;
  phone: string | null;
  branchId: string;
  branchName: string;
  soBoAnh: number;
  boAnhMoiNhat: string | null;
  trungSdtChiNhanhKhac: boolean;
  /** BB-303 — tên bé đầu tiên của khách, cho dòng phụ "mẹ của Bé …". `null` = chưa có bé nào ghi nhận. */
  babyName: string | null;
}

interface Be {
  id: string;
  fullName: string;
  nickname: string | null;
  birthDate: string | null;
  gender: string | null;
  note: string | null;
}

interface BoAnh {
  id: string;
  title: string;
  status: string;
  branchName: string;
  createdAt: string;
  submittedAt: string | null;
  photoCount: number;
  includedQuota: number | null;
  contractCodes: string[];
}

interface ChiTiet {
  khach: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    zalo: string | null;
    address: string | null;
    note: string | null;
    branchName: string;
    createdAt: string;
    tuLark: boolean;
    truongBiGhiDe: string[];
    /** BB-303 — tổng tiền mua thêm mọi bộ ảnh của khách (đã chốt). */
    tongMuaThem: number;
  };
  be: Be[];
  boAnh: BoAnh[];
  trungSdt: { id: string | null; branchName: string; fullName: string | null; phone: string | null }[];
}

export function CustomersManager({
  coQuyenSua,
  coQuyenXoa,
}: {
  coQuyenSua: boolean;
  coQuyenXoa: boolean;
}) {
  const [tuKhoa, setTuKhoa] = useState("");
  const [items, setItems] = useState<DongKhach[]>([]);
  const [tong, setTong] = useState(0);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangMo, setDangMo] = useState<string | null>(null);

  const [dangTaiThem, setDangTaiThem] = useState(false);
  const [dangDongBo, setDangDongBo] = useState(false);
  const [baoDongBo, setBaoDongBo] = useState<{ ok: boolean; cau: string } | null>(null);

  const tai = useCallback(async (q: string) => {
    setDangTai(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiTai);
      setItems(json.data.items);
      setTong(json.data.total);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiTai);
    } finally {
      setDangTai(false);
    }
  }, []);

  /** BB-337 mục 3 — tải trang kế tiếp, nối vào cuối danh sách đang hiện. */
  async function taiThem() {
    setDangTaiThem(true);
    try {
      const res = await fetch(
        `/api/admin/customers?q=${encodeURIComponent(tuKhoa.trim())}&offset=${items.length}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiTai);
      const daCo = new Set(items.map((k) => k.id));
      setItems([...items, ...(json.data.items as DongKhach[]).filter((k) => !daCo.has(k.id))]);
      setTong(json.data.total);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiTai);
    } finally {
      setDangTaiThem(false);
    }
  }

  /** BB-337 mục 3 — chạy ngay lượt đồng bộ Lark của cron sáng (chỉ đọc Lark). */
  async function dongBoNgay() {
    setDangDongBo(true);
    setBaoDongBo(null);
    try {
      const res = await fetch("/api/admin/customers/dong-bo", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setBaoDongBo({ ok: false, cau: json?.error?.message ?? "Không đồng bộ được, thử lại giúp." });
        return;
      }
      const d = json.data;
      setBaoDongBo(
        d.dangChay
          ? { ok: false, cau: t.dongBoDangChay }
          : { ok: true, cau: t.dongBoXong.replace("{doc}", formatSo(d.docDuoc)).replace("{moi}", formatSo(d.taoMoi)) },
      );
      await tai(tuKhoa.trim());
    } catch {
      setBaoDongBo({ ok: false, cau: "Mất kết nối, thử lại giúp." });
    } finally {
      setDangDongBo(false);
    }
  }

  // Gõ tới đâu tìm tới đó, nhưng chờ người ta gõ xong một nhịp rồi mới hỏi
  // máy chủ — gõ mười chữ số mà bắn mười câu truy vấn là tự làm chậm mình.
  useEffect(() => {
    const h = setTimeout(() => void tai(tuKhoa.trim()), 300);
    return () => clearTimeout(h);
  }, [tuKhoa, tai]);

  /**
   * Trên điện thoại, MỞ HỒ SƠ THÌ THAY CHỖ danh sách.
   *
   * Đo ngày 22/09/2026 trên màn 375px: hồ sơ vẽ ngay dưới danh sách, mà danh
   * sách dài tới 50 dòng — chạm vào một khách xong thì màn hình không nhúc
   * nhích, hồ sơ nằm cách đó mấy nghìn điểm ảnh bên dưới. Người dùng kết luận
   * là bấm không ăn.
   *
   * Từ `lg` trở lên thì giữ cả hai: bảng ở trên, hồ sơ ở dưới, liếc mắt là
   * thấy cả hai cùng lúc.
   */
  const anDanhSach = dangMo ? "hidden lg:block" : "";

  return (
    // BB-303 (bản vẽ BB-301, khach-hang.png, admin duyệt 28/09/2026): "bảng
    // co giãn + ngăn chi tiết 360px BÊN PHẢI" — trước đây hồ sơ nằm NGAY
    // DƯỚI bảng (full-width), đúng cho điện thoại nhưng không khớp bản vẽ
    // máy tính. Từ `lg` trở lên tách hai cột bằng CSS Grid; dưới `lg` giữ
    // đúng hành vi cũ (xếp dọc, hồ sơ thay chỗ danh sách — xem `anDanhSach`).
    // BB-320 (Q-S2): chỉ chia cột 360px khi có hồ sơ đang mở — chưa mở thì bảng
    // trải hết bề rộng nội dung, không chừa một cột trống bên phải.
    <div className={dangMo ? "min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6" : "min-w-0"}>
      <div className="min-w-0 space-y-5">
        {/* Mô tả trang nay nằm trong PageHeader (BB-320) — ở đây chỉ còn ô tìm và câu gợi ý. */}
      <div className={`flex flex-wrap items-center gap-2 ${anDanhSach}`}>
        <div className="min-w-0 flex-1 sm:max-w-md">
          <label htmlFor="tim-khach" className="sr-only">
            {t.oTim}
          </label>
          <Input
            id="tim-khach"
            value={tuKhoa}
            placeholder={t.oTim}
            inputMode="search"
            onChange={(e) => setTuKhoa(e.target.value)}
          />
        </div>
        {tuKhoa && (
          <Button variant="ghost" size="sm" onClick={() => setTuKhoa("")}>
            {t.xoaTim}
          </Button>
        )}
        {coQuyenSua && (
          <Button
            variant="outline"
            size="sm"
            data-testid="nut-dong-bo-khach"
            disabled={dangDongBo}
            onClick={() => void dongBoNgay()}
            title={t.dongBoGoiY}
          >
            {dangDongBo ? t.dangDongBo : t.dongBoNgay}
          </Button>
        )}
      </div>
      {baoDongBo && (
        <p
          role="status"
          data-testid="bao-dong-bo-khach"
          className={`text-xs ${baoDongBo.ok ? "text-[var(--bb-fg-muted)]" : "text-[var(--bb-danger)]"} ${anDanhSach}`}
        >
          {baoDongBo.cau}
        </p>
      )}
      <p className={`text-xs text-[var(--bb-fg-muted)] ${anDanhSach}`}>{t.goiY}</p>

      {loi && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--bb-danger)] bg-[var(--bb-danger-soft)] px-4 py-3 text-sm"
        >
          {loi}
        </div>
      )}

      <div className={`space-y-3 ${anDanhSach}`}>
      {dangTai ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">{tuKhoa ? t.trong : t.trongBanDau}</p>
      ) : (
        <>
          {/* Dưới `lg` mỗi khách là một thẻ — bảng năm cột không vừa 375px. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {items.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => setDangMo(k.id)}
                  className="w-full rounded-lg border border-[var(--bb-border)] p-3 text-left text-sm hover:bg-[var(--bb-surface-2)]"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      {/* BB-308 — `data-testid` chỉ để phép thử tìm đúng chữ
                          cái avatar, tách khỏi tên/nhãn khác trong cùng ô. */}
                      <AvatarFallback data-testid="chu-cai-dau" style={mauAvatarStyle(k.id || k.fullName)}>
                        {chuCaiDau(k.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      {/* BB-294 (#17): tên KHÔNG còn chia hàng ngang với chi
                          nhánh (`justify-between` ép tên vào cột ~70px khi
                          chi nhánh dài — báo cáo độc lập #17). Tên chiếm
                          trọn bề rộng thẻ, tối đa 2 dòng (`line-clamp-2`);
                          chi nhánh chuyển xuống HÀNG DƯỚI, cùng hàng với
                          SĐT/số bộ/ngày. */}
                      <div className="line-clamp-2 break-words font-medium">{k.fullName}</div>
                      {/* BB-303 (khach-hang.png) — nối khách với bé, khi có dữ liệu thật.
                          BB-308 (vòng 4, mục #8): `tenGoiBe` tránh "Bé Bé Na". */}
                      {k.babyName && (
                        <p className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">mẹ của {tenGoiBe(k.babyName)}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--bb-fg-muted)]">
                        {/* BB-290 (#40): SĐT sans 14px tabular-nums, không
                            còn font-mono — chữ số monospace đọc rời rạc hơn
                            là cần trên một thẻ danh sách.
                            BB-303: nhóm 4-3-3 ("0901 000 001") thay vì liền số. */}
                        <span className="select-all text-sm tabular-nums">{formatSdt(k.phone) || t.chuaCoSdt}</span>
                        <span>
                          {formatSo(k.soBoAnh)} {t.cot.soBo.toLowerCase()}
                        </span>
                        {k.branchName && <span>{k.branchName}</span>}
                        {k.boAnhMoiNhat && <span>{ngay(k.boAnhMoiNhat)}</span>}
                      </div>
                      {k.trungSdtChiNhanhKhac && (
                        <Badge variant="warning" className="mt-2">
                          {t.trungChiNhanhKhac}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--bb-border)] text-left">
                  <th className="py-2 pr-3 font-medium">{t.cot.ten}</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">{t.cot.sdt}</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">{t.cot.chiNhanh}</th>
                  <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">{t.cot.soBo}</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">{t.cot.ganNhat}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((k) => (
                  <tr
                    key={k.id}
                    className={
                      // BB-303 (BB-301 XONG.md mục 1, admin duyệt 28/09/2026):
                      // hàng đang mở dùng ĐÚNG kiểu "nền be + vạch rêu" của
                      // mục đang chọn trong thanh bên, thay nền bạc hà cũ —
                      // một luật nhất quán cho "đang chọn" trong toàn quản
                      // trị. Vạch rêu (`bb-muc-on`) đặt trên Ô ĐẦU (`<td>`),
                      // không trên `<tr>` — định vị tuyệt đối trên hàng bảng
                      // không đáng tin cậy bằng trên một ô.
                      dangMo === k.id
                        ? "cursor-pointer border-b border-[var(--bb-border)] bg-[var(--bb-sidebar-active-bg)]"
                        : "cursor-pointer border-b border-[var(--bb-border)] hover:bg-[var(--bb-surface-2)]"
                    }
                    onClick={() => setDangMo(k.id)}
                  >
                    <td className={dangMo === k.id ? "bb-muc-on py-2 pr-3" : "py-2 pr-3"}>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback data-testid="chu-cai-dau" style={mauAvatarStyle(k.id || k.fullName)}>
                            {chuCaiDau(k.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <button type="button" className="text-left font-medium hover:underline">
                            {k.fullName}
                          </button>
                          {/* BB-303 (khach-hang.png) — nối khách với bé, khi có dữ liệu thật.
                              BB-308 (vòng 4, mục #8): `tenGoiBe` tránh "Bé Bé Na". */}
                          {k.babyName && (
                            <p className="text-xs text-[var(--bb-fg-muted)]">mẹ của {tenGoiBe(k.babyName)}</p>
                          )}
                        </div>
                        {k.trungSdtChiNhanhKhac && (
                          <Badge variant="warning" className="align-middle">
                            {t.trungChiNhanhKhac}
                          </Badge>
                        )}
                      </div>
                    </td>
                    {/* select-all để bôi một phát rồi dán sang Zalo hoặc Lark.
                        BB-290 (#40): sans 14px tabular-nums thay cho font-mono
                        text-xs — nhỏ hơn hẳn tên (15px) và khó đọc hơn cần.
                        BB-303: nhóm 4-3-3. */}
                    <td className="select-all whitespace-nowrap py-2 pr-3 text-sm tabular-nums">
                      {formatSdt(k.phone) || t.chuaCoSdt}
                    </td>
                    <td className="py-2 pr-3">{k.branchName}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatSo(k.soBoAnh)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{k.boAnhMoiNhat ? ngay(k.boAnhMoiNhat) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Danh sách cắt ở 50 dòng. Nói ra, chứ im lặng thì người ta tưởng
              chi nhánh chỉ có đúng ngần này khách. */}
          {/* BB-337 mục 3: báo rõ đang hiện bao nhiêu / tổng trong DB, và cho tải tiếp tới hết. */}
          <div className="flex flex-wrap items-center gap-3" data-testid="chan-danh-sach-khach">
            <p className="text-xs text-[var(--bb-fg-muted)]" data-testid="dem-khach">
              {tong > items.length
                ? t.conNua.replace("{n}", formatSo(items.length)).replace("{tong}", formatSo(tong))
                : t.dangHienDu.replace("{tong}", formatSo(tong))}
            </p>
            {tong > items.length && (
              <Button
                variant="outline"
                size="sm"
                data-testid="nut-tai-them-khach"
                disabled={dangTaiThem}
                onClick={() => void taiThem()}
              >
                {dangTaiThem ? t.dangTaiThem : t.taiThem}
              </Button>
            )}
          </div>
        </>
      )}
      </div>
      </div>

      {/* BB-303 — cột phải 360px, dính lại khi cuộn (bảng có thể dài hơn
          360px chiều cao của hồ sơ). Dưới `lg` không có `lg:col-start-2` nào
          để đặt — phần tử xếp NGAY DƯỚI cột trái trong luồng tài liệu bình
          thường, đúng hành vi cũ trên điện thoại. */}
      {dangMo && (
        <div className="lg:sticky lg:top-4">
          <HoSoKhach
            id={dangMo}
            coQuyenSua={coQuyenSua}
            coQuyenXoa={coQuyenXoa}
            onDong={() => setDangMo(null)}
            onDaDoi={() => void tai(tuKhoa.trim())}
          />
        </div>
      )}
    </div>
  );
}

function HoSoKhach({
  id,
  coQuyenSua,
  coQuyenXoa,
  onDong,
  onDaDoi,
}: {
  id: string;
  coQuyenSua: boolean;
  coQuyenXoa: boolean;
  onDong: () => void;
  onDaDoi: () => void;
}) {
  const [ct, setCt] = useState<ChiTiet | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [xong, setXong] = useState<string | null>(null);
  const [dangSua, setDangSua] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [dangLuu, setDangLuu] = useState(false);
  const [beMoi, setBeMoi] = useState<{ fullName: string; birthDate: string } | null>(null);

  const tai = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiTai);
      setCt(json.data);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiTai);
    } finally {
      setDangTai(false);
    }
  }, [id]);

  useEffect(() => {
    void tai();
  }, [tai]);

  function moSua() {
    if (!ct) return;
    setForm({
      fullName: ct.khach.fullName ?? "",
      phone: ct.khach.phone ?? "",
      email: ct.khach.email ?? "",
      zalo: ct.khach.zalo ?? "",
      address: ct.khach.address ?? "",
      note: ct.khach.note ?? "",
    });
    setXong(null);
    setDangSua(true);
  }

  async function luu() {
    setDangLuu(true);
    setLoi(null);
    try {
      // Ô để trống nghĩa là xoá giá trị, nên gửi null chứ không gửi chuỗi rỗng
      // — cột email là citext và chuỗi rỗng không phải email hợp lệ.
      const rong = (k: string) => (form[k] ?? "").trim() === "" ? null : form[k];
      const than = {
        fullName: form.fullName ?? "",
        phone: rong("phone"),
        email: rong("email"),
        zalo: rong("zalo"),
        address: rong("address"),
        note: rong("note"),
      };
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(than),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiLuu);
      setXong(t.daLuu);
      setDangSua(false);
      await tai();
      onDaDoi();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiLuu);
    } finally {
      setDangLuu(false);
    }
  }

  async function themBe() {
    if (!beMoi?.fullName.trim()) return;
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}/babies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: beMoi.fullName,
          birthDate: beMoi.birthDate.trim() === "" ? null : beMoi.birthDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiLuu);
      setBeMoi(null);
      await tai();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiLuu);
    }
  }

  async function xoaBe(b: Be) {
    if (!window.confirm(t.hoiXoaBe.replace("{ten}", b.fullName))) return;
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}/babies/${b.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiLuu);
      await tai();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiLuu);
    }
  }

  return (
    <Card className="min-w-0 space-y-5 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{t.hoSo}</h2>
        <div className="flex shrink-0 items-center gap-1">
          {/* BB-337 mục 3 — trang chi tiết khách: lịch sử chụp, lịch sử mua, tổng giá trị, lượt ghé. */}
          <Link
            href={`/admin/customers/${encodeURIComponent(id)}`}
            data-testid="link-trang-khach"
            className="inline-flex h-9 items-center rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] px-3 text-xs font-medium hover:bg-[var(--bb-surface-2)]"
          >
            {t.xemTrang}
          </Link>
          <Button variant="ghost" size="sm" onClick={onDong}>
            {t.dong}
          </Button>
        </div>
      </div>

      {loi && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--bb-danger)] bg-[var(--bb-danger-soft)] px-4 py-3 text-sm"
        >
          {loi}
        </div>
      )}
      {xong && (
        <div
          role="status"
          className="rounded-lg border border-[var(--bb-success)] bg-[var(--bb-success-soft)] px-4 py-3 text-sm"
        >
          {xong}
        </div>
      )}

      {dangTai ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !ct ? null : (
        <>
          {ct.khach.truongBiGhiDe.length > 0 && (
            <p className="rounded-lg border border-[var(--bb-danger)] bg-[var(--bb-danger)]/10 px-3 py-2 text-sm">
              {t.canhBaoLark}
            </p>
          )}

          {dangSua ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["fullName", "phone", "email", "zalo", "address", "note"] as const).map((k) => (
                <div key={k} className={k === "note" ? "sm:col-span-2" : undefined}>
                  <label htmlFor={`kh-${k}`} className="mb-1 block text-sm font-medium">
                    {t.nhan[k]}
                  </label>
                  <Input
                    id={`kh-${k}`}
                    value={form[k] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="flex gap-2 sm:col-span-2">
                <Button onClick={() => void luu()} disabled={dangLuu}>
                  {dangLuu ? t.dangLuu : t.luu}
                </Button>
                <Button variant="ghost" onClick={() => setDangSua(false)}>
                  {t.huy}
                </Button>
              </div>
            </div>
          ) : (
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
              <Dong nhan={t.nhan.fullName} giaTri={ct.khach.fullName} />
              <Dong nhan={t.nhan.phone} giaTri={formatSdt(ct.khach.phone) || t.chuaCoSdt} chon />
              <Dong nhan={t.nhan.email} giaTri={ct.khach.email} />
              <Dong nhan={t.nhan.zalo} giaTri={ct.khach.zalo ? formatSdt(ct.khach.zalo) : null} />
              <Dong nhan={t.nhan.address} giaTri={ct.khach.address} />
              <Dong nhan={t.nhan.note} giaTri={ct.khach.note} />
              <Dong nhan={t.cot.chiNhanh} giaTri={ct.khach.branchName} />
            </dl>
          )}

          {/* BB-303 (khach-hang.png) — "Gọi" mở app điện thoại; "Zalo" CHỈ
              hiện số để nhân viên tự chép rồi dán vào Zalo (không tự gửi gì —
              chưa có đường gửi Zalo trong app). Chỉ hiện khi có dữ liệu thật. */}
          {!dangSua && (ct.khach.phone || ct.khach.zalo) && (
            <div className="flex flex-wrap gap-2">
              {ct.khach.phone && (
                <Button asChild variant="outline" size="sm">
                  <a href={`tel:${ct.khach.phone}`}>
                    <PhoneIcon className="mr-1.5 h-4 w-4" /> Gọi
                  </a>
                </Button>
              )}
              {(ct.khach.zalo || ct.khach.phone) && (
                <NutChepZalo so={(ct.khach.zalo || ct.khach.phone) as string} />
              )}
            </div>
          )}

          {/* BB-303 — tổng mua thêm mọi bộ ảnh (đã chốt) của khách này. */}
          {!dangSua && ct.khach.tongMuaThem > 0 && (
            <p className="text-sm">
              <span className="text-[var(--bb-fg-muted)]">Tổng mua thêm: </span>
              <span className="bb-so font-medium">
                {formatTien(ct.khach.tongMuaThem)}
              </span>
            </p>
          )}

          {coQuyenSua && !dangSua && (
            <Button variant="outline" size="sm" onClick={moSua}>
              {t.sua}
            </Button>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">{t.dsBe}</h3>
            {ct.be.length === 0 ? (
              <p className="text-sm text-[var(--bb-fg-muted)]">{t.chuaCoBe}</p>
            ) : (
              <ul className="divide-y divide-[var(--bb-border)]">
                {ct.be.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 break-words font-medium">{b.fullName}</span>
                    {b.nickname && (
                      <span className="text-xs text-[var(--bb-fg-muted)]">({b.nickname})</span>
                    )}
                    <span className="text-xs text-[var(--bb-fg-muted)]">
                      {b.birthDate ? ngay(b.birthDate) : t.chuaCoNgaySinh}
                    </span>
                    {coQuyenXoa && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => void xoaBe(b)}
                      >
                        {t.xoaBe}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {coQuyenSua &&
              (beMoi ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="be-ten" className="mb-1 block text-xs font-medium">
                      {t.tenBe}
                    </label>
                    <Input
                      id="be-ten"
                      value={beMoi.fullName}
                      onChange={(e) => setBeMoi({ ...beMoi, fullName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="be-ngay" className="mb-1 block text-xs font-medium">
                      {t.ngaySinh}
                    </label>
                    <Input
                      id="be-ngay"
                      type="date"
                      value={beMoi.birthDate}
                      onChange={(e) => setBeMoi({ ...beMoi, birthDate: e.target.value })}
                    />
                  </div>
                  <Button size="sm" onClick={() => void themBe()}>
                    {t.luu}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setBeMoi(null)}>
                    {t.huy}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setBeMoi({ fullName: "", birthDate: "" })}
                >
                  {t.themBe}
                </Button>
              ))}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">{t.lichSu}</h3>
            {ct.boAnh.length === 0 ? (
              <p className="text-sm text-[var(--bb-fg-muted)]">{t.chuaCoBo}</p>
            ) : (
              <ul className="divide-y divide-[var(--bb-border)]">
                {ct.boAnh.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <Link
                      href={`/admin/galleries/${g.id}`}
                      className="min-w-0 break-words font-medium text-[var(--bb-primary)] hover:underline"
                    >
                      {hienTieuDeBoAnh(g.title)}
                    </Link>
                    <span className="text-xs text-[var(--bb-fg-muted)]">
                      {GALLERY_STATUS_LABEL[g.status as keyof typeof GALLERY_STATUS_LABEL] ??
                        g.status}
                    </span>
                    <span className="text-xs text-[var(--bb-fg-muted)]">{ngay(g.createdAt)}</span>
                    <span className="ml-auto shrink-0 text-xs text-[var(--bb-fg-muted)]">
                      {formatSo(g.photoCount)} ảnh
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ct.trungSdt.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">{t.trungSdt}</h3>
              <p className="mb-2 text-xs text-[var(--bb-fg-muted)]">{t.trungSdtGiaiThich}</p>
              <ul className="space-y-1 text-sm">
                {ct.trungSdt.map((x, i) => (
                  <li key={x.id ?? `${x.branchName}-${i}`} className="flex flex-wrap gap-2">
                    <span>{x.branchName}</span>
                    {/* Hồ sơ ở chi nhánh mình không có quyền thì chỉ nói là CÓ,
                        không hiện tên và số của khách bên đó. */}
                    <span className="text-[var(--bb-fg-muted)]">
                      {x.fullName ?? t.khongXemDuoc}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Card>
  );
}

function Dong({ nhan, giaTri, chon }: { nhan: string; giaTri: string | null; chon?: boolean }) {
  return (
    <>
      <dt className="text-[var(--bb-fg-muted)]">{nhan}</dt>
      {/* BB-303 (luật phông 28/09/2026): tabular-nums (Be Vietnam Pro) thay font-mono — dùng cho SĐT (`chon`). */}
      <dd className={chon ? "select-all break-words tabular-nums text-xs" : "break-words"}>
        {giaTri ?? "—"}
      </dd>
    </>
  );
}

/**
 * BB-303 (khach-hang.png) — "Zalo chỉ hiện số để chép": KHÔNG có đường gửi
 * Zalo thật trong app, nên nút này chỉ chép số vào clipboard để nhân viên tự
 * dán vào Zalo, không mở hay gửi gì thay họ.
 */
function NutChepZalo({ so }: { so: string }) {
  const [daChep, setDaChep] = useState(false);
  async function chep() {
    try {
      await navigator.clipboard.writeText(so);
      setDaChep(true);
      window.setTimeout(() => setDaChep(false), 2000);
    } catch {
      // Clipboard API bị chặn — không có gì thêm để làm ở một nút nhỏ.
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={() => void chep()}>
      <CopyIcon className="mr-1.5 h-4 w-4" /> {daChep ? "Đã chép số Zalo" : `Chép số Zalo (${formatSdt(so)})`}
    </Button>
  );
}

/**
 * Chữ cái đầu để làm avatar — bản vẽ quan-tri-khach-hang.webp dùng chữ cái
 * đầu tên thay vì ảnh, đúng luật §6: không có ảnh chân dung khách trong hệ
 * thống này.
 *
 * BB-308 (bản vẽ BB-301 khach-hang.html, admin duyệt 28/09/2026) — đổi từ
 * HAI chữ cái (đầu họ + đầu tên) sang MỘT chữ cái của TÊN GỌI, tức chữ cuối
 * của họ tên đầy đủ: "Nguyễn Thị Mai" → "M" (không phải "NM"). Người Việt
 * gọi nhau bằng tên, không phải họ — bản vẽ khách hàng liệt kê đúng một chữ
 * cho mỗi khách ("M", "H", "A", "T"…), khớp cách CSKH thật sự gọi khách.
 * Xuất hàm ra để `tests/unit/bb-308-chu-cai-dau.test.ts` thử trực tiếp,
 * cùng cách `tenThanThienMuaThem` (gallery-detail.tsx) đã làm cho BB-296.
 */
export function chuCaiDau(hoTen: string): string {
  const tu = hoTen.trim().split(/\s+/).filter(Boolean);
  if (tu.length === 0) return "?";
  return tu[tu.length - 1]!.charAt(0).toUpperCase();
}


/**
 * BB-290 (#40): `toLocaleDateString("vi-VN")` in "27/9/2026" (KHÔNG đệm số
 * 0) trong khi quản trị và mọi nơi khác dùng "27/09/2026" — dùng chung
 * `formatNgayVN` (BB-287) thay vì tự gọi `toLocaleDateString` ở đây.
 */
function ngay(value: string): string {
  const ket = formatNgayVN(value);
  return ket || "—";
}
