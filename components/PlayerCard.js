'use client'

export default function PlayerCard({ player, personality, isCurrentPicker, gameMode }) {
  const strikes = player.strikes ?? 0

  return (
    <div className={`relative bg-brand-panel border rounded-xl px-3 py-2.5 flex items-center gap-3 transition-all duration-300 ${
      player.eliminated
        ? 'border-brand-border opacity-40 grayscale'
        : isCurrentPicker
        ? 'border-brand-red picker-glow'
        : 'border-brand-border'
    }`}>
      {/* Picking indicator — left stripe */}
      {isCurrentPicker && !player.eliminated && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-red rounded-l-xl" />
      )}

      {/* Photo */}
      <div className="w-10 h-10 rounded-full overflow-hidden bg-brand-card border border-brand-border flex-shrink-0">
        {personality?.photo_url ? (
          <img src={personality.photo_url} alt={personality.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-brand-muted font-display text-lg">
            {personality?.name?.[0] ?? '?'}
          </div>
        )}
      </div>

      {/* Name + strikes */}
      <div className="flex-1 min-w-0">
        <div className="text-white text-sm font-medium truncate leading-tight">
          {personality?.name?.split(' ')[0] ?? 'Player'}
        </div>
        {player.eliminated && (
          <div className="text-brand-red text-[10px] uppercase tracking-wide">Eliminated</div>
        )}
        {!player.eliminated && gameMode === 'strike' && (
          <div className="flex gap-1 mt-0.5">
            {[1, 2, 3].map(n => (
              <div key={n} className={`strike-dot ${n <= strikes ? 'active' : ''}`} />
            ))}
          </div>
        )}
        {isCurrentPicker && !player.eliminated && (
          <div className="text-brand-red text-[10px] font-display tracking-widest uppercase">Picking</div>
        )}
      </div>

      {/* Score */}
      <div className="text-right flex-shrink-0">
        <div className="font-display text-3xl text-white leading-none">{player.score ?? 0}</div>
        <div className="text-brand-muted text-[10px]">pts</div>
      </div>
    </div>
  )
}
