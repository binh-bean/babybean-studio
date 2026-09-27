/**
 * BB-286 — làm nóng bộ đệm ảnh theo lô (`src/lib/drive/lam-nong-cache.ts`).
 *
 * Ba thứ được canh, đúng ba điều đề bài BB-286 yêu cầu cho phần (b):
 *   1. Tấm ĐÃ có trong đệm bị BỎ QUA — không gọi Drive lại.
 *   2. Số lượt gọi Drive chạy song song trong một lô bị GIỚI HẠN, không bắn
 *      hết một lúc (tôn trọng quota 10.000 req/100s của Drive).
 *   3. Gặp lỗi kiểu "hết quota" (driveFetch đã thử hết MAX_ATTEMPTS mà vẫn
 *      hỏng) thì DỪNG lại, không khởi động thêm lượt gọi Drive mới.
 *
 * KHÔNG gọi Drive thật: `driveClient.driveFetch` bị giả lập (spyOn), đúng
 * ranh giới đã dùng ở `tests/unit/bb-137-cache-anh-nho.test.ts` và
 * `tests/unit/drive-fetch.test.ts` — không đọc `dangChayPhepThu` trực tiếp,
 * không giả `fetch` toàn cục.
 *
 * `client` (Supabase) là một double tự tay dựng (như
 * `tests/unit/bb-261-chuong-thong-bao.test.ts`) — không chạm bb-dev, vì hành
 * vi cần canh (bỏ qua/song song/dừng vì quota) không phụ thuộc dữ liệu thật.
 *
 * KIỂM NGƯỢC (chạy tay, dán kết quả vào bàn giao):
 *  · Xoá điều kiện `if (await daCoTrongDem(...))` trong `nongMotAnh` →
 *    ca "bỏ qua tấm đã có" phải ĐỎ (driveFetch bị gọi cho cả tấm đã có).
 *  · Đổi `SO_SONG_SONG_TOI_DA_LAM_NONG` xử lý thành xử lý tuần tự (bỏ
 *    `Promise.all`, gọi từng ảnh một) → ca "giới hạn song song" phải ĐỎ
 *    (không còn thấy nhiều lượt gọi cùng lúc).
 *  · Xoá `dungVìQuota = true; break;` khi gặp `DriveUnavailableError` → ca
 *    "dừng khi lỗi quota" phải ĐỎ (driveFetch bị gọi cho toàn bộ 10 ảnh thay
 *    vì dừng lại ở lô đầu).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import * as driveClient from "@/lib/drive/client";
import {
  lamNongMotLo,
  SO_SONG_SONG_TOI_DA_LAM_NONG,
  CO_ANH_LAM_NONG,
} from "@/lib/drive/lam-nong-cache";

type Anh = { id: string; drive_file_id: string; sort_index: number };

function taoClientGia(opts: { tongSoAnh: number; anhs: Anh[]; daCoDem?: Set<string> }) {
  const daCoDem = opts.daCoDem ?? new Set<string>();
  const uploadCalls: string[] = [];
  const listCalls: string[] = [];

  const client = {
    from(bang: string) {
      if (bang === "galleries") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { photo_count: opts.tongSoAnh }, error: null }),
            }),
          }),
        };
      }
      if (bang === "photos") {
        let sauSortIndex = 0;
        const builder = {
          select: () => builder,
          eq: () => builder,
          gt: (_col: string, val: number) => {
            sauSortIndex = val;
            return builder;
          },
          order: () => builder,
          limit: async (n: number) => {
            const loc = opts.anhs
              .filter((a) => a.sort_index > sauSortIndex)
              .sort((a, b) => a.sort_index - b.sort_index)
              .slice(0, n);
            return { data: loc, error: null };
          },
        };
        return builder;
      }
      throw new Error(`bảng không mong đợi: ${bang}`);
    },
    storage: {
      from(bucket: string) {
        if (bucket !== "thumbnails") throw new Error(`bucket không mong đợi: ${bucket}`);
        return {
          list: async (prefix: string, _opts: { search: string }) => {
            listCalls.push(prefix);
            return { data: daCoDem.has(prefix) ? [{ name: `${CO_ANH_LAM_NONG}.jpg` }] : [], error: null };
          },
          upload: async (path: string) => {
            uploadCalls.push(path);
            return { error: null };
          },
          createBucket: async () => ({ error: null }),
        };
      },
    },
  };

  return { client: client as unknown as SupabaseClient, uploadCalls, listCalls };
}

function anhGia(n: number, tienTo = "anh"): Anh[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${tienTo}-${i}`,
    drive_file_id: `file-${tienTo}-${i}`,
    sort_index: i + 1,
  }));
}

function driveResOk(): Response {
  return new Response(new Uint8Array([255, 216, 255, 0]), {
    status: 200,
    headers: { "Content-Type": "image/jpeg" },
  });
}

describe("BB-286: lamNongMotLo — bỏ qua tấm đã có, giới hạn song song, dừng khi lỗi quota", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Bỏ qua tấm ĐÃ có trong đệm — chỉ gọi Drive cho tấm chưa có", async () => {
    const anhs = anhGia(2);
    const { client, uploadCalls } = taoClientGia({
      tongSoAnh: 2,
      anhs,
      daCoDem: new Set([anhs[0]!.id]), // anh-0 đã có đệm
    });

    const goiDrive: string[] = [];
    vi.spyOn(driveClient, "driveFetch").mockImplementation(async (url: string) => {
      goiDrive.push(url);
      return driveResOk();
    });

    const kq = await lamNongMotLo(client, "bo-1", 0, "req-bo-qua");

    expect(goiDrive.length).toBe(1);
    expect(goiDrive[0]).toContain(anhs[1]!.drive_file_id);
    expect(uploadCalls).toEqual([`${anhs[1]!.id}/${CO_ANH_LAM_NONG}.jpg`]);
    expect(kq.soDaCoSanLoNay).toBe(1);
    expect(kq.soMoiNongLoNay).toBe(1);
    expect(kq.soLoiLoNay).toBe(0);
    expect(kq.conAnhChuaXuLy).toBe(false);
    expect(kq.conTroTiep).toBe(anhs[1]!.sort_index);
  });

  it("Giới hạn số lượt gọi Drive chạy SONG SONG trong một lô", async () => {
    const anhs = anhGia(SO_SONG_SONG_TOI_DA_LAM_NONG * 2);
    const { client } = taoClientGia({ tongSoAnh: anhs.length, anhs });

    let dangChay = 0;
    let dinhCao = 0;
    vi.spyOn(driveClient, "driveFetch").mockImplementation(async () => {
      dangChay++;
      dinhCao = Math.max(dinhCao, dangChay);
      await new Promise((r) => setTimeout(r, 15));
      dangChay--;
      return driveResOk();
    });

    const kq = await lamNongMotLo(client, "bo-2", 0, "req-song-song");

    // Không bắn hết 8 lượt cùng lúc — bị chặn ở đúng hằng số đã khai báo.
    expect(dinhCao).toBeLessThanOrEqual(SO_SONG_SONG_TOI_DA_LAM_NONG);
    // Nhưng CÓ chạy song song thật (không phải tuần tự từng-cái-một).
    expect(dinhCao).toBeGreaterThan(1);
    expect(kq.soMoiNongLoNay).toBe(anhs.length);
    expect(kq.conAnhChuaXuLy).toBe(false);
  });

  it("Dừng lại khi Drive báo lỗi kiểu hết quota — không gọi tiếp các ảnh sau", async () => {
    const anhs = anhGia(10);
    const { client } = taoClientGia({ tongSoAnh: anhs.length, anhs });

    const goiDrive: string[] = [];
    vi.spyOn(driveClient, "driveFetch").mockImplementation(async (url: string) => {
      goiDrive.push(url);
      // Ảnh thứ hai (chỉ mục 1) mô phỏng driveFetch đã thử hết MAX_ATTEMPTS
      // rồi vẫn hỏng — đúng thứ ném ra khi quota cạn thật.
      if (url.includes(anhs[1]!.drive_file_id)) {
        throw new driveClient.DriveUnavailableError("Drive không phản hồi sau 5 lần thử");
      }
      return driveResOk();
    });

    const kq = await lamNongMotLo(client, "bo-3", 0, "req-quota");

    expect(kq.dungVìQuota).toBe(true);
    expect(kq.conAnhChuaXuLy).toBe(true);
    // Đúng một lô song song (SO_SONG_SONG_TOI_DA_LAM_NONG ảnh) được thử, KHÔNG
    // phải toàn bộ 10 ảnh — đây là "dừng khi lỗi quota", không phải "làm cố
    // cho hết".
    expect(goiDrive.length).toBe(SO_SONG_SONG_TOI_DA_LAM_NONG);
    // Ảnh gây lỗi quota không được tính là "đã xử lý" — lượt sau phải thử lại
    // đúng ảnh đó, nên con trỏ dừng TRƯỚC nó.
    expect(kq.conTroTiep).toBeLessThan(anhs[1]!.sort_index);
  });
});
