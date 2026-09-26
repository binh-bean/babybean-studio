/**
 * Bốn phép đo MÁY dùng chung cho BB-274 (`bb-274-bo-cuc.spec.ts`, các màn
 * CHÍNH) và BB-275 (`bb-275-man-phu.spec.ts`, các màn PHỤ).
 *
 * OWNER: QA-BOT. Tách ra khỏi `bb-274-bo-cuc.spec.ts` thành một helper THẬT
 * (không phải `*.spec.ts`) — BB-275 từng `import` thẳng từ file spec kia, và
 * Playwright NẠP CHẠY mọi `test.describe` ở top-level của một module ngay khi
 * nó được import. Kết quả: mỗi lần chạy `bb-275-man-phu.spec.ts` lại âm thầm
 * chạy lại TOÀN BỘ bộ BB-274 (kể cả ca quản trị nặng ~300s) như một tác dụng
 * phụ — không phải chủ đích "dùng lại hàm đo".
 *
 * Bốn phép đo:
 *  (a) `kiemCuonNgang` — không cuộn ngang toàn trang.
 *  (b) `kiemChuTran` — tiêu đề/nút/nhãn chip không bị CHỮ TRÀN khỏi khung của
 *      chính nó (scrollWidth phần tử > clientWidth phần tử).
 *  (c) `kiemTheDinhDayCheNut` — thanh nổi/nút dính đáy không che phần tử
 *      tương tác cuối trang khi đã cuộn tới đáy.
 *  (d) `kiemAnhPhuKin` — ảnh minh hoạ (`/hanh-trinh/`, `/minh-hoa/`,
 *      `/san-pham/`) phủ kín khung chứa nó.
 *
 * `kiemBoCuc` gộp cả bốn — dùng cho MỌI trang/hộp thoại chiếm trọn màn hình.
 * `kiemBoCucNhe` chỉ (a)+(b) — dùng cho lớp phủ KHÔNG che kín màn hình (một
 * dropdown/bottom-sheet có lớp phủ mờ cố ý che nội dung phía sau): phép đo
 * (c) không áp dụng được ở đó, vì che nội dung bên dưới CHÍNH LÀ chủ đích của
 * lớp phủ, không phải một thanh nổi vô tình chồng lên nút cuối trang.
 */
import type { Page } from "@playwright/test";

export const DIEN_THOAI = { width: 390, height: 844 };
export const MAY_TINH = { width: 1440, height: 900 };

/** (a) không cuộn ngang toàn trang. */
export async function kiemCuonNgang(page: Page): Promise<string[]> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (scrollWidth > clientWidth + 1) {
    return [`Cuộn ngang: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`];
  }
  return [];
}

/** (b) tiêu đề/nút/nhãn chip không bị chữ tràn khỏi khung của chính nó. */
export async function kiemChuTran(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const loi: string[] = [];
    const selectors = ["h1", "h2", "h3", "button", '[role="button"]', "a.rounded-full", "[class*='badge']"];
    const seen = new Set<Element>();
    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue; // ẩn hoặc rỗng
        if (r.top > window.innerHeight || r.bottom < 0) continue; // ngoài khung nhìn
        const he = el as HTMLElement;
        if (he.scrollWidth > he.clientWidth + 2 && he.clientWidth > 0) {
          const text = (he.textContent || "").trim().slice(0, 40);
          loi.push(
            `Chữ tràn trong <${el.tagName.toLowerCase()}> "${text}": scrollWidth=${he.scrollWidth} > clientWidth=${he.clientWidth}`,
          );
        }
      }
    }
    return loi;
  });
}

/** (c) thanh nổi/nút dính đáy không che phần tử tương tác cuối trang. */
export async function kiemTheDinhDayCheNut(page: Page): Promise<string[]> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const loi: string[] = [];
    const interactive = Array.from(
      document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]'),
    );
    for (const el of interactive) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      // Chỉ xét phần tử đang thật sự nằm trong khung nhìn hiện tại.
      if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
      const tren = document.elementFromPoint(cx, cy);
      if (!tren) continue;
      if (tren === el || el.contains(tren) || tren.contains(el)) continue;
      // Bị phần tử khác che ở đúng tâm — kiểm phần tử che có phải đứng yên ở
      // đáy màn (fixed/sticky) hay không, để tránh báo nhầm lớp phủ tạm thời.
      const csTren = getComputedStyle(tren);
      if (csTren.position !== "fixed" && csTren.position !== "sticky") continue;
      const nhan = (el.textContent || (el as HTMLElement).getAttribute?.("aria-label") || "").trim().slice(0, 40);
      loi.push(
        `Phần tử tương tác "<${el.tagName.toLowerCase()}> ${nhan}" bị che bởi <${tren.tagName.toLowerCase()} class="${tren.className.toString().slice(0, 60)}">`,
      );
    }
    return loi;
  });
}

/** (d) ảnh minh hoạ phủ kín khung chứa nó. */
export async function kiemAnhPhuKin(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const loi: string[] = [];
    const imgs = Array.from(document.querySelectorAll("img")).filter((img) => {
      const src = img.currentSrc || img.src || "";
      return /\/(hanh-trinh|minh-hoa|san-pham)\//.test(src);
    });
    for (const img of imgs) {
      const r = img.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) continue;
      const cs = getComputedStyle(img);
      if (cs.objectFit === "cover" || cs.objectFit === "fill") continue;
      if (!img.complete || img.naturalWidth === 0) continue;
      const tiLeKhung = r.width / r.height;
      const tiLeAnh = img.naturalWidth / img.naturalHeight;
      const lech = Math.abs(tiLeKhung - tiLeAnh) / tiLeKhung;
      if (lech > 0.06) {
        loi.push(
          `Ảnh "${(img.currentSrc || img.src).split("/").pop()}" không phủ kín khung: object-fit="${cs.objectFit}", ` +
            `tỉ lệ khung=${tiLeKhung.toFixed(2)} vs tỉ lệ ảnh=${tiLeAnh.toFixed(2)} (lệch ${(lech * 100).toFixed(0)}%)`,
        );
      }
    }
    return loi;
  });
}

/** Cả bốn phép đo — dùng cho trang/hộp thoại chiếm trọn màn hình. */
export async function kiemBoCuc(
  page: Page,
  kichThuoc: { width: number; height: number },
  chupManHinh: (hau: string) => string,
): Promise<string[]> {
  await page.setViewportSize(kichThuoc);
  await page.waitForTimeout(400); // ổn định layout/ảnh sau khi đổi viewport

  const loiCuonNgang = await kiemCuonNgang(page);
  const loiChuTran = await kiemChuTran(page);
  const loiAnh = await kiemAnhPhuKin(page);

  await page.screenshot({ path: chupManHinh("truoc-cuon"), fullPage: false });

  const loiCheNut = await kiemTheDinhDayCheNut(page);
  await page.screenshot({ path: chupManHinh("cuoi-trang"), fullPage: false });

  return [...loiCuonNgang, ...loiChuTran, ...loiAnh, ...loiCheNut];
}

/** Chỉ (a)+(b) — dùng cho lớp phủ KHÔNG che kín màn hình. Xem ghi chú đầu file. */
export async function kiemBoCucNhe(
  page: Page,
  kichThuoc: { width: number; height: number },
  chupManHinh: () => string,
): Promise<string[]> {
  await page.setViewportSize(kichThuoc);
  await page.waitForTimeout(300);
  const loi = [...(await kiemCuonNgang(page)), ...(await kiemChuTran(page))];
  await page.screenshot({ path: chupManHinh(), fullPage: false });
  return loi;
}
