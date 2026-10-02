"use client";

/**
 * BB-356 — khối "Dung lượng & dọn dữ liệu vận hành" ở màn Cài đặt (chỉ Admin).
 *
 * 1. Thanh dung lượng DB so với 500 MB của gói Supabase Free + ước tính còn mấy
 *    tháng thì đầy (GET /api/admin/van-hanh/don-rac).
 * 2. Nút "Xem trước" → POST { thuTruoc: true }: bảng từng loại sẽ xoá bao nhiêu.
 * 3. Sau khi đã xem trước mới hiện "Dọn dữ liệu vận hành"; bấm phải xác nhận
 *    lần hai → POST { thuTruoc: false, xacNhan: "DON" }.
 *
 * Tự động thì cron 01:00 đêm đã dọn; nút này cho lúc Admin muốn xem/dọn ngay.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { CARD_TITLE_CLASS } from "./page-header";

interface DungLuong {
  dbByte: number;
  hanMucDbByte: number;
  storageByte: number;
  hanMucStorageByte: number;
  tangMoiThangByte: number | null;
  nguonUocTinh: "moc_do" | "dong_moi_7_ngay" | "khong_du";
  thangConLai: number | null;
}
interface ChinhSach {
  loai: string;
  bang: string;
  giuNgay: number;
  moTa: string;
}
interface KetQuaLoai {
  loai: string;
  xoa: number;
  conLai: number;
  uocTinhByte: number;
  loi?: string;
  boQua?: string;
}
interface KetQuaDonRac {
  thuTruoc: boolean;
  ketQua: KetQuaLoai[];
  tongXoa: number;
  tongUocTinhByte: number;
  hetGio: boolean;
}

const MB = 1024 * 1024;
const mb = (b: number) => `${(b / MB).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;
const so = (n: number) => n.toLocaleString("vi-VN");

function ThanhDungLuong({ ten, dung, hanMuc }: { ten: string; dung: number; hanMuc: number }) {
  const phanTram = Math.min(100, Math.round((dung / hanMuc) * 100));
  const mau = phanTram >= 80 ? "bg-[var(--bb-danger)]" : phanTram >= 60 ? "bg-[var(--bb-warning)]" : "bg-[var(--bb-primary)]";
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{ten}</span>
        <span className="tabular-nums text-[var(--bb-fg-muted)]">
          {mb(dung)} / {mb(hanMuc)} · {phanTram}%
        </span>
      </div>
      <div
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--bb-border)]"
        role="progressbar"
        aria-label={ten}
        aria-valuenow={phanTram}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full ${mau}`} style={{ width: `${phanTram}%` }} />
      </div>
    </div>
  );
}

export function DonDuLieuVanHanh() {
  const [dungLuong, setDungLuong] = React.useState<DungLuong | null>(null);
  const [chinhSach, setChinhSach] = React.useState<ChinhSach[]>([]);
  const [loiTai, setLoiTai] = React.useState<string | null>(null);
  const [dang, setDang] = React.useState<"" | "xem" | "don">("");
  const [xemTruoc, setXemTruoc] = React.useState<KetQuaDonRac | null>(null);
  const [daDon, setDaDon] = React.useState<KetQuaDonRac | null>(null);
  const [hoiXacNhan, setHoiXacNhan] = React.useState(false);
  const [cau, setCau] = React.useState<{ ok: boolean; text: string } | null>(null);

  const taiDungLuong = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/van-hanh/don-rac");
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoiTai(json?.error?.message ?? "Chưa đọc được dung lượng");
        return;
      }
      setDungLuong(json.data.dungLuong);
      setChinhSach(json.data.chinhSach);
      setLoiTai(null);
    } catch {
      setLoiTai("Mất kết nối, tải lại trang giúp");
    }
  }, []);

  React.useEffect(() => {
    void taiDungLuong();
  }, [taiDungLuong]);

  async function chay(thuTruoc: boolean) {
    setDang(thuTruoc ? "xem" : "don");
    setCau(null);
    try {
      const res = await fetch("/api/admin/van-hanh/don-rac", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(thuTruoc ? { thuTruoc: true } : { thuTruoc: false, xacNhan: "DON" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setCau({ ok: false, text: json?.error?.message ?? "Chưa chạy được, thử lại giúp" });
        return;
      }
      const kq = json.data as KetQuaDonRac;
      if (thuTruoc) {
        setXemTruoc(kq);
        setDaDon(null);
      } else {
        setDaDon(kq);
        setXemTruoc(null);
        setCau({ ok: true, text: `Đã dọn ${so(kq.tongXoa)} dòng (~${mb(kq.tongUocTinhByte)} được tái dùng).` });
        void taiDungLuong();
      }
    } catch {
      setCau({ ok: false, text: "Mất kết nối, thử lại giúp" });
    } finally {
      setDang("");
      setHoiXacNhan(false);
    }
  }

  const bang = xemTruoc ?? daDon;
  const moTa = new Map(chinhSach.map((c) => [c.loai, c]));

  return (
    <section data-testid="don-du-lieu-van-hanh" className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] p-5">
      <h2 className={CARD_TITLE_CLASS}>Dung lượng & dọn dữ liệu vận hành</h2>
      <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
        Gói miễn phí cho 500 MB cơ sở dữ liệu và 1 GB ảnh đệm. Mỗi đêm 01:00 app tự dọn dữ liệu vận hành cũ (nhật ký
        cũ, tin đã gửi, khoá chống trùng…), và thu gọn danh sách ảnh của bộ đã lưu trữ/hết hạn quá 6 tháng (giữ bìa và
        ảnh khách đã chọn; ảnh gốc vẫn trên Drive, bấm Đồng bộ lại ở bộ ảnh là đủ). Không bao giờ đụng lượt chọn, tiền,
        khách, sản phẩm, nhân sự.
      </p>

      <div className="mt-4 space-y-3" data-testid="dung-luong-db">
        {loiTai && <p className="text-sm text-[var(--bb-danger)]">{loiTai}</p>}
        {!dungLuong && !loiTai && <p className="text-sm text-[var(--bb-fg-muted)]">Đang đọc dung lượng…</p>}
        {dungLuong && (
          <>
            <ThanhDungLuong ten="Cơ sở dữ liệu" dung={dungLuong.dbByte} hanMuc={dungLuong.hanMucDbByte} />
            <ThanhDungLuong ten="Ảnh đệm (Storage)" dung={dungLuong.storageByte} hanMuc={dungLuong.hanMucStorageByte} />
            <p className="text-sm" data-testid="thang-con-lai">
              {dungLuong.thangConLai === null
                ? "Chưa ước tính được tốc độ tăng."
                : `Tăng khoảng ${mb(dungLuong.tangMoiThangByte ?? 0)}/tháng → còn khoảng ${dungLuong.thangConLai.toLocaleString("vi-VN")} tháng thì chạm 500 MB.`}{" "}
              <span className="text-[var(--bb-fg-muted)]">
                {dungLuong.nguonUocTinh === "moc_do"
                  ? "(theo mốc đo hằng đêm)"
                  : "(ước theo dòng mới 7 ngày qua — sẽ chính xác hơn sau 7 đêm đo)"}
              </span>
            </p>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="nut-xem-truoc-don"
          disabled={dang !== ""}
          onClick={() => void chay(true)}
        >
          {dang === "xem" ? "Đang xem trước…" : "Xem trước sẽ dọn gì"}
        </Button>
        {xemTruoc && !hoiXacNhan && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="nut-don-du-lieu"
            disabled={dang !== "" || xemTruoc.tongXoa === 0}
            onClick={() => setHoiXacNhan(true)}
          >
            Dọn dữ liệu vận hành
          </Button>
        )}
        {hoiXacNhan && xemTruoc && (
          <span className="flex flex-wrap items-center gap-2" role="group" aria-label="Xác nhận dọn">
            <span className="text-sm">Xoá vĩnh viễn {so(xemTruoc.tongXoa)} dòng như bảng dưới?</span>
            <Button
              type="button"
              variant="danger"
              size="sm"
              data-testid="nut-xac-nhan-don"
              disabled={dang !== ""}
              onClick={() => void chay(false)}
            >
              {dang === "don" ? "Đang dọn…" : "Xác nhận dọn"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={dang !== ""} onClick={() => setHoiXacNhan(false)}>
              Thôi
            </Button>
          </span>
        )}
        {cau && (
          <span role="status" className={`text-xs ${cau.ok ? "text-[var(--bb-fg-muted)]" : "text-[var(--bb-danger)]"}`}>
            {cau.text}
          </span>
        )}
      </div>

      {bang && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm" data-testid="bang-don-rac">
            <caption className="mb-2 text-left text-[var(--bb-fg-muted)]">
              {bang.thuTruoc ? "Xem trước — chưa xoá gì" : "Kết quả lượt dọn vừa rồi"}
              {bang.hetGio ? " · hết giờ giữa chừng, lượt sau làm tiếp" : ""}
            </caption>
            <thead>
              <tr className="border-b border-[var(--bb-border)] text-left">
                <th className="py-1 pr-3 font-medium">Loại</th>
                <th className="py-1 pr-3 font-medium">Giữ</th>
                <th className="py-1 pr-3 text-right font-medium">{bang.thuTruoc ? "Sẽ xoá" : "Đã xoá"}</th>
                <th className="py-1 pr-3 text-right font-medium">Còn chờ</th>
                <th className="py-1 text-right font-medium">Ước tính</th>
              </tr>
            </thead>
            <tbody>
              {bang.ketQua.map((k) => (
                <tr key={k.loai} className="border-b border-[var(--bb-border)]">
                  <td className="py-1 pr-3">{moTa.get(k.loai)?.moTa ?? k.loai}</td>
                  <td className="py-1 pr-3 tabular-nums">{moTa.get(k.loai)?.giuNgay ?? "—"} ngày</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{k.loi ? (
                      <span className="text-[var(--bb-danger)]" title={k.loi}>lỗi</span>
                    ) : k.boQua ? (
                      <span className="text-[var(--bb-fg-muted)]">{k.boQua}</span>
                    ) : (
                      so(k.xoa)
                    )}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{so(k.conLai)}</td>
                  <td className="py-1 text-right tabular-nums">{mb(k.uocTinhByte)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-1 pr-3 font-medium" colSpan={2}>
                  Tổng
                </td>
                <td className="py-1 pr-3 text-right font-medium tabular-nums">{so(bang.tongXoa)}</td>
                <td />
                <td className="py-1 text-right font-medium tabular-nums">{mb(bang.tongUocTinhByte)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
