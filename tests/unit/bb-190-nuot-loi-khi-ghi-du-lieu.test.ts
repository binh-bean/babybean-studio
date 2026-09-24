import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const goc = path.resolve(__dirname, "../..");

function moiTepTs(thuMuc: string): string[] {
  const ra: string[] = [];
  for (const m of fs.readdirSync(thuMuc, { withFileTypes: true })) {
    const duong = path.join(thuMuc, m.name);
    if (m.isDirectory()) ra.push(...moiTepTs(duong));
    else if (/\.(ts|tsx)$/.test(m.name)) ra.push(duong);
  }
  return ra;
}

describe("BB-190: Nuốt lỗi khi ghi dữ liệu", () => {
  it("không được nuốt lỗi khi ghi dữ liệu", () => {
    const loi: string[] = [];
    
    for (const tep of moiTepTs(path.join(goc, "src"))) {
      const noi = fs.readFileSync(tep, "utf8");
      const lines = noi.split(/\r?\n/);
      
      for (let i = 0; i < lines.length; i++) {
        if (
            (lines[i] || "").match(/^\s*await (admin|supabase|db)(\.|\s*$)/) || 
            ((lines[i] || "").match(/await (admin|supabase|db)\./) && (lines[i] || "").match(/\.(insert|update|upsert|delete)\(/))
        ) {
          let found = false;
          
          for (let j = i; j < Math.min(i + 15, lines.length); j++) {
             // lines[j] + '\n';
             if ((lines[j] || "").match(/\.(insert|update|upsert|delete)\(/)) {
                 found = true;
             }
             if ((lines[j] || "").match(/const\s*\{.*error.*\}/) || (lines[j] || "").match(/const\s+[^=]+\s*=\s*await/)) {
                 found = false;
                 break;
             }
             if ((lines[j] || "").includes(';')) break;
          }
          if (found) {
             const ngan = path.relative(goc, tep).split(path.sep).join("/");
             loi.push(ngan + ":" + (i + 1));
          }
        }
      }
    }
    
    // BB-214: sửa nốt chỗ cuối cùng còn sót (src/app/api/g/buoi-chup/route.ts:231,
    // cập nhật last_viewed_at không bắt lỗi) — danh sách cho phép giờ rỗng.
    // Không hạ chuẩn: đây là con số CÒN LẠI đúng bằng 0, không phải nới lỏng.
    expect(loi, `Đang có ${loi.length} chỗ ghi dữ liệu không bắt lỗi (cho phép 0). Chi tiết:\n${loi.join('\n')}`).toHaveLength(0);
  });
});
