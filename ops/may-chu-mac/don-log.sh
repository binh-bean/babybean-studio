#!/bin/bash
# BB-411 — Xoay vòng log, launchd gọi lúc 03:30 hằng ngày (nhãn vn.babybean.don-log).
# Tệp .log lớn hơn 5 MB: chép sang .1 (giữ .1 .2 .3), rồi cắt rỗng tệp gốc.
# Cắt rỗng thay vì đổi tên vì app/tunnel đang mở tệp ở chế độ nối đuôi.
set -euo pipefail
. "$(dirname "$0")/lib/chung.sh"
GHI_LOG_TEP="$BB_LOGS/van-hanh.log"
[ -d "$BB_LOGS" ] || exit 0
GIOI_HAN=$((5 * 1024 * 1024))
for f in "$BB_LOGS"/*.log; do
  [ -f "$f" ] || continue
  co="$(wc -c < "$f" | tr -d ' ')"
  [ "$co" -gt "$GIOI_HAN" ] || continue
  rm -f "$f.3"
  [ -f "$f.2" ] && mv "$f.2" "$f.3"
  [ -f "$f.1" ] && mv "$f.1" "$f.2"
  cp "$f" "$f.1"
  : > "$f"
  ghi_log "don-log: xoay vòng $(basename "$f") ($co byte)"
done
# Log dựng bản cũ hơn 14 ngày.
find "$BB_LOGS" -name 'dung-*.log' -mtime +14 -delete 2>/dev/null || true
