/**
 * BB-334A — tên của "nhà" trên trang gia đình và dưới icon màn hình chính.
 *
 * Anh chốt Q7 ★: tên "Nhà bé Mít"; hai bé thì "Bé Mít & Na". Dưới icon giữ luật
 * BB-324 (`tenNganManHinhChinh`, ≤ 12 ký tự, không cắt giữa chữ): dài quá thì
 * rơi về tên ngắn của bé mới nhất ("Bé Mít"), không có bé nào thì "Baby Bean".
 */
import { tenNganManHinhChinh, TEN_NGAN_MAC_DINH } from "@/lib/utils/dinh-dang";

const TOI_DA = 12;
const doDai = (s: string) => [...s.normalize("NFC")].length;

export interface BeTrongNha {
  nickname: string | null | undefined;
  fullName: string | null | undefined;
}

/** Bỏ chữ "Bé " ở đầu của tên ngắn ("Bé Mít" → "Mít"). */
function boChuBe(ten: string): string {
  return ten.replace(/^bé\s+/i, "");
}

/**
 * @param cacBe bé của nhà, bé của bộ MỚI NHẤT trước (trùng thì đã gộp ở nơi gọi
 *              hay chưa cũng được — gộp lại theo tên ở đây).
 */
export function tenNha(cacBe: readonly BeTrongNha[]): { tenNha: string; tenNgan: string } {
  const ten: string[] = [];
  for (const be of cacBe) {
    const t = tenNganManHinhChinh(be.nickname, be.fullName);
    if (t !== TEN_NGAN_MAC_DINH && !ten.includes(t)) ten.push(t);
  }
  if (ten.length === 0) return { tenNha: TEN_NGAN_MAC_DINH, tenNgan: TEN_NGAN_MAC_DINH };

  const dau = ten[0]!;
  const day =
    ten.length === 1 ? `Nhà bé ${boChuBe(dau)}` : `Bé ${boChuBe(dau)} & ${boChuBe(ten[1]!)}`;
  return { tenNha: day, tenNgan: doDai(day) <= TOI_DA ? day : dau };
}
