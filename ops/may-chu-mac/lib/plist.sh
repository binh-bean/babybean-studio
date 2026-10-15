# shellcheck shell=bash
# BB-411 — Sinh tệp launchd (.plist) cho máy chủ Mac.
#
# Dùng chung cho cai-dat.sh (cài thật) và kiem-tra-tinh.sh (kiểm trên Windows/Mac),
# để phép kiểm đọc ĐÚNG tệp mà máy sẽ chạy, không đọc một bản chép tay.
#
# GIẢ ĐỊNH GIỜ: launchd chạy StartCalendarInterval theo GIỜ MÁY. cai-dat.sh dừng
# lại nếu múi giờ Mac không phải Asia/Ho_Chi_Minh (UTC+7). Vì vậy:
#   vercel.json "0 18 * * *" UTC  = 01:00 giờ VN  → GIO_HET_HAN=1
#   vercel.json "0 1 * * *"  UTC  = 08:00 giờ VN  → GIO_HAU_KY=8
# kiem-tra-tinh.sh tự đọc vercel.json, cộng 7 giờ và so với hai số này.

GIO_HET_HAN=1;  PHUT_HET_HAN=0;  DUONG_HET_HAN="/api/cron/expire-galleries"
GIO_HAU_KY=8;   PHUT_HAU_KY=0;   DUONG_HAU_KY="/api/cron/hau-ky"
GIO_DON_LOG=3;  PHUT_DON_LOG=30
CHU_KY_CAP_NHAT=300   # 5 phút
CHU_KY_CANH_GAC=60    # 1 phút

# Danh sách nhãn (tên tệp = <nhãn>.plist).
nhan_tat_ca() {
  local n="${BB_NHAN:-vn.babybean}"
  printf '%s\n' "$n.app" "$n.tunnel" "$n.cron-het-han" "$n.cron-hau-ky" \
    "$n.tu-cap-nhat" "$n.canh-gac" "$n.don-log"
}

_xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

_dau_plist() {
  local nhan="$1"; shift
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$(_xml "$nhan")</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
EOF
  local a
  for a in "$@"; do printf '    <string>%s</string>\n' "$(_xml "$a")"; done
  cat <<EOF
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(_xml "${BB_TOOLS:-$HOME/babybean/tools}")/node/bin:$(_xml "${BB_TOOLS:-$HOME/babybean/tools}")/bin:/usr/local/opt/node@22/bin:/opt/homebrew/opt/node@22/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>$(_xml "$HOME")</string>
  </dict>
EOF
}

_cuoi_plist() {
  local nhan="$1" logs="$2"
  cat <<EOF
  <key>StandardOutPath</key>
  <string>$(_xml "$logs/launchd-$nhan.log")</string>
  <key>StandardErrorPath</key>
  <string>$(_xml "$logs/launchd-$nhan.log")</string>
</dict>
</plist>
EOF
}

# Dịch vụ chạy mãi (app, tunnel): tự bật khi đăng nhập, chết thì launchd bật lại.
plist_chay_mai() {
  local nhan="$1" script="$2" logs="$3"
  _dau_plist "$nhan" "$script"
  cat <<EOF
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
EOF
  _cuoi_plist "$nhan" "$logs"
}

# Việc chạy theo giờ trong ngày (giờ máy = giờ VN).
plist_theo_gio() {
  local nhan="$1" gio="$2" phut="$3" logs="$4"; shift 4
  _dau_plist "$nhan" "$@"
  cat <<EOF
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>$gio</integer>
    <key>Minute</key>
    <integer>$phut</integer>
  </dict>
EOF
  _cuoi_plist "$nhan" "$logs"
}

# Việc chạy lặp lại mỗi N giây.
plist_chu_ky() {
  local nhan="$1" giay="$2" logs="$3"; shift 3
  _dau_plist "$nhan" "$@"
  cat <<EOF
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>$giay</integer>
EOF
  _cuoi_plist "$nhan" "$logs"
}

# Ghi đủ 7 tệp plist vào thư mục $1. $2 = thư mục bin, $3 = thư mục logs.
tao_tat_ca_plist() {
  local dich="$1" bin="$2" logs="$3" n="${BB_NHAN:-vn.babybean}"
  mkdir -p "$dich"
  plist_chay_mai "$n.app"    "$bin/chay-app.sh"    "$logs" > "$dich/$n.app.plist"
  plist_chay_mai "$n.tunnel" "$bin/chay-tunnel.sh" "$logs" > "$dich/$n.tunnel.plist"
  plist_theo_gio "$n.cron-het-han" "$GIO_HET_HAN" "$PHUT_HET_HAN" "$logs" \
    "$bin/goi-cron.sh" "$DUONG_HET_HAN" > "$dich/$n.cron-het-han.plist"
  plist_theo_gio "$n.cron-hau-ky" "$GIO_HAU_KY" "$PHUT_HAU_KY" "$logs" \
    "$bin/goi-cron.sh" "$DUONG_HAU_KY" > "$dich/$n.cron-hau-ky.plist"
  plist_chu_ky "$n.tu-cap-nhat" "$CHU_KY_CAP_NHAT" "$logs" "$bin/tu-cap-nhat.sh" > "$dich/$n.tu-cap-nhat.plist"
  plist_chu_ky "$n.canh-gac" "$CHU_KY_CANH_GAC" "$logs" "$bin/canh-gac.sh" > "$dich/$n.canh-gac.plist"
  plist_theo_gio "$n.don-log" "$GIO_DON_LOG" "$PHUT_DON_LOG" "$logs" \
    "$bin/don-log.sh" > "$dich/$n.don-log.plist"
}
