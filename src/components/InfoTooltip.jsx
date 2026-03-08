import { useState } from 'react'

export default function InfoTooltip({ text }) {
  const [visible, setVisible] = useState(false)

  return (
    <span className="relative inline-block ml-1">
      <button
        className="w-4 h-4 rounded-full border-2 border-black text-xs font-black
                   bg-neo-secondary flex items-center justify-center leading-none
                   hover:bg-yellow-300 transition-colors"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        aria-label="More information"
        type="button"
      >
        i
      </button>
      {visible && (
        <span
          className="absolute z-50 left-0 top-6 bg-white border-2 border-black
                     shadow-neo-sm p-2 text-xs font-bold whitespace-normal break-words w-48 leading-tight"
          role="tooltip"
        >
          {text}
        </span>
      )}
    </span>
  )
}
