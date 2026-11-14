import { Icon } from './Icon'

// 히어로 영역에 표시할 예시 콘텐츠입니다.
const HERO_DATA = {
  eyebrow: '지구 관측 작업 공간',
  title: '화재 관측\n프로젝트',
  description: '관심 영역을 그려 정하고, 필요한 관측 도구를 골라\n나만의 지도 작업 공간을 만드세요.',
  actionLabel: '프로젝트 만들기',
  credit: 'NASA Blue Marble',
}

export function HeroSection({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <section className="dashboard-hero" id="top" aria-labelledby="dashboard-title">
      <div className="hero-stars" aria-hidden="true" />
      <div className="hero-globe" aria-hidden="true"><span className="continent continent-one" /><span className="continent continent-two" /><span className="continent continent-three" /><span className="globe-glow" /></div>
      <div className="hero-copy">
        <div className="hero-label"><span />{HERO_DATA.eyebrow}</div>
        <h1 id="dashboard-title">{HERO_DATA.title.split('\n').map((line) => <span key={line}>{line}</span>)}</h1>
        <p>{HERO_DATA.description}</p>
        <button className="accent-button hero-action" type="button" onClick={onCreateProject}><Icon name="plus" size={17} />{HERO_DATA.actionLabel}</button>
      </div>
      <span className="hero-credit">{HERO_DATA.credit}</span>
    </section>
  )
}
