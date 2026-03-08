import { useEffect, useRef, useState } from 'react'
import { BOT_ACCOUNTS } from '../constants.js'

const GIVEN_COLOR = '#7C3AED'
const RECEIVED_COLOR = '#F5A623'

function useContainerWidth(ref) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    setWidth(ref.current.clientWidth)
    const ro = new ResizeObserver(entries => {
      setWidth(entries[0].contentRect.width)
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return width
}

export default function ReviewReciprocity({
  prs,
  reviewEventsMap,
  scores,
  hoveredEngineer,
  onHover,
  onSelect,
  layer1Status,
}) {
  const containerRef = useRef(null)
  const containerWidth = useContainerWidth(containerRef)
  const [tooltip, setTooltip] = useState(null)

  const isLoading = layer1Status === 'idle' || layer1Status === 'loading'

  // Compute reviews given / received per engineer
  const reviewsGiven = {}
  const reviewsReceived = {}

  for (const pr of prs) {
    const author = pr.user?.login
    if (!author || BOT_ACCOUNTS.has(author)) continue
    const reviews = (reviewEventsMap.get(pr.number) || [])
      .filter(r => r.user?.login && r.user.login !== author && !BOT_ACCOUNTS.has(r.user.login))
    reviewsReceived[author] = (reviewsReceived[author] || 0) + reviews.length
    for (const r of reviews) {
      const rv = r.user.login
      reviewsGiven[rv] = (reviewsGiven[rv] || 0) + 1
    }
  }

  const allLogins = new Set([...Object.keys(reviewsGiven), ...Object.keys(reviewsReceived)])
  const data = [...allLogins]
    .map(login => ({
      login,
      given: reviewsGiven[login] || 0,
      received: reviewsReceived[login] || 0,
    }))
    .sort((a, b) => (b.given + b.received) - (a.given + a.received))
    .slice(0, 5)

  // Top 5 logins from scores (leaderboard)
  const top5 = new Set((scores || []).slice(0, 5).map(s => s.login))

  const maxGiven = Math.max(...data.map(d => d.given), 1)
  const maxReceived = Math.max(...data.map(d => d.received), 1)
  const maxDomain = Math.max(maxGiven, maxReceived)

  const NAME_W = 100
  const ROW_H = 30
  const BAR_H = 16
  const PADDING_TOP = 24

  const barZone = containerWidth > 0 ? (containerWidth - NAME_W) / 2 : 0
  const svgHeight = data.length * ROW_H + PADDING_TOP + 4

  const xScale = (val) => (val / maxDomain) * barZone

  return (
    <div
      style={{ gridArea: 'reciprocity' }}
      className="p-3 flex flex-col overflow-hidden bg-cream h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 border-b-4 border-black pb-2 mb-2">
        <h2 className="font-black text-xs uppercase tracking-widest">Review Reciprocity</h2>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 border border-black" style={{ backgroundColor: GIVEN_COLOR }} />
            given
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 border border-black" style={{ backgroundColor: RECEIVED_COLOR }} />
            received
          </span>
        </div>
      </div>

      {/* Chart area */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative flex items-center justify-center min-h-0">
        {isLoading && (
          <div className="space-y-1.5 pt-1">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="h-6 bg-gray-200 animate-pulse rounded"
                style={{ animationDelay: `${i * 80}ms`, width: `${60 + (i % 3) * 12}%` }}
              />
            ))}
          </div>
        )}

        {!isLoading && containerWidth > 0 && data.length > 0 && (
          <svg
            width={containerWidth}
            height={svgHeight}
            style={{ overflow: 'visible', flexShrink: 0 }}
          >
            {/* Column headers */}
            <text
              x={barZone - 4}
              y={PADDING_TOP - 8}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight={700}
              fill={GIVEN_COLOR}
              style={{ fontFamily: 'inherit' }}
            >
              ← given
            </text>
            <text
              x={barZone + NAME_W + 4}
              y={PADDING_TOP - 8}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight={700}
              fill={RECEIVED_COLOR}
              style={{ fontFamily: 'inherit' }}
            >
              received →
            </text>

            {data.map((d, i) => {
              const y = PADDING_TOP + i * ROW_H
              const givenW = xScale(d.given)
              const receivedW = xScale(d.received)
              const isHovered = hoveredEngineer === d.login
              const isTop5 = top5.has(d.login)
              const labelColor = isTop5 ? RECEIVED_COLOR : '#111827'

              return (
                <g
                  key={d.login}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => {
                    onHover(d.login)
                    const rect = containerRef.current?.getBoundingClientRect()
                    if (rect) {
                      setTooltip({
                        login: d.login,
                        given: d.given,
                        received: d.received,
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                      })
                    }
                  }}
                  onMouseLeave={() => {
                    onHover(null)
                    setTooltip(null)
                  }}
                  onClick={() => onSelect(d.login)}
                >
                  {/* Hover background */}
                  {isHovered && (
                    <rect
                      x={0}
                      y={y - 2}
                      width={containerWidth}
                      height={ROW_H}
                      fill="#f0f9ff"
                      stroke="none"
                    />
                  )}

                  {/* Given bar — grows leftward from centre */}
                  <rect
                    x={barZone - givenW}
                    y={y + (ROW_H - BAR_H) / 2}
                    width={givenW}
                    height={BAR_H}
                    fill={GIVEN_COLOR}
                    opacity={isHovered ? 1 : 0.85}
                  />

                  {/* Received bar — grows rightward from centre */}
                  <rect
                    x={barZone + NAME_W}
                    y={y + (ROW_H - BAR_H) / 2}
                    width={receivedW}
                    height={BAR_H}
                    fill={RECEIVED_COLOR}
                    opacity={isHovered ? 1 : 0.85}
                  />

                  {/* Name label — centred in NAME_W column */}
                  <text
                    x={barZone + NAME_W / 2}
                    y={y + ROW_H / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={11}
                    fontWeight={isHovered ? 900 : isTop5 ? 700 : 500}
                    fill={labelColor}
                    style={{ fontFamily: 'inherit' }}
                  >
                    {d.login.length > 12 ? d.login.slice(0, 11) + '…' : d.login}
                  </text>
                </g>
              )
            })}
          </svg>
        )}

        {!isLoading && data.length === 0 && (
          <div className="text-xs font-bold text-gray-400 text-center pt-4">
            No review data yet
          </div>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-10 border-2 border-black bg-white px-2 py-1.5 text-xs font-bold shadow-neo-sm pointer-events-none"
            style={{
              left: tooltip.x + 10,
              top: tooltip.y - 10,
              transform: tooltip.x > containerWidth / 2 ? 'translateX(-100%)' : undefined,
            }}
          >
            <div className="font-black">{tooltip.login}</div>
            <div style={{ color: GIVEN_COLOR }}>given: {tooltip.given}</div>
            <div style={{ color: RECEIVED_COLOR }}>received: {tooltip.received}</div>
          </div>
        )}
      </div>
    </div>
  )
}
