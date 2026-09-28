/**
 * BB-315 — khai báo ambient cho `import ... from "*.mjs"`.
 *
 * `tsconfig.json` đặt `allowJs: false` (đúng, kho này không muốn TS tự kiểm
 * tra .js/.mjs), nên `tsc --noEmit` không có cách nào suy ra kiểu của các
 * script trong `scripts/**\/*.mjs` khi phép thử `.test.ts` import ngược lại
 * chúng để kiểm logic thuần (AGENTS.md §5a — phép thử phải gọi đúng hàm thật,
 * không đọc mã nguồn làm dữ liệu).
 *
 * Khai báo "shorthand ambient module" (không có thân `{}`) làm mọi export đặt
 * tên từ một `.mjs` bất kỳ có kiểu `any` — không kiểm được kiểu chi tiết, đúng
 * đủ để hết lỗi TS7016 mà không tự bịa một bộ kiểu giả rồi cam đoan sai.
 */
declare module "*.mjs";
