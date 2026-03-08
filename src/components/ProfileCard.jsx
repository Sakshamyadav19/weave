import { useEffect, useRef } from 'react'
import { DIMENSION_COLORS } from '../constants.js'

const WORK_TYPE_LABELS = {
  feature: 'Feature',
  fix: 'Bug Fix',
  refactor: 'Refactor',
  infra: 'Infra/CI',
}

function WorkTypeBar({ workTypes }) {
  const total = Object.values(workTypes).reduce((s, v) => s + v, 0) || 1
  const types = ['feature', 'fix', 'refactor', 'infra']

  return (
    <div>
      <h3 className="font-black text-xs uppercase tracking-widest mb-2">Work Type Breakdown</h3>
      <div className="flex h-6 border-2 border-black overflow-hidden w-full">
        {types.map(type => {
          const pct = ((workTypes[type] || 0) / total) * 100
          if (pct < 1) return null
          return (
            <div
              key={type}
              className="h-full transition-all duration-700 ease-out relative group"
              style={{ width: `${pct}%`, backgroundColor: DIMENSION_COLORS[type] }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-xs font-black drop-shadow">{pct.toFixed(0)}%</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-3 mt-1.5 flex-wrap">
        {types.map(type => {
          const count = workTypes[type] || 0
          if (!count) return null
          return (
            <span key={type} className="flex items-center gap-1 text-xs font-bold">
              <span className="w-2 h-2 border border-black" style={{ backgroundColor: DIMENSION_COLORS[type] }} />
              {WORK_TYPE_LABELS[type]}: {count}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function StatBlock({ label, value, subLabel, color }) {
  return (
    <div className="border-2 border-black p-3 shadow-neo-sm bg-white">
      <div className="text-xs 3xl:text-sm font-black uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="font-black text-2xl 3xl:text-3xl" style={{ color: color || '#000' }}>{value}</div>
      {subLabel && <div className="text-xs font-bold text-gray-400 mt-0.5">{subLabel}</div>}
    </div>
  )
}

function CalibrationLine({ scores, login }) {
  if (!scores?.length) return null
  const engineer = scores.find(s => s.login === login)
  if (!engineer) return null

  const rank = scores.findIndex(s => s.login === login) + 1
  const total = scores.length
  const pct = ((total - rank) / (total - 1 || 1)) * 100

  return (
    <div>
      <h3 className="font-black text-xs uppercase tracking-widest mb-2">Cohort Percentile</h3>
      <div className="relative h-6 border-2 border-black bg-gray-100">
        <div
          className="absolute left-0 top-0 h-full bg-neo-amber transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-0 flex items-center px-2">
          <span className="text-xs font-black relative z-10">
            #{rank} of {total} engineers · {pct.toFixed(0)}th percentile
          </span>
        </div>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[80, 60, 70, 50].map((w, i) => (
        <div key={i} className="h-12 bg-gray-200 border-2 border-gray-200" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

export default function ProfileCard({
  engineer,
  profileCardData,
  profileCardStatus,
  scores,
  onDismiss,
}) {
  const isOpen = !!engineer
  const cardRef = useRef(null)

  // Escape key dismiss
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onDismiss() }
    if (isOpen) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onDismiss])

  // Focus trap
  useEffect(() => {
    if (isOpen && cardRef.current) {
      cardRef.current.focus()
    }
  }, [isOpen])

  const data = profileCardData
  const workTypes = data?.workTypes || {}
  const reworkMedian = data?.reworkMedian ?? null
  const gravitational = data?.gravitational ?? null
  const prCount = data?.prCount ?? null
  const incompleteFix = data?.incompleteFix
  const dependency = data?.dependency
  const firstContribution = data?.firstContribution

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(0,0,0,0.4)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        onClick={onDismiss}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Profile card for ${engineer || ''}`}
        className="fixed right-0 top-0 h-full z-50 border-l-4 border-black bg-cream overflow-y-auto outline-none"
        style={{
          width: '40vw',
          minWidth: '360px',
          maxWidth: '640px',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: isOpen ? 'transform 300ms ease-out' : 'transform 250ms ease-in',
          boxShadow: '-8px 0 0 0 #000',
        }}
      >
        {engineer && (
          <div className="p-6 3xl:p-8">
            {/* Identity Strip */}
            <div className="flex items-center gap-4 border-b-4 border-black pb-4 mb-5">
              <img
                src={`https://avatars.githubusercontent.com/${engineer}?size=80`}
                alt={engineer}
                className="w-16 h-16 3xl:w-20 3xl:h-20 border-4 border-black shadow-neo-sm flex-shrink-0"
                onError={e => {
                  e.target.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="%23FFD93D"/><text x="32" y="40" text-anchor="middle" font-size="24" font-family="sans-serif" font-weight="bold">${engineer.charAt(0).toUpperCase()}</text></svg>`
                }}
              />
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-xl 3xl:text-2xl truncate">{engineer}</h2>
                {firstContribution && (
                  <p className="text-xs font-bold text-gray-500 mt-0.5">
                    Contributor since {new Date(firstContribution).getFullYear()}
                  </p>
                )}
                <a
                  href={`https://github.com/${engineer}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-black border-2 border-black px-2 py-0.5 bg-neo-secondary
                             shadow-neo-sm hover:-translate-y-0.5 hover:shadow-neo-md transition-all
                             inline-block mt-1.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  GitHub ↗
                </a>
              </div>
              <button
                onClick={onDismiss}
                className="w-8 h-8 border-2 border-black font-black text-lg flex items-center justify-center
                           bg-white shadow-neo-sm hover:-translate-y-0.5 hover:shadow-neo-md transition-all
                           active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex-shrink-0"
                aria-label="Close profile"
              >
                ×
              </button>
            </div>

            {profileCardStatus === 'loading' && <LoadingSkeleton />}

            {(profileCardStatus === 'done' || data) && (
              <div className="space-y-5">
                {/* Key Metrics */}
                <div className="grid grid-cols-3 gap-2">
                  <StatBlock
                    label="PRs Merged"
                    value={prCount ?? '—'}
                  />
                  <StatBlock
                    label="Rework Median"
                    value={reworkMedian != null ? reworkMedian.toFixed(1) : '—'}
                    color={reworkMedian != null && reworkMedian > 3 ? '#EF4444' : '#10B981'}
                    subLabel="cycles"
                  />
                  <StatBlock
                    label="Manual Reviews"
                    value={gravitational ?? '—'}
                    color="#F5A623"
                    subLabel="requested"
                  />
                </div>

                {/* Work Type Bar */}
                <div className="border-2 border-black p-3 shadow-neo-sm bg-white">
                  <WorkTypeBar workTypes={workTypes} />
                </div>

                {/* Incomplete Fix Rate */}
                {incompleteFix != null && (
                  <div className="border-2 border-black p-3 shadow-neo-sm bg-white">
                    <h3 className="font-black text-xs uppercase tracking-widest mb-2">
                      Incomplete Fix Rate
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="font-black text-2xl" style={{
                        color: incompleteFix.rate > 0.2 ? '#EF4444' : '#10B981'
                      }}>
                        {(incompleteFix.rate * 100).toFixed(0)}%
                      </span>
                      <span className="text-xs font-bold text-gray-500">
                        ({incompleteFix.incompleteFixes} of {incompleteFix.totalCloses} closed issues reopened within 14d)
                      </span>
                    </div>
                    <div className="mt-2 h-2 border border-black bg-gray-100 overflow-hidden">
                      <div
                        className="h-full transition-all duration-700"
                        style={{
                          width: `${Math.min(incompleteFix.rate * 100, 100)}%`,
                          backgroundColor: incompleteFix.rate > 0.2 ? '#EF4444' : '#10B981',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Dependency Footprint */}
                {dependency != null && (dependency.upstreamCount > 0 || dependency.downstreamCount > 0) && (
                  <div className="border-2 border-black p-3 shadow-neo-sm bg-white">
                    <h3 className="font-black text-xs uppercase tracking-widest mb-2">
                      Dependency Footprint
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs font-bold text-gray-500">Upstream PRs Unblocked</div>
                        <div className="font-black text-xl text-neo-violet">{dependency.upstreamCount}</div>
                        <div className="text-xs text-gray-400">others depend on this engineer's work</div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-500">Downstream Dependencies</div>
                        <div className="font-black text-xl">{dependency.downstreamCount}</div>
                        <div className="text-xs text-gray-400">PRs that reference other PRs</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cohort Calibration */}
                <div className="border-2 border-black p-3 shadow-neo-sm bg-white">
                  <CalibrationLine scores={scores} login={engineer} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
