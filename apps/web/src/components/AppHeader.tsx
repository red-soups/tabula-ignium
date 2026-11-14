import { Icon } from './Icon'
import { GoogleLoginButton } from './GoogleLoginButton'

// 헤더에 표시할 예시 콘텐츠입니다.
const HEADER_DATA = {
  brand: 'FireScope', currentPage: '프로젝트', dataLabel: '시연 데이터',
  createLabel: '새 프로젝트',
}

type AppHeaderProps = {
  onCreateProject: () => void
  onLogin: () => void
}

export function AppHeader({ onCreateProject, onLogin }: AppHeaderProps) {
  return (
    <header className="app-header">
      <a className="wordmark" href="#top" aria-label="FireScope 프로젝트 홈">
        <span className="brand-symbol" aria-hidden="true"><i /><b /></span>
        <span>{HEADER_DATA.brand}</span>
      </a>
      <span className="header-divider" aria-hidden="true" />
      <span className="header-crumb">{HEADER_DATA.currentPage}</span>
      <div className="header-actions">
        <button className="data-button" type="button"><span className="live-dot" /><span>{HEADER_DATA.dataLabel}</span></button>
        <GoogleLoginButton onClick={onLogin} />
        <button className="accent-button header-create" type="button" onClick={onCreateProject}><Icon name="plus" size={16} />{HEADER_DATA.createLabel}</button>
      </div>
    </header>
  )
}
