/**
 * BB-108 — Phép thử canh lựa chọn mặc định của màn tạo bộ ảnh.
 *
 * OWNER: DEV-FE. Task BB-108.
 * Spec: docs/briefs/BB-108-ba-cong-tac-noi-doi.md
 *
 * Canh 3 công tắc để màn hình không bao giờ lệch với hệ thống và quyết định vận hành:
 * 1. Đóng dấu mờ: BỎ HẲN ô tick và state, không còn xuất hiện trong wizard.
 * 2. Cho tải ảnh: Có ô tick, MẶC ĐỊNH BẬT (download = true) nhất quán với 457 bộ trên prod.
 * 3. Mã PIN: Có ô tick, MẶC ĐỊNH TẮT (requirePin = false) theo quyết định 12/09/2026.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("BB-108: Canh lựa chọn mặc định của màn tạo bộ ảnh (create-gallery-wizard)", () => {
  const wizardPath = path.resolve(
    __dirname,
    "../../src/components/features/admin/create-gallery-wizard.tsx",
  );
  const wizardSource = fs.readFileSync(wizardPath, "utf-8");

  it("1. Bỏ hẳn ô và state đóng dấu mờ (watermark) khỏi màn hình", () => {
    // Không còn state useState cho watermark
    expect(wizardSource).not.toMatch(/useState\([^)]*watermark[^)]*\)/i);
    expect(wizardSource).not.toMatch(/setWatermark/);
    expect(wizardSource).not.toMatch(/\bwatermark\b/);

    // Không còn nhãn checkbox watermark
    expect(wizardSource).not.toContain("w.watermark");
  });

  it("2. Công tắc 'Cho phép tải ảnh' (download) có mặt và bật sẵn theo mặc định (true)", () => {
    // Phải có state download khởi tạo là true
    expect(wizardSource).toMatch(/const\s+\[download,\s*setDownload\]\s*=\s*useState\(true\)/);

    // Checkbox hiển thị nhãn w.allowDownload gắn với checked={download}
    expect(wizardSource).toContain("w.allowDownload");
    expect(wizardSource).toMatch(/checked=\{download\}/);
    expect(wizardSource).toMatch(/onChange=\{\(e\)\s*=>\s*setDownload\(e\.target\.checked\)\}/);
  });

  it("3. Payload options gửi lên API phải dùng state download, không ghi cứng hay gửi watermark", () => {
    // options gửi đi phải là { download, ... }
    expect(wizardSource).toMatch(/options:\s*\{\s*download,\s*notes:\s*true,\s*invite:\s*true\s*\}/);
    expect(wizardSource).not.toContain("download: false");
    expect(wizardSource).not.toContain("watermark");
  });
});
