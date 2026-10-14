import { formatARS } from "@/domain/money";
import { formatCompactARS } from "@/lib/format";

export interface BarDatum {
  label: string;
  a: number;
  b?: number;
}

const COLOR_A = "#1E56F0";
const COLOR_B = "#B6C9FB";

/** Barras agrupadas en SVG. Cada barra lleva su valor en un <title>; el detalle completo va también en una tabla aparte. */
export function BarChart({
  data,
  labelA,
  labelB,
  ariaLabel,
}: {
  data: BarDatum[];
  labelA: string;
  labelB?: string;
  ariaLabel: string;
}) {
  const W = 720;
  const H = 240;
  const left = 56;
  const right = 8;
  const top = 12;
  const bottom = 28;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b ?? 0]));
  const n = Math.max(1, data.length);
  const groupW = plotW / n;
  const hasB = labelB !== undefined;
  const barW = Math.max(2, Math.min(28, (groupW * 0.7) / (hasB ? 2 : 1)));
  const labelEvery = Math.ceil(n / 12);
  const y = (v: number) => top + plotH - (v / max) * plotH;

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: COLOR_A }} aria-hidden />
          {labelA}
        </span>
        {hasB && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: COLOR_B }} aria-hidden />
            {labelB}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(max * t)} y2={y(max * t)} stroke="#E6EAF1" />
            <text x={left - 6} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="#6E7786">
              {formatCompactARS(max * t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = left + groupW * i + groupW / 2;
          const x0 = hasB ? cx - barW : cx - barW / 2;
          return (
            <g key={`${d.label}-${i}`}>
              <rect x={x0} y={y(d.a)} width={barW} height={Math.max(0, top + plotH - y(d.a))} rx={2} fill={COLOR_A}>
                <title>{`${d.label}: ${labelA} ${formatARS(d.a)}`}</title>
              </rect>
              {hasB && (
                <rect x={cx} y={y(d.b ?? 0)} width={barW} height={Math.max(0, top + plotH - y(d.b ?? 0))} rx={2} fill={COLOR_B}>
                  <title>{`${d.label}: ${labelB} ${formatARS(d.b ?? 0)}`}</title>
                </rect>
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="#6E7786">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
