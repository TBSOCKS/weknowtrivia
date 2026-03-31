'use client'
import { useRef, useEffect, useState } from 'react'
import { getGridCols } from '@/lib/gameUtils'

export default function GameBoard({ answers, totalCount, revealedIds = new Set() }) {
  const cols = getGridCols(totalCount)
  const rows = Math.ceil(totalCount / cols)
  const containerRef = useRef(null)
  const [cellSize, setCellSize] = useState(0)
  const GAP = 6

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const maxByWidth  = (width  - GAP * (cols - 1)) / cols
      const maxByHeight = (height - GAP * (rows - 1)) / rows
      setCellSize(Math.floor(Math.min(maxByWidth, maxByHeight)))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [cols, rows])

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center"
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
          gap: `${GAP}px`,
        }}
      >
        {answers.map((ans, idx) => {
          const revealed = revealedIds.has(ans.id)
          const photoUrl = ans.castaways?.seasons?.version_season
            ? `https://gradientdescending.com/survivor/castaways/colour/${ans.castaways.seasons.version_season}US${ans.castaways.castaway_id}.png`
            : null

          return (
            <div
              key={ans.id}
              className={`board-cell ${revealed ? 'revealed' : ''}`}
              style={{ width: cellSize, height: cellSize }}
            >
              <div className="board-cell-inner">

                {/* Front: season label */}
                <div className="board-cell-front cell-shimmer border border-white/10 flex items-center justify-center p-1 text-center">
                  <span className="text-white font-display tracking-wide leading-tight"
                        style={{ fontSize: Math.max(8, Math.floor(cellSize * 0.13)) }}>
                    {ans.castaways?.seasons?.name ?? `#${idx + 1}`}
                  </span>
                </div>

                {/* Back: castaway photo */}
                <div className="board-cell-back bg-brand-card border border-brand-green/60 overflow-hidden relative flex items-end justify-center">
                  {photoUrl && (
                    <img
                      src={photoUrl}
                      alt={ans.castaways?.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ objectPosition: 'center top' }}
                      onError={e => { e.target.style.display = 'none' }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <span
                    className="relative text-white font-bold drop-shadow-md pb-1 z-10"
                    style={{ fontSize: Math.max(7, Math.floor(cellSize * 0.12)) }}
                  >
                    {ans.castaways?.name?.split(' ')[0]}
                  </span>
                  {revealed && (
                    <div className="absolute inset-0 bg-brand-green/20 pointer-events-none" />
                  )}
                </div>

              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
