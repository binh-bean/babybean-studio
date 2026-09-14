# BB-136 — Hết chập chờn khi nhiều người chạy phép thử cùng lúc

**Cửa sổ:** DEV-OPS
**Thư mục worktree:** `../bb-ops-136`
**Nhánh:** `feat/bb-136-phep-thu-doc-lap`

---

## Vì sao có việc này

Ngày 14.09.2026 bốn agent chạy song song trên **cùng một** cơ sở dữ liệu thử.
Kết quả: `tests/security/gallery-auth.test.ts` đỏ khác nhau mỗi lần chạy — lần
1 ca, lần 7 ca, lần 8 ca, lần 0 ca. Chạy riêng thì 14/14 đạt.

Gốc bệnh: dữ liệu dựng sẵn dùng **hằng số cố định** (`token-no-pin`,
`Fixture BB-030%`) và bước dựng lại **xoá theo chính hằng số đó**. Hai tiến
trình chạy cùng lúc thì tiến trình này xoá dữ liệu của tiến trình kia giữa
chừng. `fileParallelism: false` chỉ chặn song song **trong** một tiến trình.

Ghi trong chính tệp đó, từ một lần vấp trước: *"Bộ test chập chờn tệ hơn bộ
test đỏ — người ta học thói quen chạy lại cho tới khi xanh, và một lỗi thật sẽ
trôi qua giữa những lần chạy lại đó."*

## Phải làm gì

1. Mỗi **lần chạy** một nhãn riêng (ví dụ 8 ký tự ngẫu nhiên). Mọi dữ liệu
   dựng sẵn mang nhãn đó: mã link, tiêu đề bộ ảnh, tên khách.
2. Bước dọn chỉ đụng **nhãn của chính mình**, không bao giờ dọn theo tiền tố
   chung.
3. Bước "dọn rác của lần chạy trước" vẫn giữ — nó cứu lần chạy chết giữa chừng
   — nhưng **chỉ dọn rác cũ hơn một giờ**, để không giẫm vào một tiến trình
   đang chạy song song.
4. Soát cả `tests/` xem còn tệp nào dùng hằng số dùng chung kiểu đó.

## Ràng buộc

- Không nới một điều kiện `expect` nào. Việc này sửa **cách dựng dữ liệu**,
  không sửa điều đang được kiểm.
- Xoá buổi chụp TRƯỚC khi xoá khách, và **đọc `error`** ở mỗi bước xoá:
  `shoots.customer_id` là `on delete NO ACTION` nên xoá khách bị chặn, mà
  Supabase `.delete()` không ném lỗi. Đúng chỗ im lặng này đã nuôi 138 dòng
  rác trong bb-dev suốt nhiều tuần.

## Xong là khi

- [ ] **Chạy hai tiến trình `npm test` cùng lúc**, cả hai cùng xanh. Đây là
      phép kiểm chứng của chính task này — làm thật và ghi kết quả vào báo cáo.
- [ ] Chạy xong bộ test thì bb-dev **không còn dòng `Fixture%` nào** (đếm và
      ghi số vào báo cáo)
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` sạch
