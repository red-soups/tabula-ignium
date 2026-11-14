import { Icon } from './Icon'
import type { ProjectFilter } from './DashboardSidebar'
import type { ProjectResponse } from '../api/projects'

const PROJECT_GRID_DATA = {
  titles: { all: '모든 프로젝트', recent: '최근 열어본 프로젝트' },
  searchPlaceholder: '프로젝트 검색',
  emptyTitle: '저장된 프로젝트가 없습니다',
  emptyDescription: '새 프로젝트를 만들어 관측 지역과 기능을 저장해 보세요.',
}

export type Project = Omit<ProjectResponse, 'description'> & {
  description: string
  updatedAt: string
  updatedAtTimestamp: number
  isRecent: boolean
}

export type ProjectSort = 'recent' | 'oldest'

type ProjectGridProps = {
  projects: Project[]
  filter: ProjectFilter
  query: string
  sort: ProjectSort
  onQueryChange: (query: string) => void
  onSortChange: (sort: ProjectSort) => void
  onEditProject: (project: Project) => void
  onDeleteProject: (project: Project) => void
  onOpenProject: (project: Project) => void
}

function ProjectCard({ project, onEdit, onDelete, onOpen }: {
  project: Project
  onEdit: (project: Project) => void
  onDelete: (project: Project) => void
  onOpen: (project: Project) => void
}) {
  const mapVariants = ['amazon', 'western-us', 'australia'] as const
  const mapVariant = mapVariants[project.id % mapVariants.length]

  return (
    <article className="project-card">
      <button className="project-open" type="button" aria-label={`${project.name} 열기`} onClick={() => onOpen(project)}>
        <span className={`project-preview map-${mapVariant}`}>
          <span className="map-grid" aria-hidden="true" />
          <span className="map-land land-one" aria-hidden="true" />
          <span className="map-land land-two" aria-hidden="true" />
          <span className="area-box" aria-hidden="true" />
          <span className="fire-points" aria-hidden="true" />
          <span className="project-area-tag">{project.regions.map((region) => region.name).join(' · ')}</span>
        </span>
        <span className="project-card-body">
          <strong className="project-card-title">{project.name}</strong>
          <span className="project-description">{project.description}</span>
          <span className="project-meta"><span>지역 {project.regions.length}개</span><span aria-hidden="true">·</span><span>기능 {project.features.length}개</span><span aria-hidden="true">·</span><span>{project.updatedAt}</span></span>
          <span className="project-tags">
            {project.features.slice(0, 3).map((feature) => <span key={feature.id}>{feature.name}</span>)}
            {project.features.length > 3 && <span>+{project.features.length - 3}</span>}
          </span>
        </span>
      </button>
      <span className="project-card-actions">
        <button className="project-config" type="button" aria-label={`${project.name} 수정`} onClick={() => onEdit(project)}><Icon name="settings" size={15} /></button>
        <button className="project-delete" type="button" aria-label={`${project.name} 삭제`} onClick={() => onDelete(project)}><Icon name="trash" size={15} /></button>
      </span>
    </article>
  )
}

export function ProjectGrid({ projects, filter, query, sort, onQueryChange, onSortChange, onEditProject, onDeleteProject, onOpenProject }: ProjectGridProps) {
  return (
    <section className="project-index" aria-labelledby="project-list-title">
      <div className="index-top">
        <div className="index-title"><h2 id="project-list-title">{PROJECT_GRID_DATA.titles[filter]}</h2><span className="count-chip">{projects.length}</span></div>
        <div className="index-tools">
          <label className="project-sort">
            <span className="visually-hidden">프로젝트 정렬</span>
            <select value={sort} onChange={(event) => onSortChange(event.target.value as ProjectSort)} aria-label="프로젝트 정렬">
              <option value="recent">최근 수정 순</option>
              <option value="oldest">오래된 순</option>
            </select>
          </label>
          <label className="project-search"><Icon name="search" size={18} /><input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={PROJECT_GRID_DATA.searchPlaceholder} aria-label={PROJECT_GRID_DATA.searchPlaceholder} /></label>
        </div>
      </div>
      {projects.length > 0 ? (
        <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} onEdit={onEditProject} onDelete={onDeleteProject} onOpen={onOpenProject} />)}</div>
      ) : (
        <div className="grid-empty"><Icon name="map" size={25} /><strong>{PROJECT_GRID_DATA.emptyTitle}</strong><span>{PROJECT_GRID_DATA.emptyDescription}</span></div>
      )}
    </section>
  )
}
