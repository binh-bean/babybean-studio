#!/bin/bash
# BB-411 — Cập nhật TAY ngay bây giờ (không đợi lịch 5 phút).
# Dựng cả commit từng bị đánh dấu hỏng (thử lại sau khi đã sửa môi trường).
#   bash ~/babybean/bin/cap-nhat.sh
#   bash ~/babybean/bin/cap-nhat.sh --dung-lai   dựng lại bản đang chạy
#        (bắt buộc sau khi đổi biến NEXT_PUBLIC_* — chúng được nướng vào bản dựng)
set -euo pipefail
. "$(dirname "$0")/lib/chung.sh"
in_buoc "Cập nhật app lên bản mới nhất trên GitHub (có thể mất 3–8 phút)…"
if [ "${1:-}" = "--dung-lai" ]; then
  bash "$(dirname "$0")/tu-cap-nhat.sh" --dung-lai
else
  bash "$(dirname "$0")/tu-cap-nhat.sh" --ep
fi
in_ok "Xong. Xem tình trạng: bash ~/babybean/bin/trang-thai.sh"
