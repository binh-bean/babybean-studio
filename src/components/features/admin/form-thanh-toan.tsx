"use client";

/**
 * Form "Ghi nhận đã thu" + "Giảm giá %" — BB-320, tách khỏi gallery-detail.tsx
 * ở BB-331 để dòng "Ảnh vượt hạn mức" (Việc cần xử lý) dùng lại đúng form
 * này, không chép một bản thứ hai dễ lệch luật.
 *
 * Gọi chung một route: `POST /api/admin/galleries/[id]/payments` — xem
 * `ghiThanhToan` bên dưới.
 */

import React from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { tinhGiamGia, CAU_CHUA_PHAT_SINH_TIEN } from "@/lib/gallery/tien-phat-sinh";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { CAU_KHACH_DANG_SUA, type KhoaKhiThu } from "@/lib/gallery/khoa-khi-thu";

/** BB-349 — hai ô tick đi kèm lần ghi thu (máy chủ kiểm lại cả hai). */
export interface TuyChonXacNhan {
  khoaBoAnh?: boolean;
  chacChan?: boolean;
  /**
   * BB-351 — khoá chống ghi trùng: form sinh MỘT mã cho mỗi lần ghi; bấm đúp / mạng gửi lại
   * cùng mã thì máy chủ chỉ ghi một dòng sổ (payments/route.ts).
   */
  maYeuCau?: string;
}

export type KetQuaGhiThu =
  | {
      ok: true;
      /** Còn thiếu sau khi ghi, CÓ DẤU (âm = khách thật sự trả dư) — cùng công thức `layTienCanThu`. */
      outstanding: number;
      discountAmount: number;
      daKhoa: boolean;
      loiKhoa: string | null;
      /** BB-351 — máy chủ nhận ra lần gửi trùng, không ghi thêm dòng nào. */
      trung: boolean;
    }
  | { ok: false; message: string };

/**
 * Gửi một lần ghi thu (kèm % giảm, kèm "khoá" + "chắc chắn" nếu có). MỘT hàm cho cả ba nơi
 * thu tiền: chi tiết bộ ảnh, tab "Khách gửi ảnh chọn", tab "Ảnh vượt hạn mức" (BB-351).
 */
export async function ghiThanhToan(
  galleryId: string,
  amount: number,
  method: string,
  note: string,
  discountPercent: number | null,
  xacNhan: TuyChonXacNhan = {},
): Promise<KetQuaGhiThu> {
  const res = await fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount,
      method,
      note,
      ...(discountPercent ? { discountPercent } : {}),
      ...(xacNhan.khoaBoAnh ? { khoaBoAnh: true } : {}),
      ...(xacNhan.chacChan ? { chacChan: true } : {}),
      ...(xacNhan.maYeuCau ? { requestId: xacNhan.maYeuCau } : {}),
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, message: json?.error?.message ?? "Không ghi nhận được" };
  return {
    ok: true,
    outstanding: Number(json?.data?.outstanding ?? 0),
    discountAmount: Number(json?.data?.discountAmount ?? 0),
    daKhoa: json?.data?.daKhoa === true,
    loiKhoa: typeof json?.data?.loiKhoa === "string" ? json.data.loiKhoa : null,
    trung: json?.data?.trung === true,
  };
}

/** BB-351 — câu báo sau khi ghi thu, dùng chung ba nơi (không nơi nào tự viết câu "trả DƯ" riêng). */
export function cauSauKhiThu(kq: Extract<KetQuaGhiThu, { ok: true }>, khiDu = "Khách đã trả đủ."): string {
  if (kq.trung) return "Lần bấm này trùng với lần ghi vừa xong — sổ chỉ ghi MỘT dòng.";
  const left = kq.outstanding;
  return (
    (kq.daKhoa ? "Đã xác nhận danh sách và khoá bộ ảnh. " : "") +
    (kq.loiKhoa ? `Chưa khoá được: ${kq.loiKhoa}. ` : "") +
    (kq.discountAmount > 0 ? `Đã ghi giảm giá ${formatCurrencyVND(kq.discountAmount)}. ` : "") +
    (left > 0
      ? `Đã ghi. Còn thiếu ${formatCurrencyVND(left)}.`
      : left < 0
        ? `Đã ghi. Khách trả DƯ ${formatCurrencyVND(-left)} — kiểm tra lại giúp.`
        : `Đã ghi. ${khiDu}`)
  );
}

function maMoi(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

export function PaymentForm({
  disabled: disabledNgoai,
  conThieu,
  chuaPhatSinh = false,
  khoa,
  sanPhamQuaLark = 0,
  onSubmit,
}: {
  disabled?: boolean;
  /** Số còn thiếu hiện tại (0 nếu đã đủ) — nền để gợi ý số tiền và tính giảm giá. */
  conThieu: number;
  /**
   * BB-344 — luật chủ studio "nếu không phát sinh thì khối không nhấn được": true thì
   * MỌI ô và nút bị khoá và hiện câu "Chưa phát sinh tiền cần thu". Máy chủ cũng từ
   * chối ghi thu khi số cần thu = 0 (payments/route.ts), nên khoá ở đây không phải
   * chỗ chặn duy nhất.
   */
  chuaPhatSinh?: boolean;
  /**
   * BB-349 — trạng thái khoá của bộ ảnh (`khoaKhiThu` từ GET items). Có danh sách chờ
   * xác nhận thì hiện ô "Đồng thời xác nhận danh sách và khoá bộ ảnh" (tick sẵn). Khoá,
   * hoặc khách đang sửa lại chưa gửi, thì phải tick "Tôi chắc chắn muốn xác nhận" mới bấm
   * được. Không truyền = như cũ (chỉ ghi tiền).
   */
  khoa?: KhoaKhiThu;
  /**
   * BB-360 — tiền sản phẩm mua thêm (ảnh in / khung / album) đang THU QUA LARK — không nằm
   * trong `conThieu`. > 0 thì hiện một dòng riêng để "Mua thêm X ₫" cạnh "Phải thu 0 ₫" hết mơ hồ.
   */
  sanPhamQuaLark?: number;
  onSubmit: (
    amount: number,
    method: string,
    note: string,
    discountPercent: number | null,
    xacNhan: TuyChonXacNhan,
  ) => void | Promise<void>;
}) {
  // BB-351 — chống bấm đúp: khoá nút ngay trong lượt bấm (không đợi `busy` của trang render
  // lại) và gửi kèm một mã cho mỗi lần ghi; xong lần này mới sinh mã mới.
  const dangGuiRef = React.useRef(false);
  const [dangGui, setDangGui] = React.useState(false);
  const maYeuCauRef = React.useRef<string>("");
  if (!maYeuCauRef.current) maYeuCauRef.current = maMoi();
  const disabled = disabledNgoai || chuaPhatSinh || dangGui;
  const [amount, setAmount] = React.useState(conThieu > 0 ? String(conThieu) : "");
  const [method, setMethod] = React.useState("tien_mat");
  const [note, setNote] = React.useState("");
  // BB-320: "Giảm giá %" — 0–100. Trống = không giảm.
  const [giamPt, setGiamPt] = React.useState("");

  const phanTram = giamPt.trim() === "" ? 0 : Number(giamPt);
  const phanTramHopLe = Number.isFinite(phanTram) && phanTram > 0 && phanTram <= 100;
  const giam = phanTramHopLe ? tinhGiamGia(conThieu, phanTram) : null;

  // Ghi xong thì số còn thiếu đổi → xoá ô % và lý do của lần vừa ghi (không để lại "10%" cạnh dòng "hết nợ").
  React.useEffect(() => {
    setGiamPt("");
    setNote("");
  }, [conThieu]);

  // Số tiền gợi ý = còn thiếu × (1 − %/100), làm tròn nghìn — đổi % thì số gợi ý đổi theo (CSKH vẫn sửa tay được).
  React.useEffect(() => {
    setAmount(giam ? String(giam.soTienGoiY) : conThieu > 0 ? String(conThieu) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi nền hoặc % đổi
  }, [conThieu, giam?.soTienGoiY]);

  const parsed = amount.trim() === "" ? 0 : Number(amount);
  const amountOk = Number.isInteger(parsed) && parsed !== 0;
  // Dòng trừ tiền bắt buộc có lý do — route cũng chặn. Giảm giá cũng phải có lý do.
  const coGiam = giamPt.trim() !== "" && phanTram !== 0;
  const giamOk = !coGiam || (phanTramHopLe && giam !== null && giam.soTienGiam > 0);
  const soTienOk = amountOk ? parsed > 0 || note.trim().length > 0 : coGiam && Number.isInteger(parsed);
  // BB-395: form này giờ là đường NHẬP TAY dự phòng — mọi dòng đều bắt ghi lý do (route cũng chặn).
  const valid = giamOk && soTienOk && note.trim().length > 0;

  // BB-349 — xác nhận + khoá cùng lúc, và ô "chắc chắn" bắt buộc.
  const [khoaBoAnh, setKhoaBoAnh] = React.useState(true);
  const [chacChan, setChacChan] = React.useState(false);
  const coTheKhoa = khoa?.coTheKhoa === true;
  const seKhoa = coTheKhoa && khoaBoAnh;
  const dangMoLai = khoa?.dangMoLai === true;
  // Dòng trừ (đính chính) không cần — chỉ dòng có tiền/giảm giá vào.
  const coTienVao = (amountOk && parsed > 0) || coGiam;
  const canChacChan = seKhoa || (dangMoLai && coTienVao);
  const duChacChan = !canChacChan || chacChan;
  // Ghi xong (số còn thiếu đổi) thì bỏ tick "chắc chắn" — lần sau phải tick lại.
  React.useEffect(() => setChacChan(false), [conThieu, khoa?.coTheKhoa, khoa?.dangMoLai]);

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      {sanPhamQuaLark > 0 && (
        <p data-testid="dong-san-pham-qua-lark" className="basis-full text-sm text-[var(--bb-fg-muted)]">
          Sản phẩm mua thêm: <strong className="text-[var(--bb-fg)]">{formatCurrencyVND(sanPhamQuaLark)}</strong> · thu qua Lark
        </p>
      )}
      {/* BB-294 (#19) — ô số, select, ô nhập hệ thiết kế, không phải mặc định trình duyệt. */}
      <label className="flex flex-col gap-1 text-xs">
        Giảm giá %
        <Input
          type="number"
          name="giamGiaPhanTram"
          inputMode="decimal"
          min={0}
          max={100}
          step="any"
          value={giamPt}
          disabled={disabled || conThieu <= 0}
          onChange={(e) => setGiamPt(e.target.value)}
          placeholder="0–100"
          className="h-9 w-24 min-h-0 px-2 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Số tiền
        <Input
          type="number"
          name="amount"
          value={amount}
          disabled={disabled}
          onChange={(e) => setAmount(e.target.value)}
          className="h-9 w-36 min-h-0 px-2 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Hình thức
        <Select
          name="method"
          value={method}
          disabled={disabled}
          onChange={(e) => setMethod(e.target.value)}
          className="h-9 min-h-0 px-2 py-2 text-sm"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
        {coGiam ? "Lý do giảm giá" : "Lý do nhập tay"}
        <Input
          type="text"
          name="note"
          maxLength={500}
          value={note}
          disabled={disabled}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            coGiam
              ? "Bắt buộc: lý do giảm giá"
              : parsed < 0
                ? "Bắt buộc: lý do trừ tiền"
                : "Bắt buộc: vì sao không xác nhận bằng mã hoá đơn"
          }
          className="h-9 min-h-0 px-2 py-2 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={disabled || !valid || !duChacChan}
        onClick={() => {
          if (dangGuiRef.current) return;
          dangGuiRef.current = true;
          setDangGui(true);
          void Promise.resolve(
            onSubmit(amountOk ? parsed : 0, method, note.trim(), coGiam ? phanTram : null, {
              khoaBoAnh: seKhoa,
              chacChan: canChacChan && chacChan,
              maYeuCau: maYeuCauRef.current,
            }),
          ).finally(() => {
            dangGuiRef.current = false;
            maYeuCauRef.current = maMoi();
            setDangGui(false);
          });
        }}
        className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm disabled:opacity-40"
      >
        {coGiam ? "Ghi giảm giá và thu" : "Ghi nhận đã thu"}
      </button>
      {coTheKhoa && !disabled && (
        <label className="flex basis-full items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="khoaBoAnh"
            checked={khoaBoAnh}
            onChange={(e) => setKhoaBoAnh(e.target.checked)}
            className="h-4 w-4"
          />
          Đồng thời xác nhận danh sách và khoá bộ ảnh
          {khoa?.soDot && khoa.soDot >= 2 ? ` (đợt ${khoa.soDot})` : ""}
        </label>
      )}
      {canChacChan && !disabled && (
        <div
          role="alert"
          data-testid="canh-bao-xac-nhan"
          className={
            "basis-full rounded-md border p-3 text-sm " +
            (dangMoLai
              ? "border-[var(--bb-danger)] bg-[color-mix(in_srgb,var(--bb-danger)_8%,transparent)]"
              : "border-[var(--bb-border)] bg-[var(--bb-surface-2)]")
          }
        >
          <p className={dangMoLai ? "font-medium text-[var(--bb-danger)]" : ""}>
            {dangMoLai
              ? CAU_KHACH_DANG_SUA
              : "Xác nhận lúc này sẽ khoá bộ ảnh: khách không sửa danh sách được nữa, studio bắt đầu chỉnh ảnh."}
          </p>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              name="chacChan"
              checked={chacChan}
              onChange={(e) => setChacChan(e.target.checked)}
              className="h-4 w-4"
            />
            Tôi chắc chắn muốn xác nhận
          </label>
        </div>
      )}
      {chuaPhatSinh && (
        <p data-testid="chua-phat-sinh-tien" className="basis-full text-sm text-[var(--bb-fg-muted)]">
          {CAU_CHUA_PHAT_SINH_TIEN}
        </p>
      )}
      {/* Hiện RÕ phần giảm và số khách phải trả — trước khi bấm ghi. */}
      {coGiam && (
        <p data-testid="dong-giam-gia" className="basis-full text-sm">
          {giam ? (
            <>
              Giảm <strong>{phanTram}%</strong> = <strong>−{formatCurrencyVND(giam.soTienGiam)}</strong> · khách trả{" "}
              <strong>{formatCurrencyVND(giam.soTienGoiY)}</strong> (làm tròn nghìn đồng)
            </>
          ) : conThieu <= 0 ? (
            <span className="text-[var(--bb-danger)]">Không còn khoản nào để giảm.</span>
          ) : (
            <span className="text-[var(--bb-danger)]">Phần trăm phải lớn hơn 0 và không quá 100.</span>
          )}
        </p>
      )}
    </div>
  );
}

