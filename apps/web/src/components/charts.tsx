import { useState, type ReactNode } from "react";
import { Table2 } from "lucide-react";
import { cn } from "../ui";

// Chart pieces following the dataviz method: thin marks with 4px rounded data-ends, a 2px surface gap
// between touching fills, values at the bar tip, text in text tokens (never the series colour),
// hover/focus tooltips on every mark, and a table view so nothing is gated behind hover.

const SERIES = "rgb(var(--series-1))";

export function ChartCard({ title, subtitle, children, table, className }: { title: string; subtitle?: string; children: ReactNode; table?: { head: string[]; rows: (string | number)[][] }; className?: string }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={cn("card p-5", className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {table && (
          <button onClick={() => setShowTable((s) => !s)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-subtle hover:text-fg" aria-pressed={showTable}>
            <Table2 className="h-3.5 w-3.5" /> {showTable ? "Chart" : "Data"}
          </button>
        )}
      </div>
      {showTable && table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              {table.head.map((h) => (
                <th key={h} className="pb-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={cn("py-1.5", j > 0 && "tabular-nums")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        children
      )}
    </section>
  );
}

/** Horizontal bars, one hue (magnitude). Value sits at the bar tip. */
export function BarList({ rows, unit = "" }: { rows: { label: string; value: number; icon?: ReactNode }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li
          key={r.label}
          tabIndex={0}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          className="grid grid-cols-[8.5rem_1fr] items-center gap-3 rounded-md outline-none"
          aria-label={`${r.label}: ${r.value}${unit}`}
        >
          <span className="flex items-center gap-1.5 truncate text-sm text-fg/80 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-muted">
            {r.icon}
            {r.label}
          </span>
          <span className="relative flex h-5 items-center gap-2">
            <span
              className="h-5 rounded-r-[4px] transition-[filter,width] duration-300"
              style={{ width: `${(r.value / max) * 85}%`, minWidth: r.value ? 3 : 0, background: SERIES, filter: hover === i ? "brightness(1.15)" : undefined }}
            />
            <span className="text-xs font-medium tabular-nums">
              {r.value}
              {unit}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Part-to-whole in one bar; 2px surface gaps between segments; legend carries label, count and share. */
export function StackedBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const [hover, setHover] = useState<string | null>(null);
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="flex h-6 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={shown.map((s) => `${s.label} ${s.value}`).join(", ")}>
        {shown.map((s) => (
          <div
            key={s.label}
            title={`${s.value} · ${s.label}`}
            onMouseEnter={() => setHover(s.label)}
            onMouseLeave={() => setHover(null)}
            className="h-full transition-opacity"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color, opacity: hover && hover !== s.label ? 0.45 : 1 }}
          />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm" onMouseEnter={() => setHover(s.label)} onMouseLeave={() => setHover(null)}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: s.color }} />
            <span className="text-fg/80">{s.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{s.value}</span>
            <span className="w-9 text-right text-xs tabular-nums text-muted">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Columns over time (one hue), clean ticks, hairline grid, tooltip on the hovered column. */
export function Columns({ data, height = 160 }: { data: { label: string; value: number; detail?: string }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = Array.from({ length: max + 1 }, (_, i) => i).filter((t) => max <= 4 || t % Math.ceil(max / 4) === 0);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="relative">
      <div className="relative ml-6" style={{ height }}>
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / max) * 100}%` }}>
            <span className="absolute -left-6 -top-2 w-4 text-right text-[10px] tabular-nums text-muted">{t}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {data.map((d, i) => (
            <div
              key={d.label}
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="relative flex h-full flex-1 items-end justify-center outline-none"
              aria-label={`${d.label}: ${d.value}`}
            >
              <div className="w-full max-w-[24px] rounded-t-[4px] transition-[filter]" style={{ height: `${(d.value / max) * 100}%`, background: SERIES, filter: hover === i ? "brightness(1.15)" : undefined }} />
              {hover === i && (
                <div className="pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[14rem] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop">
                  <div className="text-sm font-semibold tabular-nums">{d.value} email{d.value === 1 ? "" : "s"}</div>
                  <div className="text-muted">{d.label}</div>
                  {d.detail && <div className="mt-0.5 font-mono text-[11px] text-muted">{d.detail}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="ml-6 mt-1.5 flex gap-[2px]">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[10px] tabular-nums text-muted">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A single ratio against its limit: same-ramp track, filled share. */
export function Meter({ label, value, max, display }: { label: string; value: number; max: number; display?: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-fg/80">{label}</span>
        <span className="font-semibold tabular-nums">{display ?? `${value}/${max}`}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: "rgb(var(--series-track))" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SERIES }} />
      </div>
    </div>
  );
}

export function StatTile({ label, value, caption, icon, accent }: { label: string; value: ReactNode; caption?: ReactNode; icon: ReactNode; accent?: "red" | "amber" | "green" | "brand" }) {
  const ring = { red: "text-rose-600 bg-rose-500/10", amber: "text-amber-600 bg-amber-500/10", green: "text-emerald-600 bg-emerald-500/10", brand: "text-brand bg-brand/10" }[accent ?? "brand"];
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg [&>svg]:h-4 [&>svg]:w-4", ring)}>{icon}</span>
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      {caption && <div className="mt-1 text-xs text-muted">{caption}</div>}
    </div>
  );
}
