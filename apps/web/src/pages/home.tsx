import { useEffect, useMemo, useState } from 'react'
import {
  AuthRequestError, GOOGLE_LOGIN_URL,
  type SignupDetails,
  type ProfileDetails,
} from '../api/auth'
import {
  useAccountQuery,
  useCompleteSignupMutation,
  useLogoutMutation,
  useUpdateProfileMutation,
} from '../api/authQueries'
import { AppHeader } from '../components/AppHeader'
import { CreateProjectModal } from '../components/CreateProjectModal'
import {
  DashboardSidebar,
  type ProjectFilter,
} from '../components/DashboardSidebar'
import { GlobePreview } from '../components/GlobePreview'
import { HeroSection } from '../components/HeroSection'
import { ProjectGrid, type Project } from '../components/ProjectGrid'
import { SignupModal } from '../components/SignupModal'
import { EditProfileModal } from '../components/EditProfileModal'

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

function getSignupErrorMessage(error: Error | null) {
  if (error instanceof AuthRequestError && error.status === 401) {
    return '가입 세션이 만료되었습니다. Google로 다시 로그인해 주세요.'
  }
  if (error instanceof AuthRequestError && error.status === 409) {
    return '이미 등록된 이메일입니다. 기존 계정으로 로그인해 주세요.'
  }
  return error ? '회원가입을 완료하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요.' : ''
}

function Home() {
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [query, setQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGlobePreviewOpen, setIsGlobePreviewOpen] = useState(false)
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false)
  const [redirectError, setRedirectError] = useState(() =>
    new URLSearchParams(window.location.search).get('login') === 'failed'
      ? 'Google 로그인에 실패했습니다. 다시 시도해 주세요.'
      : '',
  )

  const accountQuery = useAccountQuery()
  const signupMutation = useCompleteSignupMutation()
  const logoutMutation = useLogoutMutation()
  const updateProfileMutation = useUpdateProfileMutation()
  const account = accountQuery.data ?? null
  const pendingSignup = account && 'registrationRequired' in account ? account : null
  const user = account && 'id' in account ? account : null
  const authBusy = accountQuery.isPending || signupMutation.isPending || logoutMutation.isPending || updateProfileMutation.isPending
  const authError = redirectError
    || (accountQuery.error ? '로그인 상태를 확인하지 못했습니다.' : '')
    || getSignupErrorMessage(signupMutation.error)
    || (logoutMutation.error ? (pendingSignup ? '가입 취소에 실패했습니다.' : '로그아웃에 실패했습니다.') : '')

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('login') === 'failed') {
      url.searchParams.delete('login')
      window.history.replaceState(null, '', url)
    }
  }, [])

  function finishSignup(details: SignupDetails) {
    setRedirectError('')
    logoutMutation.reset()
    signupMutation.mutate(details)
  }

  function endSession() {
    setIsEditProfileOpen(false)
    setRedirectError('')
    signupMutation.reset()
    logoutMutation.mutate()
  }

  function saveProfile(details: ProfileDetails) {
    updateProfileMutation.mutate(details, { onSuccess: () => setIsEditProfileOpen(false) })
  }

  function startGoogleLogin() {
    setRedirectError('')
    signupMutation.reset()
    logoutMutation.reset()
    window.location.assign(GOOGLE_LOGIN_URL)
  }

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
        onGlobePreview={() => setIsGlobePreviewOpen(true)}
        user={user}
        authBusy={authBusy}
        onLogin={startGoogleLogin}
        onLogout={endSession}
        onEditProfile={() => { updateProfileMutation.reset(); setIsEditProfileOpen(true) }}
      />
      <div className="dashboard-layout">
        <DashboardSidebar activeFilter={filter} onFilterChange={setFilter} />
        <main className="dashboard-content">
          {authError && !pendingSignup && <p className="auth-error" role="alert">{authError}</p>}
          <HeroSection onCreateProject={openCreateModal} />
          <ProjectGrid
            projects={filteredProjects}
            filter={filter}
            query={query}
            onQueryChange={setQuery}
          />
        </main>
      </div>
      {isGlobePreviewOpen && <GlobePreview onClose={() => setIsGlobePreviewOpen(false)} />}
      <CreateProjectModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
      {pendingSignup && (
        <SignupModal
          profile={pendingSignup}
          busy={authBusy}
          error={authError}
          onClose={endSession}
          onSubmit={finishSignup}
        />
      )}
      {user && isEditProfileOpen && (
        <EditProfileModal
          user={user}
          busy={updateProfileMutation.isPending}
          error={updateProfileMutation.error
            ? updateProfileMutation.error instanceof AuthRequestError && updateProfileMutation.error.status === 401
              ? '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.'
              : '회원정보를 저장하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요.'
            : ''}
          onClose={() => setIsEditProfileOpen(false)}
          onSubmit={saveProfile}
        />
      )}
    </div>
  )
}

export default Home
