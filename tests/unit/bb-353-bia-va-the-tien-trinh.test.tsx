/**
 * BB-353 (P0) — người chấm vòng 7 (V7-K09b/K09c): ngay sau khi ba mẹ chốt, bìa
 * ghi "Studio đang chỉnh ảnh của Bé Bơ." trong khi thẻ tiến trình CÙNG trang
 * ghi "Đang chờ studio xác nhận". Các khối từng tự suy nhãn riêng.
 *
 * Phép thử dựng THẬT năm chỗ khách thấy trạng thái (`renderToStaticMarkup`,
 * không giả lập hook — AGENTS.md §5a): bìa, thẻ tiến trình, dải khoá đầu lưới,
 * màn cảm ơn sau chốt, bìa của người thân được mời — rồi đi qua MỌI trạng thái
 * (status × giai đoạn Lark) và đòi cả năm chỗ nói cùng một dòng của bảng
 * `TRANG_THAI_BO_ANH`. Một khối tự viết câu riêng (như bìa trước BB-353) là đỏ.
 *
 * Dữ liệu giả hoàn toàn (tên bé "Bé Fixture").
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BiaBoAnh } from "@/components/features/gallery/bia-bo-anh";
import { TheHanhTrinh } from "@/components/features/gallery/the-hanh-trinh";
import { DaiKhoaTrangThai } from "@/components/features/gallery/dai-khoa-trang-thai";
import { CamOnSauChot } from "@/components/features/gallery/cam-on-sau-chot";
import { TRANG_THAI_BO_ANH, TAM_KHOA_KHACH, trangThaiVuaChot } from "@/lib/lark/trang-thai-app-lark";

const TEN_BE = "Bé Fixture";

function giaiMa(html: string): string {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    // BB-358 — "ạ" gắn vào chữ trước bằng khoảng trắng không ngắt (`giuA`); so chữ như người đọc thấy.
    .replace(/ /g, " ")
    .trim();
}

function theoTestId(html: string, id: string, the = "p"): string {
  const m = html.match(new RegExp(`data-testid="${id}"[^>]*>([\\s\\S]*?)</${the}>`));
  expect(m, `thiếu khối ${id}`).not.toBeNull();
  return giaiMa(m![1]!);
}

function cauBia(status: string, giaiDoan: number | null, laNguoiXem = false): string {
  const html = renderToStaticMarkup(
    <BiaBoAnh
      anhBia={null}
      coverHeadline={null}
      tenBe={TEN_BE}
      ngayChup={null}
      chiNhanh="Chi nhánh Fixture"
      loiChao="Lời chào Fixture studio tự soạn"
      soAnh={40}
      hanMuc={20}
      daChon={20}
      hanChot={null}
      khoa
      trangThai={status}
      giaiDoanTienDo={giaiDoan}
      laNguoiXem={laNguoiXem}
      onBatDau={() => {}}
    />,
  );
  return theoTestId(html, "bia-loi-chao");
}

function theTienTrinh(status: string, giaiDoan: number | null): { tieuDe: string; buoc: string } | null {
  const html = renderToStaticMarkup(
    <TheHanhTrinh status={status} giaiDoan={giaiDoan} photoCount={40} nhanTienDo={null} />,
  );
  if (!html) return null;
  const h3 = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
  const buoc = html.match(/aria-current="step"[^>]*>([\s\S]*?)<\/span>/);
  return { tieuDe: giaiMa(h3![1]!), buoc: buoc ? giaiMa(buoc[1]!).replace(/\s+/g, " ") : "" };
}

function daiKhoa(status: string, giaiDoan: number | null): string {
  const html = renderToStaticMarkup(
    <DaiKhoaTrangThai status={status} giaiDoan={giaiDoan} daChotChoXacNhan={status === "submitted"} />,
  );
  return theoTestId(html, "dai-khoa-nhan");
}

function camOn(status: string, giaiDoan: number | null): string {
  const html = renderToStaticMarkup(
    <CamOnSauChot
      tenBe={TEN_BE}
      trangThai={status}
      giaiDoan={giaiDoan}
      chotLuc={new Date("2026-10-01T03:00:00Z")}
      soTamDaChon={20}
      hanMuc={20}
      coBia={null}
      soMonMuaThem={0}
      tienMuaThem={0}
      onXemTienDo={() => {}}
    />,
  );
  return theoTestId(html, "cam-on-trang-thai", "h1");
}

const DONG = [...Object.values(TRANG_THAI_BO_ANH), TAM_KHOA_KHACH];
const biaCua = (khach: string) =>
  DONG.filter((d) => d.khach === khach).map((d) => d.bia.replace("{be}", TEN_BE));

const STATUS = ["ready", "in_review", "submitted", "in_retouch", "awaiting_approval", "approved"];
const GIAI_DOAN: (number | null)[] = [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

describe("BB-353 — mọi chỗ khách thấy trạng thái nói CÙNG một nhãn", () => {
  it("ca người chấm bắt: vừa chốt → cả năm chỗ nói Bean đang xác nhận, không chỗ nào nói 'đang chỉnh'", () => {
    const the = theTienTrinh("submitted", null)!;
    expect(the.buoc).toBe("Chờ xác nhận");
    expect(the.tieuDe).toBe("Bean đang xác nhận danh sách ảnh ạ");
    expect(cauBia("submitted", null)).toBe(`Bean đang xác nhận danh sách ảnh của ${TEN_BE} ạ.`);
    expect(daiKhoa("submitted", null)).toBe(the.tieuDe);
    expect(camOn("submitted", null)).toBe(cauBia("submitted", null));
    for (const c of [the.tieuDe, cauBia("submitted", null), daiKhoa("submitted", null), camOn("submitted", null)]) {
      expect(c).not.toMatch(/đang chỉnh|studio/i);
    }
  });

  for (const status of STATUS) {
    for (const gd of GIAI_DOAN) {
      it(`${status} · giai đoạn ${gd ?? "—"}: bìa = dải khoá = cảm ơn = người thân = thẻ tiến trình`, () => {
        const nhanDai = daiKhoa(status, gd);
        const bia = cauBia(status, gd);
        // Dải khoá là nhãn gốc; bìa phải là câu bìa của CÙNG dòng đó.
        expect(biaCua(nhanDai), `dải khoá "${nhanDai}" không thuộc bảng chung`).not.toEqual([]);
        expect(biaCua(nhanDai), `bìa "${bia}" lệch dải khoá "${nhanDai}"`).toContain(bia);
        // Màn cảm ơn hiện ngay sau khi gửi: trạng thái còn ở bước chọn thì là "vừa chốt".
        expect(camOn(status, gd), "màn cảm ơn lệch bìa").toBe(cauBia(trangThaiVuaChot(status), gd));
        expect(camOn(status, gd), "màn cảm ơn không được nói tạm khoá").not.toMatch(/tạm khoá/);
        expect(cauBia(status, gd, true), "bìa người thân (đã khoá) lệch bìa ba mẹ").toBe(bia);
        const the = theTienTrinh(status, gd);
        if (the) expect(the.tieuDe, "thẻ tiến trình lệch dải khoá").toBe(nhanDai);
      });
    }
  }

  it("đang chỉnh thật (Lark Đang làm) → nói đang chỉnh; còn xếp hàng → KHÔNG nói đang chỉnh", () => {
    expect(cauBia("in_retouch", 3)).toBe(`Bean đang chỉnh ảnh của ${TEN_BE} ạ.`);
    expect(cauBia("in_retouch", null)).not.toMatch(/đang chỉnh/i);
    expect(cauBia("in_retouch", 2)).not.toMatch(/đang chỉnh/i);
  });

  it("màn cảm ơn ngay sau chốt (bộ ảnh trên máy còn 'ready') → Bean đang xác nhận", () => {
    expect(camOn("ready", null)).toBe(`Bean đang xác nhận danh sách ảnh của ${TEN_BE} ạ.`);
  });

  it("khoá khi còn ở bước chọn (quá hạn 60 ngày) → nói tạm khoá, không mời chọn tiếp", () => {
    expect(cauBia("ready", null)).toMatch(/tạm khoá/);
    expect(daiKhoa("ready", 1)).toMatch(/tạm khoá/);
  });
});
