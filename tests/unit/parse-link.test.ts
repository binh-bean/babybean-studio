/**
 * OWNER: DEV-INT. Task BB-010.
 * Reference test file — follow this shape for the rest of the suite.
 */

import { describe, expect, it } from "vitest";
import { parseDriveFolderId, isDriveFolderLink } from "@/lib/drive/parse-link";

describe("parseDriveFolderId", () => {
  const FOLDER_ID = "1a2B3c4D5eF6g7H8i";

  it.each([
    `https://drive.google.com/drive/folders/${FOLDER_ID}?usp=sharing`,
    `https://drive.google.com/drive/u/0/folders/${FOLDER_ID}`,
    `https://drive.google.com/drive/folders/${FOLDER_ID}`,
    `https://drive.google.com/open?id=${FOLDER_ID}`,
    ` https://drive.google.com/drive/folders/${FOLDER_ID}?usp=drive_link `,
  ])("accepts %s", (input) => {
    expect(parseDriveFolderId(input)).toBe(FOLDER_ID);
  });

  it("accepts a bare folder id", () => {
    expect(parseDriveFolderId(FOLDER_ID)).toBe(FOLDER_ID);
  });

  it.each([
    "",
    "   ",
    "not a link",
    "https://example.com/drive/folders/1a2B3c4D5eF6g7H8i",
    // A single-file link would silently produce an empty gallery.
    `https://drive.google.com/file/d/${FOLDER_ID}/view`,
    "https://docs.google.com/document/d/abc/edit",
  ])("rejects %s", (input) => {
    expect(() => parseDriveFolderId(input)).toThrow();
    expect(isDriveFolderLink(input)).toBe(false);
  });
});
