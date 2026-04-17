import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function UpdateBanner(): JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const cleanups: (() => void)[] = []

    cleanups.push(
      window.api.onUpdateAvailable((v) => {
        setVersion(v)
      })
    )

    cleanups.push(
      window.api.onUpdateProgress((p) => {
        setProgress(p)
      })
    )

    cleanups.push(
      window.api.onUpdateDownloaded(() => {
        setDownloading(false)
        setReady(true)
      })
    )

    return () => cleanups.forEach(fn => fn())
  }, [])

  if (dismissed || !version) return null

  const handleDownload = () => {
    setDownloading(true)
    window.api.downloadUpdate()
  }

  const handleInstall = () => {
    window.api.installUpdate()
  }

  return (
    <AnimatePresence>
      <motion.div
        className="mx-4 mt-1 p-2.5 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-between"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
      >
        <div className="flex-1 min-w-0">
          {ready ? (
            <span className="text-[11px] text-success font-medium">v{version} 已下载完成</span>
          ) : downloading ? (
            <div>
              <span className="text-[11px] text-accent-cyan font-medium">正在下载 v{version}...</span>
              <div className="progress-track mt-1">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <span className="text-[11px] text-accent-cyan font-medium">新版本 v{version} 可用</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          {ready ? (
            <button
              onClick={handleInstall}
              className="text-[10px] px-2.5 py-1 rounded-lg bg-success/20 text-success border border-success/30 font-medium"
            >
              立即安装
            </button>
          ) : downloading ? null : (
            <>
              <button
                onClick={handleDownload}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 font-medium"
              >
                下载
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="text-[10px] px-1.5 py-1 text-txt-muted hover:text-txt-secondary"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default UpdateBanner
