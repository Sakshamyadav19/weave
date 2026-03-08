import { useEffect, useState } from 'react'
import InfoTooltip from './InfoTooltip.jsx'

function FlagItem({ flag, index, onSelect }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 50)
    return () => clearTimeout(t)
  }, [index])

  const severityColor = {
    high: '#FF6B6B',
    medium: '#F5A623',
    low: '#10B981',
  }[flag.severity || 'medium']

  return (
    <div
      className="flex items-center gap-2 border-2 border-black p-2 3xl:p-3 mb-2 shadow-neo-sm
                 cursor-pointer hover:-translate-y-0.5 hover:shadow-neo-md transition-all duration-200 bg-white"
      style={{
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 300ms ease-out, opacity 300ms ease-out',
      }}
      onClick={() => onSelect(flag.engineer)}
    >
      <span
        className="w-2.5 h-2.5 rounded-full border border-black flex-shrink-0"
        style={{ backgroundColor: severityColor }}
      />
      <span className="font-bold text-xs 3xl:text-sm truncate max-w-[90px] 3xl:max-w-[130px]">{flag.engineer}</span>
      <span className="text-xs 3xl:text-sm text-gray-500 flex-1 truncate min-w-0">{flag.label}</span>
    </div>
  )
}

function SectionHeader({ title, count, tooltip }) {
  if (count === 0) return null
  return (
    <div className="flex items-center justify-between mb-1.5 mt-3 first:mt-0">
      <span className="text-xs 3xl:text-sm font-black uppercase tracking-wider text-gray-500 flex items-center">
        {title}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      <span className="text-xs font-black border border-black px-1.5 bg-neo-secondary">{count}</span>
    </div>
  )
}

function SkeletonFlag({ delay }) {
  return (
    <div
      className="border-2 border-gray-200 mb-2 h-9 animate-pulse bg-gray-100"
      style={{ animationDelay: `${delay}ms` }}
    />
  )
}

export default function RedFlagsPanel({ redFlags, layer1Status, onSelect }) {
  const isLoading = layer1Status === 'idle' || layer1Status === 'loading'
  const hasData = redFlags && (
    redFlags.knowledgeSilo?.length > 0 ||
    redFlags.highRework?.length > 0
  )

  let itemIndex = 0

  return (
    <div
      className="pt-px pb-px px-3 3xl:px-5 flex flex-col overflow-hidden"
      style={{ gridArea: 'redflags' }}
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden pr-0.5" style={{ scrollbarWidth: 'thin' }}>
        {isLoading && (
          <>
            {[...Array(6)].map((_, i) => (
              <SkeletonFlag key={i} delay={i * 80} />
            ))}
          </>
        )}

        {layer1Status === 'error' && (
          <div className="border-2 border-neo-accent p-3 text-sm font-bold">
            Could not compute signals
          </div>
        )}

        {!isLoading && !hasData && layer1Status === 'done' && (
          <div className="border-2 border-black p-3 text-sm font-bold text-center text-gray-500">
            No signals detected — great teamwork!
          </div>
        )}

        {!isLoading && redFlags && (
          <>
            <SectionHeader
              title="Knowledge Silo Risk"
              count={redFlags.knowledgeSilo?.length || 0}
              tooltip="One engineer reviewing the majority of PRs in a module. If they leave, that knowledge leaves too."
            />
            {(redFlags.knowledgeSilo || []).map(flag => (
              <FlagItem key={flag.engineer + flag.module} flag={flag} index={itemIndex++} onSelect={onSelect} />
            ))}

            <SectionHeader
              title="High Rework Loops"
              count={redFlags.highRework?.length || 0}
              tooltip="PRs frequently needing 3+ revision cycles before merge."
            />
            {(redFlags.highRework || []).map(flag => (
              <FlagItem key={flag.engineer + flag.type} flag={flag} index={itemIndex++} onSelect={onSelect} />
            ))}
          </>
        )}
      </div>

    </div>
  )
}
