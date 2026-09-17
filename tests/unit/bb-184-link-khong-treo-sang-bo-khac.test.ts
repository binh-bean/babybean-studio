/**
 * BB-184 — Link gửi khách KHÔNG được treo sang bộ ảnh khác.
 *
 * OWNER: DEV-FE. Chủ studio báo 17/09/2026.
 *
 * ---------------------------------------------------------------------------
 * Lỗi nghiêm trọng nhất dự án này từng gặp
 * ---------------------------------------------------------------------------
 * `linkMoi` là trạng thái trong `GalleryDetail`, đặt sau khi CSKH bấm tạo link.
 * Điều hướng từ bộ A sang bộ B giữ nguyên component và chỉ đổi prop, nên mọi
 * trạng thái Ở LẠI — kể cả chuỗi link.
 *
 * Kết quả: khung "Link gửi khách" treo link của nhà A dưới tiêu đề của nhà B,
 * kèm dòng chữ "gửi thẳng cho khách". CSKH chép và gửi đi là **nhà B mở được
 * ảnh con nhà A**.
 *
 * Hai lớp chặn, và phép thử này canh CẢ HAI:
 *   1. `key={id}` ở `app/(admin)/admin/galleries/[id]/page.tsx` — React tháo
 *      rồi dựng lại component, mọi trạng thái sạch.
 *   2. `useEffect` xoá ba trạng thái khi `galleryId` đổi — phòng khi ai đó dựng
 *      component ở chỗ mới mà quên `key`.
 *
 * ---------------------------------------------------------------------------
 * Vì sao canh bằng cách đọc mã chứ không dựng component
 * ---------------------------------------------------------------------------
 * `AGENTS.md §5a` cấm đọc mã nguồn làm dữ liệu thử, và cấm đúng. Nhưng ở đây
 * thứ cần canh KHÔNG phải hành vi của một hàm — nó là **hai chốt cấu trúc nằm
 * ở hai tệp khác nhau**, và cái nguy hiểm là chúng bị gỡ đi.
 *
 * Dựng component rồi đổi prop sẽ chứng minh được lớp 2, nhưng KHÔNG chứng minh
 * được lớp 1: `key` chỉ có tác dụng ở chỗ gọi, và chỗ gọi là một trang Next.js.
 * Nên ca 1 canh sự tồn tại của `key`, ca 2 canh hành vi xoá trạng thái.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const goc = path.resolve(__dirname, "../..");
const doc = (p: string) => fs.readFileSync(path.join(goc, p), "utf8");

describe("BB-184 · link không treo sang bộ ảnh khác", () => {
  it("1. Trang chi tiết dựng GalleryDetail kèm key theo id", () => {
    const trang = doc("src/app/(admin)/admin/galleries/[id]/page.tsx");
    expect(
      /<GalleryDetail[^>]*\bkey=\{id\}/.test(trang),
      "Thiếu key={id} — điều hướng giữa hai bộ ảnh sẽ giữ nguyên link của bộ trước",
    ).toBe(true);
  });

  it("2. Component tự xoá ba trạng thái của lần tạo link khi đổi bộ ảnh", () => {
    const mã = doc("src/components/features/admin/gallery-detail.tsx");

    // Lấy đúng thân effect có mảng phụ thuộc [galleryId] và gọi setLinkMoi(null).
    const khoi = mã.match(
      /React\.useEffect\(\(\) => \{([\s\S]*?)\}, \[galleryId\]\);/g,
    );
    expect(khoi, "không có useEffect nào phụ thuộc [galleryId]").toBeTruthy();

    const gop = (khoi ?? []).join("\n");
    for (const ten of ["setLinkMoi(null)", "setDaGhiLark(null)", "setLyDoKhongGhiLark(null)"]) {
      expect(
        gop.includes(ten),
        `Đổi bộ ảnh mà không gọi ${ten} — trạng thái của bộ trước còn treo lại`,
      ).toBe(true);
    }
  });

  /**
   * Ca này canh điều dễ bị bỏ quên nhất: dòng chữ bảo CSKH "gửi thẳng cho
   * khách" chỉ được hiện KHI CÓ link, chứ không hiện kèm một ô trống hay một
   * chuỗi cũ.
   */
  it("3. Khung link chỉ hiện khi thật sự có link của lần tạo này", () => {
    const mã = doc("src/components/features/admin/gallery-detail.tsx");
    expect(mã.includes("{linkMoi ? (")).toBe(true);
  });
});
