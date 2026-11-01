import { useEffect, useRef, useState, type ReactNode } from 'react'
import { linePath, xPositions, yFor, type Range } from './chartMath'

// Charts drawn by hand in SVG (no chart library). Each chart measures its own width and draws at
// exactly that size, so the text stays the same size on a phone and on a wide screen. Colours come
// from the theme, so dark mode works too.

const HEIGHT = 130
const LEFT = 40
const RIGHT_GAP = 8
const TOP = 8
const BOTTOM = 106

/** The width of the chart's box, in pixels; null until it's measured. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  // Without ResizeObserver (very old browsers), draw at a common phone width.
  const [width, setWidth] = useState<number | null>(() => (typeof ResizeObserver === 'undefined' ? 300 : null))
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(160, Math.round(entry.contentRect.width)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

interface Axis {
  format: (value: number) => string
  firstLabel: string
  lastLabel: string
}

function Frame({ range, right, format, firstLabel, lastLabel }: Axis & { range: Range; right: number }) {
  return (
    <>
      <line x1={LEFT} x2={right} y1={TOP} y2={TOP} className="stroke-border" />
      <line x1={LEFT} x2={right} y1={BOTTOM} y2={BOTTOM} className="stroke-border" />
      <text x={LEFT - 6} y={TOP + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
        {format(range[1])}
      </text>
      <text x={LEFT - 6} y={BOTTOM} textAnchor="end" className="fill-muted-foreground text-[11px]">
        {format(range[0])}
      </text>
      <text x={LEFT} y={HEIGHT - 6} className="fill-muted-foreground text-[11px]">
        {firstLabel}
      </text>
      <text x={right} y={HEIGHT - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
        {lastLabel}
      </text>
    </>
  )
}

/** The chart's box: measures the width, keeps the height while measuring. */
function ChartBox({ label, className, children }: { label: string; className?: string; children: (right: number, width: number) => ReactNode }) {
  const [ref, width] = useWidth()
  return (
    <div ref={ref} style={{ height: HEIGHT }}>
      {width !== null && (
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={label} className={className}>
          {children(width - RIGHT_GAP, width)}
        </svg>
      )}
    </div>
  )
}

interface TrendChartProps extends Axis {
  /** Read out by screen readers, e.g. "Memory over 9 weeks: from 78% to 86%". */
  label: string
  /** One per week, oldest first; null = not measured (the line breaks). */
  values: (number | null)[]
  range: Range
  /** The last value is this week's, still going: drawn hollow. */
  liveLast?: boolean
  /** A dashed line, e.g. the challenge target. */
  target?: number
  /** A shaded band, e.g. memory's aim of 85–90%. */
  band?: Range
  /** A thin line, e.g. 1.0× ("as planned") for learning speed. */
  reference?: number
}

/** A line over the weeks. */
export function TrendChart({ label, values, range, liveLast, target, band, reference, ...axis }: TrendChartProps) {
  const y = (value: number) => yFor(value, range, TOP, BOTTOM)
  const inRange = (value: number) => value >= range[0] && value <= range[1]
  const bandTop = band ? y(Math.min(band[1], range[1])) : 0
  const bandBottom = band ? y(Math.max(band[0], range[0])) : 0

  return (
    <ChartBox label={label} className="text-primary">
      {(right) => {
        const xs = xPositions(values.length, LEFT, right)
        return (
          <>
            {band && bandBottom > bandTop && <rect x={LEFT} y={bandTop} width={right - LEFT} height={bandBottom - bandTop} className="fill-mode-life/15" />}
            <Frame range={range} right={right} {...axis} />
            {reference !== undefined && inRange(reference) && <line x1={LEFT} x2={right} y1={y(reference)} y2={y(reference)} className="stroke-muted-foreground/40" />}
            {target !== undefined && inRange(target) && (
              <line x1={LEFT} x2={right} y1={y(target)} y2={y(target)} strokeWidth={1.5} strokeDasharray="4 3" className="stroke-mode-hustle" />
            )}
            <path d={linePath(values, xs, y)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {values.map((value, index) =>
              value === null ? null : (
                <circle
                  key={index}
                  cx={xs[index]}
                  cy={y(value)}
                  r={3.5}
                  strokeWidth={2}
                  className={liveLast && index === values.length - 1 ? 'fill-background stroke-current' : 'fill-current stroke-current'}
                />
              ),
            )}
          </>
        )
      }}
    </ChartBox>
  )
}

interface WeekBarsProps extends Axis {
  label: string
  values: number[]
  /** The last bar is this week's, still going: drawn lighter. */
  liveLast?: boolean
}

/** A bar per week, from 0. */
export function WeekBars({ label, values, liveLast, ...axis }: WeekBarsProps) {
  const range: Range = [0, Math.max(1, ...values)]

  return (
    <ChartBox label={label}>
      {(right) => {
        const slot = (right - LEFT) / Math.max(1, values.length)
        const xs = xPositions(values.length, LEFT + slot / 2, right - slot / 2)
        // Bars stay slim on wide screens.
        const barWidth = Math.min(28, Math.max(4, slot * 0.6))
        return (
          <>
            <Frame range={range} right={right} {...axis} />
            {values.map((value, index) => {
              const top = yFor(value, range, TOP, BOTTOM)
              return (
                <rect
                  key={index}
                  x={(xs[index] ?? 0) - barWidth / 2}
                  y={top}
                  width={barWidth}
                  height={Math.max(0, BOTTOM - top)}
                  rx={2}
                  className={liveLast && index === values.length - 1 ? 'fill-primary/40' : 'fill-primary'}
                />
              )
            })}
          </>
        )
      }}
    </ChartBox>
  )
}
