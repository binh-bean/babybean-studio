/**
 * BB-378 — hình minh hoạ nhỏ cho TỪNG bước "lưu ra màn hình chính".
 *
 * OWNER: DEV-FE. Vẽ bằng SVG thuần (không ảnh chụp màn hình thật — ảnh chụp
 * lỗi thời theo từng bản iOS/Android và nặng). Mỗi hình là một góc màn hình
 * điện thoại phác bằng nét mảnh; chỗ ba mẹ cần chạm được khoanh màu san hô
 * của Bean để mắt tìm thấy ngay.
 */

import React from "react";

export type LoaiMinhHoa =
  | "safari-chia-se"
  | "bang-chia-se"
  | "chrome-menu"
  | "menu-them"
  | "man-hinh-chinh"
  | "trong-app-menu"
  | "mo-trinh-duyet"
  | "may-tinh-cai"
  | "samsung-menu";

const MUC = "#2e2a27";
const NHAT = "#b9ada1";
const NEN = "#fbf7f2";
const VIEN = "#e5dcd2";
const NHAN = "#e8a598";

/** Vòng khoanh chỗ cần chạm. */
function Khoanh({ cx, cy, r = 9 }: { cx: number; cy: number; r?: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r + 3} fill={NHAN} opacity={0.22} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={NHAN} strokeWidth={1.6} />
    </>
  );
}

/** Biểu tượng Chia sẻ của iOS: ô vuông hở trên + mũi tên lên. */
function IconChiaSe({ x, y, mau = MUC }: { x: number; y: number; mau?: string }) {
  return (
    <g stroke={mau} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${x - 3.5} ${y - 1} h-1.5 v7 h10 v-7 h-1.5`} />
      <path d={`M${x} ${y + 2} v-9 M${x - 2.6} ${y - 4.4} L${x} ${y - 7} L${x + 2.6} ${y - 4.4}`} />
    </g>
  );
}

/** Ô vuông có dấu cộng — "Thêm vào MH chính". */
function IconThem({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={MUC} strokeWidth={1.3} fill="none" strokeLinecap="round">
      <rect x={x - 5} y={y - 5} width={10} height={10} rx={2.5} />
      <path d={`M${x} ${y - 2.5} v5 M${x - 2.5} ${y} h5`} />
    </g>
  );
}

function Dong({ x, y, w }: { x: number; y: number; w: number }) {
  return <rect x={x} y={y} width={w} height={2.6} rx={1.3} fill={NHAT} />;
}

const VE: Record<LoaiMinhHoa, React.ReactNode> = {
  // Đáy màn iPhone Safari: thanh địa chỉ + 5 nút, nút Chia sẻ ở giữa.
  "safari-chia-se": (
    <>
      <path d="M8 4 v46 a8 8 0 0 0 8 8 h56 a8 8 0 0 0 8 -8 v-46" fill={NEN} stroke={VIEN} strokeWidth={1.4} />
      <rect x={16} y={14} width={56} height={10} rx={5} fill="#fff" stroke={VIEN} />
      <Dong x={30} y={17.7} w={28} />
      <g stroke={NHAT} strokeWidth={1.4} fill="none" strokeLinecap="round">
        <path d="M18 40 l-3 -3 l3 -3" />
        <path d="M30 40 l3 -3 l-3 -3" />
        <rect x={56} y={33} width={8} height={8} rx={1.5} />
        <rect x={68.5} y={33.5} width={6} height={6} rx={1} />
        <rect x={67} y={35} width={6} height={6} rx={1} />
      </g>
      <IconChiaSe x={44} y={39} />
      <Khoanh cx={44} cy={37} />
    </>
  ),
  // Bảng chia sẻ iOS: vài dòng, dòng "Thêm vào MH chính" được khoanh.
  "bang-chia-se": (
    <>
      <rect x={8} y={4} width={72} height={54} rx={8} fill={NEN} stroke={VIEN} strokeWidth={1.4} />
      <rect x={14} y={10} width={60} height={10} rx={3} fill="#fff" />
      <Dong x={18} y={13.7} w={30} />
      <rect x={14} y={23} width={60} height={12} rx={3} fill="#fff" stroke={NHAN} strokeWidth={1.4} />
      <IconThem x={22} y={29} />
      <rect x={30} y={27.7} width={34} height={2.8} rx={1.4} fill={MUC} />
      <rect x={14} y={38} width={60} height={10} rx={3} fill="#fff" />
      <Dong x={18} y={41.7} w={24} />
    </>
  ),
  // Đầu màn Chrome Android: thanh địa chỉ + dấu ⋮ ở góc phải.
  "chrome-menu": (
    <>
      <path d="M8 58 v-46 a8 8 0 0 1 8 -8 h56 a8 8 0 0 1 8 8 v46" fill={NEN} stroke={VIEN} strokeWidth={1.4} />
      <rect x={14} y={14} width={46} height={11} rx={5.5} fill="#fff" stroke={VIEN} />
      <Dong x={20} y={18.2} w={26} />
      <g fill={MUC}>
        <circle cx={69} cy={15.5} r={1.3} />
        <circle cx={69} cy={19.5} r={1.3} />
        <circle cx={69} cy={23.5} r={1.3} />
      </g>
      <Khoanh cx={69} cy={19.5} r={7} />
      <Dong x={16} y={36} w={52} />
      <Dong x={16} y={42} w={40} />
    </>
  ),
  // Trình đơn thả xuống: dòng "Cài đặt ứng dụng / Thêm vào MH chính" được khoanh.
  "menu-them": (
    <>
      <rect x={20} y={4} width={60} height={54} rx={6} fill="#fff" stroke={VIEN} strokeWidth={1.4} />
      <Dong x={28} y={11} w={30} />
      <Dong x={28} y={19} w={38} />
      <rect x={23} y={25} width={54} height={12} rx={3} fill={NEN} stroke={NHAN} strokeWidth={1.4} />
      <IconThem x={31} y={31} />
      <rect x={39} y={29.7} width={32} height={2.8} rx={1.4} fill={MUC} />
      <Dong x={28} y={43} w={34} />
      <Dong x={28} y={50} w={26} />
    </>
  ),
  // Màn hình chính: lưới biểu tượng, biểu tượng ảnh của bé (hạt đậu) được khoanh.
  "man-hinh-chinh": (
    <>
      <rect x={14} y={2} width={60} height={58} rx={9} fill={NEN} stroke={VIEN} strokeWidth={1.4} />
      {[0, 1, 2].map((h) =>
        [0, 1, 2].map((c) =>
          h === 1 && c === 1 ? null : (
            <rect key={`${h}${c}`} x={22 + c * 16} y={10 + h * 16} width={11} height={11} rx={3} fill={VIEN} />
          ),
        ),
      )}
      <rect x={38} y={26} width={11} height={11} rx={3} fill={NHAN} />
      <ellipse cx={43.5} cy={31.5} rx={2.6} ry={3.4} fill="#fff" transform="rotate(-18 43.5 31.5)" />
      <Khoanh cx={43.5} cy={31.5} r={10} />
    </>
  ),
  // Trình duyệt trong Zalo/Facebook: dấu ⋯ ở góc trên.
  "trong-app-menu": (
    <>
      <path d="M8 58 v-46 a8 8 0 0 1 8 -8 h56 a8 8 0 0 1 8 8 v46" fill={NEN} stroke={VIEN} strokeWidth={1.4} />
      <g stroke={NHAT} strokeWidth={1.4} strokeLinecap="round">
        <path d="M16 18 l6 6 M22 18 l-6 6" />
      </g>
      <Dong x={30} y={19.7} w={26} />
      <g fill={MUC}>
        <circle cx={64} cy={21} r={1.3} />
        <circle cx={68.5} cy={21} r={1.3} />
        <circle cx={73} cy={21} r={1.3} />
      </g>
      <Khoanh cx={68.5} cy={21} r={8} />
      <Dong x={16} y={36} w={52} />
      <Dong x={16} y={42} w={40} />
    </>
  ),
  // Trình đơn: dòng "Mở bằng trình duyệt" (biểu tượng la bàn) được khoanh.
  "mo-trinh-duyet": (
    <>
      <rect x={20} y={4} width={60} height={54} rx={6} fill="#fff" stroke={VIEN} strokeWidth={1.4} />
      <Dong x={28} y={11} w={30} />
      <rect x={23} y={18} width={54} height={12} rx={3} fill={NEN} stroke={NHAN} strokeWidth={1.4} />
      <circle cx={31} cy={24} r={4.6} fill="none" stroke={MUC} strokeWidth={1.3} />
      <path d="M33 22 l-1.2 3.2 l-3.2 1.2 l1.2 -3.2 z" fill={MUC} />
      <rect x={39} y={22.7} width={32} height={2.8} rx={1.4} fill={MUC} />
      <Dong x={28} y={37} w={34} />
      <Dong x={28} y={45} w={26} />
    </>
  ),
  // Thanh địa chỉ máy tính: biểu tượng cài đặt ở cuối.
  "may-tinh-cai": (
    <>
      <rect x={2} y={10} width={84} height={40} rx={6} fill={NEN} stroke={VIEN} strokeWidth={1.4} />
      <rect x={8} y={16} width={72} height={11} rx={5.5} fill="#fff" stroke={VIEN} />
      <Dong x={14} y={20.2} w={34} />
      <g stroke={MUC} strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x={66} y={18.5} width={8} height={6} rx={1} />
        <path d="M70 19.5 v3.2 M68.6 21.4 L70 22.8 L71.4 21.4" />
      </g>
      <Khoanh cx={70} cy={21.5} r={7} />
      <Dong x={10} y={35} w={50} />
      <Dong x={10} y={41} w={36} />
    </>
  ),
  // Samsung Internet: thanh dưới, biểu tượng ≡ ở góc phải.
  "samsung-menu": (
    <>
      <path d="M8 4 v46 a8 8 0 0 0 8 8 h56 a8 8 0 0 0 8 -8 v-46" fill={NEN} stroke={VIEN} strokeWidth={1.4} />
      <Dong x={16} y={14} w={52} />
      <Dong x={16} y={20} w={40} />
      <g stroke={NHAT} strokeWidth={1.4} fill="none" strokeLinecap="round">
        <path d="M18 40 l-3 -3 l3 -3" />
        <path d="M30 40 l3 -3 l-3 -3" />
      </g>
      <g stroke={MUC} strokeWidth={1.5} strokeLinecap="round">
        <path d="M63 33.5 h10 M63 37.5 h10 M63 41.5 h10" />
      </g>
      <Khoanh cx={68} cy={37.5} r={8} />
    </>
  ),
};

export function MinhHoaLuuApp({ loai, className }: { loai: LoaiMinhHoa; className?: string }) {
  return (
    <svg
      viewBox="0 0 88 62"
      width={88}
      height={62}
      aria-hidden="true"
      focusable="false"
      data-minh-hoa={loai}
      className={className}
    >
      {VE[loai]}
    </svg>
  );
}
