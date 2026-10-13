#!/bin/bash
# BB-411 — launchd gọi script này để chạy app (nhãn vn.babybean.app, KeepAlive).
# Chạy `next start` của bản đang trỏ bởi ~/babybean/current, chỉ nghe 127.0.0.1:3000
# (người ngoài chỉ vào được qua Cloudflare Tunnel). Log nối vào ~/babybean/logs/app.log.
set -euo pipefail
. "$(dirname "$0")/lib/chung.sh"
them_path
mkdir -p "$BB_LOGS"
if ! cd -P "$BB_CURRENT" 2>/dev/null || [ ! -f .dung-xong ]; then
  ghi_log "chay-app: chưa có bản phát hành hợp lệ ở $BB_CURRENT — chờ 60 giây" >/dev/null
  sleep 60
  exit 1
fi
export NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# `>>` mở tệp ở chế độ nối đuôi, nên don-log.sh cắt ngắn tệp được mà app không cần khởi động lại.
exec node node_modules/next/dist/bin/next start -p "$BB_CONG_APP" -H 127.0.0.1 >> "$BB_LOGS/app.log" 2>&1
