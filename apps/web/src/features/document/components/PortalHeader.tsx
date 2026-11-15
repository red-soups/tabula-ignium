import { BrandLogo } from '../../../components/BrandLogo'
import { Icon } from '../../../components/Icon'

type PortalHeaderProps = {
  showHomeButton: boolean
  onOpenDocumentSearch: () => void
  onGoHome: () => void
}

export function PortalHeader({ showHomeButton, onOpenDocumentSearch, onGoHome }: PortalHeaderProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'en' ? 'en' : 'ko'

  return <>
    <a className="portal-skip" href="#portal-main">{t('header.skip')}</a>
    <header className="portal-header">
      <div className="portal-header-inner">
        <a href="/" className="portal-brand" aria-label={t('header.homeLabel')}>
          <BrandLogo className="portal-brand-logo" />
        </a>
        <nav className="portal-util" aria-label={t('header.quickLinks')}>
          <div className="portal-language" role="group" aria-label={t('language.change')}>
            <button type="button" className={language === 'ko' ? 'is-active' : ''}
              aria-pressed={language === 'ko'} onClick={() => void i18n.changeLanguage('ko')}>
              {t('language.ko')}
            </button>
            <span aria-hidden="true">|</span>
            <button type="button" className={language === 'en' ? 'is-active' : ''}
              aria-pressed={language === 'en'} onClick={() => void i18n.changeLanguage('en')}>
              {t('language.en')}
            </button>
          </div>
          <button type="button" onClick={onOpenDocumentSearch}>
            <Icon name="shield" size={22} /><span>{t('header.verifyDocument')}</span>
          </button>
          {showHomeButton && <button type="button" onClick={onGoHome}>
            <Icon name="home" size={22} /><span>{t('header.home')}</span>
          </button>}
        </nav>
      </div>
    </header>
  </>
}
import { useTranslation } from 'react-i18next'
