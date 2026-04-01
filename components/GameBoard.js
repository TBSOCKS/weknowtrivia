'use client'
import { useRef, useEffect, useState } from 'react'
import { getGridCols } from '@/lib/gameUtils'

export default function GameBoard({ answers, totalCount, revealedIds = new Set() }) {
  const cols = getGridCols(totalCount)
  const rows = Math.ceil(totalCount / cols)
  const containerRef = useRef(null)
  const [cellSize, setCellSize] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const GAP = 8
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const byW = (width  - GAP * (cols - 1)) / cols
      const byH = (height - GAP * (rows - 1)) / rows
      setCellSize(Math.floor(Math.min(byW, byH)))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [cols, rows])

  const GAP = 8

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
      {cellSize > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
            gap: `${GAP}px`,
          }}
        >
          {answers.map((ans, idx) => {
            const revealed = revealedIds.has(ans.id)
            const photoUrl = ans.castaways?.seasons?.version_season
              ? `https://gradientdescending.com/survivor/castaways/colour/${ans.castaways.seasons.version_season}US${ans.castaways.castaway_id}.png`
              : null
            const fontSize = Math.max(9, Math.floor(cellSize * 0.13))

            return (
              <div
                key={ans.id}
                className={`board-cell ${revealed ? 'revealed' : ''}`}
                style={{ width: cellSize, height: cellSize }}
              >
                <div className="board-cell-inner">
                  <div
                    className="board-cell-front flex items-center justify-center p-2 text-center"
                    style={{
                      background: 'radial-gradient(circle, #252530 0%, #1a1a22 70%, #13131a 100%)',
                      border: '2px solid rgba(255,255,255,0.12)',
                      boxShadow: 'inset 0 0 20px rgba(0,0,0,0.4)',
                    }}
                  >
                    <span className="text-white font-display tracking-wide leading-tight drop-shadow"
                          style={{ fontSize }}>
                      {ans.castaways?.seasons?.name ?? `#${idx + 1}`}
                    </span>
                  </div>
                  <div
                    className="board-cell-back overflow-hidden relative flex items-end justify-center"
                    style={{ border: '2px solid rgba(46,194,126,0.6)' }}
                  >
                    {photoUrl && (
                      <img
                        src={photoUrl}
                        alt={ans.castaways?.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ objectPosition: 'center top' }}
                        onError={e => { e.target.style.display = 'none' }}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <span className="relative text-white font-bold drop-shadow-md pb-1 z-10 text-center px-1"
                          style={{ fontSize: Math.max(7, Math.floor(cellSize * 0.12)) }}>
                      {ans.castaways?.name?.split(' ')[0]}
                    </span>
                    {revealed && <div className="absolute inset-0 bg-brand-green/20 pointer-events-none" />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
