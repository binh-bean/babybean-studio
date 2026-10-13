#!/bin/bash
# BB-411 — Tự cập nhật. launchd gọi mỗi 5 phút (nhãn vn.babybean.tu-cap-nhat).
#
# 1. Hỏi GitHub: origin/main có commit mới không? Không → thoát.
# 2. Có → dựng bản mới vào ~/babybean/releases/<sha>/ (npm ci + next build).
# 3. Chạy thử bản mới trên cổng 3001, mở /login. Hỏng → giữ bản cũ.
# 4. Đạt → chuyển symlink current sang bản mới, khởi động lại app, kiểm cổng 3000.
#    Cổng 3000 hỏng → quay về bản cũ ngay.
# Bản hỏng được ghi vào state/bo-qua/<sha> để không dựng lại mỗi 5 phút.
#
#   tu-cap-nhat.sh          dùng cho launchd
#   tu-cap-nhat.sh --ep     (cap-nhat.sh gọi) dựng cả commit từng bị bỏ qua
#   tu-cap-nhat.sh --dung-lai  dựng lại CHÍNH commit đang chạy vào thư mục mới
#                              (sau khi đổi biến NEXT_PUBLIC_* trong tệp khoá)
set -euo pipefail
. "$(dirname "$0")/lib/chung.sh"
them_path
GHI_LOG_TEP="$BB_LOGS/cap-nhat.log"
EP=0; DUNG_LAI=0
case "${1:-}" in --ep) EP=1 ;; --dung-lai) EP=1; DUNG_LAI=1 ;; esac
mkdir -p "$BB_STATE/bo-qua" "$BB_LOGS"

if ! lay_khoa cap-nhat; then
  [ "$EP" = 1 ] && in_loi "Đang có một lượt cập nhật/quay lại khác chạy. Đợi vài phút rồi thử lại."
  exit 0
fi
trap 'tra_khoa cap-nhat' EXIT

if ! git -C "$BB_REPO" fetch --quiet origin "$BB_NHANH" 2>>"$GHI_LOG_TEP"; then
  ghi_log "Không hỏi được GitHub (mất mạng?) — để lượt sau."
  exit 0
fi
MOI="$(git -C "$BB_REPO" rev-parse "origin/$BB_NHANH")"
CU="$(ban_hien_tai_sha || true)"
if [ "$MOI" = "$CU" ] && [ "$DUNG_LAI" = 0 ]; then
  [ "$EP" = 1 ] && in_ok "Đang chạy bản mới nhất ($(printf '%s' "$MOI" | cut -c1-12))."
  exit 0
fi
if [ -f "$BB_STATE/bo-qua/$MOI" ] && [ "$EP" = 0 ]; then
  exit 0   # đã hỏng/đã quay lại khỏi bản này — chờ commit mới hoặc cap-nhat.sh
fi
# Giữ thư mục repo theo kịp (để cai-dat.sh chạy lại dùng script mới nhất).
git -C "$BB_REPO" merge --ff-only --quiet "origin/$BB_NHANH" 2>>"$GHI_LOG_TEP" || true

NGAN="$(printf '%s' "$MOI" | cut -c1-12)"
TEN_DIR="$NGAN"; [ "$DUNG_LAI" = 1 ] && TEN_DIR="$NGAN-$(date +%m%d%H%M)"
TIN="$(git -C "$BB_REPO" log -1 --format=%s "$MOI" | cut -c1-80)"
ghi_log "Có bản mới $NGAN ($TIN) — bắt đầu dựng."

danh_dau_hong() {
  touch "$BB_STATE/bo-qua/$MOI"
  ghi_log "BẢN $NGAN HỎNG: $1 — vẫn chạy bản cũ. Sửa rồi đẩy commit mới, hoặc chạy cap-nhat.sh để thử lại."
  bao_lark "Bản $NGAN không lên được ($1). App vẫn chạy bản cũ."
  exit 1
}

if ! DIR_MOI="$(dung_ban "$MOI" "$TEN_DIR" | tail -n 1)" || [ ! -f "$DIR_MOI/.dung-xong" ]; then
  danh_dau_hong "dựng lỗi — xem logs/dung-$TEN_DIR.log"
fi
ghi_log "Dựng xong. Chạy thử trên cổng $BB_CONG_THU…"
chay_thu_ban "$DIR_MOI" || danh_dau_hong "chạy thử trên cổng $BB_CONG_THU không mở được /login"

DIR_CU="$(ban_hien_tai_dir || true)"
[ -n "$DIR_CU" ] && printf '%s\n' "$DIR_CU" > "$BB_STATE/ban-truoc"
doi_symlink "$DIR_MOI"
khoi_dong_lai_app
if kiem_suc_khoe "$BB_CONG_APP" 45; then
  ghi_log "ĐÃ CHUYỂN sang bản $NGAN."
  if cai_bin "$DIR_MOI/ops/may-chu-mac" 2>>"$GHI_LOG_TEP"; then :; else ghi_log "Giữ script vận hành cũ (script mới lỗi cú pháp)."; fi
  don_ban_cu
  exit 0
fi

# Cổng 3000 không lên với bản mới → quay về bản cũ.
if [ -n "$DIR_CU" ]; then
  doi_symlink "$DIR_CU"
  khoi_dong_lai_app
  kiem_suc_khoe "$BB_CONG_APP" 45 && ghi_log "Đã quay về bản cũ $(basename "$DIR_CU")." \
    || ghi_log "Quay về bản cũ nhưng app vẫn chưa lên — xem logs/app.log."
fi
danh_dau_hong "app không lên sau khi chuyển"
