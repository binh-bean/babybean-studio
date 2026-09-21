/**
 * Domain types — the shared contract.
 *
 * OWNER: ARCH. Other agents read this file; they do not edit it.
 * Any change requires an ADR in docs/adr/ approved by the Tech Lead.
 *
 * Keep this file in sync with db/schema.sql and docs/04-api-spec.md.
 */

// ---------------------------------------------------------------------------
// Enums — must mirror the Postgres enums and check constraints exactly
// ---------------------------------------------------------------------------

export const STAFF_ROLES = [
  "owner",
  "admin",
  "branch_manager",
  "cs",
  "photographer",
  "retoucher",
  "accountant",
  "viewer",
  "photoshop_ctv",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// Danh sách nằm ở @/lib/gallery-status — một nguồn duy nhất, có phép thử so
// với enum thật trong cơ sở dữ liệu. Bản chép tay ở đây từng thiếu
// 'awaiting_approval' và 'approved'.
import { GALLERY_STATUSES, type GalleryStatusValue } from "@/lib/gallery-status";
export { GALLERY_STATUSES };
export type GalleryStatus = GalleryStatusValue;

export const PHOTO_STATUSES = ["active", "missing", "hidden"] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export const PRODUCT_KINDS = [
  "shoot_package",
  "edited_photo",
  "print",
  "addon",
  "service",
] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];


export const SHARE_ROLES = ["owner", "co_editor", "suggester", "viewer"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

export const SHARE_LINK_STATUSES = ["active", "revoked", "expired"] as const;
export type ShareLinkStatus = (typeof SHARE_LINK_STATUSES)[number];

/** `selected` counts against quota. `suggested` never does. */
export const SELECTION_MARKS = ["selected", "suggested", "favorite", "rejected"] as const;
export type SelectionMark = (typeof SELECTION_MARKS)[number];

export const DELIVERY_STATUSES = ["pending", "in_progress", "ready", "delivered"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const ACTOR_TYPES = ["staff", "customer", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["lark", "zalo", "email", "inapp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ["pending", "sent", "failed", "skipped"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const CUSTOMER_SOURCES = ["facebook", "zalo", "referral", "walk_in"] as const;
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];

export const BABY_GENDERS = ["male", "female", "other"] as const;
export type BabyGender = (typeof BABY_GENDERS)[number];

// ---------------------------------------------------------------------------
// Entities — mirror Postgres tables
// ---------------------------------------------------------------------------

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  hotline: string | null;
  zaloOa: string | null;
  chatUrl?: string | null;
  logoUrl: string | null;
  timezone: string;
  isActive: boolean;
  settings?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  roleId?: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  branchIds: string[];
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffBranch {
  staffId: string;
  branchId: string;
  isPrimary: boolean;
  createdAt?: string;
}

export interface Customer {
  id: string;
  branchId: string;
  fullName: string;
  phone: string;
  phoneNormalized?: string;
  email: string | null;
  zalo: string | null;
  facebook?: string | null;
  address: string | null;
  note: string | null;
  source?: CustomerSource | string | null;
  tags: string[];
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Baby {
  id: string;
  customerId: string;
  fullName: string;
  nickname: string | null;
  birthDate: string | null; // ISO date YYYY-MM-DD
  gender: BabyGender | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Package {
  id: string;
  branchId: string | null;
  code: string;
  name: string;
  description?: string | null;
  price: number;
  includedQuota: number | null;
  extraPhotoPrice: number;
  printedPhotoCount: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  branchId: string | null;
  name: string;
  kind: ProductKind;
  material: string | null;
  size: string | null;
  listPrice: number | null;
  /**
   * Chỉ báo giá cho khách khi: priceConfidence >= 0.8 VÀ priceSamples >= 5.
   * Nếu không đủ điều kiện, phải hiện "CSKH sẽ báo giá", tuyệt đối KHÔNG hiện số 0
   * và không hiện giá đoán.
   */
  priceConfidence: number | null;
  priceSamples: number;
  larkCategory: string | null;
  larkRecordId: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GalleryItem {
  id: string;
  galleryId: string;
  productId: string;
  parentItemId: string | null;
  quantity: number;
  unitPrice: number | null;
  larkContractCode: string | null;
  larkRecordId: string | null;
  createdAt?: string;
}

export interface Shoot {
  id: string;
  branchId: string;
  customerId: string;
  babyId: string | null;
  packageId: string | null;
  photographerId: string | null;
  shootDate: string; // YYYY-MM-DD
  concept: string | null;
  note: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Gallery {
  id: string;
  branchId: string;
  shootId: string | null;
  customerId: string;
  babyId: string | null;
  packageId: string | null;

  title: string;
  welcomeMessage: string | null;
  status: GalleryStatus;

  driveFolderId: string;
  driveFolderUrl: string;
  driveFolderName: string | null;
  larkContractCode: string | null;

  includedQuota: number | null;
  extraPhotoPrice: number;
  /** null = no hard cap; customer may keep adding paid photos. */
  maxSelection: number | null;
  allowExtra: boolean;

  coverPhotoId: string | null;
  downloadEnabled: boolean;
  notesEnabled: boolean;
  inviteEnabled: boolean;

  dueAt: string | null;
  sentAt: string | null;
  firstViewedAt: string | null;
  submittedAt: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;

  photoCount: number;
  lastSyncedAt: string | null;
  syncError: string | null;

  createdBy?: string | null;
  photographerId?: string | null;
  cskhId?: string | null;
  editorId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Photo {
  id: string;
  galleryId: string;
  /** Never sent to the customer client — it would leak the raw Drive link. */
  driveFileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  takenAt: string | null;
  subfolder: string | null;
  sortIndex: number;
  status: PhotoStatus;
  driveModifiedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Photo shape safe to send to the browser. Note: no driveFileId. */
export interface PhotoPublic {
  id: string;
  fileName: string;
  width: number | null;
  height: number | null;
  subfolder: string | null;
  sortIndex: number;
  status: PhotoStatus;
  isFavorite: boolean;
  mark: SelectionMark | null;
  orderIndex: number | null;
  retouchNote: string | null;
  noteTags: string[];
  suggestedBy: string[];
}

export interface ShareLink {
  id: string;
  galleryId: string | null;
  customerId: string | null;
  tokenPrefix: string;
  role: ShareRole;
  label: string | null;
  status: ShareLinkStatus;
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;

  /** Database-only fields for administrative and security auditing */
  tokenHash?: string;
  maxViews?: number | null;
  lastViewedIp?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  revokedAt?: string | null;
  revokedBy?: string | null;
}

export interface Selection {
  id: string;
  galleryId: string;
  shareLinkId: string;
  displayName: string | null;
  isPrimary: boolean;
  generalNote: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  snapshotSelectedCount: number | null;
  snapshotExtraCount: number | null;
  snapshotExtraAmount: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SelectionItem {
  id: string;
  selectionId: string;
  photoId: string;
  galleryId: string;
  isFavorite: boolean;
  mark: SelectionMark;
  orderIndex: number | null;
  retouchNote: string | null;
  noteTags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SelectionAddon {
  id: string;
  selectionId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  createdAt?: string;
}

export interface SelectionPlacement {
  selectionItemId: string;
  galleryItemId: string;
}

/** Record in the selection_ops table for idempotency tracking */
export interface SelectionOpRecord {
  clientOpId: string;
  selectionId: string;
  appliedAt: string;
}
export type SelectionOpRow = SelectionOpRecord;

export interface DeliveryPhysicalItem {
  type: string;
  name: string;
  quantity: number;
  note?: string;
  [key: string]: unknown;
}

export interface Delivery {
  id: string;
  galleryId: string;
  branchId: string;
  status: DeliveryStatus;
  retoucherId: string | null;
  dueAt: string | null;
  finalDriveUrl: string | null;
  physicalItems: DeliveryPhysicalItem[];
  deliveredAt: string | null;
  receivedBy: string | null;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActivityLog {
  id: number; // bigserial
  branchId: string | null;
  actorType: ActorType;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt?: string;
}

export interface Notification {
  id: string;
  branchId: string | null;
  channel: NotificationChannel;
  template: string;
  payload: Record<string, unknown>;
  target: string | null;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  scheduledAt: string;
  sentAt: string | null;
  createdAt?: string;
}

export interface Setting {
  id: string;
  key: string;
  branchId: string | null; // null = system-wide
  value: Record<string, unknown>;
  updatedBy: string | null;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Payload of the signed `bb_gs` cookie. Never trust IDs from the request body. */
export interface GallerySession {
  /**
   * Buổi chụp phiên đang trỏ tới. RỖNG khi link gắn theo khách và ba mẹ chưa
   * chọn buổi nào — lúc đó chỉ có `customerId` là dùng được (BB-130).
   */
  galleryId: string;
  /**
   * Khách sở hữu link. RỖNG với link kiểu cũ (gắn theo bộ ảnh).
   *
   * Trường này từng bị ký vào cookie qua một ép kiểu `as any` vì kiểu ở đây
   * chưa có nó — nên trình biên dịch không hề canh chỗ nào đọc ra. Khai báo
   * thật thì mọi chỗ lọc "chỉ của khách này" đều được kiểm lúc biên dịch.
   */
  customerId: string;
  shareLinkId: string;
  selectionId: string;
  role: ShareRole;
  exp: number;
}

export interface StaffSession {
  staffId: string;
  role: StaffRole;
  branchIds: string[];
}

// ---------------------------------------------------------------------------
// API envelope — see docs/04-api-spec.md §2
// ---------------------------------------------------------------------------

export const ERROR_CODES = [
  "INVALID_INPUT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "LINK_EXPIRED",
  // BB-187: phiên đang mở thuộc về MỘT LINK KHÁC với mã trên thanh địa chỉ.
  //
  // Khác LINK_EXPIRED: link cũ vẫn sống, chỉ là nó không phải link ba mẹ vừa bấm.
  // Mã trên địa chỉ mới là thứ họ chủ động mở, nên nó thắng phiên đang cầm.
  "SESSION_MISMATCH",
  "GALLERY_LOCKED",
  "QUOTA_EXCEEDED",
  // Khác QUOTA_EXCEEDED: khách chọn quá là một chuyện, studio chưa nhập hạn
  // mức là chuyện khác. CSKH xử lý hai việc khác nhau.
  "QUOTA_UNKNOWN",
  "CONFLICT",
  "RATE_LIMITED",
  "DRIVE_ACCESS_DENIED",
  "DRIVE_UNAVAILABLE",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiMeta {
  cursor?: string;
  hasMore?: boolean;
  total?: number;
}

export type ApiResponse<T> = { data: T; meta?: ApiMeta } | { error: ApiError };

// ---------------------------------------------------------------------------
// Selection payloads
// ---------------------------------------------------------------------------

export interface SelectionOp {
  photoId: string;
  /** null clears the mark (deselect). */
  mark?: SelectionMark | null;
  retouchNote?: string | null;
  noteTags?: string[];
}

export interface SelectionPatchRequest {
  /** Client-generated UUID. Makes retries safe — see docs/02-architecture.md §2.5. */
  clientOpId: string;
  ops: SelectionOp[];
}

export interface SelectionCounts {
  selectedCount: number;
  favoriteCount: number;
  extraCount: number;
  extraAmount: number;
}

export interface SelectionPatchResponse extends SelectionCounts {
  applied: number;
  rejected: Array<{ photoId: string; code: ErrorCode }>;
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  width: number | null;
  height: number | null;
  takenAt: string | null;
  modifiedAt: string | null;
  subfolder: string | null;
}

export interface DriveFolderPreview {
  folderId: string;
  folderName: string;
  fileCount: number;
  subfolders: string[];
  sample: Array<{ driveFileId: string; fileName: string; thumbnailUrl: string }>;
}

// BB-161: thêm 2048 cho màn xem ảnh lớn. Đo trên một ảnh gốc 5472x3648:
//   w1600 -> 146 KB · w2048 -> 228 KB · gốc (=s0) -> 3.535 KB
// Google nén khá mạnh ở mọi cỡ, nên nhảy lên 2048 chỉ tốn thêm 80 KB mà ảnh
// rõ hơn hẳn trên màn hình retina của ba mẹ.
export const THUMBNAIL_WIDTHS = [200, 400, 800, 1600, 2048] as const;
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type Urgency = "done" | "no_due" | "overdue" | "due_soon" | "on_track";

export interface GalleryProgress {
  id: string;
  branchId: string;
  branchName: string;
  title: string;
  status: GalleryStatus;
  customerName: string;
  customerPhone: string;
  photoCount: number;
  includedQuota: number | null;
  selectedCount: number;
  extraCount: number | null;
  dueAt: string | null;
  sentAt?: string | null;
  submittedAt: string | null;
  primarySelectionId?: string | null;
  urgency: Urgency;
  daysToSubmit?: number | null;
}

// ---------------------------------------------------------------------------
// Báo cáo thất thoát (BB-106)
// ---------------------------------------------------------------------------

export interface OverQuotaUnbilledRow {
  galleryId: string;
  galleryTitle: string;
  id?: string;
  title?: string;
  albumId?: string;
  albumTitle?: string;
  branchId: string;
  branchName: string;
  larkContractCode: string | null;
  shootDate: string | null;
  quota: number | null;
  includedQuota?: number | null;
  selectedCount: number;
  overCount: number;
  addonCount: number;
  addonPhotoCount?: number;
  unbilledCount: number;
  unbilledPhotoCount?: number;
  extraPhotoPrice: number;
  unbilledAmount: number;
}

export interface OverQuotaSummary {
  overQuotaAlbumCount: number;
  albumCount?: number;
  unbilledPhotoCount: number;
  photoCount?: number;
  totalUnbilledAmount: number;
  totalAmount?: number;
  missingQuotaAlbumCount: number;
  missingDataAlbumCount?: number;
}

// ---------------------------------------------------------------------------
// Thanh toán phát sinh (BB-115)
// ---------------------------------------------------------------------------

export interface GalleryPayment {
  id: string;
  galleryId: string;
  selectionId: string | null;
  amount: number;
  snapshotExtraAmount: number | null;
  paymentMethod: string;
  confirmedBy: string;
  confirmedAt: string;
  note: string | null;
  createdAt: string;
}


