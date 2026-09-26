/**
 * Bộ lọc dùng chung cho mọi báo cáo: loại bộ ảnh Fixture và đã lưu trữ.
 *
 * OWNER: DEV-BE. Task BB-260.
 *
 * Brief chốt: mọi số liệu báo cáo phải loại `title like 'Fixture%'` và
 * `status = 'archived'`. Viết một chỗ để không báo cáo nào quên áp.
 */

/**
 * Chữ ký tối thiểu cần dùng — tránh khai đúng 4-8 tham số kiểu của
 * `PostgrestFilterBuilder` (đổi theo phiên bản `@supabase/postgrest-js`),
 * vốn không phải việc của một bộ lọc dùng chung như thế này.
 */
interface CoTheLocFixture {
  not(column: string, operator: string, value: unknown): this;
  neq(column: string, value: unknown): this;
}

export function locBoAnhThat<T extends CoTheLocFixture>(q: T): T {
  return q.not("title", "ilike", "Fixture%").neq("status", "archived");
}

export const GHI_CHU_LOAI_TRU =
  "Đã loại bộ ảnh thử (tên bắt đầu bằng \"Fixture\") và bộ ảnh đã lưu trữ khỏi mọi số liệu.";
