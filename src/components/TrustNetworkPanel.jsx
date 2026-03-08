import { useEffect, useRef, useState } from 'react'
import InfoTooltip from './InfoTooltip.jsx'

function isTop5(login, scores) {
  const idx = scores.findIndex(s => s.login === login)
  return idx >= 0 && idx < 5
}

function SkeletonMatrix() {
  return (
    <div className="animate-pulse p-4 flex flex-col gap-1">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex gap-1">
          {[...Array(7)].map((_, j) => (
            <div key={j} className="w-8 h-8 bg-gray-200 rounded" />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function TrustNetworkPanel({
  nodes,
  edges,
  scores,
  hoveredEngineer,
  onHover,
  onSelect,
  layer1Status,
}) {
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ width: 0, height: 0 })
  const [tooltip, setTooltip] = useState(null)
  const [hoveredCell, setHoveredCell] = useState(null) // {row, col}

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const isLoading = layer1Status === 'idle' || layer1Status === 'loading'

  // Top 12 most active engineers
  const topEngineers = [...nodes]
    .sort((a, b) => b.activity - a.activity)
    .slice(0, 12)
    .map(n => n.id)

  // Build weight lookup: reviewerMap[reviewer][author] = weight
  const weightMap = {}
  for (const edge of edges) {
    const src = typeof edge.source === 'object' ? edge.source.id : edge.source
    const tgt = typeof edge.target === 'object' ? edge.target.id : edge.target
    if (!topEngineers.includes(src) || !topEngineers.includes(tgt)) continue
    if (!weightMap[src]) weightMap[src] = {}
    weightMap[src][tgt] = (weightMap[src][tgt] || 0) + edge.weight
  }

  const maxWeight = Math.max(
    1,
    ...Object.values(weightMap).flatMap(m => Object.values(m))
  )

  // Rows = reviewers (src), Columns = authors (tgt)
  const reviewers = topEngineers
  const authors = topEngineers

  // Layout — larger cells and labels for readability
  const ROW_LABEL_W = dims.width >= 1920 ? 120 : 100
  const COL_LABEL_H = dims.width >= 1920 ? 80 : 68
  const PAD = 6

  const availW = Math.max(0, dims.width - ROW_LABEL_W - PAD)
  const n = topEngineers.length
  const cellSize = n > 0 ? Math.min(Math.floor(availW / n), dims.width >= 1920 ? 52 : 40) : 0

  // Color: cream → amber
  function cellColor(weight) {
    if (!weight) return null
    const t = weight / maxWeight
    // Interpolate #FFF8F0 → #F5A623
    const r = Math.round(255 + (245 - 255) * t)
    const g = Math.round(248 + (166 - 248) * t)
    const b = Math.round(240 + (35 - 240) * t)
    return `rgb(${r},${g},${b})`
  }

  const gridW = n * cellSize
  const gridH = n * cellSize
  const svgW = ROW_LABEL_W + gridW + PAD
  const svgH = COL_LABEL_H + gridH + PAD

  return (
    <div
      className="p-4 3xl:p-6 flex flex-col"
      style={{ gridArea: 'network' }}
    >
      <div className="flex items-center justify-between mb-2 3xl:mb-3 flex-shrink-0">
        <h2 className="font-black text-sm 3xl:text-base uppercase tracking-widest flex items-center">
          Trust Network
          <InfoTooltip text="Co-review matrix: rows = reviewer, columns = PR author. Cell color = review frequency. Amber = top 5 engineers." />
        </h2>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 border-2 border-black bg-neo-amber inline-block" />
            Top 5
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 border-2 border-black bg-gray-300 inline-block" />
            Active
          </span>
        </div>
      </div>

      <div ref={containerRef} className="relative overflow-hidden" style={{ height: svgH > 0 ? svgH : 200, width: '100%' }}>
        {isLoading && <SkeletonMatrix />}

        {!isLoading && nodes.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm font-bold text-gray-400">
            No network data available
          </div>
        )}

        {!isLoading && nodes.length > 0 && dims.width > 0 && cellSize > 0 && (
          <svg
            width={svgW}
            height={svgH}
            style={{ display: 'block', flexShrink: 0 }}
          >
            {/* Corner axis labels */}
            <text
              x={ROW_LABEL_W - 4}
              y={COL_LABEL_H - 4}
              textAnchor="end"
              fontSize="10"
              fontWeight="600"
              fill="#888"
            >
              reviewer →
            </text>

            {/* Column headers (authors) — rotated 45° */}
            {authors.map((author, j) => {
              const cx = ROW_LABEL_W + j * cellSize + cellSize / 2
              const isH = hoveredEngineer === author || hoveredCell?.col === j
              const label = author.length > 10 ? author.slice(0, 9) + '…' : author
              return (
                <text
                  key={author}
                  x={cx}
                  y={COL_LABEL_H - 4}
                  textAnchor="start"
                  fontSize="11"
                  fontWeight={isTop5(author, scores) ? '800' : '600'}
                  fill={isTop5(author, scores) ? '#F5A623' : isH ? '#000' : '#444'}
                  transform={`rotate(-45, ${cx}, ${COL_LABEL_H - 4})`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelect(author)}
                >
                  {label}
                </text>
              )
            })}

            {/* Author axis label */}
            <text
              x={ROW_LABEL_W + gridW / 2}
              y={10}
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="#888"
            >
              author →
            </text>

            {/* Row labels (reviewers) + cells */}
            {reviewers.map((reviewer, i) => {
              const ry = COL_LABEL_H + i * cellSize
              const isRowH = hoveredEngineer === reviewer || hoveredCell?.row === i
              const label = reviewer.length > 12 ? reviewer.slice(0, 11) + '…' : reviewer

              return (
                <g key={reviewer}>
                  {/* Row label */}
                  <text
                    x={ROW_LABEL_W - 4}
                    y={ry + cellSize / 2}
                    dominantBaseline="middle"
                    textAnchor="end"
                    fontSize="11"
                    fontWeight={isTop5(reviewer, scores) ? '800' : '600'}
                    fill={isTop5(reviewer, scores) ? '#F5A623' : isRowH ? '#000' : '#444'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelect(reviewer)}
                  >
                    {label}
                  </text>

                  {/* Cells */}
                  {authors.map((author, j) => {
                    const cx = ROW_LABEL_W + j * cellSize
                    const weight = weightMap[reviewer]?.[author] || 0
                    const color = cellColor(weight)
                    const isColH = hoveredEngineer === author || hoveredCell?.col === j
                    const highlighted = isRowH || isColH

                    return (
                      <rect
                        key={author}
                        x={cx}
                        y={ry}
                        width={cellSize - 1}
                        height={cellSize - 1}
                        fill={color || '#F9FAFB'}
                        stroke={highlighted ? '#000' : '#D1D5DB'}
                        strokeWidth={highlighted ? 1.5 : 0.5}
                        rx={1}
                        style={{ cursor: weight > 0 ? 'pointer' : 'default' }}
                        onMouseEnter={e => {
                          setHoveredCell({ row: i, col: j })
                          onHover(reviewer)
                          if (weight > 0) {
                            setTooltip({
                              x: e.nativeEvent.offsetX,
                              y: e.nativeEvent.offsetY,
                              reviewer,
                              author,
                              weight,
                            })
                          }
                        }}
                        onMouseMove={e => {
                          if (weight > 0) {
                            setTooltip(prev => prev
                              ? { ...prev, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }
                              : null
                            )
                          }
                        }}
                        onMouseLeave={() => {
                          setHoveredCell(null)
                          onHover(null)
                          setTooltip(null)
                        }}
                        onClick={() => weight > 0 && onSelect(reviewer)}
                      />
                    )
                  })}
                </g>
              )
            })}
          </svg>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 bg-white border-2 border-black shadow-neo-sm px-2 py-1 text-xs font-bold"
            style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
          >
            <div>
              <span className="text-gray-500">reviewer: </span>
              {tooltip.reviewer}
            </div>
            <div>
              <span className="text-gray-500">author: </span>
              {tooltip.author}
            </div>
            <div className="text-gray-500">
              {tooltip.weight} co-review{tooltip.weight !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {layer1Status === 'error' && (
          <div className="flex items-center justify-center h-full text-sm font-bold border-2 border-neo-accent p-4">
            Network data unavailable
          </div>
        )}
      </div>
    </div>
  )
}
