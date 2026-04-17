import SyncStatus from './SyncStatus'

interface Props {
  loggedIn?: boolean
}

function Titlebar({ loggedIn }: Props): JSX.Element {
  const today = new Date()
  const dateStr = today.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })

  return (
    <div className="titlebar flex items-center justify-between px-4 pt-2.5 pb-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold tracking-wide text-txt-primary">IMprove</span>
        {loggedIn && <SyncStatus />}
      </div>
      <span className="text-[10px] text-txt-muted">{dateStr}</span>
      <div className="flex gap-1.5">
        <button
          onClick={() => window.electron?.ipcRenderer.invoke('window:minimize')}
          className="w-2.5 h-2.5 rounded-full bg-streak hover:opacity-80 transition-opacity"
        />
        <button
          onClick={() => window.electron?.ipcRenderer.invoke('window:close')}
          className="w-2.5 h-2.5 rounded-full bg-danger hover:opacity-80 transition-opacity"
        />
      </div>
    </div>
  )
}

export default Titlebar
