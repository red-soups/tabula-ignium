import { BrandLogo } from '../../../components/BrandLogo'
import { Icon } from '../../../components/Icon'

type PortalHeaderProps = {
  showHomeButton: boolean
  onOpenDocumentSearch: () => void
  onGoHome: () => void
}

export function PortalHeader({ showHomeButton, onOpenDocumentSearch, onGoHome }: PortalHeaderProps) {
  return <>
    <a className="portal-skip" href="#portal-main">본문 바로가기</a>
    <header className="portal-header">
      <div className="portal-header-inner">
        <a href="/" className="portal-brand" aria-label="산불24 홈">
          <BrandLogo className="portal-brand-logo" />
        </a>
        <nav className="portal-util" aria-label="바로가기">
          <button type="button" onClick={onOpenDocumentSearch}>
            <Icon name="shield" size={22} /><span>문서 진위 확인</span>
          </button>
          {showHomeButton && <button type="button" onClick={onGoHome}>
            <Icon name="home" size={22} /><span>처음으로</span>
          </button>}
        </nav>
      </div>
    </header>
  </>
}
