/**
 * OWNER: DEV-INT. Task BB-012.
 * Tests for listImageFiles() and toDriveFile() — pagination, 2-level recursion,
 * image filtering, natural sort, progress reporting.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));

import { listImageFiles, toDriveFile, MAX_DEPTH } from "@/lib/drive/list-files";
import * as clientModule from "@/lib/drive/client";
import fs from "node:fs";
import path from "node:path";

describe("BB-012: listImageFiles & toDriveFile", () => {
  const ctx = { requestId: "req-test-list", folderId: "root-folder-id" };

  it("exports MAX_DEPTH = 2 according to spec", () => {
    expect(MAX_DEPTH).toBe(2);
  });

  describe("toDriveFile", () => {
    it("converts EXIF timestamp to ISO format", () => {
      const raw = {
        id: "img1",
        name: "BB_001.jpg",
        mimeType: "image/jpeg",
        size: "2048500",
        modifiedTime: "2026-09-01T08:00:00.000Z",
        imageMediaMetadata: {
          width: 2048,
          height: 1365,
          time: "2026:09:01 14:30:25",
        },
      };

      const result = toDriveFile(raw, "Concept 1");
      expect(result).toEqual({
        id: "img1",
        name: "BB_001.jpg",
        mimeType: "image/jpeg",
        size: 2048500,
        width: 2048,
        height: 1365,
        takenAt: "2026-09-01T14:30:25",
        modifiedAt: "2026-09-01T08:00:00.000Z",
        subfolder: "Concept 1",
      });
    });

    it("handles missing metadata gracefully with nulls", () => {
      const raw = {
        id: "img2",
        name: "BB_002.png",
        mimeType: "image/png",
      };

      const result = toDriveFile(raw, null);
      expect(result).toEqual({
        id: "img2",
        name: "BB_002.png",
        mimeType: "image/png",
        size: null,
        width: null,
        height: null,
        takenAt: null,
        modifiedAt: null,
        subfolder: null,
      });
    });
  });

  describe("listImageFiles integration with fixtures", () => {
    const fixturesDir = path.resolve(__dirname, "../fixtures/drive-responses");

    function loadFixture(name: string) {
      const content = fs.readFileSync(path.join(fixturesDir, name), "utf-8");
      return JSON.parse(content);
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("loads small single-page album (folder-50.json)", async () => {
      const fixture = loadFixture("folder-50.json");
      vi.spyOn(clientModule, "driveFetch").mockResolvedValueOnce(
        new Response(JSON.stringify(fixture), { status: 200 }),
      );

      const files = await listImageFiles("folder-50", ctx);
      expect(files).toHaveLength(50);
      expect(files[0]?.name).toBe("BB_001.jpg");
      expect(files[49]?.name).toBe("BB_050.jpg");
      expect(files.every((f) => f.subfolder === null)).toBe(true);
    });

    it("handles multi-page pagination using nextPageToken (folder-1000.json)", async () => {
      const fixture = loadFixture("folder-1000.json");

      const driveFetchSpy = vi.spyOn(clientModule, "driveFetch").mockImplementation(
        async (_path, params) => {
          if (!params.pageToken) {
            return new Response(JSON.stringify(fixture.page1), { status: 200 });
          }
          if (params.pageToken === fixture.page1.nextPageToken) {
            return new Response(JSON.stringify(fixture.page2), { status: 200 });
          }
          throw new Error(`Unexpected pageToken: ${params.pageToken}`);
        },
      );

      const progressCalls: number[] = [];
      const files = await listImageFiles("folder-1000", ctx, {
        onProgress: (count) => progressCalls.push(count),
      });

      expect(files).toHaveLength(1000);
      expect(driveFetchSpy).toHaveBeenCalledTimes(2);
      expect(progressCalls).toEqual([500, 1000]);
      expect(files[0]?.name).toBe("BB_0001.jpg");
      expect(files[999]?.name).toBe("BB_1000.jpg");
    });

    it("filters out non-image files like .DS_Store and Lightroom catalogs (folder-mixed.json)", async () => {
      const fixture = loadFixture("folder-mixed.json");
      vi.spyOn(clientModule, "driveFetch").mockResolvedValueOnce(
        new Response(JSON.stringify(fixture), { status: 200 }),
      );

      const files = await listImageFiles("folder-mixed", ctx);
      // fixture has: .DS_Store, Shoot_2026.lrcat, ghi_chu.txt, clip.mp4, and 3 images
      expect(files).toHaveLength(3);
      expect(files.map((f) => f.name)).toEqual(["BB_001.jpg", "BB_002.png", "BB_003.webp"]);
    });

    it("recursively traverses up to 2 levels and stops (folder-subfolders.json)", async () => {
      const fixture = loadFixture("folder-subfolders.json");

      const driveFetchSpy = vi.spyOn(clientModule, "driveFetch").mockImplementation(
        async (_path, params) => {
          const folderQuery = params.q?.match(/'([^']+)' in parents/)?.[1];
          if (folderQuery === "root-id") {
            return new Response(JSON.stringify(fixture.root), { status: 200 });
          }
          if (folderQuery === "subfolder_c1") {
            return new Response(JSON.stringify(fixture.subfolder_c1), { status: 200 });
          }
          if (folderQuery === "subfolder_c2") {
            return new Response(JSON.stringify(fixture.subfolder_c2), { status: 200 });
          }
          if (folderQuery === "subfolder_c3") {
            // Level 3 should NOT be fetched
            throw new Error("Should not fetch level 3 subfolder");
          }
          throw new Error(`Unexpected folder: ${folderQuery}`);
        },
      );

      const files = await listImageFiles("root-id", ctx);

      // Root has 2 images: BB_001.jpg, BB_002.jpg (subfolder = null)
      // subfolder_c1 has 2 images: BB_010.jpg, BB_011.jpg (subfolder = Concept 1 - Studio)
      // subfolder_c2 has 1 image: BB_020.jpg (subfolder = Concept 2 - Ngoai canh)
      // subfolder_c3 should NOT be traversed
      expect(files).toHaveLength(5);
      expect(driveFetchSpy).toHaveBeenCalledTimes(3);

      const subfolders = [...new Set(files.map((f) => f.subfolder))];
      expect(subfolders).toContain(null);
      expect(subfolders).toContain("Concept 1 - Studio");
      expect(subfolders).toContain("Concept 2 - Ngoai canh");
      expect(subfolders).not.toContain("Cấp 3 - Không được duyệt");
    });

    it("natural sorts photos correctly (BB_1.jpg, BB_2.jpg, BB_10.jpg)", async () => {
      const mockResponse = {
        files: [
          { id: "3", name: "BB_10.jpg", mimeType: "image/jpeg" },
          { id: "1", name: "BB_1.jpg", mimeType: "image/jpeg" },
          { id: "2", name: "BB_2.jpg", mimeType: "image/jpeg" },
          { id: "4", name: "BB_20.jpg", mimeType: "image/jpeg" },
        ],
      };

      vi.spyOn(clientModule, "driveFetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const files = await listImageFiles("sort-folder", ctx);
      expect(files.map((f) => f.name)).toEqual(["BB_1.jpg", "BB_2.jpg", "BB_10.jpg", "BB_20.jpg"]);
    });

    it("propagates DriveAccessDeniedError from driveFetch without masking", async () => {
      vi.spyOn(clientModule, "driveFetch").mockRejectedValueOnce(
        new clientModule.DriveAccessDeniedError("denied-folder"),
      );

      await expect(listImageFiles("denied-folder", ctx)).rejects.toThrow(
        clientModule.DriveAccessDeniedError,
      );
    });
  });
});
