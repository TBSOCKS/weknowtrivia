'use client'

export default function PlayerCard({ player, personality, isCurrentPicker, gameMode, turnOrder }) {
  const strikes = player.strikes ?? 0

  return (
    <div className={`relative bg-brand-panel border rounded-xl p-2 flex flex-col items-center gap-1.5 transition-all duration-300 ${
      player.eliminated
        ? 'border-brand-border opacity-40 grayscale'
        : isCurrentPicker
        ? 'border-brand-red picker-glow'
        : 'border-brand-border'
    }`}>
      {/* Picking / Eliminated badge */}
      {isCurrentPicker && !player.eliminated && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-brand-red text-white text-[9px] font-display tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap">
          PICKING
        </div>
      )}
      {turnOrder != null && (
        <div className="absolute top-1.5 left-1.5 bg-brand-bg/80 text-white font-display text-lg leading-none w-6 h-6 rounded-full flex items-center justify-center border border-brand-border/60">
          {turnOrder}
        </div>
      )}
      {player.eliminated && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-brand-border text-brand-muted text-[9px] font-display tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap">
          OUT
        </div>
      )}

      {/* Circular photo */}
      <div className="w-11 h-11 rounded-full overflow-hidden bg-brand-card border-2 border-brand-border flex-shrink-0 mt-1">
        {personality?.photo_url ? (
          <img src={personality.photo_url} alt={personality.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-brand-muted font-display text-lg">
            {personality?.name?.[0] ?? '?'}
          </div>
        )}
      </div>

      {/* Name */}
      <div className="text-white text-xs font-medium text-center leading-tight truncate w-full px-1">
        {personality?.name?.split(' ')[0] ?? 'Player'}
      </div>

      {/* Score */}
      <div className="font-display text-3xl text-white leading-none">{player.score ?? 0}</div>
      <div className="text-brand-muted text-[10px] -mt-1">pts</div>

      {/* Strikes */}
      {gameMode === 'strike' && !player.eliminated && (
        <div className="flex gap-1">
          {[1, 2, 3].map(n => (
            <div key={n} className={`strike-dot ${n <= strikes ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  )
}
