export type HabitCategoryCode =
  | 'uncategorized'
  | 'health'
  | 'learning'
  | 'emotion'
  | 'creation'
  | 'relation'

export interface CategoryMeta {
  code: HabitCategoryCode
  label: string // 中文
  color: string // hex，用于 HabitCard 左侧条纹和 icon 光晕
  description?: string
}

export const CATEGORIES: CategoryMeta[] = [
  { code: 'uncategorized', label: '未分类', color: '#64748b' },
  { code: 'health', label: '健康', color: '#34d399' },
  { code: 'learning', label: '学习', color: '#22d3ee' },
  { code: 'emotion', label: '情绪', color: '#a78bfa' },
  { code: 'creation', label: '创造', color: '#fb923c' },
  { code: 'relation', label: '关系', color: '#f472b6' }
]

export function categoryByCode(code: string | undefined | null): CategoryMeta {
  return CATEGORIES.find((c) => c.code === code) ?? CATEGORIES[0]
}
