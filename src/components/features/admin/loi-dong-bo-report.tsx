/**
 * Báo cáo: bộ ảnh kéo từ Google Drive về không thành công.
 *
 * OWNER: DEV-FE. Task BB-129.
 * Spec: docs/briefs/BB-129-man-hinh-loi-dong-bo.md
 *
 * ---------------------------------------------------------------------------
 * Vì sao gom theo lý do
 * ---------------------------------------------------------------------------
 * Mẻ ngày 14.09.2026 hỏng 77 bộ, cả 77 bộ cùng một lý do. Nhìn danh sách phẳng
 * thì đó là 77 việc phải làm; nhìn theo nhóm thì đó là MỘT việc — sửa quyền
 * chia sẻ — lặp 77 lần. Hai cách nhìn dẫn tới hai cách phân công khác hẳn
 * nhau, nên màn hình phải nói ra ngay từ dòng đầu.
 *
 * ---------------------------------------------------------------------------
 * Vì sao có nút "Thử lại tất cả" của cả nhóm
 * ---------------------------------------------------------------------------
 * Sửa quyền bên Drive là việc làm hàng loạt: CSKH mở thư mục cha, đổi quyền
 * một lượt. Sau đó không ai chịu bấm 77 lần, và nếu bắt bấm 77 lần thì người
 * ta sẽ bỏ dở ở lần thứ mười rồi báo là "hệ thống vẫn lỗi".
 *
 * ---------------------------------------------------------------------------
 * Vì sao bấm xong danh sách chưa đổi ngay
 * ---------------------------------------------------------------------------
 * Đường đồng bộ trả 202 rồi chạy tiếp ở nền — một thư mục vài trăm ảnh lâu hơn
 * thời gian chờ của trình duyệt. Nên sau khi bấm, màn hình ghi rõ "đã gửi yêu
 * cầu" chứ KHÔNG nói "đã xong", rồi tự tải lại danh sách sau ít giây. Nói sai
 * ở chỗ này tệ hơn là chờ: người dùng sẽ tin bộ ảnh đã lành và đi làm việc
 * khác, trong khi nó vẫn hỏng.
 */

"use client";

import React from "react";
import { Button } from "@/components/ui/button";

interface LoiItem {
  galleryId: string;
  galleryTitle: string;
  contractCode: string | null;
  branchId: string;
  branchName: string;
  driveFolderUrl: string;
  lastSyncedAt: string | null;
  status: string;
  statusLabel: string;
}

interface NhomLoi {
  reason: string;
  count: number;
  items: LoiItem[];
}

interface TomTat {
  galleryCount: number;
  reasonCount: number;
  truncated: boolean;
}

/** Trạng thái của nút Thử lại từng bộ, chỉ sống trong phiên xem này. */
type TrangThaiThuLai = "da-gui" | "that-bai";

/**
 * Số yêu cầu đồng bộ gửi đi cùng lúc.
 *
 * Mỗi yêu cầu mở một phiên gọi Google Drive ở phía máy chủ. Bắn cả 77 phát một
 * lúc thì Drive trả 429 và biến một lỗi quyền chia sẻ thành hai loại lỗi chồng
 * lên nhau — lúc đó không ai lần ra được cái nào là nguyên nhân gốc.
 */
const SONG_SONG = 4;

/** Chờ trước khi tự tải lại. Đủ cho những thư mục nhỏ kịp xong. */
const CHO_TRUOC_KHI_TAI_LAI_MS = 5000;

export function LoiDongBoReport() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<TomTat | null>(null);
  const [groups, setGroups] = React.useState<NhomLoi[]>([]);
  const [dangThuLai, setDangThuLai] = React.useState<Set<string>>(new Set());
  const [ketQua, setKetQua] = React.useState<Record<string, TrangThaiThuLai>>({});
  const [loiThuLai, setLoiThuLai] = React.useState<string | null>(null);

  const taiDanhSach = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports/loi-dong-bo");
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Không tải được báo cáo");
        return;
      }
      setSummary(json.data.summary);
      setGroups(json.data.groups);
      setError(null);
      // Xoá dấu "đã gửi yêu cầu" của lượt trước. Bộ nào còn nằm đây sau khi
      // tải lại nghĩa là lần thử đó KHÔNG ăn thua, nên phải trả lại nút Thử
      // lại cho người ta bấm tiếp — chứ không để dòng đó mang mãi chữ "đã gửi"
      // rồi không ai đụng vào được nữa.
      setKetQua({});
    } catch {
      setError("Mất kết nối, thử lại giúp.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void taiDanhSach();
  }, [taiDanhSach]);

  /**
   * Gửi yêu cầu đồng bộ lại cho một hoặc nhiều bộ.
   *
   * Chỉ ghi nhận "đã gửi" — kết quả thật nằm ở lần tải lại danh sách sau đó.
   */
  async function thuLai(items: LoiItem[]) {
    const ids = items.map((i) => i.galleryId);
    setLoiThuLai(null);
    setDangThuLai((truoc) => new Set([...truoc, ...ids]));

    const hangDoi = [...ids];
    let soLoi = 0;

    async function chayMotLan() {
      for (let id = hangDoi.shift(); id; id = hangDoi.shift()) {
        let thanhCong = false;
        try {
          const res = await fetch(`/api/admin/galleries/${id}/sync`, { method: "POST" });
          thanhCong = res.ok;
        } catch {
          thanhCong = false;
        }
        if (!thanhCong) soLoi += 1;

        const ketQuaBo: TrangThaiThuLai = thanhCong ? "da-gui" : "that-bai";
        setKetQua((truoc) => ({ ...truoc, [id]: ketQuaBo }));
        setDangThuLai((truoc) => {
          const sau = new Set(truoc);
          sau.delete(id);
          return sau;
        });
      }
    }

    await Promise.all(Array.from({ length: Math.min(SONG_SONG, ids.length) }, chayMotLan));

    if (soLoi > 0) {
      setLoiThuLai(
        `Có ${soLoi} bộ không gửi được yêu cầu. Tải lại trang rồi thử lại những bộ đó.`,
      );
    }

    // Tải lại để bộ nào đã lành thì biến khỏi danh sách. Bộ nào còn hỏng sẽ
    // hiện lại với lý do mới — và lý do mới đó mới là thứ đáng đọc.
    window.setTimeout(() => void taiDanhSach(), CHO_TRUOC_KHI_TAI_LAI_MS);
  }

  if (loading) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải báo cáo…</p>;
  if (error) return <p className="text-sm text-[var(--bb-danger)]">{error}</p>;
  if (!summary) return null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Bộ ảnh tải từ Drive bị lỗi</h1>
          <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
            Những bộ ảnh chưa kéo được ảnh từ Google Drive về. Sửa nguyên nhân bên
            Drive trước, rồi bấm Thử lại.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void taiDanhSach()}>
          Tải lại danh sách
        </Button>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Stat label="Bộ ảnh đang lỗi" value={String(summary.galleryCount)} />
        <Stat
          label="Số lý do khác nhau"
          value={String(summary.reasonCount)}
          hint={
            summary.reasonCount === 1 && summary.galleryCount > 1
              ? "cùng một nguyên nhân"
              : undefined
          }
        />
      </section>

      {summary.truncated && (
        <p className="rounded-md border border-[var(--bb-border)] p-3 text-sm">
          Danh sách đang hiện tối đa <strong>{summary.galleryCount}</strong> bộ. Có thể
          còn bộ khác chưa hiện — xử lý bớt rồi tải lại để xem tiếp.
        </p>
      )}

      {loiThuLai && <p className="text-sm text-[var(--bb-danger)]">{loiThuLai}</p>}

      {groups.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">
          Không có bộ ảnh nào đang lỗi. Mọi bộ đều đã kéo được ảnh về.
        </p>
      ) : (
        groups.map((g) => (
          <section
            key={g.reason}
            className="rounded-lg border border-[var(--bb-border)] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">{g.reason}</h2>
                <p className="mt-0.5 text-sm text-[var(--bb-fg-muted)]">
                  {g.count} bộ ảnh cùng lý do này
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => void thuLai(g.items)}
                disabled={g.items.some((i) => dangThuLai.has(i.galleryId))}
              >
                Thử lại tất cả ({g.count})
              </Button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[48rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--bb-border)] text-left">
                    <Th>Tên bộ ảnh</Th>
                    <Th>Mã hợp đồng</Th>
                    <Th>Chi nhánh</Th>
                    <Th>Trạng thái</Th>
                    <Th>Lần thử gần nhất</Th>
                    <Th>Thư mục Drive</Th>
                    <Th className="text-right">Thử lại</Th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it) => (
                    <tr key={it.galleryId} className="border-b border-[var(--bb-border)]">
                      <td className="py-2 pr-3">{it.galleryTitle}</td>
                      {/* select-all để CSKH bôi đen một phát rồi dán sang Lark tra ngược */}
                      <td className="select-all py-2 pr-3 font-mono text-xs">
                        {it.contractCode ?? "—"}
                      </td>
                      <td className="py-2 pr-3">{it.branchName}</td>
                      <td className="py-2 pr-3">{it.statusLabel}</td>
                      <td className="py-2 pr-3">{formatDateTime(it.lastSyncedAt)}</td>
                      <td className="py-2 pr-3">
                        {/* Mở tab mới: CSKH còn phải quay lại đây bấm Thử lại. */}
                        <a
                          href={it.driveFolderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--bb-primary)] underline-offset-4 hover:underline"
                        >
                          Mở thư mục
                        </a>
                      </td>
                      <td className="py-2 text-right">
                        <TrangThaiNut
                          dangChay={dangThuLai.has(it.galleryId)}
                          ketQua={ketQua[it.galleryId]}
                          onClick={() => void thuLai([it])}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/**
 * Nút Thử lại của một dòng.
 *
 * Sau khi gửi thì ghi "Đã gửi yêu cầu" chứ không ghi "Xong": lúc đó máy chủ
 * mới nhận việc, ảnh chưa về. Xem ghi chú đầu tệp.
 */
function TrangThaiNut({
  dangChay,
  ketQua,
  onClick,
}: {
  dangChay: boolean;
  ketQua?: TrangThaiThuLai;
  onClick: () => void;
}) {
  if (dangChay) {
    return <span className="text-xs text-[var(--bb-fg-muted)]">Đang gửi…</span>;
  }
  if (ketQua === "da-gui") {
    return <span className="text-xs text-[var(--bb-fg-muted)]">Đã gửi yêu cầu</span>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      {ketQua === "that-bai" && (
        <span className="text-xs text-[var(--bb-danger)]">Gửi không được</span>
      )}
      <Button variant="outline" size="sm" onClick={onClick}>
        Thử lại
      </Button>
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--bb-border)] p-3">
      <div className="text-xs text-[var(--bb-fg-muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--bb-fg-muted)]">{hint}</div>}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`py-2 pr-3 font-medium ${className ?? ""}`}>{children}</th>;
}

/** Chưa đồng bộ lần nào thì để gạch ngang, đừng bịa ra ngày 01/01/1970. */
function formatDateTime(value: string | null): string {
  if (!value) return "Chưa từng tải được";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
