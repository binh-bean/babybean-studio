"use client";

/**
 * BB-342 — "chuông" của nhân viên: nghe kênh tức thì của các chi nhánh mình,
 * mỗi khi khách làm gì thì
 *   1. phát `SU_KIEN_VIEC_DOI` — huy hiệu "Việc cần xử lý" trên menu và số
 *      trên các tab tự đếm lại (cơ chế có sẵn từ BB-327);
 *   2. bật một thông báo nhỏ góc màn hình (không tên khách — chỉ loại việc).
 *
 * Các màn danh sách/chi tiết tự gắn `useCapNhatTucThi` để tải lại dữ liệu của
 * mình; component này chỉ lo huy hiệu và thông báo. Gắn MỘT lần ở khung quản
 * trị (admin-layout-shell.tsx).
 */

import { useEffect, useRef } from "react";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useCapNhatTucThi } from "@/lib/utils/use-cap-nhat-tuc-thi";
import { cauBaoNhanVien } from "@/lib/utils/tuc-thi-su-kien";
import { SU_KIEN_VIEC_DOI } from "@/lib/utils/viec-can-xu-ly-tabs";

function NgheTucThi() {
  const { toast } = useToast();
  const henDem = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (henDem.current) clearTimeout(henDem.current);
  }, []);
  useCapNhatTucThi(
    "nhan-vien",
    (sk) => {
      // Đếm lại huy hiệu CHẬM một nhịp và GỘP: đếm là 7 route (×2 khi đang ở
      // trang Việc cần xử lý). Bắn cùng lúc với lượt tải lại danh sách thì
      // danh sách — thứ nhân viên đang nhìn — phải xếp hàng sau 14 lượt gọi
      // kia; mười sự kiện dồn trong một giây chỉ đếm lại một lần.
      if (henDem.current) clearTimeout(henDem.current);
      henDem.current = setTimeout(() => window.dispatchEvent(new Event(SU_KIEN_VIEC_DOI)), 800);
      const cau = cauBaoNhanVien(sk.loai);
      if (cau) toast({ title: cau, type: "info", duration: 6000 });
    },
    // Không gộp ở đây: mỗi việc của khách một thông báo; huy hiệu đã tự gộp ở trên.
    { gopMs: 0 },
  );
  return null;
}

export function TucThiNhanVien() {
  return (
    <ToastProvider>
      <NgheTucThi />
    </ToastProvider>
  );
}
