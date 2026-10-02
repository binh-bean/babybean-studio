// BB-352 — dọn fixture của phép thử THEO ID, và KHÔNG nuốt lỗi.
//
// Vì sao có tệp này: ngày 01/10/2026 bb-dev còn 8 sản phẩm "Fixture …" đang bán
// (tạo lúc 17:13). Thủ phạm là `afterAll` của placements-and-watermark và
// submit-and-confirm: hai tệp gọi `await supabase.from(...).delete().in(...)`
// rồi bỏ đó. supabase-js KHÔNG ném khi xoá hỏng — nó trả `{ error }` — nên một
// lượt xoá hỏng (hết giờ hook, khoá ngoại, mạng) để lại sản phẩm mà phép thử vẫn
// xanh. Không ai biết cho tới khi khách thấy "Fixture Gói Baby 01" trên cửa hàng.
//
// Luật của hàm này:
//   1. Xoá đúng những id mà phép thử tự tạo (không lọc theo tên).
//   2. Thứ tự: bộ ảnh trước (kéo theo dòng hàng, lượt chọn), sản phẩm sau.
//   3. Lỗi của MỖI lượt xoá được gom lại; chạy hết các lượt rồi mới ném, để một
//      lượt hỏng không bỏ rơi các lượt sau.
//   4. Xoá xong ĐỌC LẠI: còn id nào là ném. "Không có lỗi" chưa phải "đã xoá".

interface KetQuaLoi {
  message: string;
}

/** Phần tối thiểu của supabase-js mà hàm dùng — để phép thử đơn vị đưa vào bản giả. */
export interface KhachSupabaseToiThieu {
  from(bang: string): {
    delete(): { in(cot: string, giaTri: string[]): PromiseLike<{ error: KetQuaLoi | null }> };
    select(cot: string): {
      in(cot: string, giaTri: string[]): PromiseLike<{ data: unknown[] | null; error: KetQuaLoi | null }>;
    };
  };
}

export interface DauVaoDonDep {
  galleryIds?: string[];
  productIds?: string[];
}

export async function donFixtureTheoId(
  supabase: KhachSupabaseToiThieu,
  { galleryIds = [], productIds = [] }: DauVaoDonDep,
): Promise<void> {
  const loi: string[] = [];
  const luot: Array<[string, string[]]> = [
    ["galleries", galleryIds],
    ["products", productIds],
  ];

  for (const [bang, ids] of luot) {
    if (!ids.length) continue;
    const { error } = await supabase.from(bang).delete().in("id", ids);
    if (error) loi.push(`xoá ${bang}: ${error.message}`);
  }

  for (const [bang, ids] of luot) {
    if (!ids.length) continue;
    const { data, error } = await supabase.from(bang).select("id").in("id", ids);
    if (error) loi.push(`đọc lại ${bang}: ${error.message}`);
    else if (data && data.length > 0) loi.push(`${bang} còn ${data.length}/${ids.length} dòng sau khi xoá`);
  }

  if (loi.length) {
    throw new Error(`Dọn fixture THẤT BẠI — dữ liệu thử còn nằm lại trong cơ sở dữ liệu: ${loi.join(" | ")}`);
  }
}
