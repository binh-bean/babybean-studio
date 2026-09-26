/**
 * Biểu đồ cột/đường đơn giản vẽ tay bằng SVG — không thêm thư viện biểu đồ
 * (brief BB-260 cấm thêm thư viện mới cho việc này).
 *
 * OWNER: DEV-FE (khung do DEV-BE dựng). Task BB-260.
 */

"use client";

import React from "react";
import type { BieuDoBaoCao } from "@/lib/bao-cao/loai";

const MAU_CHUOI = ["var(--bb-primary)", "var(--bb-accent)", "var(--bb-warning)", "var(--bb-urgent)"];

export function BieuDoSvg({ bieuDo }: { bieuDo: BieuDoBaoCao }) {
  const RONG = 640;
  const CAO = 220;
  const LE_TRAI = 36;
  const LE_DUOI = 28;
  const LE_TREN = 12;

  const tatCaGiaTri = bieuDo.chuoi.flatMap((c) => c.giaTri);
  const max = Math.max(1, ...tatCaGiaTri);
  const n = bieuDo.nhan.length;

  if (n === 0 || tatCaGiaTri.every((v) => v === 0)) {
    return <p className="text-sm text-[var(--bb-fg-muted)]">Không có dữ liệu trong kỳ này.</p>;
  }

  const rongVe = RONG - LE_TRAI - 8;
  const caoVe = CAO - LE_TREN - LE_DUOI;
  const yCua = (v: number) => LE_TREN + caoVe - (v / max) * caoVe;
  const xCua = (i: number) => LE_TRAI + (n <= 1 ? rongVe / 2 : (i / (n - 1)) * rongVe);
  const rongCot = n > 0 ? Math.max(4, (rongVe / n) * 0.6) : 4;

  const mocLuoi = 4;

  return (
    <svg
      viewBox={`0 0 ${RONG} ${CAO}`}
      className="h-56 w-full"
      role="img"
      aria-label="Biểu đồ báo cáo"
    >
      {Array.from({ length: mocLuoi + 1 }).map((_, i) => {
        const y = LE_TREN + (caoVe / mocLuoi) * i;
        const gia = Math.round(max - (max / mocLuoi) * i);
        return (
          <g key={i}>
            <line
              x1={LE_TRAI}
              y1={y}
              x2={RONG - 4}
              y2={y}
              stroke="var(--bb-border)"
              strokeWidth={1}
            />
            <text x={2} y={y + 3} fontSize={9} fill="var(--bb-fg-muted)">
              {gia}
            </text>
          </g>
        );
      })}

      {bieuDo.nhan.map((nhan, i) =>
        i % Math.max(1, Math.ceil(n / 8)) === 0 ? (
          <text
            key={nhan + i}
            x={xCua(i)}
            y={CAO - 6}
            fontSize={9}
            textAnchor="middle"
            fill="var(--bb-fg-muted)"
          >
            {nhan}
          </text>
        ) : null,
      )}

      {bieuDo.loai === "cot"
        ? bieuDo.chuoi.map((chuoi, ci) => (
            <g key={chuoi.ten}>
              {chuoi.giaTri.map((v, i) => {
                const x = xCua(i) - rongCot / 2 + (ci - (bieuDo.chuoi.length - 1) / 2) * (rongCot / bieuDo.chuoi.length);
                const y = yCua(v);
                return (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={rongCot / bieuDo.chuoi.length}
                    height={Math.max(0, LE_TREN + caoVe - y)}
                    fill={MAU_CHUOI[ci % MAU_CHUOI.length]}
                    rx={1.5}
                  >
                    <title>
                      {bieuDo.nhan[i]}: {v}
                    </title>
                  </rect>
                );
              })}
            </g>
          ))
        : bieuDo.chuoi.map((chuoi, ci) => (
            <polyline
              key={chuoi.ten}
              fill="none"
              stroke={MAU_CHUOI[ci % MAU_CHUOI.length]}
              strokeWidth={2}
              points={chuoi.giaTri.map((v, i) => `${xCua(i)},${yCua(v)}`).join(" ")}
            />
          ))}

      {bieuDo.loai === "duong" &&
        bieuDo.chuoi.map((chuoi, ci) =>
          chuoi.giaTri.map((v, i) => (
            <circle key={`${ci}-${i}`} cx={xCua(i)} cy={yCua(v)} r={2.5} fill={MAU_CHUOI[ci % MAU_CHUOI.length]}>
              <title>
                {chuoi.ten} · {bieuDo.nhan[i]}: {v}
              </title>
            </circle>
          )),
        )}

      {bieuDo.chuoi.length > 1 && (
        <g>
          {bieuDo.chuoi.map((chuoi, ci) => (
            <g key={chuoi.ten} transform={`translate(${LE_TRAI + ci * 110}, 4)`}>
              <rect width={8} height={8} fill={MAU_CHUOI[ci % MAU_CHUOI.length]} />
              <text x={12} y={8} fontSize={9} fill="var(--bb-fg-muted)">
                {chuoi.ten}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
