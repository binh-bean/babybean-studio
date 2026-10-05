/**
 * BB-334A — phần thuần (không cơ sở dữ liệu): tên nhà, bước tiếp theo, đọc bộ
 * ảnh của lượt gọi, che mã /k/ trong nhật ký.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { tenNha } from "@/lib/gia-dinh/ten-nha";
import { buocTiepTheo } from "@/lib/gia-dinh/bo-anh-gia-dinh";
import { boAnhYeuCau, TIEU_DE_BO_ANH } from "@/lib/auth/phien-bo-anh";
import { cheMa } from "@/lib/lark/ghi-link-app";

describe("tenNha (anh chốt Q7 ★)", () => {
  it("một bé có biệt danh → 'Nhà bé Mít', tên ngắn giữ nguyên khi ≤ 12 ký tự", () => {
    expect(tenNha([{ nickname: "Mít", fullName: "Nguyễn Văn An" }])).toEqual({ tenNha: "Nhà bé Mít", tenNgan: "Nhà bé Mít" });
  });

  it("hai bé khác nhau → 'Bé Mít & Na'; trùng bé không đếm hai lần", () => {
    const kq = tenNha([
      { nickname: "Mít", fullName: null },
      { nickname: "Mít", fullName: null },
      { nickname: "Na", fullName: null },
    ]);
    expect(kq.tenNha).toBe("Bé Mít & Na");
    expect(kq.tenNgan).toBe("Bé Mít & Na");
  });

  it("tên dài quá 12 ký tự → dưới icon rơi về tên ngắn của bé mới nhất", () => {
    const kq = tenNha([{ nickname: null, fullName: "Trần Thị Bảo Ngọc" }]);
    expect(kq.tenNha.startsWith("Nhà bé ")).toBe(true);
    expect([...kq.tenNgan].length).toBeLessThanOrEqual(12);
    expect(kq.tenNgan.startsWith("Bé ")).toBe(true);
  });

  it("chưa có bé nào → 'Baby Bean'", () => {
    expect(tenNha([])).toEqual({ tenNha: "Baby Bean", tenNgan: "Baby Bean" });
    expect(tenNha([{ nickname: null, fullName: null }])).toEqual({ tenNha: "Baby Bean", tenNgan: "Baby Bean" });
  });
});

describe("buocTiepTheo", () => {
  it("bước khách 0 → chọn ảnh; đang khoá → nhắn Bean; chờ duyệt → duyệt; còn lại → xem", () => {
    expect(buocTiepTheo("in_review", 0, false)).toBe("chon_anh");
    expect(buocTiepTheo("in_review", 0, true)).toBe("nhan_bean");
    expect(buocTiepTheo("awaiting_approval", 3, false)).toBe("duyet_anh");
    expect(buocTiepTheo("delivered", 5, false)).toBe("xem_anh");
    expect(buocTiepTheo("submitted", 1, true)).toBe("xem_anh");
  });
});

describe("boAnhYeuCau", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  it("tiêu đề x-bb-bo thắng ?bo=", () => {
    const r = new Request(`http://x/api/g/gallery?bo=khac`, { headers: { [TIEU_DE_BO_ANH]: id } });
    expect(boAnhYeuCau(r)).toBe(id);
  });
  it("không có tiêu đề → ?bo=; không có gì → null; không có request → null", () => {
    expect(boAnhYeuCau(new Request(`http://x/api/g/photos?bo=${id}`))).toBe(id);
    expect(boAnhYeuCau(new Request(`http://x/api/g/photos`))).toBeNull();
    expect(boAnhYeuCau(undefined)).toBeNull();
  });
});

describe("cheMa", () => {
  it("che cả link gia đình /k/ lẫn link theo bộ /g/ — giữ 6 ký tự đầu", () => {
    const ma = "AbCdEf" + "x".repeat(37);
    expect(cheMa(`https://app/k/${ma}`)).toBe("https://app/k/AbCdEf…");
    expect(cheMa(`https://app/g/${ma}`)).toBe("https://app/g/AbCdEf…");
  });
});

describe("verify:db — kiem0090", () => {
  // Khách giả của pg: trả dòng theo đoạn SQL nhận ra được.
  const khach = (co: { cot?: boolean; chiMuc?: string[]; ham?: { anon: boolean; auth: boolean } | null; trg?: boolean }) => ({
    query: async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: co.cot ? [{}] : [] };
      if (sql.includes("pg_index"))
        return { rows: (co.chiMuc ?? []).map((ten) => ({ ten, bang: ten.includes("share") ? "share_links" : "galleries", duy_nhat: true })) };
      if (sql.includes("pg_proc")) return { rows: co.ham ? [co.ham] : [] };
      if (sql.includes("pg_trigger")) return { rows: co.trg ? [{}] : [] };
      return { rows: [] };
    },
  });

  it("chưa áp → ĐẠT 'chờ áp'; áp đủ + revoke → ĐẠT", async () => {
    const { kiem0090 } = await import("../../scripts/lib/kiem-cau-truc-day-moi.mjs");
    expect((await kiem0090({ client: khach({}) }))[0]!.pass).toBe(true);
    const du = await kiem0090({
      client: khach({ cot: true, chiMuc: ["uq_share_links_gia_dinh_song", "uq_galleries_so_thu_tu_khach"], ham: { anon: false, auth: false }, trg: true }),
    });
    expect(du[0]!.pass).toBe(true);
  });

  it("áp nửa vời (thiếu chỉ mục) hoặc hàm mở cho anon → ĐỎ", async () => {
    const { kiem0090 } = await import("../../scripts/lib/kiem-cau-truc-day-moi.mjs");
    expect((await kiem0090({ client: khach({ cot: true }) }))[0]!.pass).toBe(false);
    const mo = await kiem0090({
      client: khach({ cot: true, chiMuc: ["uq_share_links_gia_dinh_song", "uq_galleries_so_thu_tu_khach"], ham: { anon: true, auth: false }, trg: true }),
    });
    expect(mo[0]!.pass).toBe(false);
    expect(mo[0]!.detail).toContain("revoke");
  });
});
