// 공통 SVG 아이콘 경로 데이터입니다.
const ICON_PATHS = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.2 2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  globe: <><circle cx="12" cy="12" r="8.5" /><ellipse cx="12" cy="12" rx="4" ry="8.5" /><path d="M3.5 12h17" /></>,
  map: <><path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2Z" /><path d="M9 4v14M15 6v14" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.6-1.5.9-1.9-2.1-2.1-1.9.9-1.5-.6L10.5 3h-3l-.7 2-1.5.6-1.9-.9-2.1 2.1.9 1.9-.6 1.5L0 10.5v3l2 .7.6 1.5-.9 1.9 2.1 2.1 1.9-.9 1.5.6.7 2h3l.7-2 1.5-.6 1.9.9 2.1-2.1-.9-1.9.6-1.5Z" transform="translate(1.5 -0.25) scale(.88)" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
} as const

export type IconName = keyof typeof ICON_PATHS

type IconProps = { name: IconName; size?: number; className?: string }

export function Icon({ name, size = 18, className = '' }: IconProps) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  )
}
