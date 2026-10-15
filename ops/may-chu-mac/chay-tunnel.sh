#!/bin/bash
# BB-411 — launchd gọi script này để chạy Cloudflare Tunnel (nhãn vn.babybean.tunnel).
# Cấu hình ở ~/.cloudflared/config.yml (xem cloudflare-dns.md).
set -euo pipefail
. "$(dirname "$0")/lib/chung.sh"
them_path
mkdir -p "$BB_LOGS"
CAU_HINH="$HOME/.cloudflared/config.yml"
if [ ! -f "$CAU_HINH" ]; then
  ghi_log "chay-tunnel: chưa có $CAU_HINH — làm bước E trong docs/31 trước" >/dev/null
  sleep 60
  exit 1
fi
# Tắt tự cập nhật của cloudflared. Muốn lên bản mới: xoá ~/babybean/tools/bin/cloudflared rồi chạy lại cai-dat.sh.
exec cloudflared --no-autoupdate tunnel --config "$CAU_HINH" run >> "$BB_LOGS/tunnel.log" 2>&1
