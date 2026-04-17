import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

interface DayData {
  date: string
  label: string
  minutes: number
}

interface HabitSummary {
  id: string
  name: string
  icon: string
  totalMinutes: number
  streak: number
  color: string
}

interface StatsData {
  weeklyChart: DayData[]
  habits: HabitSummary[]
  totalMinutes: number
  bestStreak: number
  activeDays: number
}

const COLORS = ['#007AFF', '#AF52DE', '#FF9500', '#34C759', '#FF3B30', '#FF2D55']

function Stats(): JSX.Element {
  const [data, setData] = useState<StatsData | null>(null)
  const [range, setRange] = useState<'week' | 'month'>('week')

  useEffect(() => {
    loadStats()
  }, [range])

  const loadStats = async () => {
    const result = await window.api.getStats(range) as StatsData
    setData(result)
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-txt-muted text-sm">
        加载中...
      </div>
    )
  }

  return (
    <motion.div
      className="flex-1 overflow-y-auto px-5 pt-4 pb-5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">统计</h1>
        <div className="flex gap-1 bg-bg-elevated rounded-lg p-0.5">
          <button
            onClick={() => setRange('week')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              range === 'week'
                ? 'bg-accent-cyan/15 text-accent-cyan'
                : 'text-txt-muted hover:text-txt-secondary'
            }`}
          >
            本周
          </button>
          <button
            onClick={() => setRange('month')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              range === 'month'
                ? 'bg-accent-cyan/15 text-accent-cyan'
                : 'text-txt-muted hover:text-txt-secondary'
            }`}
          >
            本月
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="glass-card p-3 text-center">
          <p className="font-mono text-xl font-semibold text-txt-primary">
            {formatTime(data.totalMinutes)}
          </p>
          <p className="text-[10px] text-txt-muted mt-1">总时长</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="font-mono text-xl font-semibold text-streak">
            {data.bestStreak}
          </p>
          <p className="text-[10px] text-txt-muted mt-1">最长连续</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="font-mono text-xl font-semibold text-success">
            {data.activeDays}
          </p>
          <p className="text-[10px] text-txt-muted mt-1">活跃天数</p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="glass-card p-4 mb-5">
        <h3 className="text-sm font-semibold mb-3 text-txt-secondary">每日学习时长</h3>
        {data.weeklyChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.weeklyChart} barCategoryGap="20%">
              <XAxis
                dataKey="label"
                tick={{ fill: '#8E8E93', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#AEAEB2', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={28}
                tickFormatter={(v) => `${v}m`}
              />
              <Tooltip
                contentStyle={{
                  background: '#FFFFFF',
                  border: '1px solid #E5E5EA',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#1D1D1F',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                }}
                formatter={(value: number) => [`${value} 分钟`, '学习时长']}
                labelStyle={{ color: '#8E8E93' }}
              />
              <Bar dataKey="minutes" radius={[4, 4, 0, 0]} maxBarSize={28}>
                {data.weeklyChart.map((entry, index) => {
                  const isToday = entry.date === new Date().toISOString().slice(0, 10)
                  return (
                    <Cell
                      key={index}
                      fill={isToday ? '#007AFF' : '#5AC8FA'}
                      opacity={entry.minutes > 0 ? 1 : 0.25}
                    />
                  )
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-txt-muted text-xs">
            暂无数据
          </div>
        )}
      </div>

      {/* Habit breakdown */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold mb-3 text-txt-secondary">各习惯详情</h3>
        {data.habits.length === 0 ? (
          <p className="text-xs text-txt-muted text-center py-4">暂无数据</p>
        ) : (
          <div className="space-y-3">
            {data.habits.map((habit, idx) => {
              const maxMin = Math.max(...data.habits.map(h => h.totalMinutes), 1)
              const width = (habit.totalMinutes / maxMin) * 100
              return (
                <div key={habit.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-txt-primary font-medium">
                      {habit.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {habit.streak > 0 && (
                        <span className="text-[10px] text-streak">🔥 {habit.streak}天</span>
                      )}
                      <span className="text-xs font-mono text-txt-secondary">
                        {formatTime(habit.totalMinutes)}
                      </span>
                    </div>
                  </div>
                  <div className="progress-track">
                    <div
                      className="h-full rounded-sm transition-all duration-500"
                      style={{
                        width: `${width}%`,
                        background: COLORS[idx % COLORS.length]
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h${m}m` : `${h}h`
}

export default Stats
