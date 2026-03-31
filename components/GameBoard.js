'use client'
import { getGridCols } from '@/lib/gameUtils'

export default function GameBoard({ answers, totalCount, revealedIds = new Set() }) {
  const cols = getGridCols(totalCount)

  return (
    <div
      className="w-full h-full grid gap-1.5 content-start"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {answers.map((ans, idx) => {
        const revealed = revealedIds.has(ans.id)
        const photoUrl = ans.castaways?.seasons?.version_season
          ? `https://gradientdescending.com/survivor/castaways/colour/${ans.castaways.seasons.version_season}US${ans.castaways.castaway_id}.png`
          : null

        return (
          <div key={ans.id} className={`board-cell ${revealed ? 'revealed' : ''}`}
               style={{ aspectRatio: '1' }}>
            <div className="board-cell-inner">
              {/* Front: season label */}
              <div className="board-cell-front cell-shimmer border border-white/10 flex flex-col items-center justify-center p-1 text-center">
                <span className="text-white font-display tracking-wide leading-tight"
                      style={{ fontSize: 'clamp(7px, 1.1vw, 13px)' }}>
                  {ans.castaways?.seasons?.name ?? `#${idx + 1}`}
                </span>
              </div>

              {/* Back: castaway photo */}
              <div className="board-cell-back bg-brand-card border border-brand-green/60 overflow-hidden relative">
                {photoUrl && (
                  <img
                    src={photoUrl}
                    alt={ans.castaways?.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={e => { e.target.style.display = 'none' }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-0.5 text-center">
                  <span className="text-white font-bold drop-shadow-md"
                        style={{ fontSize: 'clamp(6px, 0.9vw, 11px)' }}>
                    {ans.castaways?.name?.split(' ')[0]}
                  </span>
                </div>
                {revealed && (
                  <div className="absolute inset-0 bg-brand-green/20 pointer-events-none" />
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
