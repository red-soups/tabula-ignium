// 공통 SVG 아이콘 경로 데이터입니다.
const ICON_PATHS = {
  close: <path d="m6 6 12 12M18 6 6 18" />,
  refresh: <><path d="M20 6v5h-5" /><path d="M18.2 15a7 7 0 1 1-.6-7.7L20 11" /></>,
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
