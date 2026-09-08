/**
 * Domain types — the shared contract.
 *
 * OWNER: ARCH. Other agents read this file; they do not edit it.
 * Any change requires an ADR in docs/adr/ approved by the Tech Lead.
 *
 * Keep this file in sync with db/schema.sql and docs/04-api-spec.md.
 */

// ---------------------------------------------------------------------------
// Enums — must mirror the Postgres enums exactly
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

export type PhotoStatus = "active" | "missing" | "hidden";

export const SHARE_ROLES = ["owner", "co_editor", "suggester", "viewer"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

export type ShareLinkStatus = "active" | "revoked" | "expired";

/** `selected` counts against quota. `suggested` never does. */
export type SelectionMark = "selected" | "suggested" | "favorite" | "rejected";

export type DeliveryStatus = "pending" | "in_progress" | "ready" | "delivered";

// ---------------------------------------------------------------------------
// Entities
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
}

export interface Customer {
  id: string;
  branchId: string;
  fullName: string;
  phone: string;
  email: string | null;
  zalo: string | null;
  address: string | null;
  note: string | null;
  tags: string[];
}

export interface Baby {
  id: string;
  customerId: string;
  fullName: string;
  nickname: string | null;
  birthDate: string | null; // ISO date
  gender: "male" | "female" | "other" | null;
}

export interface Package {
  id: string;
  branchId: string | null;
  code: string;
  name: string;
  price: number;
  includedQuota: number;
  extraPhotoPrice: number;
  printedPhotoCount: number;
  isActive: boolean;
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
}

export interface SelectionItem {
  id: string;
  selectionId: string;
  photoId: string;
  galleryId: string;
  mark: SelectionMark;
  orderIndex: number | null;
  retouchNote: string | null;
  noteTags: string[];
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
  submittedAt: string | null;
  urgency: Urgency;
}
