import { useMemo, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { CreateProjectModal } from '../components/CreateProjectModal'
import {
  DashboardSidebar,
  type ProjectFilter,
} from '../components/DashboardSidebar'
import { HeroSection } from '../components/HeroSection'
import { ProjectGrid, type Project } from '../components/ProjectGrid'
import { SignupModal } from '../components/SignupModal'

// API 연결 전 홈 화면에서 사용하는 예시 데이터입니다.
const HOME_PAGE_DATA: { projects: Project[] } = {
  projects: [
    {
      id: 'amazon',
      name: '아마존 산불 관측',
      description: '아마존 유역의 화재 감지 추이와 FRP 변화를 관측합니다.',
      regions: ['아마존'],
      features: ['감지점 지도', '기간 추이', 'FRP 분석', '감지 밀도'],
      updatedAt: '2026. 11. 12 수정',
      isRecent: true,
      mapVariant: 'amazon',
    },
    {
      id: 'western-us',
      name: '미국 서부 센서 비교',
      description: '미국 서부의 MODIS와 VIIRS 감지 결과를 비교합니다.',
      regions: ['미국 서부', '캘리포니아'],
      features: ['감지점 지도', '센서별 비교', '신뢰도 필터'],
      updatedAt: '2026. 11. 10 수정',
      isRecent: true,
      mapVariant: 'western-us',
    },
    {
      id: 'australia',
      name: '호주 동남부 감지 밀도',
      description: '호주 동남부의 계절별 화재 밀집 지역을 확인합니다.',
      regions: ['호주 동남부'],
      features: ['감지점 지도', '주야간 분포', '감지 밀도'],
      updatedAt: '2026. 10. 30 수정',
      isRecent: false,
      mapVariant: 'australia',
    },
  ],
}

function Home() {
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [query, setQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false)

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')

    return HOME_PAGE_DATA.projects.filter((project) => {
      const matchesFilter = filter === 'all' || project.isRecent
      const matchesSearch =
        normalizedQuery.length === 0 ||
        [project.name, project.description, ...project.regions, ...project.features]
          .join(' ')
          .toLocaleLowerCase('ko-KR')
          .includes(normalizedQuery)

      return matchesFilter && matchesSearch
    })
  }, [filter, query])

  const openCreateModal = () => setIsModalOpen(true)

  return (
    <div className="app-shell">
      <AppHeader
        onCreateProject={openCreateModal}
        onLogin={() => setIsSignupModalOpen(true)}
      />
      <div className="dashboard-layout">
        <DashboardSidebar activeFilter={filter} onFilterChange={setFilter} />
        <main className="dashboard-content">
          <HeroSection onCreateProject={openCreateModal} />
          <ProjectGrid
            projects={filteredProjects}
            filter={filter}
            query={query}
            onQueryChange={setQuery}
          />
        </main>
      </div>
      <CreateProjectModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
      <SignupModal
        open={isSignupModalOpen}
        onClose={() => setIsSignupModalOpen(false)}
      />
    </div>
  )
}

export default Home
