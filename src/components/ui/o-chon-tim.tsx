"use client";

/**
 * BB-340 — ô chọn có tìm kiếm (combobox).
 *
 * Anh chủ studio: "các phần chọn có danh sách bên trong hiện tại phải kéo để
 * tìm — thêm tính năng gõ ký tự sẽ hiện ra sp có ký tự đó ở tất cả các trang".
 *
 * Dùng thay cho `<Select>` ở chỗ danh sách dài. API giống `<Select>` (cùng
 * `value` / `defaultValue` / `onChange(e)` với `e.target.value`, cùng `name`,
 * cùng con là `<option>` / `<optgroup>`), nên chỗ gọi chỉ đổi tên thẻ.
 *
 *  - Danh sách NGẮN (<= NGUONG_HIEN_O_TIM mục) thì vẫn vẽ `<Select>` gốc như
 *    cũ: trên điện thoại bảng chọn của hệ điều hành là cách nhanh nhất cho
 *    vài mục, và các chỗ đang dùng `selectOption` của phép thử không đổi.
 *  - Danh sách DÀI thì thành ô gõ-để-lọc: gõ "go" ra "Gỗ", gõ "nguyen" ra
 *    "Nguyễn" (bỏ dấu, không phân biệt hoa thường — `locTheoChu`).
 *
 * Bàn phím: mũi tên lên/xuống di chuyển, Enter chọn, Esc đóng. ARIA theo mẫu
 * combobox có danh sách: `role="combobox"` + `role="listbox"` + `aria-activedescendant`.
 * Chỉ dùng token màu/bo góc/đổ bóng sẵn có của `Select`.
 */

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./utils";
import { Select } from "./select";
import { locTheoChu } from "@/lib/utils/tim-khong-dau";

/** Danh sách có NHIỀU HƠN số mục này thì mới hiện ô gõ để lọc. */
export const NGUONG_HIEN_O_TIM = 7;

export interface OChonTimProps {
  children?: React.ReactNode;
  className?: string;
  error?: boolean;
  value?: string | number;
  defaultValue?: string | number;
  /** Giống `<Select>`: đọc `e.target.value`. */
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  title?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** Chữ khi gõ mà không mục nào khớp. */
  emptyText?: string;
}

interface Muc {
  value: string;
  label: string;
  disabled: boolean;
  /** Tên nhóm (`<optgroup label>`), nếu có. */
  nhom?: string;
}

function layChu(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(layChu).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return layChu(node.props.children);
  }
  return "";
}

/** Đọc các `<option>` / `<optgroup>` (kể cả lồng trong Fragment hay mảng) thành danh sách phẳng. */
function docCacMuc(children: React.ReactNode, nhom?: string, ra: Muc[] = []): Muc[] {
  React.Children.forEach(children, (con) => {
    if (!React.isValidElement(con)) return;
    const props = con.props as {
      value?: string | number;
      label?: string;
      disabled?: boolean;
      children?: React.ReactNode;
    };
    if (con.type === "option") {
      const label = layChu(props.children);
      ra.push({
        value: props.value !== undefined ? String(props.value) : label,
        label,
        disabled: !!props.disabled,
        nhom,
      });
    } else if (con.type === "optgroup") {
      docCacMuc(props.children, props.label, ra);
    } else if (con.type === React.Fragment) {
      docCacMuc(props.children, nhom, ra);
    }
  });
  return ra;
}

function mucKeTiep(ds: Muc[], tu: number, huong: 1 | -1): number {
  if (ds.length === 0) return -1;
  // Chưa có mục nào sáng: mũi tên xuống vào mục đầu, mũi tên lên vào mục cuối.
  const goc = tu < 0 && huong === -1 ? 0 : tu;
  for (let b = 1; b <= ds.length; b++) {
    const i = (((goc + huong * b) % ds.length) + ds.length) % ds.length;
    const m = ds[i];
    if (m && !m.disabled) return i;
  }
  return -1;
}

function mucDauTienDung(ds: Muc[]): number {
  return ds.findIndex((m) => !m.disabled);
}

export function OChonTim(props: OChonTimProps) {
  const { emptyText, ...conLai } = props;
  const cacMuc = docCacMuc(props.children);
  if (cacMuc.length <= NGUONG_HIEN_O_TIM) {
    return <Select {...conLai} />;
  }
  return <HopTimKiem {...conLai} cacMuc={cacMuc} emptyText={emptyText} />;
}
OChonTim.displayName = "OChonTim";

function HopTimKiem({
  cacMuc,
  className,
  error,
  value,
  defaultValue,
  onChange,
  name,
  id,
  disabled,
  required,
  title,
  emptyText = "Không có mục nào khớp",
  ...aria
}: Omit<OChonTimProps, "children"> & { cacMuc: Muc[] }) {
  const idGoc = React.useId();
  const idDanhSach = `${idGoc}-ds`;
  const idMuc = (i: number) => `${idGoc}-m${i}`;

  const [giaTriNoiBo, setGiaTriNoiBo] = React.useState(
    defaultValue == null ? "" : String(defaultValue),
  );
  const laDieuKhien = value !== undefined;
  const giaTri = laDieuKhien ? String(value) : giaTriNoiBo;
  const mucDangChon = cacMuc.find((m) => m.value === giaTri);

  const [mo, setMo] = React.useState(false);
  const [truyVan, setTruyVan] = React.useState("");
  const [viTri, setViTri] = React.useState(-1);

  const hienThi = mo ? locTheoChu(cacMuc, truyVan) : [];

  const moRa = () => {
    if (disabled) return;
    setTruyVan("");
    setMo(true);
    const i = cacMuc.findIndex((m) => m.value === giaTri && !m.disabled);
    setViTri(i >= 0 ? i : mucDauTienDung(cacMuc));
  };
  const dong = () => {
    setMo(false);
    setTruyVan("");
    setViTri(-1);
  };
  const chon = (muc: Muc) => {
    if (muc.disabled || disabled) return;
    if (!laDieuKhien) setGiaTriNoiBo(muc.value);
    if (onChange) {
      const gia = { value: muc.value, name: name ?? "" };
      onChange({ target: gia, currentTarget: gia } as unknown as React.ChangeEvent<HTMLSelectElement>);
    }
    dong();
  };

  // Mục đang sáng luôn nằm trong tầm nhìn khi đi bằng mũi tên.
  React.useEffect(() => {
    if (!mo || viTri < 0) return;
    document.getElementById(idMuc(viTri))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, viTri]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        if (!mo) {
          moRa();
          return;
        }
        setViTri((v) => mucKeTiep(hienThi, v, e.key === "ArrowDown" ? 1 : -1));
        return;
      }
      case "Enter": {
        if (!mo) return;
        e.preventDefault(); // đừng gửi form khi đang chọn mục
        const m = hienThi[viTri];
        if (m) chon(m);
        return;
      }
      case "Escape": {
        if (!mo) return;
        e.preventDefault();
        e.stopPropagation(); // đóng ô chọn thôi, đừng đóng hộp thoại bao ngoài
        e.nativeEvent.stopImmediatePropagation?.();
        dong();
        return;
      }
      case "Tab":
        dong();
        return;
    }
  };

  let nhomTruoc: string | undefined;

  return (
    <div className="relative w-full">
      {name != null && <input type="hidden" name={name} value={giaTri} />}
      <input
        id={id}
        type="text"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={mo}
        aria-controls={mo ? idDanhSach : undefined}
        aria-autocomplete="list"
        aria-activedescendant={mo && viTri >= 0 && hienThi[viTri] ? idMuc(viTri) : undefined}
        aria-required={required || undefined}
        aria-invalid={error || undefined}
        aria-label={aria["aria-label"]}
        aria-labelledby={aria["aria-labelledby"]}
        aria-describedby={aria["aria-describedby"]}
        title={title}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        // Chữ `text-base` (16px) dưới `sm` để iOS không tự phóng to trang khi chạm vào ô.
        enterKeyHint="search"
        disabled={disabled}
        value={mo ? truyVan : (mucDangChon?.label ?? "")}
        placeholder={mo ? (mucDangChon?.label ?? "") : undefined}
        onFocus={(e) => e.currentTarget.select()}
        onClick={() => {
          if (!mo) moRa();
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (!mo) setMo(true);
          setTruyVan(v);
          setViTri(mucDauTienDung(locTheoChu(cacMuc, v)));
        }}
        onBlur={dong}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-11 min-h-[44px] w-full truncate rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface)] px-3 py-2 pr-9 text-base sm:text-sm text-[var(--bb-fg)] ring-offset-background placeholder:text-[var(--bb-fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer",
          error && "border-[var(--bb-danger)] focus-visible:ring-[var(--bb-danger)]",
          className,
        )}
      />
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--bb-fg-muted)] transition-transform",
          mo && "rotate-180",
        )}
      />
      {mo && (
        <ul
          id={idDanhSach}
          role="listbox"
          aria-label={aria["aria-label"]}
          // Giữ tiêu điểm ở ô gõ khi chạm/bấm vào danh sách (kể cả cuộn bằng ngón tay).
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-max min-w-full max-w-[85vw] overflow-auto rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface)] py-1 text-sm text-[var(--bb-fg)] shadow-[var(--bb-shadow)]"
        >
          {hienThi.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-[var(--bb-fg-muted)]">
              {emptyText}
            </li>
          )}
          {hienThi.map((m, i) => {
            const tieuDeNhom = m.nhom && m.nhom !== nhomTruoc ? m.nhom : null;
            nhomTruoc = m.nhom;
            const dangChon = m.value === giaTri;
            return (
              <React.Fragment key={`${m.nhom ?? ""}|${m.value}|${i}`}>
                {tieuDeNhom && (
                  <li
                    role="presentation"
                    className="px-3 pb-1 pt-2 text-xs font-medium text-[var(--bb-fg-muted)]"
                  >
                    {tieuDeNhom}
                  </li>
                )}
                <li
                  id={idMuc(i)}
                  role="option"
                  aria-selected={dangChon}
                  aria-disabled={m.disabled || undefined}
                  onClick={() => chon(m)}
                  onMouseEnter={() => !m.disabled && setViTri(i)}
                  className={cn(
                    "flex min-h-[44px] cursor-pointer items-center justify-between gap-2 px-3 py-2 sm:min-h-[36px]",
                    i === viTri && "bg-[var(--bb-surface-2)]",
                    dangChon && "font-medium",
                    m.disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="min-w-0 break-words">{m.label}</span>
                  {dangChon && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}
