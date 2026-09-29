#!/usr/bin/env node
/**
 * chep-cau-hinh — chép CẤU HÌNH (không phải dữ liệu khách) từ một môi trường
 * sang một môi trường khác: chi nhánh, vai trò, nhân sự, cài đặt, gói chụp.
 *
 * OWNER: DEV-OPS. Task BB-315. Sửa lỗi chặn C2 + S2/S3/S5 theo soát của cố
 * vấn CV-01 (scratchpad/co-van/4-soat-runbook.md).
 *
 * ---------------------------------------------------------------------------
 * Vì sao đúng SÁU bảng này, không hơn
 * ---------------------------------------------------------------------------
 * `BANG_GIU_NGUYEN` (import từ `nap-lai-tu-lark.mjs`) là danh sách sáu bảng mà
 * "xoá sạch rồi nạp lại từ Lark" KHÔNG đụng tới, vì Lark không biết gì về
 * chúng. Đây đúng là sáu bảng cần một đường CHÉP riêng, vì chúng không tự có
 * ở đích: `branches`, `staff_profiles`, `staff_branches`, `roles`, `settings`,
 * `packages`. Dùng lại cùng một danh sách — không định nghĩa hai lần, không
 * để hai chỗ lệch nhau khi có bảng cấu hình mới trong tương lai.
 *
 * `roles` chỉ chép phần VAI TỰ TẠO (`is_system = false`) — chín vai hệ thống
 * dùng UUID CỐ ĐỊNH `00000000-0000-0000-0000-00000000000N` giống hệt nhau ở
 * mọi môi trường (xem `db/migrations/0052-vai-tro-dong.sql`), migration tự lo,
 * không cần chép.
 *
 * ---------------------------------------------------------------------------
 * LỖI CHẶN C2 (đã sửa) — branches khớp theo id → code → name, không tự chèn
 * ---------------------------------------------------------------------------
 * Bản đầu khớp `branches` CHỈ theo `code`, và dòng không khớp được thì CHÈN
 * MỚI bằng đúng UUID của nguồn. `db/seed.sql` và `db/seed-prod.sql` dùng
 * CHUNG ba UUID `1111…/2222…/3333…` nhưng khác `code` — nếu bb-prod vẫn còn
 * `code` cũ (`BB-Q1`/`BB-GV`) khác bb-dev hiện tại (`BB-Q1`/`BB-TD`/`BB-GV`
 * cũ, đã đổi hiển thị sang Pasteur/Tân Bình/Thảo Điền), việc chèn bằng UUID
 * nguồn sẽ `duplicate key value violates unique constraint "branches_pkey"`.
 * Cố vấn CV-01 gọi đây là lỗi chặn C2.
 *
 * Sửa: `khopBranch()` khớp theo BA khoá, ưu tiên id trước, rồi code, rồi
 * name. Một dòng nguồn KHÔNG khớp được với bất kỳ dòng đích nào (thật sự là
 * chi nhánh MỚI) rơi vào `themMoi` — và `--ghi` TỪ CHỐI chạy nếu `themMoi`
 * của branches > 0 (xem `main()`), bắt người vận hành xử lý tay thay vì tự
 * chèn một UUID có thể trùng khoá chính. `branches` vì vậy chỉ CÓ NHÁNH SỬA,
 * không có nhánh CHÈN, trong toàn bộ vòng đời `--ghi` của công cụ này.
 *
 * `packages`/`settings`/`staff_branches` vẫn được PHÉP chèn dòng mới bằng id
 * nguồn (không có collision UUID lịch sử như branches — packages/roles không
 * dùng lại `1111…/2222…/3333…`), nhưng branch_id của chúng LUÔN nắn qua bản
 * đồ id chi nhánh đã khớp — không bao giờ chép thẳng branch_id nguồn.
 *
 * ---------------------------------------------------------------------------
 * Giao dịch — TOÀN BỘ phần ghi bảng nằm trong MỘT giao dịch
 * ---------------------------------------------------------------------------
 * Bản đầu ghi từng câu rời — gãy ở giữa (ví dụ packages) để lại branches đã
 * đổi, packages/settings/staff chưa, mã xác nhận cũ không dùng lại được, và
 * không ai biết trạng thái nửa vời đó tới khi soát lại tay. Nay `branches`
 * (chỉ sửa) → `packages` → `roles` → `settings` (trừ khoá trạng thái, xem
 * dưới) → cập nhật hồ sơ nhân sự ĐÃ CÓ chạy trong MỘT `begin/commit`, rollback
 * sạch nếu bất kỳ câu nào lỗi.
 *
 * `auth.users` (tạo tài khoản MỚI) đứng NGOÀI giao dịch đó, chạy SAU khi
 * commit — Admin Auth API là một dịch vụ HTTP riêng của Supabase, không tham
 * gia được vào transaction Postgres. Vì vậy phần "tạo nhân sự mới" luôn chạy
 * cuối cùng, mỗi người một cố gắng độc lập (một người lỗi không huỷ người
 * khác), và KHÔNG nằm trong đường lùi tự động của bước ghi bảng.
 *
 * ---------------------------------------------------------------------------
 * S5 (đã sửa) — role_id của staff_profiles phải nắn qua bản đồ vai
 * ---------------------------------------------------------------------------
 * Bản đầu chép thẳng `role_id` của nguồn. Một vai TỰ TẠO đã có sẵn ở đích
 * (khớp theo `name`, id khác nguồn) làm `role_id` nguồn trỏ vào một hàng
 * KHÔNG TỒN TẠI ở đích → vi phạm khoá ngoại `staff_profiles.role_id ->
 * roles.id`. `xayBanDoVai()` khớp roles theo tên (dòng đã có ở đích giữ id
 * đích; dòng mới chèn bằng id nguồn — không có rủi ro trùng UUID lịch sử như
 * branches), rồi nắn `role_id` qua bản đồ đó trước khi ghi.
 *
 * ---------------------------------------------------------------------------
 * S2 (đã sửa) — xác nhận `lark.webhook_url` là nhóm THẬT trước khi ghi
 * ---------------------------------------------------------------------------
 * `docs/26` §14 đổi tạm `lark.webhook_url` sang nhóm "Kiểm thử app" trong
 * tuần nhân viên thử trên bb-dev. Nếu quên đổi lại TRƯỚC khi chạy bước chép
 * cấu hình, bb-prod sẽ nhận webhook của nhóm THỬ — mọi tin khách chốt sau khi
 * mở đi lạc vào đó, không ai trong nhóm vận hành thật thấy, và không có lỗi
 * nào hiện ra để biết mà sửa. `--ghi` khi phần chép `settings` có đụng khoá
 * `lark.webhook_url` (thêm hoặc sửa) sẽ in giá trị ĐÃ CHE (`cheBot`) và đòi
 * thêm cờ `--xac-nhan-webhook-that` — một xác nhận TÁCH RIÊNG khỏi mã
 * `--xac-nhan` (mã đó đổi theo SỐ ĐẾM, không nói lên được webhook trỏ đúng
 * nhóm hay không).
 *
 * ---------------------------------------------------------------------------
 * S3 (đã sửa) — không chép khoá TRẠNG THÁI đồng bộ
 * ---------------------------------------------------------------------------
 * `settings` không chỉ chứa cấu hình — nó còn giữ `lark_hook_queue` (hàng đợi
 * đang chạy của đường kéo Lark) và `lark_retouch_last_sync` (mốc cron đã đồng
 * bộ tới đâu, `src/lib/lark/dong-bo-bo-anh.ts`). Chép nguyên các khoá này
 * sang một cơ sở dữ liệu MỚI NẠP là bảo prod "đã đồng bộ tới giờ này" trong
 * khi nó chưa có gì — lượt cron đầu bỏ qua mọi bản ghi Lark sửa trước mốc đó.
 * `laKhoaTrangThaiDongBo()` loại các khoá này (và mọi khoá kết thúc bằng
 * `_last_sync`/`_cursor`, phòng khoá tương lai cùng kiểu) khỏi TOÀN BỘ vòng
 * đời so sánh/chép — không hiện trong phần chỉ-xem, không ghi.
 *
 * ---------------------------------------------------------------------------
 * Nhân sự — auth.users tách riêng theo từng project Supabase
 * ---------------------------------------------------------------------------
 * Đã tra `@supabase/auth-js` (kiểu `AdminUserAttributes`, trường `id?: string`
 * — "Allows you to overwrite the default `id` set for the user"): Admin API
 * `auth.admin.createUser({ id, ... })` CHO PHÉP đặt sẵn UUID, không phải để
 * Supabase tự sinh. Nên nhân sự chép sang giữ ĐÚNG UUID cũ, `staff_profiles.id`
 * ở đích khớp thẳng `auth.users.id` mới tạo, không cần bảng ánh xạ.
 *
 * KHÔNG chép mật khẩu — không có gì để chép, vì tệp sao lưu và bảng
 * `staff_profiles` đọc ở nguồn còn không CHỨA mật khẩu (nằm trong
 * `auth.users`, ngoài tầm mọi script ở đây, xem `backup.mjs`). Tài khoản tạo
 * ra ở đích được gán một mật khẩu NGẪU NHIÊN, dài, không lưu lại — tức không
 * ai, kể cả người chạy script, biết mật khẩu đó. Chủ studio (hoặc chính nhân
 * sự sau khi được cấp lại) phải ĐẶT MẬT KHẨU MỚI qua "Đặt lại mật khẩu" trong
 * màn Nhân sự (PATCH /api/admin/staff/:id, đã có sẵn — BB-063) trước khi tài
 * khoản đó dùng được. Ghi rõ việc này trong runbook `docs/26`.
 *
 * Trùng email nhưng KHÁC id (ví dụ chủ studio đã tự tay tạo tài khoản owner
 * đầu tiên ở bb-prod theo docs/18 §2.1, trùng email với một dòng ở bb-dev):
 * script IN CẢ HAI id (nguồn và id thật đã tìm thấy ở đích qua tra email) và
 * VẪN GHI `staff_profiles`/`staff_branches` bằng đúng id THẬT tìm được ở
 * đích — không bỏ hẳn nhân sự đó, chỉ là không tạo được một auth.users MỚI
 * cho họ (vì đã có sẵn một tài khoản khác đang giữ email này).
 *
 * ---------------------------------------------------------------------------
 * An toàn khi in ra màn hình
 * ---------------------------------------------------------------------------
 * Mặc định (không có `--ghi`) là CHỈ ĐỌC — không được PHÉP in tên/SĐT/email
 * nhân sự, không in giá trị cài đặt đánh dấu bí mật (`lark.webhook_url`, trừ
 * dạng đã che). Chỉ in id và khoá tự nhiên (code/key/tên vai).
 *
 * ---------------------------------------------------------------------------
 * Cách chạy
 * ---------------------------------------------------------------------------
 *   # chỉ xem — không ghi gì, chỉ đọc bb-dev qua .env.local
 *   node --import tsx scripts/chep-cau-hinh.mjs --dich .env.prod.local
 *
 *   # ghi thật (chủ studio duyệt rồi mới chạy) — Claude chạy phần bb-prod
 *   node --import tsx scripts/chep-cau-hinh.mjs --dich .env.prod.local \
 *     --ghi --xac-nhan <mã in ra ở lượt chỉ-xem> --that-su-la-bb-prod \
 *     --xac-nhan-webhook-that   (chỉ cần khi phần chép settings đụng lark.webhook_url)
 */

import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { docTepEnv } from "./lib/doc-tep-env.mjs";
import { inMoiTruong, kiemTraMoiTruongChoPhep, kiemTraCoBbProd, MA_BB_DEV, maDuAn } from "./lib/moi-truong.mjs";
import { BANG_GIU_NGUYEN } from "./nap-lai-tu-lark.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GOC_REPO = path.resolve(__dirname, "..");

/** Sáu bảng cấu hình biết chép — dùng lại nguyên danh sách của nap-lai-tu-lark.mjs. */
export const BANG_CAU_HINH = BANG_GIU_NGUYEN;

// ============================================================================
// Logic thuần — không đụng cơ sở dữ liệu, kiểm bằng phép thử đơn vị thẳng.
// ============================================================================

/** So cột đơn giản: liệt kê tên cột có giá trị khác nhau (so sánh JSON, đủ cho scalar/jsonb). */
export function soSanhCotDonGian(cotCanSo) {
  return (nguon, dich) => cotCanSo.filter((c) => JSON.stringify(nguon[c]) !== JSON.stringify(dich[c]));
}

/**
 * So sánh một tập dòng NGUỒN với một tập dòng ĐÍCH theo MỘT khoá tự nhiên
 * (packages, roles, settings — không có rủi ro trùng UUID lịch sử như
 * branches, xem `khopBranch` ở dưới cho lý do branches cần ba khoá).
 */
export function soSanhTheoKhoa(hangNguon, hangDich, khoaCua, soSanhCot) {
  const dichTheoKhoa = new Map(hangDich.map((r) => [khoaCua(r), r]));
  const khoaNguon = new Set();
  const themMoi = [];
  const capNhat = [];
  const khongDoi = [];

  for (const n of hangNguon) {
    const k = khoaCua(n);
    khoaNguon.add(k);
    const d = dichTheoKhoa.get(k);
    if (!d) {
      themMoi.push(n);
      continue;
    }
    const cotKhac = soSanhCot(n, d);
    if (cotKhac.length > 0) {
      capNhat.push({ nguon: n, dich: d, cotKhac });
    } else {
      khongDoi.push({ nguon: n, dich: d });
    }
  }

  const xoaODich = hangDich.filter((d) => !khoaNguon.has(khoaCua(d)));
  return { themMoi, capNhat, khongDoi, xoaODich };
}

/**
 * BB-315 (lỗi chặn C2) — khớp branches theo BA khoá, ưu tiên id → code →
 * name. Trả về Map<idNguon, dòngĐích | null> — `null` nghĩa là dòng nguồn
 * này KHÔNG khớp được với bất kỳ dòng đích nào (chi nhánh thật sự mới, hoặc
 * `code` đã đổi ở một bên mà `id` cũng khác — không tự đoán được).
 */
export function khopBranch(hangNguon, hangDich) {
  const dichTheoId = new Map(hangDich.map((d) => [d.id, d]));
  const dichTheoCode = new Map(hangDich.map((d) => [d.code, d]));
  const dichTheoName = new Map(hangDich.map((d) => [d.name, d]));
  const ketQua = new Map();
  for (const n of hangNguon) {
    const d = dichTheoId.get(n.id) ?? dichTheoCode.get(n.code) ?? dichTheoName.get(n.name) ?? null;
    ketQua.set(n.id, d);
  }
  return ketQua;
}

/**
 * Diff branches DÙNG `khopBranch` — không có nhánh CHÈN: một dòng nguồn
 * không khớp được rơi vào `themMoi`, và `main()` TỪ CHỐI `--ghi` khi
 * `themMoi.length > 0` (xem đầu tệp — lỗi chặn C2).
 */
export function soSanhBranch(hangNguon, hangDich, soSanhCot) {
  const khop = khopBranch(hangNguon, hangDich);
  const themMoi = [];
  const capNhat = [];
  const khongDoi = [];
  for (const n of hangNguon) {
    const d = khop.get(n.id);
    if (!d) {
      themMoi.push(n);
      continue;
    }
    const cotKhac = soSanhCot(n, d);
    if (cotKhac.length > 0) capNhat.push({ nguon: n, dich: d, cotKhac });
    else khongDoi.push({ nguon: n, dich: d });
  }
  const idDichDaKhop = new Set([...khop.values()].filter(Boolean).map((d) => d.id));
  const xoaODich = hangDich.filter((d) => !idDichDaKhop.has(d.id));
  return { themMoi, capNhat, khongDoi, xoaODich };
}

/**
 * Bản đồ id chi nhánh nguồn -> đích, CHỈ tính được khi MỌI dòng nguồn đã khớp
 * (không còn `themMoi`) — gọi hàm này trước khi kiểm điều kiện đó là dùng sai.
 * Trả `null` nếu còn dòng chưa khớp, để nơi gọi phải tự xử lý rõ ràng thay vì
 * âm thầm dùng một bản đồ thiếu.
 */
export function banDoBranchDaKhopHet(hangNguon, hangDich) {
  const khop = khopBranch(hangNguon, hangDich);
  const banDo = new Map();
  for (const [idNguon, d] of khop) {
    if (!d) return null;
    banDo.set(idNguon, d.id);
  }
  return banDo;
}

/**
 * Bản đồ id VAI nguồn -> đích, khớp theo `name`. KHÁC branches: roles được
 * PHÉP chèn dòng mới bằng id nguồn (không có rủi ro trùng UUID lịch sử —
 * roles tự tạo sinh UUID ngẫu nhiên, không dùng lại hằng số seed như
 * branches), nên dòng chưa khớp trỏ về CHÍNH id nguồn.
 */
export function xayBanDoVai(hangNguon, hangDich) {
  const dichTheoTen = new Map(hangDich.map((r) => [r.name, r.id]));
  const banDo = new Map();
  for (const n of hangNguon) banDo.set(n.id, dichTheoTen.get(n.name) ?? n.id);
  return banDo;
}

/** Nắn một id theo bản đồ nguồn->đích. `null`/`undefined` giữ nguyên (không tra bản đồ). */
export function nanIdTheoBanDo(banDo, id) {
  if (id === null || id === undefined) return null;
  return banDo.get(id) ?? id;
}

/**
 * BB-315 (S3) — khoá `settings` mang TRẠNG THÁI đồng bộ, không phải cấu
 * hình: chép nguyên giá trị nguồn sang một cơ sở dữ liệu mới nạp là nói dối
 * "đã đồng bộ tới giờ này" trong khi đích chưa có gì.
 */
const KHOA_SETTINGS_LOAI_TRU = new Set(["lark_hook_queue", "lark_retouch_last_sync"]);
export function laKhoaTrangThaiDongBo(key) {
  return KHOA_SETTINGS_LOAI_TRU.has(key) || /(_last_sync|_cursor)$/i.test(key);
}

/** Loại các khoá trạng thái đồng bộ khỏi một danh sách dòng settings — dùng cho cả nguồn lẫn đích trước khi so sánh. */
export function locBoKhoaTrangThai(hangSettings) {
  return hangSettings.filter((s) => !laKhoaTrangThaiDongBo(s.key));
}

/** Phần chép settings có đụng `lark.webhook_url` không — dùng để đòi xác nhận riêng (S2). */
export function dtSettingsCoDoiWebhook(dtSettings) {
  return (
    dtSettings.themMoi.some((s) => s.key === "lark.webhook_url") ||
    dtSettings.capNhat.some((c) => c.nguon.key === "lark.webhook_url")
  );
}

/** Mã xác nhận cho lượt ghi — đổi theo tổng số dòng sẽ thêm/sửa mỗi bảng + ngày. */
export function taoMaXacNhanChep(tongKetTheoBang, ngayYYYYMMDD) {
  const noiDung = JSON.stringify(
    Object.keys(tongKetTheoBang)
      .sort()
      .map((k) => [k, tongKetTheoBang[k].themMoi, tongKetTheoBang[k].capNhat]),
  );
  const bam = crypto.createHash("sha256").update(`${noiDung}|${ngayYYYYMMDD}`).digest("hex");
  return bam.slice(0, 6).toUpperCase();
}

export function ngayHomNay(bayGio = new Date()) {
  const d = bayGio;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Từ chối nếu đích là bb-dev — không được vô tình chép đè lên cơ sở dữ liệu thử thật. */
export function kiemTraDichKhongPhaiBbDev(dbUrlDich) {
  const ma = maDuAn(dbUrlDich);
  if (ma === MA_BB_DEV) {
    return {
      choPhep: false,
      ly_do:
        "Đích đang là bb-dev — đó là cơ sở dữ liệu thử THẬT của studio, không " +
        "phải nơi để chép cấu hình đè lên. Kiểm lại --dich.",
    };
  }
  return { choPhep: true };
}

/**
 * BB-315 (lỗi chặn C2) — chặn `--ghi` khi branches còn dòng "sẽ thêm" (không
 * khớp được với đích qua id/code/name). Chèn tự động một UUID có thể trùng
 * khoá chính là đúng nguyên nhân lỗi chặn; người vận hành phải tự quyết.
 */
export function kiemTraBranchKhongConThemMoi(dtBranches) {
  if (dtBranches.themMoi.length > 0) {
    return {
      choPhep: false,
      ly_do:
        `branches còn ${dtBranches.themMoi.length} dòng "sẽ thêm" (không khớp được ` +
        `với đích qua id/code/name): ${dtBranches.themMoi.map((b) => `${b.id} ${b.code}`).join(", ")}. ` +
        "Không tự chèn — kiểm lại code/tên chi nhánh ở đích rồi chạy lại, hoặc " +
        "tạo tay chi nhánh còn thiếu trước.",
    };
  }
  return { choPhep: true };
}

/** Sinh một mật khẩu dài, ngẫu nhiên, không lưu lại — dùng cho tài khoản vừa tạo ở đích. */
export function matKhauNgauNhienKhongLuu() {
  return crypto.randomBytes(24).toString("base64url");
}

/** Che giá trị bí mật khi IN — không bao giờ in nguyên văn. */
export function cheBot(giaTri) {
  const s = typeof giaTri === "string" ? giaTri : JSON.stringify(giaTri ?? "");
  if (!s || s.length <= 12) return s ? "••••" : "(rỗng)";
  return `${s.slice(0, 6)}••••${s.slice(-4)}`;
}

const KHOA_SETTINGS_BI_MAT = new Set(["lark.webhook_url"]);

// ============================================================================
// Lớp truy cập DB / Auth — biên giới mỏng, không unit test trực tiếp phần này.
// ============================================================================

function layTepMoiTruong(duong, nhan) {
  const bien = docTepEnv(path.resolve(GOC_REPO, duong));
  if (!bien) {
    console.error(`Không thấy tệp môi trường (${nhan}): ${path.resolve(GOC_REPO, duong)}`);
    process.exit(2);
  }
  return bien;
}

async function ketNoiPg(bien, nhan) {
  const dbUrl = bien.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(`Thiếu SUPABASE_DB_URL trong tệp môi trường ${nhan}.`);
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  return { client, dbUrl };
}

function taoAdminAuth(bien, nhan) {
  const url = bien.NEXT_PUBLIC_SUPABASE_URL;
  const key = bien.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(`Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong tệp môi trường ${nhan}.`);
    process.exit(2);
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function docBang(client, bang, cot) {
  const { rows } = await client.query(`select ${cot.map((c) => `"${c}"`).join(", ")} from "${bang}"`);
  return rows;
}

/** Tìm user Auth theo email trên đích — dùng khi createUser báo trùng email dưới một id khác (không có filter email trực tiếp trong listUsers của bản supabase-js đang dùng, nên tự lọc). */
async function timUserTheoEmail(admin, email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error || !data?.users) return null;
  return data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
}

async function upsertTheoKhoa(client, bang, cotKhoa, giaTriKhoa, cotGhi, dong) {
  const coDieuKien = cotKhoa.map((c, i) => `"${c}" = $${i + 1}`).join(" and ");
  const { rows } = await client.query(`select id from "${bang}" where ${coDieuKien}`, giaTriKhoa);
  if (rows.length > 0) {
    const set = cotGhi.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
    await client.query(`update "${bang}" set ${set} where id = $${cotGhi.length + 1}`, [
      ...cotGhi.map((c) => dong[c]),
      rows[0].id,
    ]);
    return { hanhDong: "sua", id: rows[0].id };
  }
  const cotChen = ["id", ...cotGhi];
  const giuCho = cotChen.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(
    `insert into "${bang}" (${cotChen.map((c) => `"${c}"`).join(", ")}) values (${giuCho})`,
    cotChen.map((c) => dong[c]),
  );
  return { hanhDong: "them", id: dong.id };
}

/**
 * BB-315 (lỗi chặn C2) — MỘT giao dịch cho toàn bộ phần ghi BẢNG (không gồm
 * `auth.users`, xem đầu tệp). Gãy ở đâu thì rollback sạch, không để lại cấu
 * hình nửa vời. `branches` CHỈ đọc từ `dtBranches.capNhat` (không bao giờ
 * `dtBranches.themMoi`) — về cấu trúc, hàm này không có đường nào tự CHÈN một
 * dòng `branches` mới, kể cả khi bị gọi với `themMoi` không rỗng (lời gọi từ
 * `main()` đã bị `kiemTraBranchKhongConThemMoi` chặn từ trước, nhưng hàm này
 * không dựa vào điều đó để an toàn — nó cấu trúc sẵn KHÔNG insert branches).
 *
 * Tách khỏi `main()` để phép thử đơn vị gọi được bằng một client pg GIẢ,
 * không cần kết nối gì thật (AGENTS.md §5a).
 */
export async function ghiGiaoDichBang(pgDich, { dtBranches, dtPackages, dtRoles, dtSettings, staffDaCo, banDoVai }) {
  await pgDich.query("begin");
  try {
    // BB-315 lượt 3 (cố vấn CV-01, lỗi chặn còn lại) — branches PHẢI update
    // theo id ĐÍCH (`c.dich.id`, đã có sẵn trong kết quả khopBranch/soSanhBranch),
    // KHÔNG được tra lại theo `code` của NGUỒN như `upsertTheoKhoa` làm. Đúng
    // ca C2 (cùng UUID nhưng khác code: bb-dev `BB-Q1`, bb-prod `BB-PT`):
    // khopBranch khớp qua id -> capNhat, nhưng code khác nhau -> tra
    // `where code = 'BB-Q1'` ở đích KHÔNG ra dòng nào -> nhánh chèn của
    // upsertTheoKhoa chèn lại đúng UUID đó -> `branches_pkey` trùng, rollback,
    // và bước 6 không bao giờ qua được với đúng dữ liệu C2 mô tả. Update
    // thẳng theo id thì không cần tra gì cả — id đã biết chắc chắn là đích.
    for (const c of dtBranches.capNhat) {
      const b = c.nguon;
      await pgDich.query(
        `update "branches" set "code" = $1, "name" = $2, "address" = $3, "hotline" = $4,
           "zalo_oa" = $5, "logo_url" = $6, "timezone" = $7, "is_active" = $8, "settings" = $9
         where "id" = $10`,
        [b.code, b.name, b.address, b.hotline, b.zalo_oa, b.logo_url, b.timezone, b.is_active, b.settings, c.dich.id],
      );
    }

    for (const pTho of [...dtPackages.themMoi, ...dtPackages.capNhat.map((c) => c.nguon)]) {
      const p = pTho; // branch_id đã nắn từ lúc đọc (banDoBranch đã đầy đủ vì không còn themMoi)
      const dkKhoa = p.branch_id
        ? { sql: '"branch_id" = $1 and "code" = $2', gia: [p.branch_id, p.code] }
        : { sql: '"branch_id" is null and "code" = $1', gia: [p.code] };
      const { rows } = await pgDich.query(`select id from "packages" where ${dkKhoa.sql}`, dkKhoa.gia);
      const cotGhi = ["branch_id", "code", "name", "description", "price", "included_quota", "extra_photo_price", "printed_photo_count", "is_active"];
      if (rows.length > 0) {
        const set = cotGhi.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
        await pgDich.query(`update "packages" set ${set} where id = $${cotGhi.length + 1}`, [...cotGhi.map((c) => p[c]), rows[0].id]);
      } else {
        const cotChen = ["id", ...cotGhi];
        await pgDich.query(
          `insert into "packages" (${cotChen.map((c) => `"${c}"`).join(", ")}) values (${cotChen.map((_, i) => `$${i + 1}`).join(", ")})`,
          cotChen.map((c) => p[c]),
        );
      }
    }

    for (const rr of [...dtRoles.themMoi, ...dtRoles.capNhat.map((c) => c.nguon)]) {
      await upsertTheoKhoa(pgDich, "roles", ["name"], [rr.name], ["name", "permissions", "is_system"], rr);
    }

    for (const sTho of [...dtSettings.themMoi, ...dtSettings.capNhat.map((c) => c.nguon)]) {
      const s = sTho; // branch_id đã nắn từ lúc đọc
      const dkKhoa = s.branch_id
        ? { sql: '"branch_id" = $1 and "key" = $2', gia: [s.branch_id, s.key] }
        : { sql: '"branch_id" is null and "key" = $1', gia: [s.key] };
      const { rows } = await pgDich.query(`select id from "settings" where ${dkKhoa.sql}`, dkKhoa.gia);
      if (rows.length > 0) {
        await pgDich.query(`update "settings" set "value" = $1 where id = $2`, [s.value, rows[0].id]);
      } else {
        await pgDich.query(`insert into "settings" ("id", "key", "branch_id", "value") values ($1, $2, $3, $4)`, [
          s.id, s.key, s.branch_id, s.value,
        ]);
      }
    }

    for (const s of staffDaCo) {
      await pgDich.query(
        `update staff_profiles set full_name = $2, phone = $3, role = $4, role_id = $5, is_active = $6 where id = $1`,
        [s.id, s.full_name, s.phone, s.role, nanIdTheoBanDo(banDoVai, s.role_id), s.is_active],
      );
    }

    await pgDich.query("commit");
  } catch (e) {
    await pgDich.query("rollback").catch(() => {});
    throw e;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (ten, macDinh) => {
    const i = argv.indexOf(ten);
    return i !== -1 ? argv[i + 1] : macDinh;
  };
  const ghiThat = argv.includes("--ghi");
  const coBbProd = argv.includes("--that-su-la-bb-prod");
  const coXacNhanWebhook = argv.includes("--xac-nhan-webhook-that");
  const maNhapVao = arg("--xac-nhan", null);

  const duongNguon = arg("--nguon", ".env.local");
  const duongDich = arg("--dich", null);
  if (!duongDich) {
    console.error("Thiếu --dich <đường dẫn tệp môi trường>. Ví dụ: --dich .env.prod.local");
    process.exit(2);
  }

  const bienNguon = layTepMoiTruong(duongNguon, "nguồn");
  const bienDich = layTepMoiTruong(duongDich, "đích");

  const { client: pgNguon, dbUrl: dbUrlNguon } = await ketNoiPg(bienNguon, "nguồn");
  const { client: pgDich, dbUrl: dbUrlDich } = await ketNoiPg(bienDich, "đích");

  try {
    console.log("Nguồn:");
    inMoiTruong(dbUrlNguon);
    console.log("Đích:");
    inMoiTruong(dbUrlDich);

    for (const [nhan, url] of [
      ["nguồn", dbUrlNguon],
      ["đích", dbUrlDich],
    ]) {
      const kt = kiemTraMoiTruongChoPhep(url);
      if (!kt.choPhep) {
        console.error(`(${nhan}) ${kt.ly_do}`);
        process.exit(2);
      }
    }

    const ktDich = kiemTraDichKhongPhaiBbDev(dbUrlDich);
    if (!ktDich.choPhep) {
      console.error(ktDich.ly_do);
      process.exit(2);
    }

    // --- đọc dữ liệu cấu hình cả hai bên ------------------------------------
    const branchesNguon = await docBang(pgNguon, "branches", [
      "id", "code", "name", "address", "hotline", "zalo_oa", "logo_url", "timezone", "is_active", "settings",
    ]);
    const branchesDich = await docBang(pgDich, "branches", [
      "id", "code", "name", "address", "hotline", "zalo_oa", "logo_url", "timezone", "is_active", "settings",
    ]);
    const dtBranches = soSanhBranch(
      branchesNguon,
      branchesDich,
      soSanhCotDonGian(["code", "name", "address", "hotline", "zalo_oa", "logo_url", "timezone", "is_active", "settings"]),
    );
    // Chỉ tính được khi KHÔNG còn themMoi (xem banDoBranchDaKhopHet) — dùng
    // "null-an-toàn" cho phần CHỈ XEM (packages/settings vẫn cần hiển thị dù
    // branches còn thiếu khớp); write path sẽ tự chặn lại lần nữa trước khi ghi.
    const banDoBranch = banDoBranchDaKhopHet(branchesNguon, branchesDich) ?? new Map(branchesNguon.map((n) => [n.id, n.id]));

    const packagesNguonTho = await docBang(pgNguon, "packages", [
      "id", "branch_id", "code", "name", "description", "price", "included_quota", "extra_photo_price", "printed_photo_count", "is_active",
    ]);
    const packagesDich = await docBang(pgDich, "packages", [
      "id", "branch_id", "code", "name", "description", "price", "included_quota", "extra_photo_price", "printed_photo_count", "is_active",
    ]);
    // Khoá tự nhiên của packages là (branch_id đã nắn, code) — hai chi nhánh
    // khác nhau được phép có cùng code (xem uq_packages_code trong schema.sql).
    const packagesNguon = packagesNguonTho.map((p) => ({ ...p, branch_id: nanIdTheoBanDo(banDoBranch, p.branch_id) }));
    const dtPackages = soSanhTheoKhoa(
      packagesNguon,
      packagesDich,
      (r) => `${r.branch_id ?? "ALL"}::${r.code}`,
      soSanhCotDonGian(["name", "description", "price", "included_quota", "extra_photo_price", "printed_photo_count", "is_active"]),
    );

    const rolesNguon = (await docBang(pgNguon, "roles", ["id", "name", "permissions", "is_system"])).filter(
      (r) => !r.is_system,
    );
    const rolesDich = (await docBang(pgDich, "roles", ["id", "name", "permissions", "is_system"])).filter(
      (r) => !r.is_system,
    );
    const banDoVai = xayBanDoVai(rolesNguon, rolesDich);
    const dtRoles = soSanhTheoKhoa(rolesNguon, rolesDich, (r) => r.name, soSanhCotDonGian(["permissions"]));

    const settingsNguonTho = locBoKhoaTrangThai(await docBang(pgNguon, "settings", ["id", "key", "branch_id", "value"]));
    const settingsDich = locBoKhoaTrangThai(await docBang(pgDich, "settings", ["id", "key", "branch_id", "value"]));
    const settingsNguon = settingsNguonTho.map((s) => ({ ...s, branch_id: nanIdTheoBanDo(banDoBranch, s.branch_id) }));
    const dtSettings = soSanhTheoKhoa(
      settingsNguon,
      settingsDich,
      (r) => `${r.key}::${r.branch_id ?? "ALL"}`,
      soSanhCotDonGian(["value"]),
    );

    const staffNguon = await docBang(pgNguon, "staff_profiles", [
      "id", "full_name", "email", "phone", "role", "role_id", "is_active",
    ]);
    const staffDich = await docBang(pgDich, "staff_profiles", ["id"]);
    const idDichCoSan = new Set(staffDich.map((r) => r.id));
    const staffChuaCo = staffNguon.filter((s) => !idDichCoSan.has(s.id));
    const staffDaCo = staffNguon.filter((s) => idDichCoSan.has(s.id));

    const branchesNguonOfStaff = await docBang(pgNguon, "staff_branches", ["staff_id", "branch_id", "is_primary"]);

    // --- in tổng kết AN TOÀN: chỉ id + khoá tự nhiên, không tên/SĐT/bí mật --
    const inNhom = (tenBang, dt, hienThi) => {
      console.log(`\n${tenBang}:`);
      console.log(`  giữ nguyên : ${dt.khongDoi.length}`);
      console.log(`  sẽ thêm    : ${dt.themMoi.length}`);
      for (const r of dt.themMoi) console.log(`    + ${hienThi(r)}`);
      console.log(`  sẽ sửa     : ${dt.capNhat.length}`);
      for (const c of dt.capNhat) console.log(`    ~ ${hienThi(c.nguon)} (đổi: ${c.cotKhac.join(", ")})`);
      if (dt.xoaODich.length) {
        console.log(`  CHỈ CÓ Ở ĐÍCH, không còn ở nguồn (KHÔNG tự xoá) : ${dt.xoaODich.length}`);
        for (const r of dt.xoaODich) console.log(`    ? ${hienThi(r)}`);
      }
    };

    inNhom("branches", dtBranches, (r) => `${r.id} ${r.code}`);
    if (dtBranches.themMoi.length > 0) {
      console.log(
        `  !!! ${dtBranches.themMoi.length} dòng KHÔNG khớp được với đích qua id/code/name — ` +
          `--ghi sẽ TỪ CHỐI cho tới khi việc này được xử lý tay (xem đầu tệp, lỗi chặn C2).`,
      );
    }
    inNhom("packages", dtPackages, (r) => `${r.id} ${r.code}`);
    inNhom("roles (tự tạo)", dtRoles, (r) => `${r.id} ${r.name}`);
    inNhom(
      "settings (đã loại khoá trạng thái đồng bộ)",
      dtSettings,
      (r) => `${r.id ?? "(mới)"} ${r.key}${KHOA_SETTINGS_BI_MAT.has(r.key) ? " = " + cheBot(r.value) : ""}`,
    );
    if (dtSettingsCoDoiWebhook(dtSettings)) {
      console.log(
        "  !!! settings đụng lark.webhook_url — --ghi sẽ đòi thêm cờ --xac-nhan-webhook-that " +
          "(xác nhận đây LÀ webhook nhóm vận hành THẬT, không phải nhóm 'Kiểm thử app').",
      );
    }

    console.log(`\nstaff_profiles:`);
    console.log(`  đã có ở đích (id khớp) : ${staffDaCo.length}`);
    console.log(`  sẽ tạo mới             : ${staffChuaCo.length}`);
    for (const s of staffChuaCo) console.log(`    + ${s.id}`); // KHÔNG in tên/email/SĐT

    const tongKetTheoBang = {
      branches: { themMoi: dtBranches.themMoi.length, capNhat: dtBranches.capNhat.length },
      packages: { themMoi: dtPackages.themMoi.length, capNhat: dtPackages.capNhat.length },
      roles: { themMoi: dtRoles.themMoi.length, capNhat: dtRoles.capNhat.length },
      settings: { themMoi: dtSettings.themMoi.length, capNhat: dtSettings.capNhat.length },
      staff_profiles: { themMoi: staffChuaCo.length, capNhat: 0 },
    };
    const maDung = taoMaXacNhanChep(tongKetTheoBang, ngayHomNay());
    console.log(`\nMã xác nhận cho --ghi hôm nay: ${maDung}`);

    if (!ghiThat) {
      console.log("\nChế độ CHỈ XEM — chưa ghi gì. Muốn ghi thật: thêm --ghi --xac-nhan <mã trên> --that-su-la-bb-prod (nếu đích là bb-prod).");
      return;
    }

    // --- từ đây là ghi thật --------------------------------------------------
    const ktBbProd = kiemTraCoBbProd(dbUrlDich, coBbProd);
    if (!ktBbProd.choPhep) {
      console.error(ktBbProd.ly_do);
      process.exit(2);
    }
    if (!maNhapVao || maNhapVao.toUpperCase() !== maDung) {
      console.error(
        "Mã xác nhận không khớp. Số dòng sẽ thêm/sửa có thể đã đổi từ lúc in " +
          "mã (ai đó vừa sửa cấu hình), hoặc mã gõ sai. Chạy lại KHÔNG có --ghi " +
          "để lấy mã mới.",
      );
      process.exit(2);
    }
    // Lỗi chặn C2: không tự chèn branches trùng khoá chính.
    const ktBranch = kiemTraBranchKhongConThemMoi(dtBranches);
    if (!ktBranch.choPhep) {
      console.error(ktBranch.ly_do);
      process.exit(2);
    }
    // S2: webhook Lark phải được xác nhận riêng trước khi ghi.
    if (dtSettingsCoDoiWebhook(dtSettings) && !coXacNhanWebhook) {
      const dongWebhook =
        dtSettings.themMoi.find((s) => s.key === "lark.webhook_url") ??
        dtSettings.capNhat.find((c) => c.nguon.key === "lark.webhook_url")?.nguon;
      console.error(
        `settings sẽ ghi lark.webhook_url = ${cheBot(dongWebhook?.value)}. ` +
          "Xác nhận đây LÀ webhook của nhóm VẬN HÀNH THẬT (không phải nhóm 'Kiểm thử app' " +
          "của docs/26 §14) bằng cờ --xac-nhan-webhook-that.",
      );
      process.exit(2);
    }

    console.log("\nSao lưu ĐÍCH trước khi ghi…");
    const rSaoLuu = spawnSync(process.execPath, [path.join(GOC_REPO, "scripts", "backup.mjs")], {
      stdio: "inherit",
      env: { ...process.env, SUPABASE_DB_URL: dbUrlDich },
    });
    if (rSaoLuu.status !== 0) {
      console.error("Sao lưu ĐÍCH không xong. Dừng — không ghi cấu hình khi chưa có đường lùi.");
      process.exit(1);
    }

    console.log("\nBắt đầu giao dịch ghi cấu hình…");
    try {
      await ghiGiaoDichBang(pgDich, { dtBranches, dtPackages, dtRoles, dtSettings, staffDaCo, banDoVai });
    } catch (e) {
      console.error(`\nGiao dịch ghi cấu hình GÃY, đã rollback sạch — chưa đổi gì trên đích: ${e.message}`);
      throw e;
    }
    console.log("  Giao dịch ghi cấu hình: XONG (đã commit).");

    // ========================================================================
    // Tạo tài khoản nhân sự MỚI — NGOÀI giao dịch trên (Admin Auth API không
    // tham gia transaction Postgres). Mỗi người một cố gắng độc lập.
    // ========================================================================
    console.log("\nTạo tài khoản nhân sự mới ở đích (Admin API — không chép mật khẩu)…");
    const adminDich = taoAdminAuth(bienDich, "đích");
    let daTao = 0;
    let boQua = 0;
    for (const s of staffChuaCo) {
      let idThatODich = s.id;
      const { data, error } = await adminDich.auth.admin.createUser({
        id: s.id,
        email: s.email,
        password: matKhauNgauNhienKhongLuu(),
        email_confirm: true,
        user_metadata: { full_name: s.full_name },
      });
      if (error || !data?.user) {
        // S6 của cố vấn CV-01 (theo bàn giao trước): trùng email dưới một id
        // KHÁC vẫn phải ghi được staff_branches — tự tra email để tìm id thật.
        const nguoiTrung = await timUserTheoEmail(adminDich, s.email);
        if (!nguoiTrung) {
          console.error(`  BỎ QUA ${s.id}: không tạo được tài khoản đăng nhập (${error?.message ?? "?"}), và không tìm được user trùng email để đối chiếu. Kiểm tay.`);
          boQua += 1;
          continue;
        }
        idThatODich = nguoiTrung.id;
        console.error(`  Trùng email: id nguồn ${s.id} <-> id THẬT đã có ở đích ${idThatODich}. Ghi staff_profiles/staff_branches theo id đích thật, KHÔNG tạo user mới.`);
      }
      const loiProfile = await pgDich
        .query(
          `insert into staff_profiles (id, full_name, email, phone, role, role_id, is_active)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone,
             role = excluded.role, role_id = excluded.role_id, is_active = excluded.is_active`,
          [idThatODich, s.full_name, s.email, s.phone, s.role, nanIdTheoBanDo(banDoVai, s.role_id), s.is_active],
        )
        .then(
          () => null,
          (e) => e,
        );
      if (loiProfile) {
        console.error(`  Tạo/khớp auth OK (id ${idThatODich}) nhưng ghi staff_profiles hỏng: ${loiProfile.message}`);
        continue;
      }
      const chiNhanh = branchesNguonOfStaff.filter((b) => b.staff_id === s.id);
      for (const cn of chiNhanh) {
        const branchIdDich = nanIdTheoBanDo(banDoBranch, cn.branch_id);
        await pgDich.query(
          `insert into staff_branches (staff_id, branch_id, is_primary) values ($1, $2, $3)
           on conflict (staff_id, branch_id) do update set is_primary = excluded.is_primary`,
          [idThatODich, branchIdDich, cn.is_primary],
        );
      }
      if (idThatODich === s.id) daTao += 1;
    }

    console.log(`\nXong. Tạo mới: ${daTao} nhân sự (bỏ qua ${boQua}). Cập nhật ${staffDaCo.length} hồ sơ đã có.`);
    console.log(
      "\nMỗi nhân sự vừa TẠO MỚI có mật khẩu ngẫu nhiên KHÔNG AI BIẾT — phải " +
        "đặt lại qua màn Nhân sự (Đặt lại mật khẩu) trước khi họ đăng nhập được.",
    );
  } finally {
    await pgNguon.end();
    await pgDich.end();
  }
}

const chayTrucTiep = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (chayTrucTiep) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
