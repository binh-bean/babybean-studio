# Khung báo cáo điều hành (BB-260)

Thêm một báo cáo mới chỉ cần **hai bước**:

## 1. Viết `cac-bao-cao/<ma-bao-cao>.ts`

```ts
import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao } from "../loai";
import { locBoAnhThat, GHI_CHU_LOAI_TRU } from "../loc-chung";

async function chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao> {
  // ctx.client       — Supabase admin client (service role)
  // ctx.chiNhanhIds  — string[] | null (null = không lọc chi nhánh)
  // ctx.tu, ctx.den  — khoảng thời gian nửa mở [tu, den)
  // ctx.kyTruoc      — cùng độ dài, liền trước `tu`, nếu bật "so kỳ trước"
  // ctx.nhom         — "ngay" | "tuan" | "thang" để gom biểu đồ

  let q = ctx.client.from("galleries").select("id, branch_id");
  q = locBoAnhThat(q); // LUÔN gọi hàm này — loại Fixture% và archived
  if (ctx.chiNhanhIds) q = q.in("branch_id", ctx.chiNhanhIds);
  // ... truy vấn, tính toán ...

  return {
    theSo: [{ nhan: "Ví dụ", giaTri: 42, donVi: "bộ" }],
    bang: { cot: ["Cột 1", "Cột 2"], dong: [["a", 1]] },
    bieuDo: { loai: "cot", nhan: ["T1", "T2"], chuoi: [{ ten: "Chuỗi", giaTri: [1, 2] }] },
    ghiChu: [GHI_CHU_LOAI_TRU],
  };
}

export const tenBaoCao: DinhNghiaBaoCao = {
  ma: "ma-bao-cao",              // dùng trong URL /admin/bao-cao?ma=...
  ten: "Tên hiển thị",
  moTa: "Một câu mô tả cho danh sách báo cáo.",
  nhom: "van-hanh",              // "van-hanh" | "doanh-thu" | "nhan-vien" | "tai-chinh" | "khac"
  quyen: "reports:operations",   // hoặc "reports:financial"
  boLoc: { kySoSanh: true, theoNhanVien: false },
  chay,
};
```

## 2. Đăng ký ở `dang-ky.ts`

```ts
import { tenBaoCao } from "./cac-bao-cao/ma-bao-cao";
// thêm vào mảng DANH_SACH_BAO_CAO
export const DANH_SACH_BAO_CAO: DinhNghiaBaoCao[] = [tienDoChonAnh, hauKyCanhBao, tenBaoCao];
```

Xong — API (`/api/admin/bao-cao`, `/api/admin/bao-cao/[ma]`), trang
`/admin/bao-cao`, quyền, lọc chi nhánh, lọc kỳ, xuất CSV đều dùng lại tự động.
Không cần sửa route hay trang.

## Quy tắc khi viết `chay()`

- **Luôn gọi `locBoAnhThat()`** trên mọi truy vấn `galleries` (và lọc thủ công
  tương đương khi truy vấn bảng khác join tới `galleries`) — loại bộ ảnh
  `Fixture%` và `archived` khỏi mọi số liệu.
- **Không kéo hàng nghìn dòng về Node.** Đếm bằng `count: "exact", head:
  true` khi chỉ cần một con số. Chỉ lấy hàng chi tiết khi tập dữ liệu đã bị
  giới hạn bởi kỳ/chi nhánh (vài trăm dòng trở xuống) và bạn thật sự cần từng
  dòng (vd tính trung vị, gom theo ngày).
- **Không tạo RPC/migration mới cho báo cáo.** Nếu một phép tính cần SQL phức
  tạp mà PostgREST không làm được gọn, dùng vài truy vấn nhỏ + gộp trong
  Node, hoặc ghi vào `tasks/BLOCKERS.md` xin ARCH một RPC (không tự thêm).
- **`ctx.chiNhanhIds === null` nghĩa là không lọc**, không phải "mọi chi
  nhánh rỗng". `[]` (mảng rỗng) nghĩa là nhân viên không có chi nhánh nào —
  trả kết quả rỗng, không throw.
- Báo cáo tài chính hoặc theo nhân viên: đặt `boLoc.theoNhanVien = true` và
  đọc `staff_id`/`photographer_id`/`editor_id`/`cskh_id` tuỳ nghiệp vụ; khung
  không ép một cột nhân viên cụ thể vì mỗi báo cáo cần một vai trò khác nhau.
- Muốn "so nhân viên với nhân viên" hoặc "so nhân viên với tổng": trả nhiều
  dòng trong `bang` (một dòng/nhân viên) và một dòng "Tổng"/"Trung bình" —
  khung không cần biết gì thêm, trang tự vẽ bảng sắp xếp được.

## Kiểu dữ liệu

Xem `loai.ts`: `DinhNghiaBaoCao`, `NguCanhBaoCao`, `KetQuaBaoCao`,
`TheSoBaoCao`, `BangBaoCao`, `BieuDoBaoCao`.

## Tiện ích kỳ

`ky.ts` có sẵn: `homNay`, `nNgayGanDay`, `thangNay`, `thangTruoc`,
`kyTuMaDungSan`, `kyTruocCungDoDai`, `chenhLechPhanTram`, `chiaMoc` (chia một
khoảng thành các mốc ngày/tuần/tháng cho biểu đồ), `trungVi`. Tất cả tính theo
giờ Việt Nam (UTC+7 cố định, không có giờ mùa hè).
