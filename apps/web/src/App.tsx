import { lazy, Suspense, useEffect, useState } from 'react'
import Home from './pages/home'
import './App.css'

const ProjectPage = lazy(() => import('./pages/ProjectPage'))

function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function navigate(to: string) {
    window.history.pushState(null, '', to)
    setPath(to)
  }

  const match = /^\/projects\/(\d+)$/.exec(path)
  return match ? (
    <Suspense fallback={<p className="auth-error" role="status">프로젝트를 불러오는 중입니다.</p>}>
      <ProjectPage projectId={Number(match[1])} onBack={() => navigate('/')} />
    </Suspense>
  ) : <Home onOpenProject={(projectId) => navigate(`/projects/${projectId}`)} />
}

export default App
