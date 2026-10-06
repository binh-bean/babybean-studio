/**
 * BB-370 — cụm thương hiệu "logo hạt đậu + BABY BEAN" ở đầu màn khách, tách ra
 * để khung xem trước bìa ở quản trị vẽ ĐÚNG cụm này (cùng logo, cùng chữ), không
 * chép tay một bản na ná.
 *
 * `kho` ép cỡ theo khung: màn khách để trống (theo bề rộng cửa sổ như cũ, `lg:`);
 * khung xem trước truyền "dien-thoai"/"may-tinh" vì cửa sổ quản trị luôn rộng
 * (`lg:` luôn bật, khung điện thoại sẽ ra cỡ máy tính).
 */
import { cn } from "@/components/ui/utils";

export function ThuongHieuBoAnh({ kho }: { kho?: "dien-thoai" | "may-tinh" } = {}) {
  const mt = kho === "may-tinh";
  const tuDong = kho === undefined;
  return (
    <span
      data-testid="ten-thuong-hieu"
      className={cn(
        "inline-flex items-center justify-self-center",
        mt ? "gap-[7px]" : "gap-[8px]",
        tuDong && "lg:gap-[7px]",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-testid="logo-hat-dau"
        src="/brand/logo-hat-dau-64.png"
        alt=""
        aria-hidden="true"
        className={cn("shrink-0", mt ? "h-[21px] w-[21px]" : "h-[23px] w-[23px]", tuDong && "lg:h-[21px] lg:w-[21px]")}
      />
      <span
        className={cn(
          "font-display uppercase text-[#2e2a27]",
          mt ? "text-[18px] tracking-[0.12em]" : "text-[20px] tracking-[0.14em]",
          tuDong && "lg:text-[18px] lg:tracking-[0.12em]",
        )}
      >
        Baby Bean
      </span>
    </span>
  );
}
