#!/bin/bash
# BB-411 — CÀI ĐẶT app BabyBean chạy trên MacBook (thay Vercel).
#
# Chạy trong Terminal của Mac (KHÔNG cần sudo):
#   bash ~/babybean/repo/ops/may-chu-mac/cai-dat.sh
# Lần đầu chưa có repo thì làm theo docs/31-may-chu-mac.md mục C.
#
# Chạy lại bao nhiêu lần cũng được: bước nào đã xong thì bỏ qua.
# Dừng ngay ở lỗi đầu tiên và nói cách sửa.
# Các lệnh cần sudo (mật khẩu máy) chỉ được IN RA để anh tự chạy.
set -euo pipefail

THU_MUC_SCRIPT="$(cd "$(dirname "$0")" && pwd)"
. "$THU_MUC_SCRIPT/lib/chung.sh"
. "$THU_MUC_SCRIPT/lib/plist.sh"
trap 'in_loi "Dừng ở dòng $LINENO. Đọc thông báo phía trên, sửa rồi chạy lại đúng lệnh này."' ERR

# ---------------------------------------------------------------- 1
in_buoc "1/10 Kiểm máy Mac"
if ! la_mac; then in_loi "Script này chỉ chạy trên macOS."; exit 1; fi
echo "  macOS $(sw_vers -productVersion), chip $(uname -m), người dùng $(whoami)"
if [ "$(id -u)" = "0" ]; then in_loi "Đừng chạy bằng sudo. Chạy lại không có chữ sudo."; exit 1; fi

# ---------------------------------------------------------------- 2
in_buoc "2/10 Kiểm múi giờ (lịch 01:00 và 08:00 tính theo giờ máy)"
VUNG="$(readlink /etc/localtime 2>/dev/null | sed 's#.*/zoneinfo/##' || true)"
if [ "$(date +%z)" != "+0700" ]; then
  in_loi "Múi giờ máy là '${VUNG:-?}' ($(date +%z)), không phải giờ Việt Nam."
  echo "  Chạy lệnh sau (gõ mật khẩu máy khi được hỏi), rồi chạy lại cai-dat.sh:"
  echo "    sudo systemsetup -settimezone Asia/Ho_Chi_Minh"
  exit 1
fi
in_ok "Múi giờ ${VUNG:-+0700}."

# ---------------------------------------------------------------- 3
in_buoc "3/10 Kiểm Homebrew"
them_path
if ! command -v brew >/dev/null 2>&1; then
  in_loi "Chưa có Homebrew (trình cài phần mềm chính thức cho Mac)."
  echo "  Mở https://brew.sh để đối chiếu, rồi dán đúng lệnh này vào Terminal:"
  echo '    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  echo "  Cài xong, đóng Terminal, mở lại và chạy lại cai-dat.sh."
  exit 1
fi
in_ok "Homebrew $(brew --version | head -n 1 | awk '{print $2}')"

# ---------------------------------------------------------------- 4
in_buoc "4/10 Cài node@22, git, cloudflared (từ Homebrew)"
for goi in node@22 git cloudflared; do
  if brew list --versions "$goi" >/dev/null 2>&1; then in_ok "$goi đã có"
  else echo "  Đang cài $goi…"; brew install "$goi"; fi
done
them_path
NODE_CHINH="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_CHINH" != "22" ]; then
  in_loi "Đang dùng node $(node -v), cần node 22. Kiểm: ls $(brew --prefix)/opt/node@22/bin"; exit 1
fi
in_ok "node $(node -v), npm $(npm -v), git $(git --version | awk '{print $3}'), $(cloudflared --version 2>/dev/null | head -n 1)"

# ---------------------------------------------------------------- 5
in_buoc "5/10 Lấy mã nguồn về $BB_REPO"
mkdir -p "$BB_GOC" "$BB_RELEASES" "$BB_LOGS" "$BB_STATE/bo-qua"
if [ -d "$BB_REPO/.git" ]; then
  git -C "$BB_REPO" fetch --quiet origin "$BB_NHANH"
  git -C "$BB_REPO" checkout --quiet "$BB_NHANH"
  git -C "$BB_REPO" merge --ff-only --quiet "origin/$BB_NHANH"
  in_ok "Đã cập nhật repo."
else
  git clone --quiet --branch "$BB_NHANH" "$BB_REPO_URL" "$BB_REPO"
  in_ok "Đã tải repo."
fi
SHA="$(git -C "$BB_REPO" rev-parse HEAD)"
NGAN="$(printf '%s' "$SHA" | cut -c1-12)"
echo "  Bản trên GitHub: $NGAN — $(git -C "$BB_REPO" log -1 --format=%s)"
# Từ đây dùng script của bản vừa tải (có thể mới hơn bản đang chạy lệnh này).
NGUON_OPS="$BB_REPO/ops/may-chu-mac"
[ -f "$NGUON_OPS/lib/chung.sh" ] || { in_loi "Repo thiếu ops/may-chu-mac — nhánh main chưa có BB-411?"; exit 1; }

# ---------------------------------------------------------------- 6
in_buoc "6/10 Tệp khoá $BB_ENV"
if [ ! -f "$BB_ENV" ]; then
  cp "$NGUON_OPS/mau-env.txt" "$BB_ENV"
  chmod 600 "$BB_ENV"
  in_canh "Đã tạo tệp mẫu. Bây giờ ĐIỀN KHOÁ vào tệp này:"
  echo "    open -e $BB_ENV"
  echo "  (mở bằng TextEdit; điền xong bấm Cmd+S, đóng lại; hướng dẫn nằm ngay trong tệp)"
  echo "  Rồi chạy lại: bash $NGUON_OPS/cai-dat.sh"
  exit 1
fi
chmod 600 "$BB_ENV"
if ! kiem_env "$BB_ENV"; then
  echo
  echo "  Mở tệp để sửa các dòng trên:  open -e $BB_ENV"
  echo "  Rồi chạy lại: bash $NGUON_OPS/cai-dat.sh"
  exit 1
fi
in_ok "Đủ khoá bắt buộc (chỉ kiểm tên và dạng, không in giá trị). Quyền tệp: $(stat -f '%Sp' "$BB_ENV")"

# ---------------------------------------------------------------- 7
in_buoc "7/10 Chép script vận hành vào $BB_BIN"
cai_bin "$NGUON_OPS"
in_ok "Đã chép."

# ---------------------------------------------------------------- 8
in_buoc "8/10 Dựng bản phát hành $NGAN (lần đầu mất 3–8 phút)"
HIEN="$(ban_hien_tai_sha || true)"
if [ "$HIEN" = "$SHA" ] && [ -f "$BB_RELEASES/$NGAN/.dung-xong" ]; then
  in_ok "Bản $NGAN đã dựng và đang được dùng."
  DOI_BAN=0
else
  echo "  Nhật ký dựng: $BB_LOGS/dung-$NGAN.log  (mở Terminal khác: tail -f để xem)"
  DIR_MOI="$(dung_ban "$SHA" | tail -n 1)"
  [ -f "$DIR_MOI/.dung-xong" ] || { in_loi "Dựng chưa xong."; exit 1; }
  DIR_CU="$(ban_hien_tai_dir || true)"
  [ -n "$DIR_CU" ] && printf '%s\n' "$DIR_CU" > "$BB_STATE/ban-truoc"
  doi_symlink "$DIR_MOI"
  rm -f "$BB_STATE/bo-qua/$SHA"
  in_ok "Đã dựng xong, current → releases/$NGAN"
  DOI_BAN=1
fi

# ---------------------------------------------------------------- 9
in_buoc "9/10 Cài dịch vụ chạy nền (launchd, không cần sudo)"
UID_NAY="$(id -u)"
THU_MUC_AGENT="$HOME/Library/LaunchAgents"
mkdir -p "$THU_MUC_AGENT"

# Cổng 3000 phải trống hoặc đang là app của mình (máy này còn chạy OpenClaw).
if ! launchctl print "gui/$UID_NAY/$BB_NHAN.app" >/dev/null 2>&1; then
  if lsof -nP -iTCP:"$BB_CONG_APP" -sTCP:LISTEN >/dev/null 2>&1; then
    in_loi "Cổng $BB_CONG_APP đang bị chương trình khác dùng:"
    lsof -nP -iTCP:"$BB_CONG_APP" -sTCP:LISTEN | head -n 3
    echo "  Tắt chương trình đó (hoặc đổi cổng của nó) rồi chạy lại."
    exit 1
  fi
fi

# Tunnel: có tệp chứng chỉ tunnel mà chưa có config.yml → tự viết config.yml.
CF="$HOME/.cloudflared"
if [ ! -f "$CF/config.yml" ] && [ -d "$CF" ]; then
  SO_JSON="$(find "$CF" -maxdepth 1 -name '*-*-*-*-*.json' | wc -l | tr -d ' ')"
  if [ "$SO_JSON" = "1" ]; then
    TEP_JSON="$(find "$CF" -maxdepth 1 -name '*-*-*-*-*.json')"
    MA_TUNNEL="$(basename "$TEP_JSON" .json)"
    cat > "$CF/config.yml" <<EOF
# BB-411 — sinh bởi cai-dat.sh. Chỉ đưa hauky.babybeanstudio.vn vào app trên máy này.
tunnel: $MA_TUNNEL
credentials-file: $TEP_JSON
ingress:
  - hostname: hauky.babybeanstudio.vn
    service: http://127.0.0.1:$BB_CONG_APP
  - service: http_status:404
EOF
    in_ok "Đã viết $CF/config.yml cho tunnel $MA_TUNNEL"
  fi
fi

TAM="$(mktemp -d)"
tao_tat_ca_plist "$TAM" "$BB_BIN" "$BB_LOGS"
while read -r nhan; do
  tep="$nhan.plist"
  if [ "$nhan" = "$BB_NHAN.tunnel" ] && [ ! -f "$CF/config.yml" ]; then
    in_canh "Chưa cài tunnel (chưa có $CF/config.yml) — làm bước E trong docs/31, rồi chạy lại cai-dat.sh."
    continue
  fi
  plutil -lint -s "$TAM/$tep"
  da_nap=0; launchctl print "gui/$UID_NAY/$nhan" >/dev/null 2>&1 && da_nap=1
  if [ "$da_nap" = 1 ] && cmp -s "$TAM/$tep" "$THU_MUC_AGENT/$tep"; then
    in_ok "$nhan (giữ nguyên)"
    continue
  fi
  if [ "$da_nap" = 1 ]; then launchctl bootout "gui/$UID_NAY/$nhan" 2>/dev/null || true; sleep 2; fi
  cp "$TAM/$tep" "$THU_MUC_AGENT/$tep"
  chmod 644 "$THU_MUC_AGENT/$tep"
  # bootout chạy nền: lần nạp đầu có thể vấp "Input/output error" → thử lại một lần.
  launchctl bootstrap "gui/$UID_NAY" "$THU_MUC_AGENT/$tep" 2>/dev/null \
    || { sleep 3; launchctl bootstrap "gui/$UID_NAY" "$THU_MUC_AGENT/$tep"; }
  in_ok "$nhan (đã nạp)"
done < <(nhan_tat_ca)
rm -rf "$TAM"
if [ "$DOI_BAN" = 1 ]; then khoi_dong_lai_app; fi

echo "  Đợi app khởi động…"
if kiem_suc_khoe "$BB_CONG_APP" 45; then
  in_ok "App chạy: mở http://localhost:$BB_CONG_APP/login trên Mac này để xem."
else
  in_loi "App chưa trả lời ở cổng $BB_CONG_APP. Xem: tail -n 50 $BB_LOGS/app.log"
  exit 1
fi

# ---------------------------------------------------------------- 10
in_buoc "10/10 Việc anh tự làm (cần mật khẩu máy — script KHÔNG tự chạy sudo)"
cat <<'EOF'
  Dán từng dòng vào Terminal, gõ mật khẩu máy khi được hỏi (gõ không hiện chữ là bình thường):

    sudo pmset -a sleep 0            # máy không bao giờ tự ngủ
    sudo pmset -a disksleep 0        # ổ đĩa không ngủ
    sudo pmset -a autorestart 1      # mất điện xong có điện lại thì tự bật máy
    sudo pmset -a womp 1             # cho phép đánh thức qua mạng
    sudo pmset -a tcpkeepalive 1     # giữ kết nối mạng
    sudo pmset -a powernap 0         # tắt Power Nap (tránh ngủ chập chờn)

  Rồi kiểm:  pmset -g | grep -E "sleep|autorestart"
  Mac này KHÔNG được gập nắp khi không cắm màn hình ngoài: gập nắp là máy ngủ, app tắt.
EOF
if [ ! -f "$CF/config.yml" ]; then
  in_canh "Còn bước E (Cloudflare + tunnel): xem $NGUON_OPS/cloudflare-dns.md"
fi
in_buoc "XONG. Xem tình trạng bất cứ lúc nào:  bash $BB_BIN/trang-thai.sh"
