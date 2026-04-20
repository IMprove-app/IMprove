interface Props {
  active: 'dashboard' | 'cards' | 'todos' | 'starry' | 'stats'
  onChange: (tab: 'dashboard' | 'cards' | 'todos' | 'starry' | 'stats') => void
  dueCount?: number
  timerActive?: boolean
}

function BottomNav({ active, onChange, dueCount, timerActive }: Props): JSX.Element {
  return (
    <div className="flex items-center justify-around px-4 py-2.5 border-t border-bg-border/50 bg-bg-deep/90 backdrop-blur-xl">
      <button
        onClick={() => onChange('dashboard')}
        className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-all ${
          active === 'dashboard' ? 'text-accent-cyan' : 'text-txt-muted hover:text-txt-secondary'
        }`}
      >
        {timerActive ? (
          <div className="relative">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-success animate-pulse" />
          </div>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        )}
        <span className="text-[10px] font-medium">{timerActive ? '计时' : '习惯'}</span>
        {active === 'dashboard' && (
          <div className="w-1 h-1 rounded-full bg-accent-cyan shadow-[0_0_6px_rgba(0,229,255,0.5)]" />
        )}
      </button>

      <button
        onClick={() => onChange('cards')}
        className={`relative flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-all ${
          active === 'cards' ? 'text-accent-cyan' : 'text-txt-muted hover:text-txt-secondary'
        }`}
      >
        <div className="relative">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="16" height="14" rx="2" />
            <path d="M6 4V2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2" />
          </svg>
          {(dueCount ?? 0) > 0 && (
            <span className="absolute -top-1.5 -right-2.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-danger text-white text-[8px] font-bold px-0.5">
              {dueCount! > 99 ? '99+' : dueCount}
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium">卡片</span>
        {active === 'cards' && (
          <div className="w-1 h-1 rounded-full bg-accent-cyan shadow-[0_0_6px_rgba(0,229,255,0.5)]" />
        )}
      </button>

      <button
        onClick={() => !timerActive && onChange('todos')}
        className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-all ${
          timerActive ? 'text-txt-muted/40 cursor-not-allowed' :
          active === 'todos' ? 'text-accent-cyan' : 'text-txt-muted hover:text-txt-secondary'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 20 6" />
          <path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10" />
        </svg>
        <span className="text-[10px] font-medium">待办</span>
        {active === 'todos' && (
          <div className="w-1 h-1 rounded-full bg-accent-cyan shadow-[0_0_6px_rgba(0,229,255,0.5)]" />
        )}
      </button>

      <button
        onClick={() => !timerActive && onChange('starry')}
        className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-all ${
          timerActive ? 'text-txt-muted/40 cursor-not-allowed' :
          active === 'starry' ? 'text-accent-cyan' : 'text-txt-muted hover:text-txt-secondary'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span className="text-[10px] font-medium">星空</span>
        {active === 'starry' && (
          <div className="w-1 h-1 rounded-full bg-accent-cyan shadow-[0_0_6px_rgba(0,229,255,0.5)]" />
        )}
      </button>

      <button
        onClick={() => !timerActive && onChange('stats')}
        className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-all ${
          timerActive ? 'text-txt-muted/40 cursor-not-allowed' :
          active === 'stats' ? 'text-accent-cyan' : 'text-txt-muted hover:text-txt-secondary'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
        <span className="text-[10px] font-medium">统计</span>
        {active === 'stats' && (
          <div className="w-1 h-1 rounded-full bg-accent-cyan shadow-[0_0_6px_rgba(0,229,255,0.5)]" />
        )}
      </button>
    </div>
  )
}

export default BottomNav
