/**
 * BB-351 — `pg` GIẢ cho phép thử hook Lark: một bảng `settings` trong bộ nhớ, đủ để
 * chạy đúng các câu hàng đợi của `src/lib/lark/hang-doi-hook.ts` (nhận theo nhãn
 * `/* hang_doi:… *\/` ở đầu câu) và khoá tư vấn. Không bao giờ chạm cơ sở dữ liệu thật:
 * hàng đợi thật `lark_hook_queue` trên bb-dev không bị đọc hay ghi.
 *
 * Dùng: `vi.mock("pg", async () => (await import("../helpers/pg-gia-hang-doi")).moduleGia);`
 */
export const khoGia = {
  settings: new Map<string, { record_ids?: string[]; so_lan_loi?: Record<string, number> }>(),
  khoaDangBan: false,
  lenh: [] as string[],
  datLai() {
    this.settings.clear();
    this.khoaDangBan = false;
    this.lenh = [];
  },
  hangDoi(khoa = "lark_hook_queue"): string[] {
    return [...(this.settings.get(khoa)?.record_ids ?? [])];
  },
  soLanLoi(khoa = "lark_hook_queue"): Record<string, number> {
    return { ...(this.settings.get(khoa)?.so_lan_loi ?? {}) };
  },
};

class Client {
  async connect() {}
  async end() {}
  async query(sql: string, args: unknown[] = []) {
    khoGia.lenh.push(sql.replace(/\s+/g, " ").trim().slice(0, 60));
    if (sql.includes("pg_try_advisory_lock")) {
      return { rows: [{ locked: !khoGia.khoaDangBan, ok: !khoGia.khoaDangBan }] };
    }
    if (sql.includes("pg_advisory_unlock")) return { rows: [{}] };
    const s = khoGia.settings;
    if (sql.includes("hang_doi:them")) {
      const [khoa, ids] = args as [string, string[]];
      const v = s.get(khoa) ?? {};
      const cu = v.record_ids ?? [];
      s.set(khoa, { ...v, record_ids: [...cu, ...ids.filter((i) => !cu.includes(i))] });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("hang_doi:doc")) {
      const [khoa] = args as [string];
      const v = s.get(khoa);
      return { rows: v ? [{ value: JSON.parse(JSON.stringify(v)) }] : [] };
    }
    if (sql.includes("hang_doi:xoa")) {
      const [khoa, ids] = args as [string, string[]];
      const v = s.get(khoa);
      if (!v) return { rows: [], rowCount: 0 };
      const loi = { ...(v.so_lan_loi ?? {}) };
      for (const i of ids) delete loi[i];
      s.set(khoa, { ...v, record_ids: (v.record_ids ?? []).filter((x) => !ids.includes(x)), so_lan_loi: loi });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("hang_doi:loi")) {
      const [khoa, json] = args as [string, string];
      const v = s.get(khoa);
      if (!v) return { rows: [], rowCount: 0 };
      s.set(khoa, { ...v, so_lan_loi: { ...(v.so_lan_loi ?? {}), ...(JSON.parse(json) as Record<string, number>) } });
      return { rows: [], rowCount: 1 };
    }
    // Câu ghi đè cả hàng đợi kiểu cũ (lỗi BB-351) — giả lập đúng để phép thử đỏ khi ai đó đưa lại.
    if (/update settings set value = '\{"record_ids": \[\]\}'/.test(sql)) {
      for (const [k, v] of s) s.set(k, { ...v, record_ids: [] });
      return { rows: [], rowCount: 1 };
    }
    if (/select value from settings where key = 'lark_hook_queue'/.test(sql)) {
      const v = s.get("lark_hook_queue");
      return { rows: v ? [{ value: v }] : [] };
    }
    return { rows: [], rowCount: 0 };
  }
}

export const moduleGia = { default: { Client }, Client };
