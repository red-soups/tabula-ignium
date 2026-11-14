import type { CurrentUser } from '../api/auth'
import { Icon } from './Icon'
import { GoogleLoginButton } from './GoogleLoginButton'

// 헤더에 표시할 예시 콘텐츠입니다.
const HEADER_DATA = {
  brand: 'FireScope', currentPage: '프로젝트', dataLabel: '시연 데이터',
  createLabel: '새 프로젝트',
}

type AppHeaderProps = {
  onCreateProject: () => void
  onGlobePreview: () => void
  user: CurrentUser | null
  authBusy: boolean
  onLogin: () => void
  onLogout: () => void
  onEditProfile: () => void
}

export function AppHeader({ onCreateProject, onGlobePreview, user, authBusy, onLogin, onLogout, onEditProfile }: AppHeaderProps) {
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
        <button
          className="data-button globe-preview-trigger"
          type="button"
          onClick={onGlobePreview}
          aria-label="지구본 미리보기"
          aria-haspopup="dialog"
        >
          <Icon name="globe" size={16} />
          <span>지구본 미리보기</span>
        </button>
        {user ? (
          <>
            <span className="header-user" title={user.email}>{user.name}</span>
            <button className="quiet-button header-logout" type="button" onClick={onEditProfile} disabled={authBusy} aria-haspopup="dialog">회원정보 수정</button>
            <button className="quiet-button header-logout" type="button" onClick={onLogout} disabled={authBusy}>로그아웃</button>
          </>
        ) : (
          <GoogleLoginButton onClick={onLogin} disabled={authBusy} />
        )}
        <button className="accent-button header-create" type="button" onClick={onCreateProject}><Icon name="plus" size={16} />{HEADER_DATA.createLabel}</button>
      </div>
    </header>
  )
}
