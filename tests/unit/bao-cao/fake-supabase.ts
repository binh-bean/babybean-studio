/**
 * BB-380 — máy khách Supabase GIẢ, chạy trong bộ nhớ, đủ các phép lọc mà bộ báo cáo
 * điều hành dùng. Giả lập BIÊN GIỚI ra ngoài (cơ sở dữ liệu), không giả lập ruột báo
 * cáo — báo cáo chạy thật trên các dòng này. Bảng không khai = rỗng.
 *
 * Embed (vd `galleries!inner(...)`) không suy từ chuỗi select: dòng thử tự mang sẵn
 * đối tượng lồng (vd `galleries: {...}`).
 */
type Dong = Record<string, unknown>;

function soSanh(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function ilike(gia: unknown, mau: string): boolean {
  const re = new RegExp("^" + mau.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i");
  return re.test(String(gia ?? ""));
}

class TruyVan implements PromiseLike<{ data: unknown; error: null; count: number | null }> {
  private loc: ((d: Dong) => boolean)[] = [];
  private dem = false;
  private chiDau = false;
  private gioiHan: number | null = null;
  private sap: { cot: string; tang: boolean } | null = null;
  private motDong = false;
  constructor(private dong: Dong[]) {}
  select(_cot?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.dem = true;
    if (opts?.head) this.chiDau = true;
    return this;
  }
  eq(c: string, v: unknown) { this.loc.push((d) => d[c] === v); return this; }
  neq(c: string, v: unknown) { this.loc.push((d) => d[c] !== v); return this; }
  gt(c: string, v: unknown) { this.loc.push((d) => d[c] != null && soSanh(d[c], v) > 0); return this; }
  gte(c: string, v: unknown) { this.loc.push((d) => d[c] != null && soSanh(d[c], v) >= 0); return this; }
  lt(c: string, v: unknown) { this.loc.push((d) => d[c] != null && soSanh(d[c], v) < 0); return this; }
  is(c: string, v: unknown) { this.loc.push((d) => (d[c] ?? null) === v); return this; }
  in(c: string, vs: unknown[]) { this.loc.push((d) => vs.includes(d[c])); return this; }
  like(c: string, mau: string) { this.loc.push((d) => ilike(d[c], mau)); return this; }
  not(c: string, op: string, v: unknown) {
    if (op === "ilike") this.loc.push((d) => !ilike(d[c], String(v)));
    else if (op === "is") this.loc.push((d) => (d[c] ?? null) !== v);
    else if (op === "in") {
      const ds = String(v).replace(/[()]/g, "").split(",");
      this.loc.push((d) => !ds.includes(String(d[c])));
    } else throw new Error(`fake: not ${op} chưa hỗ trợ`);
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) { this.sap = { cot: c, tang: o?.ascending !== false }; return this; }
  limit(n: number) { this.gioiHan = n; return this; }
  maybeSingle() { this.motDong = true; return this; }
  single() { this.motDong = true; return this; }
  private chay() {
    let ra = this.dong.filter((d) => this.loc.every((f) => f(d)));
    if (this.sap) {
      const { cot, tang } = this.sap;
      ra = [...ra].sort((a, b) => (tang ? 1 : -1) * soSanh(a[cot], b[cot]));
    }
    const count = ra.length;
    if (this.gioiHan !== null) ra = ra.slice(0, this.gioiHan);
    const data = this.chiDau ? null : this.motDong ? (ra[0] ?? null) : ra;
    return { data, error: null, count: this.dem ? count : null };
  }
  then<A, B>(ok?: ((v: { data: unknown; error: null; count: number | null }) => A | PromiseLike<A>) | null, loi?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.chay()).then(ok, loi);
  }
}

export interface FakeSupabase {
  from(bang: string): TruyVan;
  /** Dòng đã `insert` theo bảng — để phép thử đọc lại. */
  daChen: Record<string, Dong[]>;
}

export function taoFakeSupabase(bang: Record<string, Dong[]>): FakeSupabase {
  const daChen: Record<string, Dong[]> = {};
  return {
    daChen,
    from(ten: string) {
      const dong = bang[ten] ?? (bang[ten] = []);
      const q = new TruyVan(dong) as TruyVan & { insert: (v: Dong | Dong[]) => Promise<{ error: null }> };
      q.insert = async (v) => {
        const ds = Array.isArray(v) ? v : [v];
        for (const d of ds) dong.push({ created_at: new Date().toISOString(), ...d });
        (daChen[ten] ??= []).push(...ds);
        return { error: null };
      };
      return q;
    },
  };
}
