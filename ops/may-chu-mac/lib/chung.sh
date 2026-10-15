# shellcheck shell=bash
# BB-411 — Hàm dùng chung cho mọi script máy chủ Mac.
#
# Tệp này chỉ được `source`, không chạy thẳng. Không chứa bí mật nào:
# mọi khoá nằm trong ~/babybean/.env.production.local (chmod 600) và chỉ
# được ĐỌC TỪNG BIẾN bằng `doc_bien`, không bao giờ in ra màn hình hay log.

# ---------- Đường dẫn ----------
BB_GOC="${BB_GOC:-$HOME/babybean}"
BB_REPO="$BB_GOC/repo"
BB_RELEASES="$BB_GOC/releases"
BB_CURRENT="$BB_GOC/current"
BB_LOGS="$BB_GOC/logs"
BB_STATE="$BB_GOC/state"
BB_BIN="$BB_GOC/bin"
# Node 22 + cloudflared BẢN DỰNG SẴN chính thức (không qua Homebrew — Intel + macOS 26 là
# "Tier 3", Homebrew phải dựng từ mã nguồn và vỡ ở Command Line Tools; 15/10/2026).
BB_TOOLS="$BB_GOC/tools"
BB_ENV="${BB_ENV:-$BB_GOC/.env.production.local}"

BB_REPO_URL="https://github.com/binh-bean/babybean-studio.git"
BB_NHANH="main"
BB_TEN_MIEN="https://hauky.babybeanstudio.vn"
BB_CONG_APP="${BB_CONG_APP:-3000}"
BB_CONG_THU=3001
BB_GIU_SO_BAN=3
BB_NHAN="vn.babybean"
BB_CAN_O_TRONG_GB=5

# Biến BẮT BUỘC (thiếu là một tính năng chết im lặng — docs/26 mục 8a).
BB_BIEN_BAT_BUOC="NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_URL APP_SECRET NEXT_PUBLIC_APP_URL NEXT_PUBLIC_VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT LARK_APP_ID LARK_APP_SECRET LARK_BASE_APP_TOKEN GOOGLE_DRIVE_API_KEY CRON_SECRET SYNC_CRON_SECRET LARK_GHI_LINK_QUAN_LY"
# Biến CẤM trên máy chủ thật (làm app tưởng đang chạy phép thử → Lark im lặng).
BB_BIEN_CAM="PHEP_THU_TRINH_DUYET CHO_PHEP_GOI_MANG_TRONG_PHEP_THU VITEST NODE_ENV"

# ---------- In ra màn hình ----------
in_buoc() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
in_ok()   { printf '\033[32m  [OK] %s\033[0m\n' "$*"; }
in_canh() { printf '\033[33m  [CHÚ Ý] %s\033[0m\n' "$*"; }
in_loi()  { printf '\033[31m  [LỖI] %s\033[0m\n' "$*" >&2; }

# Ghi một dòng có giờ vào tệp log (mặc định logs/van-hanh.log) và ra màn hình.
ghi_log() {
  local tep="${GHI_LOG_TEP:-$BB_LOGS/van-hanh.log}"
  mkdir -p "$(dirname "$tep")"
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$tep"
}

la_mac() { [ "$(uname -s)" = "Darwin" ]; }

# ---------- PATH: công cụ riêng (~/babybean/tools) trước, rồi Homebrew ----------
them_path() {
  local p
  for p in /usr/local/bin /opt/homebrew/bin; do
    case ":$PATH:" in *":$p:"*) ;; *) [ -d "$p" ] && PATH="$p:$PATH" ;; esac
  done
  for p in /usr/local/opt/node@22/bin /opt/homebrew/opt/node@22/bin; do
    if [ -x "$p/node" ]; then PATH="$p:$PATH"; break; fi
  done
  # Bản dựng sẵn của bộ cài luôn được ưu tiên (đặt SAU cùng = đứng ĐẦU PATH).
  [ -d "$BB_TOOLS/bin" ] && PATH="$BB_TOOLS/bin:$PATH"
  [ -x "$BB_TOOLS/node/bin/node" ] && PATH="$BB_TOOLS/node/bin:$PATH"
  export PATH
}

# ---------- Node 22: bản dựng sẵn chính thức từ nodejs.org, kiểm SHA-256 ----------
cai_node22() {
  local kien t ten url tam
  if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" = "22" ]; then
    return 0
  fi
  case "$(uname -m)" in x86_64) kien=x64 ;; arm64) kien=arm64 ;; *) in_loi "Chip $(uname -m) chưa hỗ trợ."; return 1 ;; esac
  url="https://nodejs.org/dist/latest-v22.x"
  tam="$(mktemp -d)"
  echo "  Tải danh sách mã băm chính thức của Node 22…"
  curl -fsSL "$url/SHASUMS256.txt" -o "$tam/SHASUMS256.txt"
  ten="$(grep -E "  node-v22\.[0-9]+\.[0-9]+-darwin-${kien}\.tar\.gz$" "$tam/SHASUMS256.txt" | awk '{print $2}' | head -n 1)"
  [ -n "$ten" ] || { in_loi "Không tìm thấy bản Node 22 cho darwin-${kien} trên nodejs.org."; rm -rf "$tam"; return 1; }
  echo "  Tải $ten (nodejs.org)…"
  curl -fsSL "$url/$ten" -o "$tam/$ten"
  ( cd "$tam" && grep "  $ten\$" SHASUMS256.txt | shasum -a 256 -c - >/dev/null )     || { in_loi "Mã băm $ten KHÔNG khớp — không cài (tệp tải về có thể hỏng)."; rm -rf "$tam"; return 1; }
  mkdir -p "$BB_TOOLS"
  t="$BB_TOOLS/${ten%.tar.gz}"
  rm -rf "$t"; tar -xzf "$tam/$ten" -C "$BB_TOOLS"
  ln -sfn "$t" "$BB_TOOLS/node"
  rm -rf "$tam"
  in_ok "Đã cài ${ten%.tar.gz} vào $BB_TOOLS/node (mã băm khớp)."
}

# ---------- cloudflared: bản dựng sẵn chính thức (GitHub Cloudflare), kiểm chữ ký Apple ----------
cai_cloudflared() {
  local kien tam bin="$BB_TOOLS/bin/cloudflared"
  if command -v cloudflared >/dev/null 2>&1; then return 0; fi
  case "$(uname -m)" in x86_64) kien=amd64 ;; arm64) kien=arm64 ;; *) in_loi "Chip $(uname -m) chưa hỗ trợ."; return 1 ;; esac
  tam="$(mktemp -d)"
  echo "  Tải cloudflared-darwin-${kien}.tgz (github.com/cloudflare/cloudflared, bản mới nhất)…"
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${kien}.tgz" -o "$tam/cf.tgz"
  tar -xzf "$tam/cf.tgz" -C "$tam"
  [ -f "$tam/cloudflared" ] || { in_loi "Gói tải về không có tệp cloudflared."; rm -rf "$tam"; return 1; }
  # Chỉ nhận tệp ký bởi Cloudflare Inc (Developer ID, TeamIdentifier 68WVV388M8 — đo trên Mac 15/10) — chặn tệp giả.
  # (codesign -dv không in dòng Authority; -dvv mới in, và TeamIdentifier là khoá chắc nhất.)
  if ! codesign --verify --strict "$tam/cloudflared" 2>/dev/null      || ! codesign -dvv "$tam/cloudflared" 2>&1 | grep -q "^TeamIdentifier=68WVV388M8$"; then
    in_loi "cloudflared tải về KHÔNG có chữ ký Cloudflare hợp lệ — không cài."; rm -rf "$tam"; return 1
  fi
  mkdir -p "$BB_TOOLS/bin"
  install -m 755 "$tam/cloudflared" "$bin"
  rm -rf "$tam"
  in_ok "Đã cài cloudflared vào $bin (chữ ký Cloudflare hợp lệ)."
}

# ---------- Đọc MỘT biến từ tệp env, không source cả tệp ----------
# Dùng: doc_bien TEN [tep]. In giá trị ra stdout (để gán vào biến), không log.
doc_bien() {
  local ten="$1" tep="${2:-$BB_ENV}" dong v
  [ -f "$tep" ] || return 0
  dong="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${ten}=" "$tep" | tail -n 1 || true)"
  [ -n "$dong" ] || return 0
  v="${dong#*=}"
  v="${v%$'\r'}"
  # bỏ khoảng trắng hai đầu
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  case "$v" in
    \"*\") v="${v#\"}"; v="${v%\"}" ;;
    \'*\') v="${v#\'}"; v="${v%\'}" ;;
  esac
  printf '%s' "$v"
}

# Kiểm tệp env. In TÊN biến có vấn đề (không bao giờ in giá trị).
# Trả 0 nếu đạt, 1 nếu còn lỗi.
kiem_env() {
  local tep="${1:-$BB_ENV}" loi=0 ten v
  if [ ! -f "$tep" ]; then in_loi "Chưa có tệp $tep"; return 1; fi
  for ten in $BB_BIEN_BAT_BUOC; do
    v="$(doc_bien "$ten" "$tep")"
    if [ -z "$v" ]; then in_loi "Còn trống: $ten"; loi=1; continue; fi
    case "$v" in *'$'*)
      in_loi "$ten có ký tự \$ — Next.js sẽ hiểu sai giá trị. Đổi mật khẩu/khoá khác không có \$."; loi=1 ;;
    esac
  done
  for ten in $BB_BIEN_CAM; do
    if grep -Eq "^[[:space:]]*(export[[:space:]]+)?${ten}=" "$tep"; then
      in_loi "Phải XOÁ dòng $ten khỏi tệp env (biến chỉ dùng khi chạy phép thử)."; loi=1
    fi
  done
  v="$(doc_bien NEXT_PUBLIC_SUPABASE_URL "$tep")"
  case "$v" in
    "") ;;
    */rest/v1|*/rest/v1/) in_loi "NEXT_PUBLIC_SUPABASE_URL không được có đuôi /rest/v1"; loi=1 ;;
    https://*.supabase.co|https://*.supabase.co/) ;;
    *) in_canh "NEXT_PUBLIC_SUPABASE_URL không có dạng https://<mã>.supabase.co — kiểm lại." ;;
  esac
  v="$(doc_bien NEXT_PUBLIC_APP_URL "$tep")"
  if [ -n "$v" ] && [ "$v" != "$BB_TEN_MIEN" ]; then
    in_loi "NEXT_PUBLIC_APP_URL phải đúng $BB_TEN_MIEN (không có / ở cuối)"; loi=1
  fi
  v="$(doc_bien APP_SECRET "$tep")"
  if [ -n "$v" ] && [ "${#v}" -lt 32 ]; then in_loi "APP_SECRET ngắn hơn 32 ký tự"; loi=1; fi
  v="$(doc_bien VAPID_SUBJECT "$tep")"
  case "$v" in ""|mailto:*) ;; *) in_loi "VAPID_SUBJECT phải bắt đầu bằng mailto:"; loi=1 ;; esac
  v="$(doc_bien LARK_GHI_LINK_QUAN_LY "$tep")"
  if [ -n "$v" ] && [ "$v" != "1" ]; then in_loi "LARK_GHI_LINK_QUAN_LY phải là 1"; loi=1; fi
  v="$(doc_bien SUPABASE_DB_URL "$tep")"
  if [ -n "$v" ]; then
    case "$v" in
      *pooler.supabase.com:5432/*) ;;
      *:6543/*) in_loi "SUPABASE_DB_URL đang là Transaction pooler (6543). Phải dùng Session pooler cổng 5432."; loi=1 ;;
      *) in_canh "SUPABASE_DB_URL không giống Session pooler (…pooler.supabase.com:5432/…) — kiểm lại." ;;
    esac
  fi
  return "$loi"
}

# ---------- Khoá chống chạy chồng (macOS không có flock) ----------
lay_khoa() {
  local ten="$1" d="$BB_STATE/khoa-$1" pid
  mkdir -p "$BB_STATE"
  if mkdir "$d" 2>/dev/null; then echo "$$" > "$d/pid"; return 0; fi
  pid="$(cat "$d/pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then return 1; fi
  # khoá mồ côi (tiến trình cũ đã chết) → gỡ và lấy lại
  rm -rf "$d"
  mkdir "$d" 2>/dev/null || return 1
  echo "$$" > "$d/pid"
}
tra_khoa() { rm -rf "$BB_STATE/khoa-$1"; }
dang_giu_khoa() {
  local d="$BB_STATE/khoa-$1" pid
  [ -d "$d" ] || return 1
  pid="$(cat "$d/pid" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# ---------- Bản phát hành ----------
# Thư mục bản đang chạy (đường thật), rỗng nếu chưa có.
ban_hien_tai_dir() {
  [ -L "$BB_CURRENT" ] || return 0
  (cd -P "$BB_CURRENT" 2>/dev/null && pwd) || true
}
ban_hien_tai_sha() {
  local d; d="$(ban_hien_tai_dir)"
  [ -n "$d" ] && [ -f "$d/.sha" ] && cat "$d/.sha"
  return 0
}

# Đổi symlink current NGUYÊN TỬ: tạo link tạm rồi rename đè lên.
doi_symlink() {
  local dich="$1" tam="$BB_GOC/current.moi"
  rm -f "$tam"
  ln -s "$dich" "$tam"
  if la_mac; then mv -fh "$tam" "$BB_CURRENT"; else mv -fT "$tam" "$BB_CURRENT"; fi
}

con_trong_gb() { df -Pk "$BB_GOC" | awk 'NR==2 { printf "%d", $4/1024/1024 }'; }

# Dựng bản phát hành cho commit $1 vào releases/<12 ký tự> (hoặc releases/$2 nếu có —
# dùng khi dựng lại cùng commit sau khi đổi biến NEXT_PUBLIC_*).
# Bản chỉ được dùng khi có tệp .dung-xong (dựng dở thì dựng lại từ đầu).
# In đường thư mục ra stdout ở dòng cuối.
dung_ban() {
  local sha="$1" ngan dich nhat_ky
  ngan="${2:-$(printf '%s' "$sha" | cut -c1-12)}"
  dich="$BB_RELEASES/$ngan"
  nhat_ky="$BB_LOGS/dung-$ngan.log"
  if [ -f "$dich/.dung-xong" ]; then echo "$dich"; return 0; fi
  if [ "$(con_trong_gb)" -lt "$BB_CAN_O_TRONG_GB" ]; then
    in_loi "Ổ đĩa còn dưới ${BB_CAN_O_TRONG_GB} GB — không dựng bản mới. Chạy don-log.sh hoặc xoá bớt tệp." ; return 1
  fi
  mkdir -p "$BB_RELEASES" "$BB_LOGS"
  rm -rf "$dich"
  mkdir -p "$dich"
  # Nối bằng && (không dựa vào set -e: bash TẮT set -e bên trong khối đứng
  # trước `||`/`if`, nên một bước hỏng sẽ bị bỏ qua nếu không nối tay).
  # NODE_ENV phải TRỐNG khi npm ci, nếu không npm bỏ devDependencies (tailwind, typescript).
  if ! (
    set -o pipefail
    echo "=== Dựng $sha lúc $(date) ===" &&
    git -C "$BB_REPO" archive "$sha" | tar -x -C "$dich" &&
    ln -s "$BB_ENV" "$dich/.env.production.local" &&
    cd "$dich" &&
    env -u NODE_ENV NEXT_TELEMETRY_DISABLED=1 npm ci --no-audit --no-fund &&
    env -u NODE_ENV NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build &&
    printf '%s\n' "$sha" > "$dich/.sha" &&
    touch "$dich/.dung-xong"
  ) >> "$nhat_ky" 2>&1; then
    in_loi "Dựng bản $ngan hỏng — xem $nhat_ky"
    return 1
  fi
  echo "$dich"
}

# Kiểm sức khoẻ: GET /login trên cổng $1, thử $2 lần, mỗi lần cách 2 giây.
kiem_suc_khoe() {
  local cong="$1" so_lan="${2:-1}" i=0
  while [ "$i" -lt "$so_lan" ]; do
    if curl -fsS -o /dev/null --max-time 10 "http://127.0.0.1:${cong}/login" 2>/dev/null; then return 0; fi
    i=$((i + 1))
    [ "$i" -lt "$so_lan" ] && sleep 2
  done
  return 1
}

# Chạy thử một bản trên cổng 3001, kiểm /login, rồi tắt. Trả 0 nếu đạt.
chay_thu_ban() {
  local dir="$1" pid ok=1
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${BB_CONG_THU}/" 2>/dev/null; then
    in_loi "Cổng ${BB_CONG_THU} đang bị chiếm — không chạy thử được."; return 1
  fi
  ( cd "$dir" && NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
      exec node node_modules/next/dist/bin/next start -p "$BB_CONG_THU" -H 127.0.0.1 ) \
      >> "$BB_LOGS/chay-thu.log" 2>&1 &
  pid=$!
  if kiem_suc_khoe "$BB_CONG_THU" 45; then ok=0; fi
  pkill -P "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  return "$ok"
}

khoi_dong_lai_app() {
  launchctl kickstart -k "gui/$(id -u)/${BB_NHAN}.app"
}

# Giữ BB_GIU_SO_BAN bản mới nhất; không bao giờ xoá bản đang chạy hay bản trước.
don_ban_cu() {
  local hien truoc d dem=0
  hien="$(ban_hien_tai_dir)"
  truoc="$(cat "$BB_STATE/ban-truoc" 2>/dev/null || true)"
  [ -d "$BB_RELEASES" ] || return 0
  # shellcheck disable=SC2045
  for d in $(ls -1dt "$BB_RELEASES"/*/ 2>/dev/null); do
    d="${d%/}"
    dem=$((dem + 1))
    [ "$dem" -le "$BB_GIU_SO_BAN" ] && continue
    [ "$d" = "$hien" ] && continue
    [ "$d" = "$truoc" ] && continue
    rm -rf "$d"
    rm -f "$BB_LOGS/dung-$(basename "$d").log"
  done
}

# Chép script vận hành từ một thư mục nguồn (repo hoặc bản phát hành) vào ~/babybean/bin.
# Chỉ chép khi MỌI script qua `bash -n` — script hỏng không được thay script đang chạy tốt.
cai_bin() {
  local nguon="$1" f tam
  for f in "$nguon"/*.sh "$nguon"/lib/*.sh; do
    bash -n "$f" || { in_loi "Script lỗi cú pháp: $f — giữ bản cũ trong $BB_BIN"; return 1; }
  done
  tam="$BB_GOC/bin.moi"
  rm -rf "$tam"; mkdir -p "$tam/lib"
  cp "$nguon"/*.sh "$tam/"; cp "$nguon"/lib/*.sh "$tam/lib/"
  [ -f "$nguon/mau-env.txt" ] && cp "$nguon/mau-env.txt" "$tam/"
  chmod 755 "$tam"/*.sh
  rm -rf "$BB_BIN.cu"
  [ -d "$BB_BIN" ] && mv "$BB_BIN" "$BB_BIN.cu"
  mv "$tam" "$BB_BIN"
  rm -rf "$BB_BIN.cu"
}

# ---------- Báo tin vào nhóm Lark vận hành (tuỳ chọn) ----------
# Chỉ gửi khi LARK_WEBHOOK_CANH_GAC có giá trị. Không bao giờ đưa bí mật vào tin.
bao_lark() {
  local url tin
  url="$(doc_bien LARK_WEBHOOK_CANH_GAC)"
  [ -n "$url" ] || return 0
  tin="[Máy chủ Mac BabyBean] $*"
  tin="$(printf '%s' "$tin" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
  printf '{"msg_type":"text","content":{"text":"%s"}}' "$tin" |
    curl -sS -o /dev/null --max-time 10 -H 'Content-Type: application/json' --data-binary @- "$url" || true
}
