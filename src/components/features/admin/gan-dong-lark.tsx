"use client";

/**
 * BB-325 ("đi về đâu") — bộ ảnh CHƯA gắn dòng Hậu Kỳ bên Lark: Link app của nó
 * không biết ghi về đâu, nên app KHÔNG ghi sang Lark. Khối này nói rõ lý do và
 * cho CSKH gắn dòng trước: nhập mã hóa đơn + SĐT → tra Lark → bấm "Gắn".
 */
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { formatNgayVN } from "@/lib/utils/dinh-dang";

interface Dong {
  recordId: string;
  maHoaDon: string;
  tenMe: string;
  tenBe: string;
  goiChup: string;
  ngayChup: string | null;
  boAnhDaCo: { id: string; tieuDe: string } | null;
}

export function GanDongLark({ galleryId, onDone }: { galleryId: string; onDone: () => void | Promise<void> }) {
  const [ma, setMa] = useState("");
  const [sdt, setSdt] = useState("");
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [cacDong, setCacDong] = useState<Dong[]>([]);

  async function tra() {
    setDang(true);
    setLoi(null);
    setCacDong([]);
    try {
      const res = await fetch("/api/admin/galleries/tra-lark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maHoaDon: ma, soDienThoai: sdt }),
      });
      const body = await res.json();
      if (!res.ok) setLoi(body?.error?.message ?? "Không tra được Lark");
      else setCacDong(body.data?.dong ?? []);
    } catch {
      setLoi("Không kết nối được máy chủ.");
    } finally {
      setDang(false);
    }
  }

  async function gan(recordId: string) {
    setDang(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/gan-lark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ larkHaukyRecordId: recordId }),
      });
      const body = await res.json();
      if (!res.ok) setLoi(body?.error?.message ?? "Không gắn được");
      else await onDone();
    } catch {
      setLoi("Không kết nối được máy chủ.");
    } finally {
      setDang(false);
    }
  }

  return (
    <div data-testid="gan-dong-lark" className="mt-3 space-y-3 rounded-md border border-[var(--bb-warning,var(--bb-border))] p-3 text-sm">
      <p>
        <strong>Bộ ảnh này chưa gắn dòng Hậu Kỳ bên Lark</strong> — Link app sẽ không được ghi sang Lark vì
        không biết ghi vào dòng nào. Gắn dòng trước rồi hãy tạo/gửi link.
      </p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void tra();
        }}
      >
        <Input
          name="maHoaDonGan"
          aria-label="Mã hóa đơn"
          placeholder="HD_20260901#01"
          value={ma}
          onChange={(e) => setMa(e.target.value)}
          spellCheck={false}
        />
        <Input
          name="sdtGan"
          aria-label="Số điện thoại khách"
          placeholder="0901234567"
          inputMode="tel"
          value={sdt}
          onChange={(e) => setSdt(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={dang || !ma.trim() || !sdt.trim()}>
          {dang ? "Đang tra…" : "Tra Lark"}
        </Button>
      </form>
      {loi && (
        <p role="alert" className="text-[var(--bb-danger)]">
          {loi}
        </p>
      )}
      {cacDong.map((d) => (
        <div key={d.recordId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--bb-border)] p-2">
          <span className="tabular-nums">
            {[d.maHoaDon, d.tenMe, d.tenBe, d.goiChup, d.ngayChup ? formatNgayVN(d.ngayChup) : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {d.boAnhDaCo && d.boAnhDaCo.id !== galleryId ? (
            <a className="text-[var(--bb-primary)] underline" href={`/admin/galleries/${encodeURIComponent(d.boAnhDaCo.id)}`}>
              Đã thuộc bộ &ldquo;{d.boAnhDaCo.tieuDe}&rdquo; →
            </a>
          ) : (
            <Button size="sm" variant="outline" disabled={dang} onClick={() => void gan(d.recordId)}>
              Gắn dòng này
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
