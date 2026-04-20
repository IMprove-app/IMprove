export interface BadgeMeta {
  code: string
  name: string
  description: string // 解锁条件，未解锁时显示
  lore: string // 解锁后的风味文案
  color: string // hex，未解锁灰
}

export const BADGES: BadgeMeta[] = [
  {
    code: 'first_light',
    name: '初光',
    description: '首次完成一次打卡',
    lore: '万物伊始，你已发光',
    color: '#fde68a'
  },
  {
    code: 'dawn_messenger',
    name: '拂晓使者',
    description: '清晨 6 点前打卡累计 5 次',
    lore: '世界尚在沉睡，你已点亮东方',
    color: '#fb923c'
  },
  {
    code: 'night_watcher',
    name: '守夜人',
    description: '晚上 23 点后打卡累计 5 次',
    lore: '夜色深处，你是自己的坐标',
    color: '#60a5fa'
  },
  {
    code: 'returning_voyager',
    name: '归航者',
    description: '中断 7 天以上后回归打卡累计 3 次',
    lore: '熄灭从不是终点，你只是绕远路回来',
    color: '#a78bfa'
  },
  {
    code: 'self_rotator',
    name: '自转者',
    description: '任一习惯连续打卡 21 天',
    lore: '习惯已有了它自己的引力',
    color: '#34d399'
  },
  {
    code: 'faint_snow',
    name: '微光积雪',
    description: '累计完成 50 次打卡',
    lore: '所有微小，都在悄悄堆成银河',
    color: '#e5e7eb'
  }
]

export function badgeByCode(code: string): BadgeMeta | undefined {
  return BADGES.find(b => b.code === code)
}

export function levelTitle(level: number): string {
  if (level >= 20) return '星图绘者'
  if (level >= 10) return '寻星客'
  if (level >= 5) return '观星人'
  return '拾光者'
}

export function xpForLevelUp(level: number): number {
  return Math.round(100 * Math.pow(level, 1.5))
}
