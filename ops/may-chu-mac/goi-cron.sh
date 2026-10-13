#!/bin/bash
# BB-411 — Thay lịch cron của Vercel (vercel.json). launchd gọi:
#   goi-cron.sh /api/cron/expire-galleries   (01:00 giờ VN)
#   goi-cron.sh /api/cron/hau-ky             (08:00 giờ VN)
# Gắn "Authorization: Bearer <CRON_SECRET>" giống Vercel. Khoá được đưa vào curl
# qua stdin (-H @-), nên không lộ trong danh sách tiến trình (ps) và không vào log.
set -euo pipefail
. "$(dirname "$0")/lib/chung.sh"
them_path
GHI_LOG_TEP="$BB_LOGS/cron.log"
DUONG="${1:?Thiếu đường cron, ví dụ /api/cron/hau-ky}"
case "$DUONG" in /api/cron/*) ;; *) ghi_log "goi-cron: đường lạ '$DUONG' — bỏ"; exit 2 ;; esac

KHOA="$(doc_bien CRON_SECRET)"
if [ -z "$KHOA" ]; then ghi_log "goi-cron $DUONG: thiếu CRON_SECRET trong $BB_ENV"; bao_lark "Lịch $DUONG không chạy: thiếu CRON_SECRET"; exit 1; fi

goi_mot_lan() {
  local tam ma
  tam="$(mktemp)"
  ma="$(printf 'Authorization: Bearer %s\n' "$KHOA" |
        curl -sS -o "$tam" -w '%{http_code}' --max-time 600 -H @- \
             "http://127.0.0.1:${BB_CONG_APP}${DUONG}" 2>>"$BB_LOGS/cron.log" || true)"
  # Chỉ ghi mã HTTP và cỡ phản hồi — không ghi nội dung (có thể có dữ liệu khách).
  ghi_log "goi-cron $DUONG → HTTP ${ma:-000}, $(wc -c < "$tam" | tr -d ' ') byte"
  rm -f "$tam"
  [ "$ma" = "200" ]
}

if goi_mot_lan; then exit 0; fi
sleep 60
if goi_mot_lan; then exit 0; fi
bao_lark "Lịch $DUONG hỏng 2 lần liền. Xem ~/babybean/logs/cron.log và app.log."
exit 1
