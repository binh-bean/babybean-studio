/**
 * Đồng bộ bảng Hậu Kỳ từ Lark Base xuống app (galleries).
 * OWNER: DEV-INT. Task BB-111.
 * Spec: docs/16-quy-trinh-dau-cuoi.md §2 & §7, docs/15-doi-chieu-lark.md §9
 *
 * MỘT CHIỀU. Tuyệt đối không bao giờ ghi ngược lên Lark ở giai đoạn này.
 * Thông tin app tự điền là BẢN NHÁP (status = 'draft') để nhân viên soát và sửa
 * trước khi tạo link app.
 */

import pg from "pg";
import { parseDriveFolderId, InvalidDriveLinkError } from "@/lib/drive/parse-link";

export const HOST = "https://open.larksuite.com/open-apis";

// --- 5 trạng thái đã qua khâu in bị loại (docs/16 §7.1) ---------------------

export const EXCLUDED_RETOUCH_STATUSES = [
  "Đã chốt chưa in",
  "Đã gửi In",
  "Hình đã về",
  "Đã Giao",
  "Đã CSKH",
];

export function isRetouchStatusExcluded(status: string): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return EXCLUDED_RETOUCH_STATUSES.some((ex) => ex.toLowerCase() === s);
}

// --- Hàm bóc tách dữ liệu ô Lark -------------------------------------------

/**
 * Ô của Lark có tám hình dạng tuỳ kiểu cột, kể cả ô điện thoại trả
 * {fullPhoneNum}. Một hàm cho tất cả.
 * (Chép đúng từ scripts/sync-lark-contracts.mjs để tránh lỗi bẫy điện thoại).
 */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v == null
          ? ""
          : typeof v === "object"
            ? ((v as { text?: string; name?: string; fullPhoneNum?: string }).text ??
               (v as { text?: string; name?: string; fullPhoneNum?: string }).name ??
               (v as { text?: string; name?: string; fullPhoneNum?: string }).fullPhoneNum ??
               "")
            : String(v),
      )
      .join("");
  }
  if (typeof value === "object") {
    return (
      (value as { text?: string; name?: string; fullPhoneNum?: string }).text ??
      (value as { text?: string; name?: string; fullPhoneNum?: string }).name ??
      (value as { text?: string; name?: string; fullPhoneNum?: string }).fullPhoneNum ??
      ""
    );
  }
  return String(value);
}

export function cellNumber(value: unknown): number {
  return Number(String(cellText(value)).replace(/[^\d]/g, "")) || 0;
}

export function cellBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "checked";
  }
  return false;
}

/** Mã bản ghi mà một ô liên kết trỏ tới. */
export function linkedRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) =>
    v && typeof v === "object" ? ((v as { record_ids?: string[] }).record_ids ?? []) : [],
  );
}

/**
 * Bẫy 1 (docs/16 §7.3): Ô "Chat với khách" có dạng [{ link, text }] và text CHÍNH LÀ TÊN KHÁCH.
 * Chỉ lấy link URL, tuyệt đối bỏ text để không kéo tên khách vào.
 */
export function extractChatLink(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      if (v && typeof v === "object" && typeof (v as { link?: string }).link === "string") {
        const link = (v as { link: string }).link.trim();
        if (link) return link;
      }
    }
  }
  if (typeof value === "object" && value !== null && typeof (value as { link?: string }).link === "string") {
    const link = (value as { link: string }).link.trim();
    if (link) return link;
  }
  if (typeof value === "string" && value.startsWith("http")) {
    return value.trim();
  }
  return null;
}

/**
 * Tìm trường theo regex pattern (bất chấp hoa thường, dấu cách, thiếu cột trong fields thưa).
 */
export function getField(fields: Record<string, unknown>, pattern: RegExp): unknown {
  if (!fields || typeof fields !== "object") return undefined;
  for (const key of Object.keys(fields)) {
    if (pattern.test(key)) return fields[key];
  }
  return undefined;
}

// --- Trích xuất Google Drive URL --------------------------------------------

export function extractDriveUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(/https:\/\/drive\.google\.com\/[^\s"'>]+/);
  return match ? match[0] : null;
}

// --- Kiểm tra điều kiện kích hoạt BB-111 & Bộ lọc docs/16 §7.1 -------------

export interface RetouchTriggerCheck {
  triggered: boolean;
  status: string;
  isStatusExcluded: boolean;
  driveUrl: string | null;
  driveFolderId: string | null;
  hasLayLinkApp: boolean;
  linkApp: string;
  reason?: string;
}

/**
 * Kiểm tra bản ghi Hậu Kỳ:
 *   1. Trạng thái không thuộc 5 trạng thái đã qua in (docs/16 §7.1)
 *   2. Cột "Link ảnh gửi khách" CÓ NỘI DUNG (chứa link Google Drive hợp lệ)
 */
export function checkRetouchTrigger(fields: Record<string, unknown>): RetouchTriggerCheck {
  const statusField = getField(fields, /trạng\s*thái|status/i);
  const status = cellText(statusField).trim();
  const statusExcluded = isRetouchStatusExcluded(status);

  const rawLinkField =
    getField(fields, /link\s*(ảnh|anh)\s*(gửi\s*khách|gui\s*khach)?/i) ??
    getField(fields, /link\s*(ảnh|anh)/i) ??
    getField(fields, /link.*drive/i);

  const rawLinkText = cellText(rawLinkField).trim();

  const layLinkAppField = getField(fields, /lấy\s*link\s*app|lay\s*link\s*app/i);
  const hasLayLinkApp = cellBoolean(layLinkAppField);

  const linkAppField = getField(fields, /^link\s*app$/i);
  const linkApp = cellText(linkAppField).trim();

  if (statusExcluded) {
    return {
      triggered: false,
      status,
      isStatusExcluded: true,
      driveUrl: null,
      driveFolderId: null,
      hasLayLinkApp,
      linkApp,
      reason: `Trạng thái đã qua khâu in (${status})`,
    };
  }

  if (!rawLinkText) {
    return {
      triggered: false,
      status,
      isStatusExcluded: false,
      driveUrl: null,
      driveFolderId: null,
      hasLayLinkApp,
      linkApp,
      reason: "Cột 'Link ảnh gửi khách' không có nội dung",
    };
  }

  const driveUrl = extractDriveUrl(rawLinkText) ?? rawLinkText;
  let driveFolderId: string | null = null;
  try {
    driveFolderId = parseDriveFolderId(driveUrl);
  } catch (err) {
    return {
      triggered: false,
      status,
      isStatusExcluded: false,
      driveUrl,
      driveFolderId: null,
      hasLayLinkApp,
      linkApp,
      reason: err instanceof InvalidDriveLinkError ? err.message : "Link Drive không hợp lệ",
    };
  }

  return {
    triggered: true,
    status,
    isStatusExcluded: false,
    driveUrl,
    driveFolderId,
    hasLayLinkApp,
    linkApp,
  };
}

// --- Khớp chi nhánh --------------------------------------------------------

export interface BranchLookup {
  id: string;
  code: string;
  name: string;
}

export function matchBranch(branchText: string, branches: BranchLookup[]): string {
  const defaultBranch = branches[0];
  if (!defaultBranch) throw new Error("Danh sách chi nhánh rỗng trong DB");
  if (!branchText) return defaultBranch.id;

  const norm = branchText.toLowerCase();
  if (norm.includes("quận 1") || norm.includes("q1") || norm.includes("bb-q1")) {
    const b = branches.find((x) => x.code === "BB-Q1" || x.name.includes("Quận 1"));
    if (b) return b.id;
  }
  if (norm.includes("thủ đức") || norm.includes("thu duc") || norm.includes("td") || norm.includes("bb-td")) {
    const b = branches.find((x) => x.code === "BB-TD" || x.name.includes("Thủ Đức"));
    if (b) return b.id;
  }
  if (norm.includes("gò vấp") || norm.includes("go vap") || norm.includes("gv") || norm.includes("bb-gv")) {
    const b = branches.find((x) => x.code === "BB-GV" || x.name.includes("Gò Vấp"));
    if (b) return b.id;
  }

  return defaultBranch.id;
}

// --- Đọc bảng từ Lark Base (phân trang tối đa 500 bản ghi) -------------------

export interface LarkAuthHeader {
  authorization: string;
}

export async function larkAuth(appId: string, appSecret: string): Promise<LarkAuthHeader> {
  const res = await fetch(`${HOST}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const json = (await res.json()) as { tenant_access_token?: string; msg?: string; code?: number };
  if (!json.tenant_access_token) {
    throw new Error(`Lark từ chối cấp token: ${json.msg || "Lỗi không xác định"}`);
  }
  return { authorization: `Bearer ${json.tenant_access_token}` };
}

export interface LarkRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

/**
 * Đọc toàn bộ bản ghi của bảng tìm theo tên regex.
 * Bẫy Lark: trả tối đa 500 bản ghi, phải lặp qua has_more và page_token.
 */
export async function readLarkTable(
  auth: LarkAuthHeader,
  baseToken: string,
  namePattern: RegExp,
  options?: { lastModifiedTime?: number }
): Promise<{ tableId: string; tableName: string; records: LarkRecord[] }> {
  const listRes = await fetch(`${HOST}/bitable/v1/apps/${baseToken}/tables?page_size=100`, {
    headers: { authorization: auth.authorization },
  });
  const list = (await listRes.json()) as {
    code: number;
    msg?: string;
    data?: { items?: Array<{ table_id: string; name: string }> };
  };

  if (list.code !== 0 || !list.data?.items) {
    throw new Error(`Không liệt kê được bảng từ Lark: ${list.msg || "Lỗi kết nối"}`);
  }

  const table = list.data.items.find((t) => namePattern.test(t.name));
  if (!table) {
    throw new Error(
      `Không tìm thấy bảng khớp ${namePattern}. Các bảng hiện có: ` +
        list.data.items.map((t) => t.name).join(" | "),
    );
  }

  const records: LarkRecord[] = [];
  let pageToken = "";
  do {
    let url = `${HOST}/bitable/v1/apps/${baseToken}/tables/${table.table_id}/records?page_size=500`;
    if (pageToken) url += `&page_token=${pageToken}`;
    
    if (options?.lastModifiedTime) {
      url += `&automatic_fields=true&sort=["last_modified_time%20DESC"]`;
    }

    const pageRes = await fetch(url, { headers: { authorization: auth.authorization } });
    const page = (await pageRes.json()) as {
      code: number;
      msg?: string;
      data?: { items?: (LarkRecord & { last_modified_time?: number })[]; has_more?: boolean; page_token?: string };
    };

    if (page.code !== 0 || !page.data) {
      throw new Error(`Lỗi đọc bảng ${table.name}: ${page.msg || "Lỗi API"}`);
    }

    let items = page.data.items ?? [];
    let shouldStop = false;

    if (options?.lastModifiedTime) {
      const filtered = [];
      for (const item of items) {
        if (item.last_modified_time && item.last_modified_time <= options.lastModifiedTime) {
          shouldStop = true;
          break;
        }
        filtered.push(item);
      }
      items = filtered;
    }

    records.push(...items);
    pageToken = (page.data.has_more && !shouldStop) ? page.data.page_token ?? "" : "";
  } while (pageToken);

  return { tableId: table.table_id, tableName: table.name, records };
}

// --- Xử lý đồng bộ 1 bản ghi Hậu Kỳ xuống DB theo docs/16 §7.3 -------------

export interface SyncRetouchOptions {
  client: pg.Client;
  record: LarkRecord;
  branches: BranchLookup[];
  staffList: Array<{ id: string; fullName: string; role: string }>;
  write: boolean;
  index: number;
}

export interface SyncResult {
  action: "created" | "skipped" | "already_exists" | "error";
  galleryId?: string;
  title?: string;
  contractCode?: string;
  driveFolderId?: string;
  reason?: string;
}

/**
 * Xử lý 1 dòng bản ghi bảng Hậu Kỳ theo đúng bảng ánh xạ docs/16 §7.3:
 *   customers.full_name        "KH · HD_..." (chính mã hợp đồng)
 *   customers.phone            null
 *   customers.phone_normalized null (tự sinh)
 *   customers.facebook         CHỈ phần URL của ô "Chat với khách" (bỏ text)
 *   customers.zalo             null
 *   customers.note             null
 *   galleries.lark_contract_code GIỮ NGUYÊN THẬT
 *   galleries.status           'draft' (Bản nháp)
 */
export async function syncSingleRetouchRecord(opts: SyncRetouchOptions): Promise<SyncResult> {
  const { client, record, branches, staffList, write } = opts;
  const fields = record.fields;

  // 1. Kiểm tra điều kiện kích hoạt & bộ lọc 5 trạng thái đã qua khâu in
  const trigger = checkRetouchTrigger(fields);
  if (!trigger.triggered || !trigger.driveFolderId || !trigger.driveUrl) {
    return { action: "skipped", reason: trigger.reason };
  }

  // 2. Kiểm tra xem album với drive_folder_id này đã tồn tại chưa
  const { rows: existingGals } = await client.query(
    `select id, title, status from galleries where drive_folder_id = $1 and status <> 'archived' limit 1`,
    [trigger.driveFolderId],
  );
  if (existingGals.length > 0) {
    return {
      action: "already_exists",
      galleryId: existingGals[0].id,
      title: existingGals[0].title,
      driveFolderId: trigger.driveFolderId,
      reason: `Album đã tồn tại (id=${existingGals[0].id}, title=${existingGals[0].title})`,
    };
  }

  // 3. Khớp chi nhánh
  const rawBranch = cellText(getField(fields, /chi\s*nhánh|cơ\s*sở|branch/i));
  const branchId = matchBranch(rawBranch, branches);

  // 4. Mã hợp đồng (lark_contract_code)
  const rawContract = cellText(getField(fields, /hợp\s*đồng|mã\s*hợp\s*đồng|hóa\s*đơn|contract/i)).trim();
  const contractCode = rawContract || null;

  // 5. Ánh xạ dữ liệu cá nhân đúng docs/16 §7.3:
  //    customers.full_name: "KH · " + mã hợp đồng (hoặc record_id nếu thiếu)
  //    customers.phone: null
  //    customers.facebook: CHỈ lấy URL từ "Chat với khách", bỏ text
  const customerFullName = contractCode ? `KH · ${contractCode}` : `KH · ${record.record_id}`;
  const chatField = getField(fields, /chat\s*với\s*khách|link\s*chat|chat/i);
  const facebookChatUrl = extractChatLink(chatField);

  // Tiêu đề album: Album · Mã HĐ
  const albumTitle = contractCode ? `Album · ${contractCode}` : `Album · ${record.record_id}`;

  // Thợ ảnh, CSKH, retoucher (khớp theo nhân sự trong hệ thống nếu có)
  const rawPhotographer = cellText(getField(fields, /thợ\s*chụp|photographer/i)).toLowerCase();
  const rawEditor = cellText(getField(fields, /người\s*photoshop|photoshop\s*ctv|retoucher/i)).toLowerCase();
  const rawCskh = cellText(getField(fields, /cskh/i)).toLowerCase();

  const photographer = staffList.find(
    (s) => s.role === "photographer" && rawPhotographer && rawPhotographer.includes(s.fullName.toLowerCase()),
  );
  const editor = staffList.find(
    (s) =>
      (s.role === "retoucher" || s.role === "photoshop_ctv") &&
      rawEditor &&
      rawEditor.includes(s.fullName.toLowerCase()),
  );
  const cskh = staffList.find(
    (s) => s.role === "cs" && rawCskh && rawCskh.includes(s.fullName.toLowerCase()),
  );

  // Ngày chụp
  const rawShootDate = cellText(getField(fields, /ngày\s*chụp|shoot\s*date/i)).trim();
  let shootDate: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawShootDate)) {
    shootDate = rawShootDate;
  } else {
    shootDate = new Date().toISOString().slice(0, 10);
  }

  if (!write) {
    return {
      action: "created",
      title: albumTitle,
      contractCode: contractCode ?? undefined,
      driveFolderId: trigger.driveFolderId,
      reason: `Sẽ tạo album nháp: "${albumTitle}" (Chat: ${facebookChatUrl || "—"})`,
    };
  }

  // --- Ghi vào DB trong transaction (xoá-rồi-ghi-lại hoặc kiểm tra tồn tại) ---
  await client.query("begin");
  try {
    // A. Tìm hoặc tạo Customer (khớp theo full_name = 'KH · HD_...' và branch_id)
    const { rows: custRows } = await client.query(
      `select id from customers where branch_id = $1 and full_name = $2 limit 1`,
      [branchId, customerFullName],
    );

    let customerId: string;
    if (custRows.length > 0) {
      customerId = custRows[0].id;
      // Cập nhật facebook link nếu chưa có
      if (facebookChatUrl) {
        await client.query(`update customers set facebook = coalesce(facebook, $1) where id = $2`, [
          facebookChatUrl,
          customerId,
        ]);
      }
    } else {
      const { rows: newCust } = await client.query(
        `insert into customers (branch_id, full_name, phone, facebook, zalo, note, source, tags)
         values ($1, $2, null, $3, null, null, 'lark_retouch', array['lark_draft', 'bb111'])
         returning id`,
        [branchId, customerFullName, facebookChatUrl],
      );
      customerId = newCust[0].id;
    }

    // B. Tạo Shoot (buổi chụp)
    const { rows: newShoot } = await client.query(
      `insert into shoots (branch_id, customer_id, photographer_id, shoot_date, note)
       values ($1, $2, $3, $4, '[Đồng bộ Lark Hậu Kỳ]')
       returning id`,
      [branchId, customerId, photographer?.id ?? null, shootDate],
    );
    const shootId = newShoot[0].id;

    // C. Tạo Gallery (Album) với status = 'draft'
    const noteMsg = `Chào mừng bạn đến với album ảnh của BabyBean Studio!`;
    const { rows: newGal } = await client.query(
      `insert into galleries (
         branch_id, customer_id, shoot_id,
         title, welcome_message, status,
         drive_folder_id, drive_folder_url,
         lark_contract_code, included_quota, extra_photo_price,
         photographer_id, cskh_id, editor_id
       ) values (
         $1, $2, $3,
         $4, $5, 'draft',
         $6, $7,
         $8, 20, 50000,
         $9, $10, $11
       ) returning id`,
      [
        branchId,
        customerId,
        shootId,
        albumTitle,
        noteMsg,
        trigger.driveFolderId,
        trigger.driveUrl,
        contractCode,
        photographer?.id ?? null,
        cskh?.id ?? null,
        editor?.id ?? null,
      ],
    );

    await client.query("commit");

    return {
      action: "created",
      galleryId: newGal[0].id,
      title: albumTitle,
      contractCode: contractCode ?? undefined,
      driveFolderId: trigger.driveFolderId,
      reason: `Đã tạo album nháp thành công (id=${newGal[0].id})`,
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}
