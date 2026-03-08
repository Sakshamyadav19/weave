import { useEffect, useState } from 'react'
import InfoTooltip from './InfoTooltip.jsx'
import { DIMENSION_COLORS } from '../constants.js'

const AVATARS_BASE = 'https://avatars.githubusercontent.com'

function SkeletonRow({ delay = 0 }) {
  return (
    <div
      className="border-2 border-gray-200 mb-2 h-10 animate-pulse bg-gray-100"
      style={{ animationDelay: `${delay}ms` }}
    />
  )
}

function EngineerRow({ engineer, rank, isHovered, onHover, onSelect, animationDelay, hasLayer2 }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), animationDelay)
    return () => clearTimeout(t)
  }, [animationDelay])

  const { login, composite, segments, raw } = engineer
  const total = composite

  // Segment widths as % of total bar (each is already weighted)
  const dmW = hasLayer2 && segments.darkMatter != null
    ? (segments.darkMatter / total) * 100
    : 0
  const gravW = (segments.gravitational / total) * 100
  const reworkW = (segments.rework / total) * 100

  return (
    <div
      className={`
        border-2 border-black mb-2 flex h-10 3xl:h-12 cursor-pointer transition-all duration-200
        ${isHovered
          ? 'shadow-neo-md -translate-y-0.5 bg-neo-secondary'
          : 'shadow-neo-sm hover:-translate-y-0.5 hover:shadow-neo-md bg-white'
        }
      `}
      onClick={() => onSelect(login)}
      onMouseEnter={() => onHover(login)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Rank */}
      <div className="w-8 3xl:w-10 border-r-2 border-black flex items-center justify-center font-black text-xs 3xl:text-sm flex-shrink-0">
        {rank}
      </div>

      {/* Avatar */}
      <div className="w-8 3xl:w-10 border-r-2 border-black flex items-center justify-center flex-shrink-0 overflow-hidden">
        <img
          src={`${AVATARS_BASE}/${login}?size=48`}
          alt={login}
          className="w-full h-full object-cover"
          onError={e => { e.target.style.display = 'none' }}
        />
      </div>

      {/* Name */}
      <div className="w-28 3xl:w-36 border-r-2 border-black flex items-center px-2 flex-shrink-0 overflow-hidden">
        <span className="font-bold text-xs 3xl:text-sm truncate">{login}</span>
      </div>

      {/* Bar */}
      <div className="flex-1 flex items-center px-2 overflow-hidden">
        <div className="w-full h-5 3xl:h-6 border border-black/20 bg-gray-50 flex overflow-hidden">
          {/* Dark Matter segment */}
          {hasLayer2 && dmW > 0 && (
            <div
              className="h-full transition-all duration-700 ease-out"
              style={{
                width: mounted ? `${dmW}%` : '0%',
                backgroundColor: DIMENSION_COLORS.darkMatter,
                transitionDelay: `${animationDelay}ms`,
              }}
            />
          )}
          {/* Gravitational segment */}
          {gravW > 0 && (
            <div
              className="h-full transition-all duration-700 ease-out"
              style={{
                width: mounted ? `${gravW}%` : '0%',
                backgroundColor: DIMENSION_COLORS.gravitational,
                transitionDelay: `${animationDelay + 100}ms`,
              }}
            />
          )}
          {/* Rework segment */}
          {reworkW > 0 && (
            <div
              className="h-full transition-all duration-700 ease-out"
              style={{
                width: mounted ? `${reworkW}%` : '0%',
                backgroundColor: DIMENSION_COLORS.rework,
                transitionDelay: `${animationDelay + 200}ms`,
              }}
            />
          )}
        </div>
      </div>

      {/* Score */}
      <div className="w-14 3xl:w-16 border-l-2 border-black flex items-center justify-center font-black text-xs 3xl:text-sm flex-shrink-0">
        {composite.toFixed(0)}
      </div>
    </div>
  )
}

export default function LeaderboardPanel({
  leaderboard,
  layer1Status,
  layer2Status,
  hoveredEngineer,
  onHover,
  onSelect,
}) {
  const hasLayer2 = layer2Status === 'done'
  const isLoading = layer1Status === 'loading' || layer1Status === 'idle'

  return (
    <div
      className="p-4 3xl:p-6 overflow-hidden flex flex-col h-full"
      style={{ gridArea: 'leaderboard' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 3xl:mb-4 flex-shrink-0">
        <h2 className="font-black text-sm 3xl:text-base uppercase tracking-widest flex items-center">
          Impact Leaderboard
          <InfoTooltip text="Composite score: Dark Matter (40%) + Gravitational Pull (35%) + Rework Efficiency (25%)" />
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <LegendDot color={DIMENSION_COLORS.darkMatter} label="Dark Matter" />
          <LegendDot color={DIMENSION_COLORS.gravitational} label="Pull" />
          <LegendDot color={DIMENSION_COLORS.rework} label="Rework" />
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-hidden">
        {isLoading && (
          <>
            {[...Array(7)].map((_, i) => (
              <SkeletonRow key={i} delay={i * 80} />
            ))}
          </>
        )}

        {layer1Status === 'error' && (
          <div className="border-2 border-neo-accent p-4 font-bold text-sm">
            Failed to load leaderboard data
          </div>
        )}

        {(layer1Status === 'done' || layer2Status === 'done') && leaderboard.length === 0 && (
          <div className="border-2 border-black p-3 text-sm font-bold">
            No engineers with 5+ PRs in this period
          </div>
        )}

        {leaderboard.map((engineer, i) => (
          <EngineerRow
            key={engineer.login}
            engineer={engineer}
            rank={i + 1}
            isHovered={hoveredEngineer === engineer.login}
            onHover={onHover}
            onSelect={onSelect}
            animationDelay={i * 150}
            hasLayer2={hasLayer2}
          />
        ))}

        {layer2Status === 'loading' && leaderboard.length > 0 && (
          <div className="text-xs font-bold text-gray-500 mt-1 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-neo-violet animate-pulse" />
            Computing dark matter...
          </div>
        )}
      </div>
    </div>
  )
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 border border-black flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="font-bold">{label}</span>
    </span>
  )
}
