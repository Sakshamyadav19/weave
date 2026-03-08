import { LEADERBOARD_CAP } from '../constants.js'

const PERIODS = [30, 60, 90]

export default function Header({ period, onPeriodChange, lastFetched, activeCount, layer1Status, incrementalStatus }) {
  const isStale = lastFetched && (Date.now() - lastFetched.getTime()) > 24 * 3600 * 1000

  return (
    <header
      className="border-b-4 border-black bg-neo-secondary flex items-center justify-between px-6 3xl:px-12 flex-shrink-0"
      style={{ height: 'clamp(52px, 6vh, 72px)' }}
    >
      {/* Left: Logo + Repo */}
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 3xl:w-8 3xl:h-8 bg-black rounded-sm flex items-center justify-center flex-shrink-0">
          <span className="text-neo-secondary text-xs 3xl:text-sm font-black">PH</span>
        </div>
        <span className="font-black text-sm 3xl:text-base uppercase tracking-wider">
          PostHog / posthog
        </span>
        <span className="border-2 border-black px-2 py-0.5 text-xs 3xl:text-sm font-black bg-white shadow-neo-sm">
          Engineering Impact
        </span>
      </div>

      {/* Center: Period Selector */}
      <div className="flex items-center gap-1">
        <span className="text-xs 3xl:text-sm font-black mr-2 uppercase tracking-wider">Window:</span>
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            disabled={layer1Status === 'loading'}
            className={`
              px-3 3xl:px-4 py-1 text-xs 3xl:text-sm font-black border-2 border-black transition-all duration-100
              active:translate-x-[2px] active:translate-y-[2px] active:shadow-none
              disabled:opacity-50 disabled:cursor-not-allowed
              ${period === p
                ? 'bg-black text-neo-secondary shadow-none translate-x-[2px] translate-y-[2px]'
                : 'bg-white shadow-neo-sm hover:-translate-y-0.5 hover:shadow-neo-md'
              }
            `}
          >
            {p}d
          </button>
        ))}
      </div>

      {/* Right: Stats + Timestamp */}
      <div className="flex items-center gap-4 text-xs 3xl:text-sm font-bold">
        {activeCount > 0 && (
          <span className="border-2 border-black px-2 py-0.5 bg-white">
            {activeCount} engineers active
          </span>
        )}
        {layer1Status === 'loading' && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-black animate-ping" />
            Fetching...
          </span>
        )}
        {layer1Status === 'done' && incrementalStatus === 'loading' && (
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
            Loading more...
          </span>
        )}
        {layer1Status === 'done' && lastFetched && (
          <span className={`border-2 border-black px-2 py-0.5 ${isStale ? 'bg-neo-amber' : 'bg-white'}`}>
            {isStale ? '⚠ ' : ''}Updated {formatRelative(lastFetched)}
          </span>
        )}
        {layer1Status === 'error' && (
          <span className="border-2 border-black px-2 py-0.5 bg-neo-accent text-white">
            Fetch error — check console
          </span>
        )}
      </div>
    </header>
  )
}

function formatRelative(date) {
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
