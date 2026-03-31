'use client'

export default function PlayerCard({ player, personality, isCurrentPicker, gameMode }) {
  const strikes = player.strikes ?? 0

  return (
    <div className={`relative bg-brand-panel border rounded-2xl p-4 flex flex-col items-center gap-3 transition-all duration-300 ${
      player.eliminated
        ? 'border-brand-border opacity-40 grayscale'
        : isCurrentPicker
        ? 'border-brand-red picker-glow'
        : 'border-brand-border'
    }`}>
      {/* Current picker label */}
      {isCurrentPicker && !player.eliminated && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-red text-white text-[10px] font-display tracking-widest px-3 py-0.5 rounded-full whitespace-nowrap">
          PICKING
        </div>
      )}

      {/* Eliminated badge */}
      {player.eliminated && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-border text-brand-muted text-[10px] font-display tracking-widest px-3 py-0.5 rounded-full whitespace-nowrap">
          ELIMINATED
        </div>
      )}

      {/* Photo */}
      <div className="w-16 h-16 rounded-full overflow-hidden bg-brand-card border-2 border-brand-border">
        {personality?.photo_url ? (
          <img src={personality.photo_url} alt={personality.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl text-brand-muted font-display">
            {personality?.name?.[0] ?? '?'}
          </div>
        )}
      </div>

      {/* Name */}
      <div className="text-white text-sm font-medium text-center leading-tight">
        {personality?.name?.split(' ')[0] ?? 'Player'}
      </div>

      {/* Score */}
      <div className="font-display text-4xl text-white leading-none">{player.score ?? 0}</div>
      <div className="text-brand-muted text-xs -mt-2">pts</div>

      {/* Strikes (strike mode only) */}
      {gameMode === 'strike' && (
        <div className="flex gap-1.5">
          {[1, 2, 3].map(n => (
            <div key={n} className={`strike-dot ${n <= strikes ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  )
}
