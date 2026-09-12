/**
 * Đồng bộ bảng Hậu Kỳ từ Lark Base xuống app (galleries).
 * OWNER: DEV-INT. Task BB-111.
 * Spec: docs/16-quy-trinh-dau-cuoi.md §2, docs/15-doi-chieu-lark.md §9
 *
 * MỘT CHIỀU. Tuyệt đối không bao giờ ghi ngược lên Lark ở giai đoạn này.
 * Thông tin app tự điền là BẢN NHÁP (status = 'draft') để nhân viên soát và sửa
 * trước khi tạo link app.
 */

import pg from "pg";
import { parseDriveFolderId, InvalidDriveLinkError } from "@/lib/drive/parse-link";

export const HOST = "https://open.larksuite.com/open-apis";

// --- Hàm bóc tách dữ liệu ô Lark -------------------------------------------

/** Ô của Lark có bảy hình dạng tuỳ kiểu cột. Một hàm cho tất cả. */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v == null ? "" : typeof v === "object" ? ((v as { text?: string; name?: string }).text ?? (v as { text?: string; name?: string }).name ?? "") : String(v),
      )
      .join("");
  }
  if (typeof value === "object") {
    return (value as { text?: string; name?: string }).text ?? (value as { text?: string; name?: string }).name ?? "";
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
  return value.flatMap((v) => (v && typeof v === "object" ? ((v as { record_ids?: string[] }).record_ids ?? []) : []));
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

// --- BB-097: Bóc tên mẹ và tên bé từ tên thư mục hoặc ô văn bản -------------

export interface ParsedNames {
  customerName: string;
  babyName: string;
  isGuessed: boolean;
}

/**
 * Quy tắc bóc tên khách (BB-097):
 *   - Bỏ tiền tố "fb" / "FB" nếu có
 *   - ngoài ngoặc  -> tên mẹ
 *   - trong ngoặc  -> tên bé
 *   - không ngoặc  -> tất cả là tên mẹ
 */
export function parseCustomerAndBabyName(raw: string): ParsedNames {
  if (!raw || typeof raw !== "string") {
    return { customerName: "Khách hàng", babyName: "", isGuessed: false };
  }

  // Chuẩn hoá khoảng trắng và bỏ tiền tố FB/fb
  const trimmed = raw.replace(/\s+/g, " ").trim();
  const cleaned = trimmed.replace(/^[fF][bB]\s*[-:_]?\s*/, "").trim();

  // Tìm cặp ngoặc tròn đầu tiên
  const match = cleaned.match(/^(.*?)\((.*?)\)(.*)$/);
  if (match && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
    const partBefore = match[1].trim();
    const inside = match[2].trim();
    const partAfter = match[3].trim();
    const combinedMother = [partBefore, partAfter].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    return {
      customerName: combinedMother || "Khách hàng",
      babyName: inside,
      isGuessed: true,
    };
  }

  return {
    customerName: cleaned || "Khách hàng",
    babyName: "",
    isGuessed: false,
  };
}

// --- Trích xuất Google Drive URL --------------------------------------------

export function extractDriveUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(/https:\/\/drive\.google\.com\/[^\s"'>]+/);
  return match ? match[0] : null;
}

// --- Kiểm tra điều kiện kích hoạt BB-111 -----------------------------------

export interface RetouchTriggerCheck {
  triggered: boolean;
  driveUrl: string | null;
  driveFolderId: string | null;
  hasLayLinkApp: boolean;
  linkApp: string;
  reason?: string;
}

/**
 * Điều kiện kích hoạt BB-111:
 *   1. Có bản ghi trong bảng Hậu Kỳ
 *   2. Cột "Link ảnh gửi khách" có nội dung (chứa link Google Drive hợp lệ)
 *
 * Ngoài ra đọc thêm:
 *   - "Lấy link app" (ô tích): nhân viên đánh dấu muốn app dựng link
 *   - "Link app" (chữ): nhân viên dán tay link app vào
 */
export function checkRetouchTrigger(fields: Record<string, unknown>): RetouchTriggerCheck {
  const rawLinkField =
    getField(fields, /link\s*(ảnh|anh)\s*(gửi\s*khách|gui\s*khach)?/i) ??
    getField(fields, /link\s*(ảnh|anh)/i) ??
    getField(fields, /link.*drive/i);

  const rawLinkText = cellText(rawLinkField).trim();
  if (!rawLinkText) {
    return {
      triggered: false,
      driveUrl: null,
      driveFolderId: null,
      hasLayLinkApp: false,
      linkApp: "",
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
      driveUrl,
      driveFolderId: null,
      hasLayLinkApp: false,
      linkApp: "",
      reason: err instanceof InvalidDriveLinkError ? err.message : "Link Drive không hợp lệ",
    };
  }

  const layLinkAppField = getField(fields, /lấy\s*link\s*app|lay\s*link\s*app/i);
  const hasLayLinkApp = cellBoolean(layLinkAppField);

  const linkAppField = getField(fields, /^link\s*app$/i);
  const linkApp = cellText(linkAppField).trim();

  return {
    triggered: true,
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

// --- Đọc bảng từ Lark Base (có hỗ trợ phân trang 500) ------------------------

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
    const url =
      `${HOST}/bitable/v1/apps/${baseToken}/tables/${table.table_id}/records?page_size=500` +
      (pageToken ? `&page_token=${pageToken}` : "");

    const pageRes = await fetch(url, { headers: { authorization: auth.authorization } });
    const page = (await pageRes.json()) as {
      code: number;
      msg?: string;
      data?: { items?: LarkRecord[]; has_more?: boolean; page_token?: string };
    };

    if (page.code !== 0 || !page.data) {
      throw new Error(`Lỗi đọc bảng ${table.name}: ${page.msg || "Lỗi API"}`);
    }

    records.push(...(page.data.items ?? []));
    pageToken = page.data.has_more ? page.data.page_token ?? "" : "";
  } while (pageToken);

  return { tableId: table.table_id, tableName: table.name, records };
}

// --- Xử lý đồng bộ 1 bản ghi Hậu Kỳ xuống DB --------------------------------

export interface SyncRetouchOptions {
  client: pg.Client;
  record: LarkRecord;
  branches: BranchLookup[];
  staffList: Array<{ id: string; fullName: string; role: string }>;
  isProduction: boolean;
  write: boolean;
  index: number;
}

export interface SyncResult {
  action: "created" | "skipped" | "already_exists" | "error";
  galleryId?: string;
  title?: string;
  driveFolderId?: string;
  reason?: string;
}

/**
 * Xử lý 1 dòng bản ghi bảng Hậu Kỳ:
 *   - Kiểm tra điều kiện kích hoạt
 *   - Bóc tên khách + tên bé (BB-097)
 *   - Tạo customer nháp + baby nháp (nếu chưa có)
 *   - Tạo album nháp trong `galleries` với status='draft'
 */
export async function syncSingleRetouchRecord(opts: SyncRetouchOptions): Promise<SyncResult> {
  const { client, record, branches, staffList, isProduction, write, index } = opts;
  const fields = record.fields;

  // 1. Kiểm tra điều kiện kích hoạt
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

  // 4. Bóc tên mẹ, tên bé từ folder name hoặc ô tên khách (BB-097)
  const rawFolderTitle =
    cellText(getField(fields, /tên\s*thư\s*mục|thư\s*mục|folder|tên\s*album|bộ\s*ảnh/i)) ||
    cellText(getField(fields, /khách\s*hàng|tên\s*khách/i));

  const parsedNames = parseCustomerAndBabyName(rawFolderTitle);

  // An toàn dữ liệu mẫu: nếu không phải production thì dùng số điện thoại giả (AGENTS.md §6)
  const rawPhone = cellText(getField(fields, /số\s*điện\s*thoại|sđt|phone/i)).replace(/\D/g, "");
  let phone = rawPhone;
  if (!isProduction || !phone) {
    // Dãy số giả rõ ràng, không trùng, hợp lệ định dạng VN
    phone = `0901${String(index + 1).padStart(6, "0")}`;
  }

  // Tên khách hàng & tên bé
  let customerName = parsedNames.customerName || "Khách hàng";
  const babyName = parsedNames.babyName;
  if (!isProduction && /^(nguyễn|trần|lê|phạm|hoàng|huỳnh|phan|vũ|võ|đặng|bùi|đỗ|hồ|ngô|dương|lý)/i.test(customerName)) {
    // Nếu dữ liệu trông giống tên người thật ngoài đời, thêm nhãn mẫu để tránh commit thông tin cá nhân
    customerName = `${customerName} [Dự thảo]`;
  }

  // Mã hợp đồng
  const rawContract = cellText(getField(fields, /hợp\s*đồng|mã\s*hợp\s*đồng|hóa\s*đơn|contract/i)).trim();
  const contractCode = rawContract || null;

  // Tiêu đề album
  const albumTitle = rawFolderTitle
    ? rawFolderTitle.replace(/\s+/g, " ").trim()
    : babyName
      ? `Album Bé ${babyName} - ${customerName}`
      : `Album ${customerName}`;

  // Thợ ảnh, CSKH, retoucher
  const rawPhotographer = cellText(getField(fields, /thợ\s*chụp|photographer/i)).toLowerCase();
  const rawEditor = cellText(getField(fields, /người\s*photoshop|photoshop\s*ctv|retoucher/i)).toLowerCase();
  const rawCskh = cellText(getField(fields, /cskh/i)).toLowerCase();

  const photographer = staffList.find((s) => s.role === "photographer" && rawPhotographer.includes(s.fullName.toLowerCase()));
  const editor = staffList.find((s) => (s.role === "retoucher" || s.role === "photoshop_ctv") && rawEditor.includes(s.fullName.toLowerCase()));
  const cskh = staffList.find((s) => s.role === "cs" && rawCskh.includes(s.fullName.toLowerCase()));

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
      driveFolderId: trigger.driveFolderId,
      reason: `Sẽ tạo album nháp: "${albumTitle}" (Mẹ: ${customerName}, Bé: ${babyName || "—"}, HĐ: ${contractCode || "—"})`,
    };
  }

  // --- Ghi vào DB trong transaction ---
  await client.query("begin");
  try {
    // A. Tìm hoặc tạo Customer
    const { rows: custRows } = await client.query(
      `select id from customers where branch_id = $1 and phone_normalized = regexp_replace($2, '\\D', '', 'g') limit 1`,
      [branchId, phone],
    );

    let customerId: string;
    if (custRows.length > 0) {
      customerId = custRows[0].id;
    } else {
      const { rows: newCust } = await client.query(
        `insert into customers (branch_id, full_name, phone, note, source, tags)
         values ($1, $2, $3, $4, 'lark_retouch', array['lark_draft', 'bb111'])
         returning id`,
        [
          branchId,
          customerName,
          phone,
          `[Đồng bộ Lark Hậu Kỳ] ${parsedNames.isGuessed ? "Máy đoán từ tên thư mục: " + customerName : "Bản nháp tự điền"}`,
        ],
      );
      customerId = newCust[0].id;
    }

    // B. Tạo Baby nếu có tên bé
    let babyId: string | null = null;
    if (babyName) {
      const { rows: babyRows } = await client.query(
        `select id from babies where customer_id = $1 and lower(full_name) = lower($2) limit 1`,
        [customerId, babyName],
      );
      if (babyRows.length > 0) {
        babyId = babyRows[0].id;
      } else {
        const { rows: newBaby } = await client.query(
          `insert into babies (customer_id, full_name, nickname, note)
           values ($1, $2, $3, $4)
           returning id`,
          [customerId, babyName, babyName, "[Tự động điền từ Lark Hậu Kỳ]"],
        );
        babyId = newBaby[0].id;
      }
    }

    // C. Tạo Shoot
    const { rows: newShoot } = await client.query(
      `insert into shoots (branch_id, customer_id, baby_id, photographer_id, shoot_date, note)
       values ($1, $2, $3, $4, $5, '[Đồng bộ Lark Hậu Kỳ]')
       returning id`,
      [branchId, customerId, babyId, photographer?.id ?? null, shootDate],
    );
    const shootId = newShoot[0].id;

    // D. Tạo Gallery (Album) với status = 'draft'
    const noteMsg = `Chào mừng ba mẹ và bé đến với album ảnh của BabyBean Studio!`;
    const { rows: newGal } = await client.query(
      `insert into galleries (
         branch_id, customer_id, baby_id, shoot_id,
         title, welcome_message, status,
         drive_folder_id, drive_folder_url, drive_folder_name,
         lark_contract_code, included_quota, extra_photo_price,
         photographer_id, cskh_id, editor_id
       ) values (
         $1, $2, $3, $4,
         $5, $6, 'draft',
         $7, $8, $9,
         $10, 20, 50000,
         $11, $12, $13
       ) returning id`,
      [
        branchId,
        customerId,
        babyId,
        shootId,
        albumTitle,
        noteMsg,
        trigger.driveFolderId,
        trigger.driveUrl,
        rawFolderTitle || null,
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
      driveFolderId: trigger.driveFolderId,
      reason: `Đã tạo album nháp thành công (id=${newGal[0].id})`,
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}
