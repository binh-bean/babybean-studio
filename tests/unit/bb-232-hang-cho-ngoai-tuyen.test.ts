/**
 * BB-232 — hàng chờ thả tim ngoại tuyến (E-6, docs/10-testing-qa.md §5).
 *
 * Canh đúng ba việc mà `src/lib/selection/hang-cho.ts` phải làm: gộp/triệt
 * tiêu theo GỐC (không phải theo hai op liên tiếp), chia lô tối đa 50 (giới
 * hạn của SelectionPatchSchema), và giữ nguyên clientOpId khi nội dung lô
 * gửi lại không đổi.
 */

import { describe, it, expect } from "vitest";
import {
  themVaoHangCho,
  layLoGui,
  boDaGui,
  TOI_DA_MOT_LO,
  type HangChoMuc,
} from "@/lib/selection/hang-cho";

describe("BB-232: hàng chờ thả tim ngoại tuyến", () => {
  describe("themVaoHangCho — gộp và triệt tiêu", () => {
    it("Tấm chưa chọn: thả tim thêm vào hàng chờ với mark='selected'", () => {
      const hangCho = themVaoHangCho([], { photoId: "p1", mark: "selected" }, null);
      expect(hangCho).toEqual([{ photoId: "p1", mark: "selected", gocTruocKhiVaoHang: null }]);
    });

    it("Thả tim rồi bỏ tim CÙNG một tấm khi chưa gửi được: hai thao tác triệt tiêu, hàng chờ rỗng", () => {
      // Tấm đang KHÔNG chọn (gốc = null). Bấm 1: chọn. Bấm 2: bỏ chọn lại —
      // quay về đúng gốc, nên không còn gì phải gửi.
      let hangCho: HangChoMuc[] = [];
      hangCho = themVaoHangCho(hangCho, { photoId: "p1", mark: "selected" }, null);
      hangCho = themVaoHangCho(hangCho, { photoId: "p1", mark: null }, "selected");
      expect(hangCho).toEqual([]);
    });

    it("Bấm ba lần (chọn, bỏ, chọn lại): còn đúng MỘT thao tác cuối, gốc giữ nguyên", () => {
      let hangCho: HangChoMuc[] = [];
      hangCho = themVaoHangCho(hangCho, { photoId: "p1", mark: "selected" }, null);
      hangCho = themVaoHangCho(hangCho, { photoId: "p1", mark: null }, "selected");
      hangCho = themVaoHangCho(hangCho, { photoId: "p1", mark: "selected" }, null);
      expect(hangCho).toEqual([{ photoId: "p1", mark: "selected", gocTruocKhiVaoHang: null }]);
    });

    it("Tấm ĐANG chọn từ trước (gốc='selected'): bỏ tim rồi chọn lại cũng triệt tiêu", () => {
      let hangCho: HangChoMuc[] = [];
      hangCho = themVaoHangCho(hangCho, { photoId: "p9", mark: null }, "selected");
      hangCho = themVaoHangCho(hangCho, { photoId: "p9", mark: "selected" }, null);
      expect(hangCho).toEqual([]);
    });

    it("Giữ nguyên thao tác của các tấm KHÁC khi gộp/triệt tiêu một tấm", () => {
      let hangCho: HangChoMuc[] = [];
      hangCho = themVaoHangCho(hangCho, { photoId: "p1", mark: "selected" }, null);
      hangCho = themVaoHangCho(hangCho, { photoId: "p2", mark: "selected" }, null);
      hangCho = themVaoHangCho(hangCho, { photoId: "p1", mark: null }, "selected");
      expect(hangCho).toEqual([{ photoId: "p2", mark: "selected", gocTruocKhiVaoHang: null }]);
    });
  });

  describe("layLoGui — chia lô tối đa 50, giữ clientOpId khi gửi lại", () => {
    it("Hàng chờ rỗng: không có lô nào để gửi", () => {
      expect(layLoGui([], null)).toBeNull();
    });

    it("Lấy tối đa TOI_DA_MOT_LO (50) op mỗi lô, dù hàng chờ nhiều hơn", () => {
      const hangCho: HangChoMuc[] = Array.from({ length: 60 }, (_, i) => ({
        photoId: `p${i}`,
        mark: "selected" as const,
        gocTruocKhiVaoHang: null,
      }));
      const lo = layLoGui(hangCho, null);
      expect(lo).not.toBeNull();
      expect(lo!.ops).toHaveLength(TOI_DA_MOT_LO);
      expect(lo!.ops[0]).toEqual({ photoId: "p0", mark: "selected" });
      expect(lo!.ops[49]).toEqual({ photoId: "p49", mark: "selected" });
    });

    it("Gửi lại với nội dung y hệt: clientOpId GIỮ NGUYÊN (máy chủ nhận ra lượt gửi lại)", () => {
      const hangCho: HangChoMuc[] = [
        { photoId: "p1", mark: "selected", gocTruocKhiVaoHang: null },
      ];
      const loDau = layLoGui(hangCho, null);
      expect(loDau).not.toBeNull();

      // Mô phỏng gửi lần đầu thất bại (mất mạng) — hàng chờ không đổi, gọi lại.
      const loSau = layLoGui(hangCho, loDau);
      expect(loSau!.clientOpId).toBe(loDau!.clientOpId);
      expect(loSau!.ops).toEqual(loDau!.ops);
    });

    it("Nội dung lô đổi (thêm/bớt tấm) trong lúc chờ: sinh clientOpId MỚI", () => {
      const hangChoDau: HangChoMuc[] = [
        { photoId: "p1", mark: "selected", gocTruocKhiVaoHang: null },
      ];
      const loDau = layLoGui(hangChoDau, null);

      const hangChoSau = themVaoHangCho(hangChoDau, { photoId: "p2", mark: "selected" }, null);
      const loSau = layLoGui(hangChoSau, loDau);

      expect(loSau!.clientOpId).not.toBe(loDau!.clientOpId);
      expect(loSau!.ops).toHaveLength(2);
    });
  });

  describe("boDaGui — bỏ các op đã gửi xong", () => {
    it("Gửi thành công thì bỏ khỏi hàng chờ", () => {
      const hangCho: HangChoMuc[] = [
        { photoId: "p1", mark: "selected", gocTruocKhiVaoHang: null },
        { photoId: "p2", mark: "selected", gocTruocKhiVaoHang: null },
      ];
      const con = boDaGui(hangCho, [{ photoId: "p1", mark: "selected" }]);
      expect(con).toEqual([{ photoId: "p2", mark: "selected", gocTruocKhiVaoHang: null }]);
    });

    it("Ba mẹ đổi ý trong lúc lô cũ đang trên đường đi: KHÔNG bỏ, vẫn còn thay đổi mới hơn", () => {
      // Lô đã gửi mang mark='selected', nhưng trong lúc chờ phản hồi, ba mẹ đã
      // bấm bỏ tim — hàng chờ hiện tại mang mark=null cho đúng tấm đó. Máy chủ
      // chỉ vừa xác nhận cái CŨ; cái MỚI vẫn phải gửi tiếp, không được xoá.
      const hangCho: HangChoMuc[] = [
        { photoId: "p1", mark: null, gocTruocKhiVaoHang: "selected" },
      ];
      const con = boDaGui(hangCho, [{ photoId: "p1", mark: "selected" }]);
      expect(con).toEqual(hangCho);
    });

    it("Op không nằm trong lô đã gửi thì giữ nguyên", () => {
      const hangCho: HangChoMuc[] = [
        { photoId: "p3", mark: "selected", gocTruocKhiVaoHang: null },
      ];
      expect(boDaGui(hangCho, [{ photoId: "p1", mark: "selected" }])).toEqual(hangCho);
    });
  });
});
