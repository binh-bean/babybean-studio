-- ============================================================================
-- Migration: 0024 — Ghi nhận thanh toán phát sinh
--
-- Task: BB-115 (ARCH + DEV-BE)
-- Tham chiếu: docs/16-quy-trinh-dau-cuoi.md §4
--
-- Bốn luật:
-- 1. App CHỈ GHI NHẬN, KHÔNG xử lý thanh toán. Thu ngoài app rồi vào đánh dấu.
-- 2. Số tiền phải GẮN VỚI con số đã chụp lại lúc khách chốt (BB-114), không tính
--    lại từ trạng thái hiện tại. Khách trả theo số họ đã nhìn thấy.
-- 3. Tiền dùng numeric, KHÔNG dùng float.
-- 4. Chỉ CSKH trở lên được ghi. CTV thời vụ không thấy bảng này. Kế toán xem
--    được nhưng không sửa được.
--
-- Ghi nhận thanh toán là việc KHÔNG ĐƯỢC XOÁ (append-only). Sửa thì ghi thêm
-- dòng đính chính, không update đè.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Bảng ghi nhận thanh toán phát sinh
-- ---------------------------------------------------------------------------

create table if not exists gallery_payments (
  id                    uuid primary key default gen_random_uuid(),
  gallery_id            uuid not null references galleries(id) on delete cascade,
  selection_id          uuid references selections(id) on delete set null,

  -- Số tiền phát sinh thực tế khách đã thanh toán (numeric, không dùng float)
  amount                numeric(12,0) not null check (amount <> 0),

  -- Con số phát sinh chụp lại lúc khách chốt đơn (đối chiếu với selections.snapshot_extra_amount)
  snapshot_extra_amount numeric(12,0),

  -- Hình thức thanh toán ngoài app: chuyển khoản, tiền mặt, POS, v.v.
  payment_method        text not null check (length(trim(payment_method)) > 0),

  -- Nhân viên xác nhận đã thu tiền ngoài app
  confirmed_by          uuid not null references staff_profiles(id),
  confirmed_at          timestamptz not null default now(),

  -- Ghi chú (mã GD ngân hàng, lý do đính chính nếu ghi nhận bù/trừ)
  note                  text,

  created_at            timestamptz not null default now()
);

create index idx_gallery_payments_gallery on gallery_payments(gallery_id);
create index idx_gallery_payments_selection on gallery_payments(selection_id);
create index idx_gallery_payments_confirmed_by on gallery_payments(confirmed_by);

comment on table gallery_payments is
  'Bảng ghi nhận tiền phát sinh của album thu ngoài app (chuyển khoản, tiền mặt...). Append-only: không sửa/xoá dòng cũ.';

comment on column gallery_payments.amount is
  'Số tiền thanh toán thực tế (numeric). Cho phép số âm nếu là dòng đính chính giảm.';

comment on column gallery_payments.snapshot_extra_amount is
  'Số tiền phát sinh chụp lại tại thời điểm khách bấm chốt (từ selections.snapshot_extra_amount). Khách trả theo số này.';

comment on column gallery_payments.payment_method is
  'Hình thức thanh toán ngoài app (chuyen_khoan, tien_mat, pos, v.v.).';

comment on column gallery_payments.confirmed_by is
  'Nhân viên xác nhận đã nhận tiền (chỉ CSKH trở lên).';

-- ---------------------------------------------------------------------------
-- 2. Hàm tính tổng tiền đã thanh toán của một album
-- ---------------------------------------------------------------------------

create or replace function app.gallery_paid_amount(p_gallery_id uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::numeric
  from gallery_payments
  where gallery_id = p_gallery_id;
$$;

revoke all on function app.gallery_paid_amount(uuid) from public;
grant execute on function app.gallery_paid_amount(uuid) to authenticated, service_role;

create or replace function public.gallery_paid_amount(p_gallery_id uuid)
returns numeric
language sql stable as $$
  select app.gallery_paid_amount(p_gallery_id);
$$;

revoke all on function public.gallery_paid_amount(uuid) from public;
grant execute on function public.gallery_paid_amount(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Phân quyền Row Level Security
-- ---------------------------------------------------------------------------

alter table gallery_payments enable row level security;

-- SELECT: Kế toán và nhân viên chi nhánh xem được; CTV thời vụ không thấy
create policy gallery_payments_select on gallery_payments for select to authenticated
  using (
    app.my_role() is distinct from 'photoshop_ctv' and
    exists (
      select 1 from galleries g
      where g.id = gallery_payments.gallery_id and app.can_see_branch(g.branch_id)
    )
  );

-- INSERT: Chỉ CSKH trở lên được ghi nhận thanh toán (kế toán, thợ ảnh, retoucher, CTV không được ghi)
create policy gallery_payments_insert on gallery_payments for insert to authenticated
  with check (
    app.can_manage_customers() and
    exists (
      select 1 from galleries g
      where g.id = gallery_payments.gallery_id and app.can_see_branch(g.branch_id)
    )
  );

-- UPDATE / DELETE: Tuyệt đối không cho sửa hoặc xoá (append-only)
create policy gallery_payments_no_update on gallery_payments for update to authenticated
  using (false) with check (false);

create policy gallery_payments_no_delete on gallery_payments for delete to authenticated
  using (false);

-- Quyền bảng: không cấp update/delete cho authenticated
revoke all on gallery_payments from public, anon;
grant select, insert on gallery_payments to authenticated;
grant all privileges on gallery_payments to service_role;

commit;
