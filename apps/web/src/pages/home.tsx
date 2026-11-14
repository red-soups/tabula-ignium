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
import { useCreateProjectMutation, useDeleteProjectMutation, useProjectsQuery, useUpdateProjectMutation } from '../api/projectQueries'
import type { CreateProjectDetails } from '../api/projects'
import { AppHeader } from '../components/AppHeader'
import { ProjectModal } from '../components/CreateProjectModal'
import { DeleteProjectModal } from '../components/DeleteProjectModal'
import {
  DashboardSidebar,
  type ProjectFilter,
} from '../components/DashboardSidebar'
import { GlobePreview } from '../components/GlobePreview'
import { HeroSection } from '../components/HeroSection'
import { ProjectGrid, type Project, type ProjectSort } from '../components/ProjectGrid'
import { SignupModal } from '../components/SignupModal'
import { EditProfileModal } from '../components/EditProfileModal'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

function getSignupErrorMessage(error: Error | null) {
  if (error instanceof AuthRequestError && error.status === 401) {
    return '가입 세션이 만료되었습니다. Google로 다시 로그인해 주세요.'
  }
  if (error instanceof AuthRequestError && error.status === 409) {
    return '이미 등록된 이메일입니다. 기존 계정으로 로그인해 주세요.'
  }
  return error ? '회원가입을 완료하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요.' : ''
}

function Home({ onOpenProject }: { onOpenProject: (projectId: number) => void }) {
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [sort, setSort] = useState<ProjectSort>('recent')
  const [query, setQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [isGlobePreviewOpen, setIsGlobePreviewOpen] = useState(false)
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false)
  const [redirectError, setRedirectError] = useState(() =>
    new URLSearchParams(window.location.search).get('login') === 'failed'
      ? 'Google 로그인에 실패했습니다. 다시 시도해 주세요.'
      : '',
  )
  const debouncedQuery = useDebouncedValue(query, 300)

  const accountQuery = useAccountQuery()
  const signupMutation = useCompleteSignupMutation()
  const logoutMutation = useLogoutMutation()
  const updateProfileMutation = useUpdateProfileMutation()
  const account = accountQuery.data ?? null
  const pendingSignup = account && 'registrationRequired' in account ? account : null
  const user = account && 'id' in account ? account : null
  const projectsQuery = useProjectsQuery(Boolean(user))
  const createProjectMutation = useCreateProjectMutation()
  const updateProjectMutation = useUpdateProjectMutation()
  const deleteProjectMutation = useDeleteProjectMutation()
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

  function saveProject(details: CreateProjectDetails) {
    const closeModal = () => {
      setIsModalOpen(false)
      setEditingProject(null)
    }
    if (editingProject) {
      updateProjectMutation.mutate({ projectId: editingProject.id, details }, { onSuccess: closeModal })
    } else {
      createProjectMutation.mutate(details, { onSuccess: closeModal })
    }
  }

  const projects = useMemo<Project[]>(() => {
    if (!user) return []
    return (projectsQuery.data ?? []).map((project) => {
      const updatedAt = new Date(project.updatedAt)
      return {
        ...project,
        description: project.description ?? '',
        updatedAt: `${new Intl.DateTimeFormat('ko-KR').format(updatedAt)} 수정`,
        updatedAtTimestamp: updatedAt.getTime(),
        isRecent: true,
      }
    })
  }, [projectsQuery.data, user])

  const filteredProjects = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLocaleLowerCase('ko-KR')

    return projects
      .filter((project) => {
        const matchesFilter = filter === 'all' || project.isRecent
        const matchesSearch =
          normalizedQuery.length === 0 ||
          [
            project.name,
            project.description,
            ...project.regions.map((region) => region.name),
            ...project.features.map((feature) => feature.name),
          ]
            .join(' ')
            .toLocaleLowerCase('ko-KR')
            .includes(normalizedQuery)

        return matchesFilter && matchesSearch
      })
      .sort((left, right) => sort === 'recent'
        ? right.updatedAtTimestamp - left.updatedAtTimestamp
        : left.updatedAtTimestamp - right.updatedAtTimestamp)
  }, [debouncedQuery, filter, projects, sort])

  const openCreateModal = () => {
    if (!user) {
      startGoogleLogin()
      return
    }
    createProjectMutation.reset()
    updateProjectMutation.reset()
    setEditingProject(null)
    setIsModalOpen(true)
  }

  const openEditModal = (project: Project) => {
    createProjectMutation.reset()
    updateProjectMutation.reset()
    setEditingProject(project)
    setIsModalOpen(true)
  }

  const projectMutation = editingProject ? updateProjectMutation : createProjectMutation

  const confirmDeleteProject = () => {
    if (!deletingProject) return
    deleteProjectMutation.mutate(deletingProject.id, {
      onSuccess: () => setDeletingProject(null),
    })
  }

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
          {projectsQuery.error && user && <p className="auth-error" role="alert">프로젝트 목록을 불러오지 못했습니다.</p>}
          <HeroSection onCreateProject={openCreateModal} />
          <ProjectGrid
            projects={filteredProjects}
            filter={filter}
            query={query}
            sort={sort}
            onQueryChange={setQuery}
            onSortChange={setSort}
            onEditProject={openEditModal}
            onOpenProject={(project) => onOpenProject(project.id)}
            onDeleteProject={(project) => {
              deleteProjectMutation.reset()
              setDeletingProject(project)
            }}
          />
        </main>
      </div>
      {isGlobePreviewOpen && <GlobePreview onClose={() => setIsGlobePreviewOpen(false)} />}
      {isModalOpen && (
        <ProjectModal
          busy={projectMutation.isPending}
          error={projectMutation.error ? '프로젝트를 저장하지 못했습니다. 입력값을 확인해 주세요.' : ''}
          project={editingProject}
          onClose={() => {
            if (!projectMutation.isPending) {
              setIsModalOpen(false)
              setEditingProject(null)
            }
          }}
          onSubmit={saveProject}
        />
      )}
      {deletingProject && (
        <DeleteProjectModal
          project={deletingProject}
          busy={deleteProjectMutation.isPending}
          error={deleteProjectMutation.error ? '프로젝트를 삭제하지 못했습니다. 다시 시도해 주세요.' : ''}
          onClose={() => {
            if (!deleteProjectMutation.isPending) setDeletingProject(null)
          }}
          onConfirm={confirmDeleteProject}
        />
      )}
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
