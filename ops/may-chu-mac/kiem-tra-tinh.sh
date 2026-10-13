#!/bin/bash
# BB-411 — Kiểm tĩnh bộ cài máy chủ Mac. Chạy được trên Windows (Git Bash) và Mac.
# Không đụng mạng, không đụng launchd, không đọc tệp khoá thật.
#   bash ops/may-chu-mac/kiem-tra-tinh.sh
#
# GIẢ ĐỊNH: máy Mac đặt múi giờ Asia/Ho_Chi_Minh (UTC+7, không có giờ mùa hè) —
# cai-dat.sh dừng lại nếu không đúng. launchd chạy StartCalendarInterval theo
# giờ máy, nên giờ trong plist = giờ UTC trong vercel.json + 7.
set -uo pipefail
DAY="$(cd "$(dirname "$0")" && pwd)"
GOC="$(cd "$DAY/../.." && pwd)"
DAT=0; HONG=0
dat()  { DAT=$((DAT + 1)); printf '  \033[32mĐẠT\033[0m  %s\n' "$*"; }
hong() { HONG=$((HONG + 1)); printf '  \033[31mHỎNG\033[0m %s\n' "$*"; }
command -v node >/dev/null 2>&1 || { echo "Cần node để chạy phép kiểm."; exit 2; }

echo "1. Cú pháp bash (bash -n)"
for f in "$DAY"/*.sh "$DAY"/lib/*.sh; do
  if bash -n "$f" 2>/dev/null; then dat "$(basename "$f")"; else hong "$(basename "$f") lỗi cú pháp"; fi
done

echo "2. Sinh plist bằng đúng hàm cai-dat.sh dùng"
TAM="$(mktemp -d)"
trap 'rm -rf "$TAM"' EXIT
(
  export HOME="/Users/kiemthu"
  export BB_GOC="$HOME/babybean"
  # shellcheck disable=SC1091
  . "$DAY/lib/chung.sh"; . "$DAY/lib/plist.sh"
  tao_tat_ca_plist "$TAM/plist" "$BB_BIN" "$BB_LOGS"
  nhan_tat_ca > "$TAM/nhan.txt"
)
NHAN_MONG="vn.babybean.app vn.babybean.tunnel vn.babybean.cron-het-han vn.babybean.cron-hau-ky vn.babybean.tu-cap-nhat vn.babybean.canh-gac vn.babybean.don-log"
for n in $NHAN_MONG; do
  if [ -f "$TAM/plist/$n.plist" ] && grep -qx "$n" "$TAM/nhan.txt"; then dat "có $n.plist"; else hong "thiếu $n.plist"; fi
done

echo "3. Nội dung plist (nhãn, lịch, đường cron) đối chiếu vercel.json"
node - "$GOC/vercel.json" "$TAM/plist" > "$TAM/node.out" 2>&1 <<'JS'
const fs = require("fs"), path = require("path");
const [vercelPath, dir] = process.argv.slice(2);
let dat = 0, hong = 0;
const ok = (m) => { dat++; console.log("  \x1b[32mĐẠT\x1b[0m  " + m); };
const bad = (m) => { hong++; console.log("  \x1b[31mHỎNG\x1b[0m " + m); };

// Đọc plist XML phẳng của mình: lấy Label, ProgramArguments, các khoá số/bool.
function docPlist(file) {
  const x = fs.readFileSync(file, "utf8");
  const val = (key) => {
    const m = x.match(new RegExp("<key>" + key + "</key>\\s*<(string|integer|true|false)\\s*/?>([^<]*)"));
    if (!m) return undefined;
    if (m[1] === "true") return true;
    if (m[1] === "false") return false;
    return m[1] === "integer" ? Number(m[2]) : m[2];
  };
  const args = [...(x.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/) || ["", ""])[1]
    .matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);
  const cal = x.match(/<key>StartCalendarInterval<\/key>\s*<dict>([\s\S]*?)<\/dict>/);
  let hour, minute;
  if (cal) {
    hour = Number((cal[1].match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/) || [])[1]);
    minute = Number((cal[1].match(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/) || [])[1]);
  }
  const balanced = (x.match(/<dict>/g) || []).length === (x.match(/<\/dict>/g) || []).length;
  return { x, label: val("Label"), args, hour, minute, keepAlive: val("KeepAlive"),
           interval: val("StartInterval"), runAtLoad: val("RunAtLoad"), balanced };
}

const plists = {};
for (const f of fs.readdirSync(dir)) {
  const p = docPlist(path.join(dir, f));
  plists[f.replace(/\.plist$/, "")] = p;
  if (p.label === f.replace(/\.plist$/, "")) ok(`${f}: Label khớp tên tệp`); else bad(`${f}: Label '${p.label}' không khớp tên tệp`);
  if (p.balanced && /<\/plist>\s*$/.test(p.x)) ok(`${f}: XML đóng đủ thẻ`); else bad(`${f}: XML thiếu thẻ đóng`);
  if (p.args[0] === "/bin/bash" && /^\/Users\/kiemthu\/babybean\/bin\/[a-z-]+\.sh$/.test(p.args[1] || ""))
    ok(`${f}: chạy ${p.args[1]}`); else bad(`${f}: ProgramArguments lạ ${JSON.stringify(p.args)}`);
}

// vercel.json → giờ VN
const crons = JSON.parse(fs.readFileSync(vercelPath, "utf8")).crons || [];
if (crons.length === 2) ok("vercel.json có 2 lịch"); else bad(`vercel.json có ${crons.length} lịch (mong 2) — bộ cài Mac chưa phủ hết`);
for (const c of crons) {
  const [mi, h, dom, mon, dow] = c.schedule.trim().split(/\s+/);
  if (dom !== "*" || mon !== "*" || dow !== "*" || !/^\d+$/.test(mi) || !/^\d+$/.test(h)) { bad(`lịch '${c.schedule}' không phải dạng hằng ngày — cần sửa bộ cài`); continue; }
  const gioVN = (Number(h) + 7) % 24, phutVN = Number(mi);
  const khop = Object.entries(plists).filter(([, p]) => p.args.includes(c.path));
  if (khop.length !== 1) { bad(`${c.path}: có ${khop.length} plist gọi đường này (mong 1)`); continue; }
  const [nhan, p] = khop[0];
  if (p.hour === gioVN && p.minute === phutVN)
    ok(`${c.path}: ${nhan} chạy ${String(gioVN).padStart(2, "0")}:${String(phutVN).padStart(2, "0")} giờ VN = '${c.schedule}' UTC`);
  else bad(`${c.path}: ${nhan} chạy ${p.hour}:${p.minute}, mong ${gioVN}:${phutVN} giờ VN ('${c.schedule}' UTC)`);
  if (p.args[1].endsWith("/goi-cron.sh")) ok(`${c.path}: gọi qua goi-cron.sh`); else bad(`${c.path}: không gọi qua goi-cron.sh`);
}
// Không plist cron nào gọi đường không có trong vercel.json
const duongVercel = new Set(crons.map((c) => c.path));
for (const [nhan, p] of Object.entries(plists))
  for (const a of p.args) if (a.startsWith("/api/") && !duongVercel.has(a)) bad(`${nhan} gọi ${a} — không có trong vercel.json`);

const app = plists["vn.babybean.app"];
if (app && app.keepAlive === true && app.runAtLoad === true) ok("app: KeepAlive + RunAtLoad"); else bad("app: thiếu KeepAlive/RunAtLoad");
const tun = plists["vn.babybean.tunnel"];
if (tun && tun.keepAlive === true) ok("tunnel: KeepAlive"); else bad("tunnel: thiếu KeepAlive");
const cn = plists["vn.babybean.tu-cap-nhat"];
if (cn && cn.interval === 300) ok("tu-cap-nhat: mỗi 300 giây"); else bad(`tu-cap-nhat: StartInterval=${cn && cn.interval} (mong 300)`);
const cg = plists["vn.babybean.canh-gac"];
if (cg && cg.interval === 60) ok("canh-gac: mỗi 60 giây"); else bad(`canh-gac: StartInterval=${cg && cg.interval} (mong 60)`);
console.log(`__KET_QUA__ ${dat} ${hong}`);
process.exit(hong ? 1 : 0);
JS
grep -v '^__KET_QUA__' "$TAM/node.out"
KQ="$(grep '^__KET_QUA__' "$TAM/node.out" || true)"
if [ -n "$KQ" ]; then
  set -- $KQ; DAT=$((DAT + $2)); HONG=$((HONG + $3))
else
  hong "phép kiểm plist bằng node không chạy hết"
fi

if command -v plutil >/dev/null 2>&1; then
  echo "3b. plutil -lint (chỉ có trên Mac)"
  for f in "$TAM"/plist/*.plist; do
    if plutil -lint -s "$f"; then dat "plutil $(basename "$f")"; else hong "plutil $(basename "$f")"; fi
  done
fi

echo "4. Script chạy app/cron dùng đúng cổng và đường"
grep -q 'next start -p "\$BB_CONG_APP" -H 127.0.0.1' "$DAY/chay-app.sh" && dat "chay-app.sh: next start chỉ nghe 127.0.0.1" || hong "chay-app.sh: không thấy next start -H 127.0.0.1"
( . "$DAY/lib/chung.sh"; [ "$BB_CONG_APP" = 3000 ] && [ "$BB_CONG_THU" = 3001 ] ) && dat "cổng app 3000, cổng chạy thử 3001" || hong "cổng sai"
grep -q -- '-H @-' "$DAY/goi-cron.sh" && dat "goi-cron.sh: khoá đi qua stdin (-H @-), không nằm trên dòng lệnh" || hong "goi-cron.sh: khoá có thể lộ qua ps"

echo "5. doc_bien / kiem_env trên tệp env GIẢ"
(
  . "$DAY/lib/chung.sh"
  F="$TAM/env-gia"
  # Giá trị bịa, không phải khoá thật.
  printf '%s\n' \
    'NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co' \
    'NEXT_PUBLIC_SUPABASE_ANON_KEY="gia-anon"' \
    "SUPABASE_SERVICE_ROLE_KEY='gia-service'" \
    'SUPABASE_DB_URL=postgresql://nguoidung.gia:matkhaugia@aws-0-x.pooler.supabase.com:5432/postgres' \
    'APP_SECRET=0123456789abcdef0123456789abcdef' \
    'NEXT_PUBLIC_APP_URL=https://hauky.babybeanstudio.vn' \
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY=gia' 'VAPID_PRIVATE_KEY=gia' 'VAPID_SUBJECT=mailto:a@b.vn' \
    'LARK_APP_ID=gia' 'LARK_APP_SECRET=gia' 'LARK_BASE_APP_TOKEN=gia' 'LARK_GHI_LINK_QUAN_LY=1' \
    'GOOGLE_DRIVE_API_KEY=gia' 'export CRON_SECRET=khoa-cron-gia' $'SYNC_CRON_SECRET=gia\r' > "$F"
  [ "$(doc_bien CRON_SECRET "$F")" = "khoa-cron-gia" ] && echo "OK1" || echo "BAD1 export"
  [ "$(doc_bien NEXT_PUBLIC_SUPABASE_ANON_KEY "$F")" = "gia-anon" ] && echo "OK2" || echo "BAD2 nháy kép"
  [ "$(doc_bien SUPABASE_SERVICE_ROLE_KEY "$F")" = "gia-service" ] && echo "OK3" || echo "BAD3 nháy đơn"
  [ "$(doc_bien SYNC_CRON_SECRET "$F")" = "gia" ] && echo "OK4" || echo "BAD4 CRLF"
  [ -z "$(doc_bien KHONG_CO "$F")" ] && echo "OK5" || echo "BAD5"
  kiem_env "$F" >/dev/null 2>&1 && echo "OK6" || echo "BAD6 env đủ mà bị chê"
  grep -v '^LARK_APP_SECRET=' "$F" > "$F.2"
  ra="$(kiem_env "$F.2" 2>&1)"; ma=$?
  case "$ra" in *'Còn trống: LARK_APP_SECRET'*) [ "$ma" -ne 0 ] && echo "OK7" || echo "BAD7 thiếu biến mà vẫn trả 0" ;;
    *) echo "BAD7 thiếu biến không bị bắt" ;; esac
  sed 's#:5432/#:6543/#' "$F" > "$F.3"
  kiem_env "$F.3" >/dev/null 2>&1 && echo "BAD8 6543 lọt" || echo "OK8"
  { cat "$F"; echo 'PHEP_THU_TRINH_DUYET=1'; } > "$F.4"
  kiem_env "$F.4" >/dev/null 2>&1 && echo "BAD9 biến cấm lọt" || echo "OK9"
  sed 's#^APP_SECRET=.*#APP_SECRET=ngan#' "$F" > "$F.5"
  kiem_env "$F.5" >/dev/null 2>&1 && echo "BAD10 APP_SECRET ngắn lọt" || echo "OK10"
  sed 's#^GOOGLE_DRIVE_API_KEY=.*#GOOGLE_DRIVE_API_KEY=ab$cd#' "$F" > "$F.6"
  kiem_env "$F.6" >/dev/null 2>&1 && echo "BAD11 ký tự \$ lọt" || echo "OK11"
  sed 's#^NEXT_PUBLIC_SUPABASE_URL=.*#NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co/rest/v1#' "$F" > "$F.7"
  kiem_env "$F.7" >/dev/null 2>&1 && echo "BAD12 /rest/v1 lọt" || echo "OK12"
  # Tệp mẫu (chưa điền) phải bị chê.
  kiem_env "$DAY/mau-env.txt" >/dev/null 2>&1 && echo "BAD13 mẫu trống lọt" || echo "OK13"
) > "$TAM/env.out" 2>&1
while read -r dong; do
  case "$dong" in OK*) dat "env: $dong" ;; BAD*) hong "env: $dong" ;; esac
done < "$TAM/env.out"

echo "6. Không có bí mật trong bộ cài và tài liệu"
# Mẫu ghép từ mảnh để chính tệp này không tự khớp.
MAU="ey""J[A-Za-z0-9_-]{20,}|sb_""secret_[A-Za-z0-9]|sb_""publishable_[A-Za-z0-9]|AI""za[0-9A-Za-z_-]{30,}|BEGIN [A-Z ]*PRIVATE"" KEY|postgres(ql)?://[^ :]+:[^ @<\[]+@[a-z0-9.-]+\.supabase\.com"
CAC_TEP=$(ls "$DAY"/*.sh "$DAY"/lib/*.sh "$DAY"/*.md "$DAY"/*.txt "$GOC/docs/31-may-chu-mac.md" 2>/dev/null | grep -v 'kiem-tra-tinh.sh')
if grep -nE "$MAU" $CAC_TEP >/dev/null 2>&1; then
  hong "có chuỗi giống khoá thật:"; grep -nE "$MAU" $CAC_TEP | cut -c1-120
else
  dat "không thấy chuỗi giống khoá (JWT, sb_secret, AIza…, private key, chuỗi Postgres có mật khẩu)"
fi
for ten in CRON_SECRET APP_SECRET SUPABASE_SERVICE_ROLE_KEY; do
  if grep -nE "^${ten}=.+" "$DAY/mau-env.txt" >/dev/null; then hong "mau-env.txt có giá trị cho $ten"; else dat "mau-env.txt: $ten để trống"; fi
done

echo
echo "TỔNG: $DAT đạt, $HONG hỏng"
[ "$HONG" -eq 0 ]
