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
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const GALLERY_STATUSES = [
  "draft",
  "syncing",
  "sync_error",
  "ready",
  "in_review",
  "submitted",
  "in_retouch",
  "delivered",
  "expired",
  "archived",
] as const;
export type GalleryStatus = (typeof GALLERY_STATUSES)[number];

export const PHOTO_STATUSES = ["active", "missing", "hidden"] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

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
  logoUrl: string | null;
  timezone: string;
  isActive: boolean;
  settings?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
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
  includedQuota: number;
  extraPhotoPrice: number;
  printedPhotoCount: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
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

  includedQuota: number;
  extraPhotoPrice: number;
  /** null = no hard cap; customer may keep adding paid photos. */
  maxSelection: number | null;
  allowExtra: boolean;

  coverPhotoId: string | null;
  watermarkEnabled: boolean;
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
  galleryId: string;
  tokenPrefix: string;
  role: ShareRole;
  label: string | null;
  requiresPin: boolean;
  status: ShareLinkStatus;
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;

  /** Database-only fields for administrative and security auditing */
  tokenHash?: string;
  pinHash?: string | null;
  failedAttempts?: number;
  lockedUntil?: string | null;
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
  galleryId: string;
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
  "PIN_REQUIRED",
  "PIN_INVALID",
  "PIN_LOCKED",
  "FORBIDDEN",
  "NOT_FOUND",
  "LINK_EXPIRED",
  "GALLERY_LOCKED",
  "QUOTA_EXCEEDED",
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

export const THUMBNAIL_WIDTHS = [200, 400, 800, 1600] as const;
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
  includedQuota: number;
  selectedCount: number;
  extraCount: number;
  dueAt: string | null;
  sentAt?: string | null;
  submittedAt: string | null;
  primarySelectionId?: string | null;
  urgency: Urgency;
  daysToSubmit?: number | null;
}
