import { Icon, type IconName } from './Icon'

export type ProjectFilter = 'all' | 'recent'

// 사이드바 메뉴 예시 데이터입니다.
const SIDEBAR_DATA: { items: { id: ProjectFilter; label: string; icon: IconName }[]; storageStatus: string } = {
  items: [
    { id: 'all', label: '모든 프로젝트', icon: 'grid' },
    { id: 'recent', label: '최근 열어본 프로젝트', icon: 'clock' },
  ],
  storageStatus: '브라우저에 저장',
}

type Props = { activeFilter: ProjectFilter; onFilterChange: (filter: ProjectFilter) => void }

export function DashboardSidebar({ activeFilter, onFilterChange }: Props) {
  return (
    <aside className="dashboard-nav" aria-label="작업 공간 메뉴">
      <nav>{SIDEBAR_DATA.items.map((item) => (
        <button className={activeFilter === item.id ? 'nav-selected' : ''} key={item.id} type="button" onClick={() => onFilterChange(item.id)} aria-current={activeFilter === item.id ? 'page' : undefined}>
          <Icon name={item.icon} size={18} /><span>{item.label}</span>
        </button>
      ))}</nav>
      <div className="nav-foot"><span className="live-dot" />{SIDEBAR_DATA.storageStatus}</div>
    </aside>
  )
}
