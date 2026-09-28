// Khai kiểu cho nap-lai-tu-lark.mjs — chỉ để phép thử TypeScript (BB-300)
// gọi được các hàm xuất ra với kiểu rõ ràng. File .mjs vẫn là nguồn sự thật;
// khai sai ở đây thì phép thử báo lỗi kiểu, không phải hành vi thật sai.

export interface DbGia {
  query(sql: string, tso?: unknown[]): Promise<{ rows?: unknown[]; rowCount?: number }>;
}

export const GOC_REPO: string;
export const MA_BB_DEV: string;
export const BANG_GIU_NGUYEN: string[];
export const THU_TU_XOA: string[];

export function phanLoaiBang(
  danhSachBangThat: string[],
  bangGiu?: string[],
  thuTuXoaDaBiet?: string[],
): { giu: string[]; xoa: string[]; moi: string[] };

export interface CanhFk {
  tu: string;
  den: string;
  batBuoc: boolean;
}

export function kiemTraThuTuAnToan(
  thuTuXoa: string[],
  canhFk: CanhFk[],
): { anToan: boolean; loi: string[] };

export function taoMaXacNhan(demTheoBang: Record<string, number>, ngayYYYYMMDD: string): string;
export function ngayHomNay(bayGio?: Date): string;

export function duongDanSaoLuuHopLe(
  duongDanChon: string,
  gocRepo?: string,
): { hopLe: boolean; duong?: string; ly_do?: string };

export interface SanLuu {
  thoiDiem: string;
  tongSoDong?: number;
  demTheoBang?: Record<string, number>;
  duongDan?: string;
}

export function kiemTraDieuKienXoa(opts: {
  maNhapVao: string | null;
  demHienTai: Record<string, number>;
  ngayHienTai: string;
  sanLuuGanNhat: SanLuu | null;
  urlKetNoi: string;
  coCoThatSuLaBbDev: boolean;
  gioAnToanBanSaoLuu?: number;
}): { choPhep: boolean; loi: string[] };

export function taoClient(dbUrl: string): unknown;
export function danhSachBangThat(client: DbGia): Promise<string[]>;
export function canhKhoaNgoai(client: DbGia): Promise<CanhFk[]>;
export function demBang(client: DbGia, danhSachBang: string[]): Promise<Record<string, number>>;
export function xuatSaoLuu(
  client: DbGia,
  danhSachBang: string[],
  thuMucDich: string,
): Promise<{ thoiDiem: string; tongSoDong: number; demTheoBang: Record<string, number> }>;
export function sanLuuGanNhatTrongThuMuc(gocSaoLuu: string): SanLuu | null;
export const TEN_TEP_MOC: string;
export function docMocSaoLuuGanNhat(gocSaoLuu: string): SanLuu | null;
export function ghiMocSaoLuuGanNhat(gocSaoLuu: string, thuMucBanSaoLuu: string): void;
export function docBanSaoLuuTaiThuMuc(thuMuc: string | null | undefined): SanLuu | null;
export function xoaSachGiaoDich(
  client: DbGia,
  thuTuXoa: string[],
): Promise<Record<string, number>>;
export function khoiPhucGiaoDich(
  client: DbGia,
  thuTuKhoiPhuc: string[],
  thuMucNguon: string,
): Promise<Record<string, number>>;
export function banGiuLieuKhongRong(demHienTai: Record<string, number>): string[];

export interface LenhNap {
  ten: string;
  lenh: string;
  tso: string[];
}

export function danhSachLenhNap(): LenhNap[];

export interface KetQuaLenh {
  ten: string;
  thanhCong: boolean;
  maThoat: number | null;
  stdout: string;
  stderr: string;
}

export type RunnerGia = (lenh: string, tso: string[]) => { status: number | null; stdout: string; stderr: string };

export function chayNap(lenhs: LenhNap[], runner?: RunnerGia, cwd?: string): KetQuaLenh[];
