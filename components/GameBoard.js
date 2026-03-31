'use client'
import { getGridCols } from '@/lib/gameUtils'

export default function GameBoard({ answers, totalCount, revealedIds = new Set() }) {
  const cols = getGridCols(totalCount)

  return (
    <div
      className="w-full grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {answers.map((ans, idx) => {
        const revealed = revealedIds.has(ans.id)
        const photoUrl = ans.castaways?.seasons?.version_season
          ? `https://gradientdescending.com/survivor/castaways/colour/${ans.castaways.seasons.version_season}US${ans.castaways.castaway_id}.png`
          : null

        return (
          <div key={ans.id} className={`board-cell ${revealed ? 'revealed' : ''}`}
               style={{ aspectRatio: '1', animationDelay: `${idx * 30}ms` }}>
            <div className="board-cell-inner">
              {/* Front: season label */}
              <div className="board-cell-front cell-shimmer border border-brand-border flex flex-col items-center justify-center p-1 text-center">
                <span className="text-brand-muted text-[10px] font-display tracking-wider leading-tight">
                  {ans.castaways?.seasons?.name ?? `#${idx + 1}`}
                </span>
              </div>

              {/* Back: castaway photo */}
              <div className="board-cell-back bg-brand-card border border-brand-green/50 flex flex-col items-center justify-center overflow-hidden relative">
                {photoUrl && (
                  <img
                    src={photoUrl}
                    alt={ans.castaways?.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={e => { e.target.style.display = 'none' }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-1 text-center">
                  <span className="text-white text-[9px] font-medium leading-tight drop-shadow">
                    {ans.castaways?.name?.split(' ')[0]}
                  </span>
                </div>
                {/* Green check overlay flash */}
                {revealed && (
                  <div className="absolute inset-0 bg-brand-green/20 animate-fade-in pointer-events-none" />
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
