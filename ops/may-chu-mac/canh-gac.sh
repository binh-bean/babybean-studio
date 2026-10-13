#!/bin/bash
# BB-411 — Canh gác, launchd gọi mỗi 60 giây (nhãn vn.babybean.canh-gac).
# Kiểm http://127.0.0.1:3000/login. Hỏng 3 lần liền → khởi động lại app,
# và báo nhóm Lark vận hành nếu có LARK_WEBHOOK_CANH_GAC.
set -euo pipefail
. "$(dirname "$0")/lib/chung.sh"
them_path
GHI_LOG_TEP="$BB_LOGS/canh-gac.log"
mkdir -p "$BB_STATE"
DEM="$BB_STATE/canh-gac-hong"
LAN_BAO="$BB_STATE/canh-gac-lan-bao"

# Đang cập nhật/quay lại (app được khởi động lại có chủ đích) → không xen vào.
if dang_giu_khoa cap-nhat; then exit 0; fi
[ -L "$BB_CURRENT" ] || exit 0

if kiem_suc_khoe "$BB_CONG_APP" 1; then
  if [ -f "$DEM" ] && [ "$(cat "$DEM")" -ge 3 ] 2>/dev/null; then
    ghi_log "App đã chạy lại bình thường."
    bao_lark "App đã chạy lại bình thường."
  fi
  echo 0 > "$DEM"
  exit 0
fi

n="$(cat "$DEM" 2>/dev/null || echo 0)"
case "$n" in ''|*[!0-9]*) n=0 ;; esac
n=$((n + 1))
echo "$n" > "$DEM"
ghi_log "Không mở được /login (lần hỏng thứ $n liên tiếp)."

if [ $((n % 3)) -eq 0 ]; then
  ghi_log "Hỏng $n lần liên tiếp → khởi động lại app."
  khoi_dong_lai_app || ghi_log "launchctl kickstart lỗi — app chưa được cài? Chạy lại cai-dat.sh."
  # Báo Lark tối đa 30 phút một lần, tránh dội tin.
  bay_gio="$(date +%s)"; cu="$(cat "$LAN_BAO" 2>/dev/null || echo 0)"
  case "$cu" in ''|*[!0-9]*) cu=0 ;; esac
  if [ $((bay_gio - cu)) -ge 1800 ]; then
    bao_lark "App không trả lời $n phút liền — đã tự khởi động lại. Nếu còn lỗi: chạy ~/babybean/bin/trang-thai.sh"
    echo "$bay_gio" > "$LAN_BAO"
  fi
fi
