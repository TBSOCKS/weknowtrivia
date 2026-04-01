'use client'
import { useState, useRef } from 'react'
import PersonalitySearch from '@/components/PersonalitySearch'

export default function DraggablePlayerList({ playerCount, setPlayerCount, selectedPlayers, setSelectedPlayers, personalities }) {
  const dragIdx = useRef(null)
  const [dragOver, setDragOver] = useState(null)

  function setPlayer(idx, id) {
    setSelectedPlayers(prev => {
      const next = [...prev]
      next[idx] = id
      return next
    })
  }

  function removePlayer(idx) {
    setSelectedPlayers(prev => {
      const next = [...prev]
      next[idx] = ''
      return next
    })
  }

  function handleDragStart(idx) {
    dragIdx.current = idx
  }

  function handleDrop(idx) {
    if (dragIdx.current === null || dragIdx.current === idx) return
    setSelectedPlayers(prev => {
      const next = [...prev]
      const moved = next.splice(dragIdx.current, 1)[0]
      next.splice(idx, 0, moved)
      return next
    })
    dragIdx.current = null
    setDragOver(null)
  }

  function handleAddPlayer(p) {
    const emptyIdx = selectedPlayers.findIndex(id => !id)
    if (emptyIdx !== -1) setPlayer(emptyIdx, p.id)
  }

  const filled = selectedPlayers.filter(Boolean)

  return (
    <div>
      {/* Player count */}
      <div className="flex gap-2 mb-4">
        {[2, 3, 4, 5, 6, 7, 8].map(n => (
          <button key={n} onClick={() => setPlayerCount(n)}
            className={`w-9 h-9 rounded-lg font-display text-lg transition-all ${
              playerCount === n
                ? 'bg-brand-red text-white'
                : 'bg-brand-card border border-brand-border text-brand-muted hover:text-white'
            }`}>
            {n}
          </button>
        ))}
      </div>

      {/* Draggable player list */}
      <div className="flex flex-col gap-2 mb-3">
        {selectedPlayers.filter(Boolean).map((pid, idx) => {
          const pers = personalities.find(p => p.id === pid)
          return (
            <div
              key={pid}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => { e.preventDefault(); setDragOver(idx) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(idx)}
              className={`flex items-center gap-3 bg-brand-card border rounded-xl px-3 py-2 cursor-grab active:cursor-grabbing transition-all ${
                dragOver === idx ? 'border-brand-amber scale-[1.02]' : 'border-brand-border'
              }`}
            >
              {/* Drag handle */}
              <span className="text-brand-border text-sm select-none">⠿</span>

              {/* Turn order badge */}
              <span className="text-brand-muted font-display text-sm w-5 text-center flex-shrink-0">{idx + 1}</span>

              {/* Avatar */}
              <div className="w-7 h-7 rounded-full overflow-hidden bg-brand-border flex-shrink-0">
                {pers?.photo_url
                  ? <img src={pers.photo_url} alt={pers.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-brand-muted text-xs font-display">{pers?.name?.[0]}</div>
                }
              </div>
              <span className="flex-1 text-white text-sm">{pers?.name}</span>
              <button onClick={() => removePlayer(idx)}
                className="text-brand-muted hover:text-brand-red text-xs transition-colors">✕</button>
            </div>
          )
        })}
      </div>

      {/* Search to add */}
      {filled.length < playerCount && (
        <PersonalitySearch
          onSelect={handleAddPlayer}
          excluded={filled}
          placeholder={`Add player ${filled.length + 1}…`}
        />
      )}

      {filled.length > 0 && (
        <p className="text-brand-muted text-xs mt-2">Drag to reorder turn order</p>
      )}
    </div>
  )
}
