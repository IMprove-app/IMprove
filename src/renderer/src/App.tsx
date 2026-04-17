import { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import Titlebar from './components/Titlebar'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Timer from './pages/Timer'
import Stats from './pages/Stats'
import Settings from './pages/Settings'
import Auth from './pages/Auth'
import CardsPage from './pages/CardsPage'
import PostSessionCards from './components/PostSessionCards'
import UpdateBanner from './components/UpdateBanner'

export interface ActiveSession {
  sessionId: string
  habitId: string
  habitName: string
  habitIcon: string
  startedAt: number
  dailyGoalM: number
  todaySeconds: number
}

function App(): JSX.Element {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState<'dashboard' | 'cards' | 'stats'>('dashboard')
  const [timerTab, setTimerTab] = useState<'timer' | 'cards'>('timer')
  const [showSettings, setShowSettings] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [skippedAuth, setSkippedAuth] = useState(false)
  const [dueCount, setDueCount] = useState(0)
  const [postSession, setPostSession] = useState<{ habitName: string } | null>(null)

  useEffect(() => {
    window.api.getAuthStatus().then(status => {
      setLoggedIn(status.loggedIn)
      setAuthChecked(true)
    })
  }, [])

  // Refresh due card count periodically
  const refreshDueCount = () => {
    window.api.getDueCardCount().then(setDueCount)
  }

  useEffect(() => {
    refreshDueCount()
    const interval = setInterval(refreshDueCount, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleSessionStart = (session: ActiveSession) => {
    setActiveSession(session)
    setTimerTab('timer')
  }

  const handleSessionStop = () => {
    const session = activeSession
    setActiveSession(null)
    setRefreshKey(k => k + 1)
    // Show post-session card add option
    if (session) {
      setPostSession({ habitName: session.habitName })
    }
  }

  const handleAuthSuccess = () => {
    setLoggedIn(true)
    window.api.triggerSync()
  }

  const handleLogout = async () => {
    await window.api.logout()
    setLoggedIn(false)
    setSkippedAuth(false)
    setShowSettings(false)
  }

  if (!authChecked) {
    return (
      <div className="h-screen flex flex-col bg-bg-deep">
        <Titlebar />
        <div className="flex-1 flex items-center justify-center text-txt-muted text-sm">
          加载中...
        </div>
      </div>
    )
  }

  if (!loggedIn && !skippedAuth) {
    return (
      <div className="h-screen flex flex-col bg-bg-deep">
        <Titlebar />
        <Auth onSuccess={handleAuthSuccess} onSkip={() => setSkippedAuth(true)} />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-bg-deep">
      <Titlebar loggedIn={loggedIn} />
      <UpdateBanner />
      {/* Keep Timer mounted (hidden) when switching to cards during session */}
      {activeSession && (
        <div className={timerTab === 'cards' ? 'hidden' : 'flex-1 flex flex-col overflow-hidden'}>
          <Timer key={`timer-${activeSession.sessionId}`} session={activeSession} onStop={handleSessionStop} />
        </div>
      )}
      {activeSession && timerTab === 'cards' && (
        <CardsPage key="timer-cards" />
      )}
      <AnimatePresence mode="wait">
        {activeSession ? null : postSession ? (
          <PostSessionCards
            key="post-session"
            habitName={postSession.habitName}
            onDone={() => { setPostSession(null); refreshDueCount() }}
            onSkip={() => { setPostSession(null); refreshDueCount() }}
          />
        ) : showSettings ? (
          <Settings
            key="settings"
            onBack={() => { setShowSettings(false); setRefreshKey(k => k + 1) }}
            loggedIn={loggedIn}
            onLogout={handleLogout}
            onLogin={() => { setSkippedAuth(false); setShowSettings(false) }}
          />
        ) : (
          <>
            {tab === 'dashboard' ? (
              <Dashboard
                key={`dash-${refreshKey}`}
                onSessionStart={handleSessionStart}
                onOpenSettings={() => setShowSettings(true)}
                dueCount={dueCount}
                onStartReview={() => setTab('cards')}
              />
            ) : tab === 'cards' ? (
              <CardsPage key="cards" />
            ) : (
              <Stats key="stats" />
            )}
          </>
        )}
      </AnimatePresence>
      {!showSettings && !postSession && (
        activeSession ? (
          <BottomNav
            active={timerTab === 'cards' ? 'cards' : 'dashboard'}
            onChange={(t) => {
              if (t === 'cards') setTimerTab('cards')
              else setTimerTab('timer')
            }}
            dueCount={dueCount}
            timerActive
          />
        ) : (
          <BottomNav active={tab} onChange={setTab} dueCount={dueCount} />
        )
      )}
    </div>
  )
}

export default App
