-- ============================================================================
-- Migration: 0021 — bốn giá trị mặc định đang chĩa sai hướng
--
-- PM làm, sau khi quét toàn bộ cột có DEFAULT trong schema. Cùng một họ với
-- 0016, 0017, 0018: một giá trị mặc định lặng lẽ thay chỗ cho "chưa nói gì".
--
-- Ba cái đầu HÔM NAY CHƯA BỊ KHAI THÁC — mọi đường ghi hiện có đều truyền giá
-- trị tường minh. Sửa vì chúng là mìn: BB-103, BB-105, BB-107 đang mở thêm
-- đường ghi mới, và người viết đường ghi mới sẽ không đọc migration này.
--
-- Quy tắc chung: khi người gọi không nói gì, mặc định phải là lựa chọn ÍT
-- QUYỀN NHẤT và ÍT KHẲNG ĐỊNH NHẤT. Bỏ sót một trường thì hệ thống phải làm
-- ít đi, không phải làm nhiều hơn.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. selection_items.mark: bỏ mặc định 'selected'
-- ---------------------------------------------------------------------------
-- 0009 cố ý cho cột này nhận null, với chú thích ngay trong migration:
-- "null = chưa chọn". Nhưng DEFAULT vẫn là 'selected', nên hai câu nói ngược
-- nhau: khai báo bảo "chưa quyết định", mặc định bảo "đã chọn".
--
-- Một dòng chèn thiếu cột mark sẽ thành ảnh ĐÃ CHỌN, tiêu một suất hạn mức.
-- Đúng loại lỗi BB-081 từng gây ra: khách bấm tim rồi mất lựa chọn.
--
-- Ba đường ghi hiện có (0003, 0009, 0016) đều truyền mark tường minh nên chưa
-- ai vấp. Bỏ mặc định để đường thứ tư không vấp.
alter table selection_items alter column mark drop default;

-- ---------------------------------------------------------------------------
-- 2. share_links.role: 'owner' -> 'viewer'
-- ---------------------------------------------------------------------------
-- owner là vai CAO NHẤT phía khách: theo SUBMIT_ROLES trong
-- src/lib/auth/gallery-session.ts, chỉ owner mới được CHỐT lựa chọn.
-- Tạo link mà quên ghi vai thì người cầm link chốt được đơn của khách.
--
-- viewer chỉ xem. Quên ghi vai thì link vô hại, và ai đó sẽ báo "link này
-- không bấm được gì" — một lời phàn nàn tốt hơn nhiều so với một đơn bị chốt
-- nhầm mà không ai biết.
alter table share_links alter column role set default 'viewer';

-- ---------------------------------------------------------------------------
-- 3. staff_profiles.role: 'cs' -> 'viewer'
-- ---------------------------------------------------------------------------
-- cs ghi được dữ liệu khách hàng (app.can_write_customer). Tạo tài khoản mà
-- quên chọn vai thì người đó sửa được thông tin khách ngay từ lần đăng nhập
-- đầu tiên.
alter table staff_profiles alter column role set default 'viewer';

-- ---------------------------------------------------------------------------
-- 4. galleries.watermark_enabled: true -> false
-- ---------------------------------------------------------------------------
-- Đây KHÔNG phải mìn, đây là chuyện đang xảy ra thật.
--
-- Công tắc watermark chạy đủ một vòng: create-gallery-wizard bật sẵn, API ghi
-- xuống, /api/g/gallery trả về `watermark: true`. Nhưng KHÔNG component nào vẽ
-- watermark cả. BB-066 (chèn ở tầng proxy ảnh) đã bị bỏ cùng lúc với việc gỡ
-- proxy ảnh khách.
--
-- Nên hôm nay CSKH bật công tắc, màn hình xác nhận đã bật, và ảnh trẻ em vẫn
-- ra sạch. Một lời hứa suông về thứ bảo vệ không tồn tại còn nguy hiểm hơn
-- không có công tắc nào: người ta dựa vào nó.
--
-- Chủ studio đã chốt KHÔNG dùng watermark. Nên việc đúng không phải là đi làm
-- watermark, mà là thôi hứa. Đổi mặc định là bước một; bước hai là gỡ công tắc
-- khỏi giao diện — việc đó nằm trong file của DEV-FE và DEV-BE, đã ghi thành
-- task riêng.
alter table galleries alter column watermark_enabled set default false;

comment on column galleries.watermark_enabled is
  'CHƯA CÓ TÁC DỤNG. Không component nào vẽ watermark; BB-066 đã bị bỏ cùng '
  'với proxy ảnh khách. Giữ cột để không phải viết migration ngược, nhưng '
  'đừng hiển thị nó như một tính năng đang chạy.';

-- KHÔNG sửa các dòng đang có. Album đã tạo giữ nguyên cờ đã lưu; đổi ngược
-- không làm ảnh của khách khác đi vì cờ vốn không có tác dụng.

commit;
