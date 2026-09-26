/**
 * BB-273 — khứ hồi mã hoá/giải mã của scripts/ma-hoa-sao-luu.mjs.
 *
 * OWNER: DEV-OPS.
 *
 * Không đụng database — chỉ đọc/ghi tệp tạm trên đĩa (os.tmpdir()) và gọi
 * script bằng child_process, đúng như GitHub Actions sẽ gọi nó. Gọi qua CLI
 * thay vì import hàm nội bộ để phép thử canh đúng hành vi người dùng cuối
 * thấy (exit code, thông điệp lỗi tiếng Việt trên stderr), không canh cách
 * viết hàm bên trong.
 */

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const GOC = path.resolve(__dirname, "../..");
const SCRIPT = path.join(GOC, "scripts/ma-hoa-sao-luu.mjs");
const MAT_KHAU_DUNG = "mot-mat-khau-du-dai-20-ky-tu-tro-len";

const tepTamDaTao: string[] = [];

function tepTam(ten: string): string {
  const duong = path.join(os.tmpdir(), `bb273-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}-${ten}`);
  tepTamDaTao.push(duong);
  return duong;
}

afterEach(() => {
  for (const t of tepTamDaTao.splice(0)) {
    try {
      fs.rmSync(t, { force: true });
    } catch {
      // dọn best-effort
    }
  }
});

function chay(args: string[], matKhau?: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], {
      env: {
        ...process.env,
        ...(matKhau === undefined ? {} : { BACKUP_PASSPHRASE: matKhau }),
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

describe("BB-273: mã hoá / giải mã tệp sao lưu", () => {
  it("khứ hồi mã hoá rồi giải mã cho ra đúng byte gốc (tệp nhỏ)", () => {
    const vao = tepTam("goc-nho.sql");
    const maHoa = tepTam("ma-hoa.enc");
    const giaiMa = tepTam("giai-ma.sql");

    const noiGoc = Buffer.from(
      "insert into public.\"customers\" (id, ten) values ('11111111-1111-1111-1111-111111111111', 'Nguyễn Thị Mai');\n",
      "utf8",
    );
    fs.writeFileSync(vao, noiGoc);

    const km = chay(["ma-hoa", vao, maHoa], MAT_KHAU_DUNG);
    expect(km.code, km.stderr).toBe(0);
    expect(fs.existsSync(maHoa)).toBe(true);

    const kg = chay(["giai-ma", maHoa, giaiMa], MAT_KHAU_DUNG);
    expect(kg.code, kg.stderr).toBe(0);

    const giaiRa = fs.readFileSync(giaiMa);
    expect(sha256(giaiRa)).toBe(sha256(noiGoc));
    expect(giaiRa.equals(noiGoc)).toBe(true);
  });

  it("khứ hồi đúng từng byte cho tệp vài MB (nhị phân giả lập, không phải văn bản lặp)", () => {
    const vao = tepTam("goc-lon.sql");
    const maHoa = tepTam("ma-hoa-lon.enc");
    const giaiMa = tepTam("giai-ma-lon.sql");

    // 3 MB dữ liệu ngẫu nhiên thật — không dùng chuỗi lặp, để không vô tình
    // che lỗi cắt/dịch byte mà một khối lặp có thể nguỵ trang.
    const noiGoc = crypto.randomBytes(3 * 1024 * 1024);
    fs.writeFileSync(vao, noiGoc);

    const km = chay(["ma-hoa", vao, maHoa], MAT_KHAU_DUNG);
    expect(km.code, km.stderr).toBe(0);

    const kg = chay(["giai-ma", maHoa, giaiMa], MAT_KHAU_DUNG);
    expect(kg.code, kg.stderr).toBe(0);

    const giaiRa = fs.readFileSync(giaiMa);
    expect(giaiRa.length).toBe(noiGoc.length);
    expect(sha256(giaiRa)).toBe(sha256(noiGoc));
  });

  it("giải mã sai mật khẩu thì báo lỗi rõ, exit khác 0, không ghi tệp ra", () => {
    const vao = tepTam("goc-sai-mk.sql");
    const maHoa = tepTam("ma-hoa-sai-mk.enc");
    const giaiMa = tepTam("giai-ma-sai-mk.sql");

    fs.writeFileSync(vao, "du lieu bi mat khong duoc lo\n");

    const km = chay(["ma-hoa", vao, maHoa], MAT_KHAU_DUNG);
    expect(km.code, km.stderr).toBe(0);

    const kg = chay(["giai-ma", maHoa, giaiMa], "mot-mat-khau-khac-cung-du-dai-20");
    expect(kg.code).not.toBe(0);
    expect(kg.stderr.length).toBeGreaterThan(0);
    expect(fs.existsSync(giaiMa)).toBe(false);
  });

  it("sửa 1 byte của ciphertext làm giải mã thất bại (GCM phát hiện được)", () => {
    const vao = tepTam("goc-sua-byte.sql");
    const maHoa = tepTam("ma-hoa-sua-byte.enc");
    const giaiMa = tepTam("giai-ma-sua-byte.sql");

    fs.writeFileSync(vao, "du lieu can toan ven, dung sua\n".repeat(50));

    const km = chay(["ma-hoa", vao, maHoa], MAT_KHAU_DUNG);
    expect(km.code, km.stderr).toBe(0);

    const buf = fs.readFileSync(maHoa);
    // Sửa một byte ở gần cuối, chắc chắn rơi vào phần ciphertext (sau đầu đề
    // magic + phiên bản + salt + iv + tag).
    const viTri = buf.length - 1;
    buf.writeUInt8(buf.readUInt8(viTri) ^ 0xff, viTri);
    fs.writeFileSync(maHoa, buf);

    const kg = chay(["giai-ma", maHoa, giaiMa], MAT_KHAU_DUNG);
    expect(kg.code).not.toBe(0);
    expect(fs.existsSync(giaiMa)).toBe(false);
  });

  it("mật khẩu ngắn hơn 20 ký tự bị từ chối, không mã hoá", () => {
    const vao = tepTam("goc-mk-ngan.sql");
    const maHoa = tepTam("ma-hoa-mk-ngan.enc");

    fs.writeFileSync(vao, "noi dung bat ky\n");

    const km = chay(["ma-hoa", vao, maHoa], "ngan-qua");
    expect(km.code).not.toBe(0);
    expect(fs.existsSync(maHoa)).toBe(false);
  });

  it("thiếu BACKUP_PASSPHRASE hoàn toàn cũng bị từ chối", () => {
    const vao = tepTam("goc-thieu-mk.sql");
    const maHoa = tepTam("ma-hoa-thieu-mk.enc");

    fs.writeFileSync(vao, "noi dung bat ky\n");

    const km = chay(["ma-hoa", vao, maHoa], undefined);
    expect(km.code).not.toBe(0);
    expect(fs.existsSync(maHoa)).toBe(false);
  });

  it("tệp ra không chứa chuỗi rõ nào từ đầu vào (đã mã hoá thật, không phải chỉ đổi tên)", () => {
    const vao = tepTam("goc-chuoi-ro.sql");
    const maHoa = tepTam("ma-hoa-chuoi-ro.enc");

    const chuoiDacTrung = "SDT-KHACH-THAT-0987654321-KHONG-DUOC-LO-RA-NGOAI";
    const noiGoc = `insert into public."customers" (sdt) values ('${chuoiDacTrung}');\n`.repeat(20);
    fs.writeFileSync(vao, noiGoc, "utf8");

    const km = chay(["ma-hoa", vao, maHoa], MAT_KHAU_DUNG);
    expect(km.code, km.stderr).toBe(0);

    const raBuf = fs.readFileSync(maHoa);
    expect(raBuf.includes(Buffer.from(chuoiDacTrung, "utf8"))).toBe(false);
    expect(raBuf.includes(Buffer.from("customers", "utf8"))).toBe(false);
  });

  it("giải mã một tệp hỏng/không đúng định dạng báo lỗi rõ, không ném ra ngoại lệ thô", () => {
    const raTepHong = tepTam("hong.enc");
    const giaiMa = tepTam("giai-ma-hong.sql");

    fs.writeFileSync(raTepHong, "day khong phai tep ma hoa hop le, chi la van ban thuong");

    const kg = chay(["giai-ma", raTepHong, giaiMa], MAT_KHAU_DUNG);
    expect(kg.code).not.toBe(0);
    expect(kg.stderr.length).toBeGreaterThan(0);
    expect(fs.existsSync(giaiMa)).toBe(false);
  });
});
