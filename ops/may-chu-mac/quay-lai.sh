#!/bin/bash
# BB-411 — Quay về bản phát hành TRƯỚC ĐÓ (khi bản mới chạy sai).
#   bash ~/babybean/bin/quay-lai.sh
# Bản đang chạy bị đánh dấu "bỏ qua" để tự cập nhật không dựng lại nó.
# Có commit mới trên GitHub thì tự cập nhật vẫn chạy bình thường.
set -euo pipefail
. "$(dirname "$0")/lib/chung.sh"
them_path
GHI_LOG_TEP="$BB_LOGS/cap-nhat.log"
mkdir -p "$BB_STATE/bo-qua"

if ! lay_khoa cap-nhat; then in_loi "Đang có lượt cập nhật chạy. Đợi vài phút rồi chạy lại."; exit 1; fi
trap 'tra_khoa cap-nhat' EXIT

HIEN="$(ban_hien_tai_dir)"
SHA_HIEN="$(ban_hien_tai_sha)"
DICH=""
TRUOC="$(cat "$BB_STATE/ban-truoc" 2>/dev/null || true)"
if [ -n "$TRUOC" ] && [ "$TRUOC" != "$HIEN" ] && [ -f "$TRUOC/.dung-xong" ]; then
  DICH="$TRUOC"
else
  # shellcheck disable=SC2045
  for d in $(ls -1dt "$BB_RELEASES"/*/ 2>/dev/null); do
    d="${d%/}"
    if [ "$d" != "$HIEN" ] && [ -f "$d/.dung-xong" ]; then DICH="$d"; break; fi
  done
fi
if [ -z "$DICH" ]; then in_loi "Không còn bản cũ nào để quay về."; exit 1; fi

in_buoc "Quay từ $(basename "${HIEN:-không có}") về $(basename "$DICH")…"
doi_symlink "$DICH"
printf '%s\n' "$HIEN" > "$BB_STATE/ban-truoc"
[ -n "$SHA_HIEN" ] && touch "$BB_STATE/bo-qua/$SHA_HIEN"
khoi_dong_lai_app
if kiem_suc_khoe "$BB_CONG_APP" 45; then
  ghi_log "QUAY LẠI bản $(basename "$DICH") — đạt."
  in_ok "App đang chạy bản $(basename "$DICH")."
  [ -n "$SHA_HIEN" ] && echo "  Muốn dùng lại bản vừa bỏ: rm $BB_STATE/bo-qua/$SHA_HIEN rồi chạy cap-nhat.sh"
else
  ghi_log "QUAY LẠI bản $(basename "$DICH") nhưng app chưa lên."
  in_loi "App chưa lên. Xem: tail -n 50 $BB_LOGS/app.log"
  exit 1
fi
