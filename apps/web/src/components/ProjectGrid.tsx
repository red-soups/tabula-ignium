import { Icon } from './Icon'
import type { ProjectFilter } from './DashboardSidebar'

// 프로젝트 목록 문구와 빈 상태 예시 데이터입니다.
const PROJECT_GRID_DATA = {
  titles: { all: '모든 프로젝트', recent: '최근 열어본 프로젝트' },
  searchPlaceholder: '프로젝트 검색',
  emptyTitle: '프로젝트를 찾을 수 없어요',
  emptyDescription: '검색어를 바꾸거나 다른 목록을 확인해 보세요.',
}

export type Project = {
  id: string
  name: string
  description: string
  regions: string[]
  features: string[]
  updatedAt: string
  isRecent: boolean
  mapVariant: 'amazon' | 'western-us' | 'australia'
}

type ProjectGridProps = {
  projects: Project[]
  filter: ProjectFilter
  query: string
  onQueryChange: (query: string) => void
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="project-card">
      <button className="project-open" type="button" aria-label={`${project.name} 열기`}>
        <span className={`project-preview map-${project.mapVariant}`}>
          <span className="map-grid" aria-hidden="true" />
          <span className="map-land land-one" aria-hidden="true" />
          <span className="map-land land-two" aria-hidden="true" />
          <span className="area-box" aria-hidden="true" />
          <span className="fire-points" aria-hidden="true" />
          <span className="project-area-tag">{project.regions.join(' · ')}</span>
        </span>
        <span className="project-card-body">
          <strong className="project-card-title">{project.name}</strong>
          <span className="project-description">{project.description}</span>
          <span className="project-meta"><span>지역 {project.regions.length}개</span><span aria-hidden="true">·</span><span>기능 {project.features.length}개</span><span aria-hidden="true">·</span><span>{project.updatedAt}</span></span>
          <span className="project-tags">
            {project.features.slice(0, 3).map((feature) => <span key={feature}>{feature}</span>)}
            {project.features.length > 3 && <span>+{project.features.length - 3}</span>}
          </span>
        </span>
      </button>
      <button className="project-config" type="button" aria-label={`${project.name} 설정`}><Icon name="settings" size={15} /></button>
    </article>
  )
}

export function ProjectGrid({ projects, filter, query, onQueryChange }: ProjectGridProps) {
  return (
    <section className="project-index" aria-labelledby="project-list-title">
      <div className="index-top">
        <div className="index-title"><h2 id="project-list-title">{PROJECT_GRID_DATA.titles[filter]}</h2><span className="count-chip">{projects.length}</span></div>
        <label className="project-search"><Icon name="search" size={18} /><input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={PROJECT_GRID_DATA.searchPlaceholder} aria-label={PROJECT_GRID_DATA.searchPlaceholder} /></label>
      </div>
      {projects.length > 0 ? (
        <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div>
      ) : (
        <div className="grid-empty"><Icon name="map" size={25} /><strong>{PROJECT_GRID_DATA.emptyTitle}</strong><span>{PROJECT_GRID_DATA.emptyDescription}</span></div>
      )}
    </section>
  )
}
