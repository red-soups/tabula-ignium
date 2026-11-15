// 공통 SVG 아이콘 경로 데이터입니다.
const ICON_PATHS = {
  close: <path d="m6 6 12 12M18 6 6 18" />,
  refresh: <><path d="M20 6v5h-5" /><path d="M18.2 15a7 7 0 1 1-.6-7.7L20 11" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  shield: <><path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  next: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="m5 12 5 5 9-10" />,
  pin: <><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  bars: <><path d="M4 20h16" /><path d="M7 16v-5M12 16V6M17 16v-8" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  gauge: <><path d="M4 16a8 8 0 1 1 16 0" /><path d="m12 16 4-5" /></>,
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.7 2.3-5 .2 1.6 1 2.6 2 3 0-3-.3-5.4.7-8z" />,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 12h.01" /></>,
  zap: <path d="M13 3 5 14h6l-1 7 8-11h-6z" />,
  daynight: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" /></>,
  swap: <><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 12 4 4-4 4" /><path d="M21 16H7" /></>,
  grid: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M4 15h16M10 4v16M15 4v16" /></>,
  map: <><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  home: <><path d="m4 11 8-7 8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
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
