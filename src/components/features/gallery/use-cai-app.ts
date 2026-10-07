"use client";

/**
 * BB-378 — nút "Lưu ngay" một chạm khi trình duyệt cho phép (sự kiện
 * `beforeinstallprompt`: Chrome Android, Chrome/Edge máy tính).
 *
 * Sự kiện chỉ bắn MỘT lần mỗi trang, thường TRƯỚC khi lời mời/tấm hướng dẫn
 * dựng xong — nên bắt ngay khi tệp này được nạp (cùng gói với màn khách) và giữ
 * ở cấp module, mọi nơi cần dùng (lời mời đầu trang, tấm hướng dẫn) đọc chung.
 * iPhone/Zalo/Facebook không có sự kiện này → `coTheCaiNgay` = false, nơi gọi
 * hiện các bước hướng dẫn thay vì nút.
 */

import { useEffect, useState } from "react";

interface SuKienCaiApp extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let suKien: SuKienCaiApp | null = null;
const nguoiNghe = new Set<() => void>();
let daGan = false;

function bao() {
  nguoiNghe.forEach((f) => f());
}

function ganMotLan() {
  if (daGan || typeof window === "undefined") return;
  daGan = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    suKien = e as SuKienCaiApp;
    bao();
  });
  window.addEventListener("appinstalled", () => {
    suKien = null;
    bao();
  });
}

ganMotLan();

export function useCaiApp(): { coTheCaiNgay: boolean; caiNgay: () => Promise<boolean> } {
  const [, setDem] = useState(0);
  useEffect(() => {
    ganMotLan();
    const f = () => setDem((n) => n + 1);
    nguoiNghe.add(f);
    // Sự kiện có thể đã tới trước lượt dựng này.
    if (suKien) f();
    return () => {
      nguoiNghe.delete(f);
    };
  }, []);

  const caiNgay = async (): Promise<boolean> => {
    const e = suKien;
    if (!e) return false;
    await e.prompt();
    const kq = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    suKien = null; // mỗi sự kiện chỉ gọi prompt() được một lần
    bao();
    return kq.outcome === "accepted";
  };

  return { coTheCaiNgay: suKien !== null, caiNgay };
}
