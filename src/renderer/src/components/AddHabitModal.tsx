import { useState } from 'react'
import { CATEGORIES, HabitCategoryCode } from '../data/categories'

interface Props {
  onSave: (data: {
    name: string
    icon: string
    target_url: string
    target_app: string
    daily_goal_m: number
    category: HabitCategoryCode
  }) => void
  onClose: () => void
  initial?: {
    name: string
    icon: string
    target_url: string
    target_app: string
    daily_goal_m: number
    category?: string
  }
}

const ICON_OPTIONS = [
  { key: 'microphone', label: '🎤' },
  { key: 'headphones', label: '🎧' },
  { key: 'code', label: '💻' },
  { key: 'book-open', label: '📖' },
  { key: 'brain', label: '🧠' },
  { key: 'dumbbell', label: '💪' },
  { key: 'pencil', label: '✏️' },
  { key: 'globe', label: '🌍' },
  { key: 'target', label: '🎯' },
  { key: 'music', label: '🎵' },
  { key: 'palette', label: '🎨' },
  { key: 'rocket', label: '🚀' }
]

const TEMPLATES = [
  { name: '英语口语', icon: 'microphone', url: 'https://www.cambly.com', goal: 15 },
  { name: '英语听力', icon: 'headphones', url: 'https://www.bbc.co.uk/learningenglish', goal: 10 },
  { name: '刷算法题', icon: 'code', url: 'https://leetcode.com/problemset/', goal: 20 },
  { name: '阅读', icon: 'book-open', url: 'https://read.amazon.com', goal: 15 },
  { name: '冥想', icon: 'brain', url: 'https://www.youtube.com/results?search_query=guided+meditation', goal: 10 },
  { name: '健身', icon: 'dumbbell', url: 'https://www.youtube.com/results?search_query=home+workout', goal: 20 },
  { name: '语言学习', icon: 'globe', url: 'https://www.duolingo.com/learn', goal: 10 }
]

function isValidCategory(c: string | undefined): c is HabitCategoryCode {
  return !!c && CATEGORIES.some((cat) => cat.code === c)
}

function AddHabitModal({ onSave, onClose, initial }: Props): JSX.Element {
  const [name, setName] = useState(initial?.name || '')
  const [icon, setIcon] = useState(initial?.icon || 'target')
  const [linkType, setLinkType] = useState<'url' | 'app'>(
    initial?.target_app ? 'app' : 'url'
  )
  const [url, setUrl] = useState(initial?.target_url || '')
  const [appPath, setAppPath] = useState(initial?.target_app || '')
  const [goal, setGoal] = useState(initial?.daily_goal_m || 30)
  const [category, setCategory] = useState<HabitCategoryCode>(
    isValidCategory(initial?.category) ? initial!.category as HabitCategoryCode : 'uncategorized'
  )
  const [showTemplates, setShowTemplates] = useState(!initial)

  const handleSave = () => {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      icon,
      target_url: linkType === 'url' ? url.trim() : '',
      target_app: linkType === 'app' ? appPath.trim() : '',
      daily_goal_m: goal,
      category
    })
  }

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setName(t.name)
    setIcon(t.icon)
    setUrl(t.url)
    setLinkType('url')
    setGoal(t.goal)
    setShowTemplates(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-[320px] max-h-[85vh] overflow-y-auto p-5 rounded-2xl bg-bg-card shadow-xl">
        <h2 className="text-lg font-semibold mb-4">
          {initial ? '编辑习惯' : '添加新习惯'}
        </h2>

        {showTemplates && !initial && (
          <div className="mb-4">
            <p className="text-xs text-txt-secondary mb-2">快速选择模板</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.name}
                  onClick={() => applyTemplate(t)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-bg-elevated border border-bg-border text-txt-secondary hover:border-accent-cyan/30 hover:text-txt-primary transition-all"
                >
                  {ICON_OPTIONS.find(i => i.key === t.icon)?.label} {t.name}
                </button>
              ))}
            </div>
            <div className="border-t border-bg-border my-4" />
          </div>
        )}

        <label className="block mb-3">
          <span className="text-xs text-txt-secondary mb-1 block">习惯名称</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：英语口语练习"
            className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent-cyan/40 transition-colors"
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs text-txt-secondary mb-1 block">图标</span>
          <div className="flex flex-wrap gap-2">
            {ICON_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setIcon(opt.key)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
                  icon === opt.key
                    ? 'bg-accent-cyan/20 border border-accent-cyan/40 scale-110'
                    : 'bg-bg-elevated border border-bg-border hover:border-bg-border/80'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </label>

        <div className="block mb-3">
          <span className="text-xs text-txt-secondary mb-1 block">
            分类 <span className="text-txt-muted">· {CATEGORIES.find(c => c.code === category)?.label}</span>
          </span>
          <div className="flex gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.code}
                type="button"
                onClick={() => setCategory(cat.code)}
                title={cat.label}
                className={`w-7 h-7 rounded-full transition-all ${
                  category === cat.code
                    ? 'ring-2 ring-white/60 scale-110'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: cat.color }}
              />
            ))}
          </div>
        </div>

        <label className="block mb-3">
          <span className="text-xs text-txt-secondary mb-1 block">打开方式</span>
          <div className="flex gap-2">
            <button
              onClick={() => setLinkType('url')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                linkType === 'url'
                  ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30'
                  : 'bg-bg-elevated text-txt-muted border border-bg-border'
              }`}
            >
              网页 URL
            </button>
            <button
              onClick={() => setLinkType('app')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                linkType === 'app'
                  ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30'
                  : 'bg-bg-elevated text-txt-muted border border-bg-border'
              }`}
            >
              本地应用
            </button>
          </div>
        </label>

        {linkType === 'url' ? (
          <label className="block mb-3">
            <span className="text-xs text-txt-secondary mb-1 block">网页地址</span>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent-cyan/40 transition-colors"
            />
          </label>
        ) : (
          <label className="block mb-3">
            <span className="text-xs text-txt-secondary mb-1 block">应用路径</span>
            <input
              type="text"
              value={appPath}
              onChange={e => setAppPath(e.target.value)}
              placeholder="C:\Program Files\..."
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent-cyan/40 transition-colors"
            />
          </label>
        )}

        <label className="block mb-5">
          <span className="text-xs text-txt-secondary mb-1 block">
            每日目标 <span className="font-mono text-txt-primary">{goal}</span> 分钟
          </span>
          <input
            type="range"
            min="5"
            max="120"
            step="5"
            value={goal}
            onChange={e => setGoal(Number(e.target.value))}
            className="w-full accent-accent-cyan"
          />
          <div className="flex justify-between text-[10px] text-txt-muted mt-1">
            <span>5m</span>
            <span>30m</span>
            <span>60m</span>
            <span>120m</span>
          </div>
        </label>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm text-txt-secondary bg-bg-elevated border border-bg-border hover:border-txt-muted/30 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 btn-glow text-sm py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddHabitModal
