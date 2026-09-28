#!/usr/bin/env node
/**
 * tao-mat-khau-sao-luu — tạo mật khẩu mã hoá bản sao lưu (BACKUP_PASSPHRASE).
 *
 * Chạy TRÊN MÁY ADMIN, in ra màn hình của admin, không ghi ra tệp, không gửi
 * đi đâu. Ghép 6 từ tiếng Việt không dấu chọn ngẫu nhiên bằng crypto (không
 * phải Math.random) + 2 chữ số: dễ chép tay, khó đoán (~50 bit).
 *
 *   npm run db:tao-mat-khau
 */
import crypto from "node:crypto";

const TU = [
  "mua", "nang", "gio", "may", "suong", "trang", "sao", "bien", "song", "nui",
  "doi", "rung", "hoa", "la", "canh", "re", "hat", "dau", "com", "chao",
  "banh", "keo", "sua", "tra", "ca", "tom", "cua", "ga", "vit", "meo",
  "cho", "chim", "buom", "ong", "kien", "de", "ngua", "trau", "bo", "heo",
  "xanh", "do", "tim", "hong", "vang", "nau", "den", "xam", "cam", "lam",
  "sang", "chieu", "toi", "dem", "xuan", "ha", "thu", "dong", "tet", "ram",
  "nha", "cua", "so", "ban", "ghe", "den", "den", "sach", "but", "giay",
  "anh", "khung", "album", "phim", "mau", "net", "bong", "ruong", "vuon", "ao",
  "cau", "duong", "pho", "cho", "ben", "thuyen", "xe", "tau", "may", "dien",
  "ngot", "man", "chua", "cay", "dang", "thom", "mem", "cung", "am", "mat",
];
const tuKhongTrung = [...new Set(TU)];
const chon = () => tuKhongTrung[crypto.randomInt(tuKhongTrung.length)];
const matKhau = [chon(), chon(), chon(), chon(), chon(), chon()].join("-") + "-" + crypto.randomInt(10, 100);

console.log("\nMật khẩu mã hoá sao lưu (chỉ hiện trên máy này):\n");
console.log("   " + matKhau + "\n");
console.log("Việc tiếp theo:");
console.log(" 1. Chép vào nơi cất an toàn (trình quản lý mật khẩu, hoặc viết tay cất tủ).");
console.log("    KHÔNG gửi qua Zalo, email, Lark, không dán vào khung chat với Claude.");
console.log(" 2. Dán vào GitHub Secret tên BACKUP_PASSPHRASE.");
console.log(" 3. Mất mật khẩu này = không mở được MỌI bản sao lưu, kể cả bản cũ.\n");
