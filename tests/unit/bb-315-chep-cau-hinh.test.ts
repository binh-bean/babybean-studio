// BB-315 — logic thuần của chep-cau-hinh.mjs, kèm sửa lỗi theo soát của cố
// vấn CV-01 (scratchpad/co-van/4-soat-runbook.md): C2 (branches khớp theo
// id→code→name, không tự chèn), S2 (xác nhận webhook), S3 (loại khoá trạng
// thái đồng bộ), S5 (nắn role_id). Dữ liệu ở đây toàn BỊA (AGENTS.md §6) —
// không đọc/ghi cơ sở dữ liệu thật; phần "client pg giả" chỉ giả lập BIÊN
// GIỚI (query trả rows tự tạo), không giả lập logic của chep-cau-hinh.mjs.

import { describe, it, expect } from "vitest";
import {
  soSanhTheoKhoa,
  soSanhCotDonGian,
  khopBranch,
  soSanhBranch,
  banDoBranchDaKhopHet,
  xayBanDoVai,
  nanIdTheoBanDo,
  kiemTraBranchKhongConThemMoi,
  laKhoaTrangThaiDongBo,
  locBoKhoaTrangThai,
  dtSettingsCoDoiWebhook,
  taoMaXacNhanChep,
  kiemTraDichKhongPhaiBbDev,
  matKhauNgauNhienKhongLuu,
  cheBot,
  ghiGiaoDichBang,
} from "../../scripts/chep-cau-hinh.mjs";
import { MA_BB_DEV, MA_BB_PROD } from "../../scripts/lib/moi-truong.mjs";

type Dong = Record<string, unknown>;

describe("soSanhTheoKhoa — thêm / sửa / không đổi / chỉ-có-ở-đích (packages/roles/settings)", () => {
  const soSanh = soSanhCotDonGian(["ten", "gia"]);
  const khoaCode = (r: Dong) => r.code as string;

  it("dòng chỉ có ở nguồn -> themMoi, GIỮ nguyên id nguồn", () => {
    const nguon = [{ id: "n1", code: "A", ten: "Alpha", gia: 100 }];
    const { themMoi, capNhat, khongDoi, xoaODich } = soSanhTheoKhoa(nguon, [], khoaCode, soSanh);
    expect(themMoi).toEqual(nguon);
    expect(capNhat).toEqual([]);
    expect(khongDoi).toEqual([]);
    expect(xoaODich).toEqual([]);
  });

  it("dòng có ở cả hai, cột khác nhau -> capNhat, báo đúng cột đổi, GIỮ id đích", () => {
    const nguon = [{ id: "n1", code: "A", ten: "Alpha mới", gia: 100 }];
    const dich = [{ id: "d9", code: "A", ten: "Alpha cũ", gia: 100 }];
    const { capNhat } = soSanhTheoKhoa(nguon, dich, khoaCode, soSanh);
    expect(capNhat).toHaveLength(1);
    expect(capNhat[0].dich.id).toBe("d9");
    expect(capNhat[0].cotKhac).toEqual(["ten"]);
  });

  it("dòng khớp mọi cột -> khongDoi", () => {
    const nguon = [{ id: "n1", code: "A", ten: "Alpha", gia: 100 }];
    const dich = [{ id: "d9", code: "A", ten: "Alpha", gia: 100 }];
    const kq = soSanhTheoKhoa(nguon, dich, khoaCode, soSanh);
    expect(kq.khongDoi).toHaveLength(1);
    expect(kq.themMoi).toEqual([]);
    expect(kq.capNhat).toEqual([]);
  });

  it("dòng chỉ có ở đích -> xoaODich", () => {
    const dich = [{ id: "d9", code: "CU", ten: "Đã bỏ", gia: 0 }];
    const kq = soSanhTheoKhoa([], dich, khoaCode, soSanh);
    expect(kq.xoaODich).toEqual(dich);
    expect(kq.themMoi).toEqual([]);
  });
});

describe("khopBranch / soSanhBranch — LỖI CHẶN C2: khớp id → code → name, KHÔNG tự chèn", () => {
  it("khớp qua id trước tiên, dù code khác nhau (đúng ca gãy thật: seed.sql/seed-prod.sql dùng CHUNG uuid 1111… nhưng khác code)", () => {
    const nguon = [{ id: "1111-0000", code: "BB-Q1", name: "Pasteur" }];
    const dich = [{ id: "1111-0000", code: "BB-PT", name: "Pasteur (tên cũ)" }];
    const khop = khopBranch(nguon, dich);
    // Khớp được qua id -> KHÔNG rơi vào themMoi, KHÔNG có nguy cơ trùng khoá chính.
    expect(khop.get("1111-0000")).toEqual(dich[0]);
  });

  it("id KHÁC nhau nhưng code trùng -> khớp qua code", () => {
    const nguon = [{ id: "n1", code: "BB-Q1", name: "Chi nhánh Q1" }];
    const dich = [{ id: "d9", code: "BB-Q1", name: "Chi nhánh Quận 1" }];
    const khop = khopBranch(nguon, dich);
    expect(khop.get("n1")).toEqual(dich[0]);
  });

  it("id và code đều khác, nhưng name trùng -> khớp qua name (khoá cuối cùng)", () => {
    const nguon = [{ id: "n1", code: "BB-NEW", name: "Thảo Điền" }];
    const dich = [{ id: "d9", code: "BB-TD", name: "Thảo Điền" }];
    const khop = khopBranch(nguon, dich);
    expect(khop.get("n1")).toEqual(dich[0]);
  });

  it("không khớp được qua bất kỳ khoá nào -> null (chi nhánh THẬT SỰ mới)", () => {
    const nguon = [{ id: "n1", code: "BB-MOI", name: "Chi nhánh mới" }];
    const dich = [{ id: "d9", code: "BB-KHAC", name: "Khác hẳn" }];
    const khop = khopBranch(nguon, dich);
    expect(khop.get("n1")).toBeNull();
  });

  it("soSanhBranch: dòng không khớp rơi vào themMoi — KHÔNG có nhánh insert riêng trong diff", () => {
    const nguon = [{ id: "n1", code: "BB-MOI", name: "Chi nhánh mới", extra: 1 }];
    const dich: Dong[] = [];
    const soSanh = soSanhCotDonGian(["extra"]);
    const kq = soSanhBranch(nguon, dich, soSanh);
    expect(kq.themMoi).toEqual(nguon);
    expect(kq.capNhat).toEqual([]);
  });

  it("soSanhBranch: khớp qua id (code khác) -> capNhat, GIỮ id đích, báo cột code đổi", () => {
    const nguon = [{ id: "1111-0000", code: "BB-Q1", name: "Pasteur" }];
    const dich = [{ id: "1111-0000", code: "BB-PT", name: "Pasteur" }];
    const soSanh = soSanhCotDonGian(["code", "name"]);
    const kq = soSanhBranch(nguon, dich, soSanh);
    expect(kq.themMoi).toEqual([]);
    expect(kq.capNhat).toHaveLength(1);
    expect(kq.capNhat[0].dich.id).toBe("1111-0000");
    expect(kq.capNhat[0].cotKhac).toContain("code");
  });
});

describe("banDoBranchDaKhopHet — trả null khi còn dòng chưa khớp (tín hiệu 'đừng dùng bản đồ này')", () => {
  it("mọi dòng đều khớp -> trả bản đồ đầy đủ", () => {
    const nguon = [{ id: "n1", code: "A", name: "A" }];
    const dich = [{ id: "d9", code: "A", name: "A" }];
    const banDo = banDoBranchDaKhopHet(nguon, dich);
    expect(banDo?.get("n1")).toBe("d9");
  });

  it("còn dòng KHÔNG khớp -> trả null, không trả bản đồ thiếu", () => {
    const nguon = [{ id: "n1", code: "A", name: "A" }, { id: "n2", code: "LA", name: "Lạ" }];
    const dich = [{ id: "d9", code: "A", name: "A" }];
    expect(banDoBranchDaKhopHet(nguon, dich)).toBeNull();
  });
});

describe("kiemTraBranchKhongConThemMoi — LỖI CHẶN C2: từ chối --ghi khi còn branches chưa khớp", () => {
  it("themMoi rỗng -> cho phép", () => {
    const kt = kiemTraBranchKhongConThemMoi({ themMoi: [], capNhat: [], khongDoi: [], xoaODich: [] });
    expect(kt.choPhep).toBe(true);
  });

  it("còn themMoi -> TỪ CHỐI, liệt kê đúng id + code", () => {
    const kt = kiemTraBranchKhongConThemMoi({
      themMoi: [{ id: "n1", code: "BB-MOI" }],
      capNhat: [],
      khongDoi: [],
      xoaODich: [],
    });
    expect(kt.choPhep).toBe(false);
    expect(kt.ly_do).toMatch(/BB-MOI/);
    expect(kt.ly_do).toMatch(/không tự chèn/i);
  });
});

describe("xayBanDoVai / nanIdTheoBanDo — S5: nắn role_id, không như branches (roles ĐƯỢC phép chèn bằng id nguồn)", () => {
  it("vai đã có ở đích (khớp tên) -> bản đồ trỏ về id ĐÍCH", () => {
    const nguon = [{ id: "n-vai", name: "Điều phối ảnh" }];
    const dich = [{ id: "d-vai", name: "Điều phối ảnh" }];
    const banDo = xayBanDoVai(nguon, dich);
    expect(nanIdTheoBanDo(banDo, "n-vai")).toBe("d-vai");
  });

  it("vai CHƯA có ở đích -> bản đồ trỏ về CHÍNH id nguồn (roles được phép chèn, khác branches)", () => {
    const nguon = [{ id: "n-vai-moi", name: "Vai chưa có ở đích" }];
    const banDo = xayBanDoVai(nguon, []);
    expect(nanIdTheoBanDo(banDo, "n-vai-moi")).toBe("n-vai-moi");
  });

  it("role_id null (chưa gán vai) -> giữ null", () => {
    const banDo = xayBanDoVai([], []);
    expect(nanIdTheoBanDo(banDo, null)).toBeNull();
  });

  it("ĐÚNG ca lỗi S5: role_id trỏ vào một vai đã tồn tại ở đích với id KHÁC -> phải nắn, không được giữ nguyên id nguồn", () => {
    // Đây là kịch bản gãy thật: staff_profiles.role_id (nguồn) = n-vai, vai
    // "Điều phối ảnh" đã có sẵn ở đích với id d-vai — nếu ghi thẳng role_id
    // nguồn thì staff_profiles.role_id trỏ vào MỘT HÀNG KHÔNG TỒN TẠI ở đích.
    const nguon = [{ id: "n-vai", name: "Điều phối ảnh" }];
    const dich = [{ id: "d-vai", name: "Điều phối ảnh" }];
    const banDo = xayBanDoVai(nguon, dich);
    const roleIdSauKhiNan = nanIdTheoBanDo(banDo, "n-vai");
    expect(roleIdSauKhiNan).toBe("d-vai");
    expect(roleIdSauKhiNan).not.toBe("n-vai"); // KHÔNG được giữ nguyên id nguồn
  });
});

describe("laKhoaTrangThaiDongBo / locBoKhoaTrangThai — S3: không chép khoá TRẠNG THÁI", () => {
  it("lark_hook_queue và lark_retouch_last_sync bị loại", () => {
    expect(laKhoaTrangThaiDongBo("lark_hook_queue")).toBe(true);
    expect(laKhoaTrangThaiDongBo("lark_retouch_last_sync")).toBe(true);
  });

  it("khoá kết thúc bằng _last_sync hoặc _cursor (phòng khoá tương lai cùng kiểu) bị loại", () => {
    expect(laKhoaTrangThaiDongBo("drive_photos_last_sync")).toBe(true);
    expect(laKhoaTrangThaiDongBo("sync_cursor")).toBe(true);
  });

  it("khoá CẤU HÌNH bình thường không bị loại", () => {
    expect(laKhoaTrangThaiDongBo("chat.page_url")).toBe(false);
    expect(laKhoaTrangThaiDongBo("lark.webhook_url")).toBe(false);
    expect(laKhoaTrangThaiDongBo("gallery.link_ttl_days")).toBe(false);
  });

  it("locBoKhoaTrangThai lọc đúng, giữ nguyên thứ tự các dòng còn lại", () => {
    const hang = [
      { key: "chat.page_url", value: "x" },
      { key: "lark_retouch_last_sync", value: "2026-09-01" },
      { key: "lark.webhook_url", value: "y" },
      { key: "lark_hook_queue", value: {} },
    ];
    expect(locBoKhoaTrangThai(hang).map((h: Dong) => h.key)).toEqual(["chat.page_url", "lark.webhook_url"]);
  });
});

describe("dtSettingsCoDoiWebhook — S2: phát hiện đúng lúc phần chép đụng lark.webhook_url", () => {
  it("webhook nằm trong themMoi -> true", () => {
    const dt = { themMoi: [{ key: "lark.webhook_url", value: "x" }], capNhat: [], khongDoi: [], xoaODich: [] };
    expect(dtSettingsCoDoiWebhook(dt)).toBe(true);
  });

  it("webhook nằm trong capNhat -> true", () => {
    const dt = {
      themMoi: [],
      capNhat: [{ nguon: { key: "lark.webhook_url", value: "x" }, dich: {}, cotKhac: ["value"] }],
      khongDoi: [],
      xoaODich: [],
    };
    expect(dtSettingsCoDoiWebhook(dt)).toBe(true);
  });

  it("không đụng webhook -> false", () => {
    const dt = { themMoi: [{ key: "chat.page_url", value: "x" }], capNhat: [], khongDoi: [], xoaODich: [] };
    expect(dtSettingsCoDoiWebhook(dt)).toBe(false);
  });
});

describe("cheBot — không bao giờ in giá trị bí mật nguyên văn", () => {
  it("chuỗi dài -> giữ đầu/đuôi, che ruột", () => {
    const s = cheBot("https://open.larksuite.com/webhook/abc123def456");
    expect(s).not.toContain("abc123def456");
    expect(s).toContain("••••");
  });

  it("rỗng -> báo '(rỗng)', không phải chuỗi che", () => {
    expect(cheBot("")).toBe("(rỗng)");
  });
});

describe("taoMaXacNhanChep — mã đổi khi số dòng sẽ ghi đổi", () => {
  it("cùng tổng kết, cùng ngày -> cùng mã", () => {
    const tk = { branches: { themMoi: 1, capNhat: 0 } };
    expect(taoMaXacNhanChep(tk, "2026-09-28")).toBe(taoMaXacNhanChep(tk, "2026-09-28"));
  });

  it("số dòng đổi -> mã đổi", () => {
    const ma1 = taoMaXacNhanChep({ branches: { themMoi: 1, capNhat: 0 } }, "2026-09-28");
    const ma2 = taoMaXacNhanChep({ branches: { themMoi: 2, capNhat: 0 } }, "2026-09-28");
    expect(ma1).not.toBe(ma2);
  });
});

describe("kiemTraDichKhongPhaiBbDev", () => {
  it("từ chối khi đích là bb-dev", () => {
    const url = `postgresql://postgres.${MA_BB_DEV}:x@aws.pooler.supabase.com/postgres`;
    const kt = kiemTraDichKhongPhaiBbDev(url);
    expect(kt.choPhep).toBe(false);
    expect(kt.ly_do).toMatch(/bb-dev/);
  });

  it("cho phép khi đích là bb-prod", () => {
    const url = `postgresql://postgres.${MA_BB_PROD}:x@aws.pooler.supabase.com/postgres`;
    expect(kiemTraDichKhongPhaiBbDev(url).choPhep).toBe(true);
  });
});

describe("matKhauNgauNhienKhongLuu", () => {
  it("đủ dài, khác nhau mỗi lần gọi, không toàn chữ số", () => {
    const a = matKhauNgauNhienKhongLuu();
    const b = matKhauNgauNhienKhongLuu();
    expect(a.length).toBeGreaterThanOrEqual(10);
    expect(a).not.toBe(b);
    expect(/^\d+$/.test(a)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ghiGiaoDichBang — client pg GIẢ (C2): kiểm giao dịch thật sự bọc begin/
// commit/rollback, và branches KHÔNG BAO GIỜ insert dù được đưa themMoi.
// ---------------------------------------------------------------------------
function taoClientGia(banDauODich: Record<string, Dong[]> = {}) {
  const bang: Record<string, Dong[]> = JSON.parse(JSON.stringify(banDauODich));
  const lenhDaGoi: string[] = [];
  const goiChiTiet: Array<{ sql: string; params: unknown[] }> = [];
  let goiLoi: ((sql: string) => boolean) | null = null;
  return {
    lenhDaGoi,
    goiChiTiet,
    guiLoiKhi(khop: (sql: string) => boolean) {
      goiLoi = khop;
    },
    async query(sql: string, params: unknown[] = []) {
      const dongDau = sql.trim().split("\n")[0]!.trim();
      lenhDaGoi.push(dongDau);
      goiChiTiet.push({ sql, params });
      if (goiLoi?.(sql)) throw new Error("giả lập lỗi Postgres");
      if (/^begin$|^commit$|^rollback$/i.test(dongDau)) {
        return { rows: [] };
      }
      const mBang = /(?:from|into|update)\s+"?([a-z_]+)"?/i.exec(sql);
      const ten = mBang?.[1] ?? "?";
      bang[ten] ??= [];
      if (/^select id from/i.test(sql)) {
        // Giả định khớp theo "id" đã có trong params cuối hoặc theo khoá code/key/name đầu tiên
        // — đơn giản: coi như KHÔNG có dòng nào trùng, trừ khi bảng đã seed sẵn dòng cùng "khoá" ở tham số đầu.
        const trung = bang[ten].find((r) => Object.values(r).includes(params[0]));
        return { rows: trung ? [{ id: trung.id }] : [] };
      }
      if (/^insert into/i.test(sql)) {
        return { rows: [] };
      }
      if (/^update/i.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

const dtRong = { themMoi: [], capNhat: [], khongDoi: [], xoaODich: [] };

describe("ghiGiaoDichBang — client pg GIẢ, kiểm giao dịch (lỗi chặn C2)", () => {
  it("begin ... commit đúng thứ tự khi mọi việc suôn sẻ", async () => {
    const client = taoClientGia();
    await ghiGiaoDichBang(client as never, {
      dtBranches: dtRong,
      dtPackages: dtRong,
      dtRoles: dtRong,
      dtSettings: dtRong,
      staffDaCo: [],
      banDoVai: new Map(),
    });
    expect(client.lenhDaGoi[0]).toBe("begin");
    expect(client.lenhDaGoi[client.lenhDaGoi.length - 1]).toBe("commit");
  });

  it("branches CHỈ NHẬN capNhat — dù bị đưa themMoi (gọi sai), KHÔNG BAO GIỜ insert vào branches", async () => {
    const client = taoClientGia();
    await ghiGiaoDichBang(client as never, {
      dtBranches: { themMoi: [{ id: "n1", code: "BB-MOI" }], capNhat: [], khongDoi: [], xoaODich: [] },
      dtPackages: dtRong,
      dtRoles: dtRong,
      dtSettings: dtRong,
      staffDaCo: [],
      banDoVai: new Map(),
    });
    const coInsertBranches = client.lenhDaGoi.some((l) => /insert into "?branches/i.test(l));
    expect(coInsertBranches).toBe(false);
  });

  it("branches capNhat -> chỉ update, không insert", async () => {
    const client = taoClientGia({ branches: [{ id: "d9", code: "A" }] });
    await ghiGiaoDichBang(client as never, {
      dtBranches: {
        themMoi: [],
        capNhat: [{ nguon: { code: "A", name: "Tên mới", address: null, hotline: null, zalo_oa: null, logo_url: null, timezone: "Asia/Ho_Chi_Minh", is_active: true, settings: {} }, dich: { id: "d9" }, cotKhac: ["name"] }],
        khongDoi: [],
        xoaODich: [],
      },
      dtPackages: dtRong,
      dtRoles: dtRong,
      dtSettings: dtRong,
      staffDaCo: [],
      banDoVai: new Map(),
    });
    expect(client.lenhDaGoi.some((l) => /^update "?branches/i.test(l))).toBe(true);
    expect(client.lenhDaGoi.some((l) => /^insert into "?branches/i.test(l))).toBe(false);
  });

  it("ĐÚNG ca lỗi chặn còn lại (cố vấn CV-01, lượt 3): cùng id, KHÁC code -> chỉ UPDATE theo id đích, KHÔNG insert, KHÔNG tra lại theo code nguồn", async () => {
    // Đúng ca gãy thật: seed.sql (bb-dev) và seed-prod.sql (bb-prod) dùng
    // CHUNG uuid 1111-0000 cho chi nhánh đầu tiên, nhưng code khác nhau
    // (BB-Q1 ở bb-dev, BB-PT ở bb-prod). khopBranch khớp qua id -> capNhat.
    // Bản trước ghi bằng upsertTheoKhoa(["code"], [nguồn.code]) — tra
    // `where code = 'BB-Q1'` ở đích KHÔNG ra dòng nào (đích đang là BB-PT) ->
    // rơi vào nhánh insert(id=1111-0000) -> trùng khoá chính.
    const client = taoClientGia({ branches: [{ id: "1111-0000", code: "BB-PT" }] });
    await ghiGiaoDichBang(client as never, {
      dtBranches: {
        themMoi: [],
        capNhat: [
          {
            nguon: {
              code: "BB-Q1",
              name: "Pasteur",
              address: null,
              hotline: null,
              zalo_oa: null,
              logo_url: null,
              timezone: "Asia/Ho_Chi_Minh",
              is_active: true,
              settings: {},
            },
            dich: { id: "1111-0000", code: "BB-PT" },
            cotKhac: ["code"],
          },
        ],
        khongDoi: [],
        xoaODich: [],
      },
      dtPackages: dtRong,
      dtRoles: dtRong,
      dtSettings: dtRong,
      staffDaCo: [],
      banDoVai: new Map(),
    });
    const coInsert = client.lenhDaGoi.some((l) => /^insert into "?branches/i.test(l));
    expect(coInsert).toBe(false);
    const goiUpdate = client.goiChiTiet.find((g) => /^update "?branches/i.test(g.sql.trim()));
    expect(goiUpdate).toBeDefined();
    // Tham số CUỐI của update phải là id ĐÍCH (1111-0000), không phải đi tra
    // lại theo code nguồn (BB-Q1) — đó chính là điều đã gãy.
    expect(goiUpdate!.params[goiUpdate!.params.length - 1]).toBe("1111-0000");
  });

  it("lỗi giữa chừng -> rollback, KHÔNG commit (một giao dịch cho toàn bộ phần ghi bảng)", async () => {
    const client = taoClientGia();
    client.guiLoiKhi((sql) => /^insert into "?packages/i.test(sql.trim()));
    await expect(
      ghiGiaoDichBang(client as never, {
        dtBranches: dtRong,
        dtPackages: { themMoi: [{ id: "p1", branch_id: null, code: "GOI1", name: "x", description: null, price: 0, included_quota: null, extra_photo_price: 0, printed_photo_count: 0, is_active: true }], capNhat: [], khongDoi: [], xoaODich: [] },
        dtRoles: dtRong,
        dtSettings: dtRong,
        staffDaCo: [],
        banDoVai: new Map(),
      }),
    ).rejects.toThrow("giả lập lỗi Postgres");
    expect(client.lenhDaGoi).toContain("rollback");
    expect(client.lenhDaGoi).not.toContain("commit");
  });

  it("staffDaCo: role_id được NẮN qua banDoVai trước khi update, không ghi thẳng id nguồn (S5)", async () => {
    const client = taoClientGia();
    const banDoVai = new Map([["n-vai", "d-vai"]]);
    await ghiGiaoDichBang(client as never, {
      dtBranches: dtRong,
      dtPackages: dtRong,
      dtRoles: dtRong,
      dtSettings: dtRong,
      staffDaCo: [{ id: "s1", full_name: "X", phone: null, role: "cs", role_id: "n-vai", is_active: true }],
      banDoVai,
    });
    const goiUpdateStaff = client.goiChiTiet.find((g) => /^update staff_profiles/i.test(g.sql.trim()));
    expect(goiUpdateStaff).toBeDefined();
    // update staff_profiles set full_name=$2, phone=$3, role=$4, role_id=$5, is_active=$6 where id=$1
    // -> params[4] là role_id ĐÃ NẮN. Phải là "d-vai" (id đích), KHÔNG phải "n-vai" (id nguồn).
    expect(goiUpdateStaff!.params[4]).toBe("d-vai");
    expect(goiUpdateStaff!.params[4]).not.toBe("n-vai");
  });
});
