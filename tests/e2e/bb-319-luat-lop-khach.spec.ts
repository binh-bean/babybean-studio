/**
 * BB-319 — SÁU LUẬT THEO LỚP LỖI cho màn khách, đo trên đúng 24 khung hình
 * người chấm nhìn (12 màn K × điện thoại 390×844 + máy tính 1440×900) CỘNG
 * các khung phụ phủ phần còn lại của ứng dụng khách (toàn trang từng trạng
 * thái bộ ảnh, tấm "Đặt in", cửa hàng tab Album, hộp chốt mở chi tiết, màn mua
 * thêm sau khi giao).
 *
 * Vì sao theo LỚP: vòng 5 và vòng 6 mỗi vòng chỉ vá đúng chỗ người chấm chỉ,
 * người chấm sau lại thấy CÙNG kiểu lỗi ở chỗ khác (x/×, lề 24/20/16, nhãn
 * giỏ, câu dài). Mỗi luật dưới đây quét MỌI chữ/khối/nút đang thấy trên mọi
 * khung, nên một màn nào sau này phạm lại là đỏ ngay.
 *
 *   Luật 1 · kích thước  — chỉ "×" giữa hai số (hàm `formatKichThuoc`/`tenKemSoLuong`).
 *   Luật 2 · lề          — điện thoại: nội dung 24 px, lưới ảnh 8 px; máy tính: trang 40 px.
 *   Luật 3 · hệ          — một màu nút chính (mực, viên tròn), tiêu đề Playfair không
 *                          nghiêng, nhãn nhỏ viết hoa, mọi cỡ chữ nằm trên MỘT thang.
 *   Luật 4 · lời         — mọi câu ≤ 12 chữ; không lộ chữ nội bộ (hạn mức, suất, CSKH…).
 *   Luật 5 · tiền & giỏ  — "Trong giỏ" khi chưa gửi đơn, "Đã đặt mua" chỉ khi đã gửi; tiền "N.NNN ₫".
 *   Luật 6 · tên bé      — đúng tên (họ tên đầy đủ khi không có biệt danh), không "Bé Bé", không bị cắt.
 *
 * Dữ liệu: tests/fixtures/danh-gia.ts ("Fixture DANHGIA5-…"), dọn NGAY sau khi đo
 * xong (cuối beforeAll). Chạy: MOCK_DRIVE_TRE=1 PW_PORT=3179 --workers=1.
 *
 * Số đo được giữ trong một tệp tạm theo tiến trình chạy (`process.ppid`) — một
 * luật đỏ làm Playwright dựng lại worker, worker mới đọc lại số đo thay vì đo
 * lại 40 khung. `DO_KHACH_RA=<thư mục>` ghi thêm bản số đo thô để soi tay.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { duLieuDanhGia5, donDep } from "../fixtures/danh-gia";
import { denManK, doMan, GOC_DO, KHUNG_PHU, MA_K, type DoManKhach, type Kho, type MaK } from "./helpers/man-khach";
import {
  KY_HIEU_X,
  LE_DT,
  LE_LUOI_DT,
  LE_MT,
  THANG_CHU,
  MAU_NUT_CHINH,
  cauQuaDai,
  chuNoiBo,
  tienSaiDinhDang,
} from "./helpers/luat-khach";

const PORT = Number(process.env.PW_PORT) || 3099;
const BASE = `http://localhost:${PORT}`;
const TAM = path.join(os.tmpdir(), `bb319-luat-khach-${process.ppid}.json`);

interface KhungDo {
  khoa: string;
  kho: Kho;
  /** Mã màn K (khung chấm điểm) hoặc null với khung phụ. */
  ma: MaK | null;
  /** Tên bé phải thấy; null = khung không bắt buộc gọi tên. */
  tenBe: string | null;
  daGui: boolean;
  /** Khung "trang" (không phải hộp thoại) — dùng cho luật lề máy tính. */
  laTrang: boolean;
  s: DoManKhach;
}

let KHUNG: KhungDo[] = [];
let LOI_DI_TOI: string[] = [];

/** Tên bé người chấm phải thấy ở từng màn (tính từ dữ liệu mẫu, không từ mã app). */
function tenBeCuaMan(ma: MaK): string | null {
  if (ma === "K06") return null; // cửa hàng là lớp phủ; tên bé ở thanh dính mờ phía sau
  if (ma === "K09") return "Bé Bơ";
  if (ma === "K10") return "Bé Mít";
  if (ma === "K11") return "Bé Xoài";
  if (ma === "K12") return "Ngô Gia Huy";
  return "Nguyễn Ngọc Bảo An";
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(1_500_000);
  if (fs.existsSync(TAM)) {
    const cu = JSON.parse(fs.readFileSync(TAM, "utf8")) as { khung: KhungDo[]; loi: string[] };
    KHUNG = cu.khung;
    LOI_DI_TOI = cu.loi;
    return;
  }
  const d = await duLieuDanhGia5();
  let ip = 0;
  const dai = `10.${(process.pid % 200) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  const moTrang = async () => {
    ip += 1;
    const ctx = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `${dai}.${ip}` } });
    return { ctx, page: await ctx.newPage() };
  };
  try {
    for (const k of ["dt", "mt"] as Kho[]) {
      for (const ma of MA_K) {
        const { ctx, page } = await moTrang();
        try {
          await denManK(page, d, ma, k);
          await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
          const tenBe = tenBeCuaMan(ma);
          KHUNG.push({
            khoa: `${ma}-${k}`,
            kho: k,
            ma,
            tenBe,
            daGui: ["K09", "K10", "K11"].includes(ma),
            laTrang: GOC_DO[ma] === null,
            s: await doMan(page, GOC_DO[ma], tenBe ?? "Nguyễn Ngọc Bảo An"),
          });
        } catch (e) {
          LOI_DI_TOI.push(`${ma}-${k}: ${(e as Error).message.split("\n")[0]}`);
        } finally {
          await ctx.close();
        }
      }
    }
    for (const kp of KHUNG_PHU) {
      const { ctx, page } = await moTrang();
      try {
        await page.setViewportSize(kp.kho === "dt" ? { width: 390, height: 844 } : { width: 1440, height: 900 });
        await kp.di(page, d);
        await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
        const tenBe = kp.tenBe(d);
        KHUNG.push({
          khoa: `${kp.ma}-${kp.kho}`,
          kho: kp.kho,
          ma: null,
          tenBe,
          daGui: kp.daGui,
          laTrang: kp.goc === null,
          s: await doMan(page, kp.goc, tenBe, kp.toanTrang),
        });
      } catch (e) {
        LOI_DI_TOI.push(`${kp.ma}-${kp.kho}: ${(e as Error).message.split("\n")[0]}`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await donDep(d);
  }
  fs.writeFileSync(TAM, JSON.stringify({ khung: KHUNG, loi: LOI_DI_TOI }));
  const ra = process.env.DO_KHACH_RA;
  if (ra) {
    fs.mkdirSync(ra, { recursive: true });
    fs.writeFileSync(path.join(ra, "do-khach.json"), JSON.stringify(Object.fromEntries(KHUNG.map((k) => [k.khoa, k.s])), null, 1));
  }
});

/** Gom vi phạm của mọi khung rồi so một lần — thấy hết, không dừng ở lỗi đầu. */
function quet(fn: (kh: KhungDo) => string[], loc: (kh: KhungDo) => boolean = () => true): string[] {
  const loi: string[] = [];
  for (const kh of KHUNG.filter(loc)) for (const l of fn(kh)) loi.push(`${kh.khoa} · ${l}`);
  return loi;
}

test("đã đi tới và đo đủ 24 khung chấm điểm + khung phụ", () => {
  expect(LOI_DI_TOI, "khung không đi tới được").toEqual([]);
  expect(KHUNG.filter((k) => k.ma).length).toBe(24);
  expect(KHUNG.filter((k) => !k.ma).length).toBe(KHUNG_PHU.length);
});

test("Luật 1 · ký hiệu kích thước: chỉ '×' (10×15), không bao giờ chữ 'x' giữa hai số", () => {
  const loi = quet(({ s }) => s.chu.filter((c) => KY_HIEU_X.test(c.t)).map((c) => `"${c.t}"`));
  expect(loi).toEqual([]);
  // Đo có chạm tới chỗ hiện kích thước (không xanh vì không thấy gì).
  const coKichThuoc = quet(({ s }) => (s.chu.some((c) => /\d×\d/.test(c.t)) ? ["có"] : []));
  expect(coKichThuoc.length, "quá ít khung hiện kích thước — phép đo không chạm tới chỗ cần canh").toBeGreaterThan(6);
});

test("Luật 2 · lề: điện thoại nội dung 24 px mọi màn, lưới ảnh 8 px (token riêng); máy tính trang 40 px", () => {
  const loiDt = quet(
    ({ s }) => {
      const ra: string[] = [];
      const lechTrai = s.khoi.filter((o) => o.left < LE_DT - 0.6);
      const lechPhai = s.khoi.filter((o) => o.right < LE_DT - 0.6);
      if (lechTrai.length) ra.push(`lệch trái < ${LE_DT}: ${JSON.stringify(lechTrai.slice(0, 4))}`);
      if (lechPhai.length) ra.push(`lệch phải < ${LE_DT}: ${JSON.stringify(lechPhai.slice(0, 4))}`);
      if (!s.khoi.some((o) => Math.abs(o.left - LE_DT) <= 0.6)) ra.push(`không khối nào đứng đúng lề ${LE_DT}`);
      // Lưới ảnh: lề riêng theo MỘT token (mép trong của khung lưới, hai bên).
      for (const o of s.luoi)
        if (Math.abs(o.left - LE_LUOI_DT) > 0.6 || Math.abs(o.right - LE_LUOI_DT) > 0.6)
          ra.push(`lưới ảnh lề ${o.left}/${o.right} ≠ ${LE_LUOI_DT}`);
      return ra;
    },
    (kh) => kh.kho === "dt",
  );
  const loiMt = quet(
    ({ s }) => {
      const ra: string[] = [];
      const lech = s.khoi.filter((o) => o.left < LE_MT - 0.6);
      if (lech.length) ra.push(`lệch trái < ${LE_MT}: ${JSON.stringify(lech.slice(0, 4))}`);
      for (const o of s.luoi) if (Math.abs(o.left - LE_MT) > 0.6) ra.push(`lưới ảnh lề ${o.left} ≠ ${LE_MT}`);
      return ra;
    },
    (kh) => kh.kho === "mt" && kh.laTrang,
  );
  expect([...loiDt, ...loiMt]).toEqual([]);
});

test("Luật 3 · hệ: một màu nút chính (mực, viên tròn), một kiểu tiêu đề, một thang chữ", () => {
  const loiNut = quet(({ s }) =>
    s.nut
      .filter((n) => n.bg !== MAU_NUT_CHINH || n.tronVien < 0.95)
      .map((n) => `nút đặc "${n.chu}" nền ${n.bg}, bo ${n.tronVien.toFixed(2)}`),
  );
  // Tiêu đề: cỡ ≥ 16 px là Playfair nét thường (300/400), không nghiêng; nhỏ hơn là nhãn viết HOA (eyebrow).
  const loiTieuDe = quet(({ s }) =>
    s.chu
      .filter((c) => c.tieuDe)
      .filter((c) =>
        c.px >= 16
          ? !/Playfair/i.test(c.ff) || c.fst !== "normal" || !["300", "400"].includes(c.fw)
          : c.tt !== "uppercase",
      )
      .map((c) => `tiêu đề "${c.t.slice(0, 30)}" ${c.ff.split(",")[0]} ${c.fw} ${c.fst} ${c.px}px ${c.tt}`),
  );
  const thang = new Set<number>(THANG_CHU);
  const loiThang = quet(({ s }) => {
    const le = [...new Set(s.chu.filter((c) => !thang.has(c.px)).map((c) => `${c.px}px "${c.t.slice(0, 24)}"`))];
    return le.length ? [`cỡ chữ ngoài thang: ${le.slice(0, 6).join(" | ")}`] : [];
  });
  expect([...loiNut, ...loiTieuDe, ...loiThang]).toEqual([]);
});

test("Luật 4 · lời: mọi câu ≤ 12 chữ, không lộ chữ nội bộ (hạn mức, suất, CSKH…)", () => {
  const loi = quet(({ s }) => {
    const ra: string[] = [];
    for (const doan of s.doan) {
      if (/^Fixture DANHGIA5/.test(doan)) continue; // tên dữ liệu mẫu (chi nhánh, khách)
      for (const c of cauQuaDai(doan)) ra.push(`câu dài: "${c}"`);
      ra.push(...chuNoiBo(doan));
    }
    return ra;
  });
  expect(loi).toEqual([]);
});

test("Luật 5 · tiền và giỏ: nhãn đúng trạng thái (chưa gửi = 'Trong giỏ'), tiền một định dạng 'N.NNN ₫'", () => {
  const loi = [
    ...quet(() => ["'Đã đặt mua' khi đơn chưa gửi"], (kh) => !kh.daGui && /Đã đặt mua/.test(kh.s.toanBo)),
    ...quet(() => ["'Trong giỏ' khi đơn đã gửi"], (kh) => kh.daGui && /Trong giỏ/.test(kh.s.toanBo)),
    ...quet(() => ["'Đang đặt' — nhãn giỏ phải là 'Trong giỏ'/'Đã đặt mua'"], (kh) => /Đang đặt/.test(kh.s.toanBo)),
    ...quet(() => ["cửa hàng sau khi thêm không ghi 'Trong giỏ'"], (kh) => kh.ma === "K06" && !kh.s.toanBo.includes("Trong giỏ")),
    ...quet(({ s }) => tienSaiDinhDang(s.toanBo).map((t) => `tiền sai định dạng "${t}"`)),
  ];
  expect(loi).toEqual([]);
  // K06: dòng giỏ và thông báo "Đã thêm vào giỏ" nói cùng một sự thật — giỏ đã có món vừa thêm.
  for (const k of ["dt", "mt"]) {
    const k6 = KHUNG.find((x) => x.khoa === `K06-${k}`);
    expect(k6, `K06-${k}: không đo được (xem ca "đã đi tới")`).toBeTruthy();
    const gio = /Giỏ · (\d+) món/i.exec(k6!.s.toanBo.replace(/\s+/g, " "));
    expect(gio, `K06-${k}: không thấy dòng "Giỏ · N món"`).not.toBeNull();
    expect(Number(gio![1]), `K06-${k}: giỏ chưa có 3 món vừa thêm (còn số cũ)`).toBeGreaterThanOrEqual(4);
  }
});

test("Luật 6 · tên bé: đúng tên ở mọi màn (họ tên đầy đủ khi không có biệt danh), không 'Bé Bé', không bị cắt", () => {
  const loi = quet((kh) => {
    const ra: string[] = [];
    if (kh.tenBe && !kh.s.toanBo.includes(kh.tenBe)) ra.push(`không thấy tên "${kh.tenBe}"`);
    if (/Bé Bé|bé Bé|bé bé/.test(kh.s.toanBo)) ra.push("lặp 'Bé Bé'");
    for (const c of kh.s.tenBiCat) ra.push(`tên bị cắt trong "${c}"`);
    return ra;
  });
  expect(loi).toEqual([]);
});
