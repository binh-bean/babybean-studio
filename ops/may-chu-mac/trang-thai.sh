#!/bin/bash
# BB-411 — In tình trạng máy chủ Mac. Không in bí mật nào.
#   bash ~/babybean/bin/trang-thai.sh
set -uo pipefail
. "$(dirname "$0")/lib/chung.sh"
. "$(dirname "$0")/lib/plist.sh"
them_path
UID_NAY="$(id -u)"

in_buoc "Bản đang chạy"
SHA="$(ban_hien_tai_sha)"
if [ -n "$SHA" ]; then
  echo "  $(printf '%s' "$SHA" | cut -c1-12) — $(git -C "$BB_REPO" log -1 --format='%s (%cr)' "$SHA" 2>/dev/null || echo '?')"
  MOI="$(git -C "$BB_REPO" rev-parse "origin/$BB_NHANH" 2>/dev/null || true)"
  if [ -n "$MOI" ] && [ "$MOI" != "$SHA" ]; then
    if [ -f "$BB_STATE/bo-qua/$MOI" ]; then in_canh "GitHub có bản $(printf '%s' "$MOI" | cut -c1-12) nhưng bản đó bị BỎ QUA (dựng hỏng hoặc đã quay lại)."
    else in_canh "GitHub có bản mới hơn $(printf '%s' "$MOI" | cut -c1-12) — sẽ tự cập nhật trong ≤5 phút."; fi
  fi
else
  in_loi "Chưa có bản nào (chưa chạy cai-dat.sh?)"
fi
echo "  Các bản đang giữ: $(ls -1t "$BB_RELEASES" 2>/dev/null | tr '\n' ' ')"

in_buoc "App (cổng $BB_CONG_APP)"
if kiem_suc_khoe "$BB_CONG_APP" 1; then in_ok "http://127.0.0.1:$BB_CONG_APP/login trả lời."
else in_loi "http://127.0.0.1:$BB_CONG_APP/login KHÔNG trả lời."; fi

in_buoc "Qua tên miền"
MA="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BB_TEN_MIEN/login" || true)"
if [ "$MA" = "200" ]; then in_ok "$BB_TEN_MIEN/login → 200"; else in_canh "$BB_TEN_MIEN/login → ${MA:-không kết nối được} (tunnel/DNS chưa xong?)"; fi

in_buoc "Dịch vụ launchd"
while read -r nhan; do
  if out="$(launchctl print "gui/$UID_NAY/$nhan" 2>/dev/null)"; then
    st="$(printf '%s\n' "$out" | awk -F'= ' '/^\tstate =/ {print $2; exit}')"
    pid="$(printf '%s\n' "$out" | awk -F'= ' '/^\tpid =/ {print $2; exit}')"
    ec="$(printf '%s\n' "$out" | awk -F'= ' '/last exit code =/ {print $2; exit}')"
    printf '  %-26s đã nạp  trạng thái=%s%s  lần thoát cuối=%s\n' "$nhan" "${st:-?}" "${pid:+ pid=$pid}" "${ec:-?}"
  else
    printf '  %-26s \033[31mCHƯA NẠP\033[0m\n' "$nhan"
  fi
done < <(nhan_tat_ca)

in_buoc "Lịch chạy (giờ máy — phải là giờ VN)"
echo "  Múi giờ máy: $(readlink /etc/localtime 2>/dev/null | sed 's#.*/zoneinfo/##') ($(date +%z))"
printf '  %02d:%02d  %s\n' "$GIO_HET_HAN" "$PHUT_HET_HAN" "$DUONG_HET_HAN"
printf '  %02d:%02d  %s\n' "$GIO_HAU_KY" "$PHUT_HAU_KY" "$DUONG_HAU_KY"
echo "  Lần gọi gần nhất:"
tail -n 4 "$BB_LOGS/cron.log" 2>/dev/null | sed 's/^/    /' || echo "    (chưa có)"

in_buoc "Cập nhật gần nhất"
tail -n 5 "$BB_LOGS/cap-nhat.log" 2>/dev/null | sed 's/^/  /' || echo "  (chưa có)"

in_buoc "Lỗi gần nhất trong log app và tunnel"
for f in app.log tunnel.log; do
  echo "  [$f]"
  grep -iE 'error|lỗi|fatal|unhandled|ERR ' "$BB_LOGS/$f" 2>/dev/null | tail -n 5 | cut -c1-200 | sed 's/^/    /' || true
done

in_buoc "Máy"
echo "  Ổ đĩa còn trống: $(con_trong_gb) GB"
if la_mac; then
  pmset -g 2>/dev/null | grep -E '^ (sleep|autorestart|disksleep|womp|tcpkeepalive|powernap)\b' | sed 's/^/  /'
  echo "  Nguồn điện: $(pmset -g batt 2>/dev/null | head -n 1 | sed "s/Now drawing from //")"
fi
echo
