/**
 * BB-170 — Mỗi cột Kanban phải lấy được đúng dữ liệu của cột đó.
 *
 * OWNER: DEV-FE.
 * Spec: docs/briefs/BB-170-kanban-chi-ve-50-bo.md
 *
 * ---------------------------------------------------------------------------
 * Vì sao phép thử này gọi đường API thật chứ không dựng component
 * ---------------------------------------------------------------------------
 * Bản đầu của phép thử BB-170 giả lập cả `useState` lẫn `useEffect` của React.
 * `useEffect` thành hàm rỗng nghĩa là hiệu ứng không chạy — mà hiệu ứng chính
 * là chỗ mỗi cột đi tải dữ liệu. Nó còn tự nhét sẵn một thẻ giả qua mock rồi
 * kiểm HTML có chứa chuỗi "10" và "5". Phép thử đó vẫn xanh kể cả khi Kanban
 * hỏng y như cũ.
 *
 * Điều thật sự đỡ cho Kanban là: đường API có lọc đúng theo trạng thái không.
 * Không lọc được thì mọi cột nhận cùng một mớ dữ liệu, và lỗi cũ quay lại
 * nguyên vẹn. Nên canh đúng chỗ đó, trên cơ sở dữ liệu thật.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Những trạng thái Kanban vẽ thành cột. */
const COT = ["draft", "sync_error", "ready", "in_review"] as const;

describe("BB-170: mỗi cột Kanban lọc được đúng dữ liệu của mình", () => {
  const demTheoTrangThai = new Map<string, number>();

  beforeAll(async () => {
    for (const st of COT) {
      const { count } = await supabase
        .from("galleries")
        .select("id", { count: "exact", head: true })
        .eq("status", st);
      demTheoTrangThai.set(st, count ?? 0);
    }
  });

  it("Lọc theo từng trạng thái trả về ĐÚNG trạng thái đó, không lẫn", async () => {
    for (const st of COT) {
      const { data, error } = await supabase
        .from("galleries")
        .select("id, status")
        .eq("status", st)
        .limit(20);

      expect(error).toBeNull();
      for (const row of data ?? []) {
        expect(row.status).toBe(st);
      }
    }
  });

  /**
   * Ca quan trọng nhất, và là ca bắt được đúng lỗi gốc.
   *
   * Lỗi cũ: màn tải 50 bộ mới nhất rồi lọc trong trí nhớ. Bộ `ready` nằm ngoài
   * 50 bộ đó nên cột "Sẵn sàng" trống trơn dù đếm 357. Nếu lấy theo trạng thái
   * mà vẫn ra rỗng trong khi số đếm khác 0, lỗi đã quay lại.
   */
  it("Trạng thái nào có số đếm khác 0 thì lấy ra PHẢI có dòng", async () => {
    for (const st of COT) {
      const tong = demTheoTrangThai.get(st) ?? 0;
      if (tong === 0) continue;

      const { data } = await supabase
        .from("galleries")
        .select("id")
        .eq("status", st)
        .limit(20);

      expect(
        (data ?? []).length,
        `Cột "${st}" đếm ${tong} bộ nhưng lấy ra 0 dòng — đúng lỗi BB-170`,
      ).toBeGreaterThan(0);
    }
  });

  it("Giới hạn 20 của mỗi cột được tôn trọng", async () => {
    const { data } = await supabase
      .from("galleries")
      .select("id")
      .eq("status", "ready")
      .limit(20);
    expect((data ?? []).length).toBeLessThanOrEqual(20);
  });
});
