import { useEffect, useState } from 'react'
import {
  AuthRequestError, GOOGLE_LOGIN_URL,
  type ProfileDetails, type SignupDetails,
} from '../api/auth'
import {
  useAccountQuery, useCompleteSignupMutation,
  useLogoutMutation, useUpdateProfileMutation,
} from '../api/authQueries'
import { EditProfileModal } from '../components/EditProfileModal'
import { GoogleLoginButton } from '../components/GoogleLoginButton'
import { SignupModal } from '../components/SignupModal'

function signupError(error: Error | null) {
  if (error instanceof AuthRequestError && error.status === 401) {
    return '가입 세션이 만료되었습니다. Google로 다시 로그인해 주세요.'
  }
  if (error instanceof AuthRequestError && error.status === 409) {
    return '이미 등록된 이메일입니다. 기존 계정으로 로그인해 주세요.'
  }
  return error ? '회원가입을 완료하지 못했습니다. 입력값을 확인해 주세요.' : ''
}

export default function AuthHome() {
  const [editingProfile, setEditingProfile] = useState(false)
  const [redirectError, setRedirectError] = useState(() =>
    new URLSearchParams(window.location.search).get('login') === 'failed'
      ? 'Google 로그인에 실패했습니다. 다시 시도해 주세요.' : '',
  )
  const accountQuery = useAccountQuery()
  const signupMutation = useCompleteSignupMutation()
  const logoutMutation = useLogoutMutation()
  const profileMutation = useUpdateProfileMutation()
  const account = accountQuery.data ?? null
  const pendingSignup = account && 'registrationRequired' in account ? account : null
  const user = account && 'id' in account ? account : null
  const busy = accountQuery.isPending || signupMutation.isPending
    || logoutMutation.isPending || profileMutation.isPending
  const error = redirectError
    || (accountQuery.error ? '로그인 상태를 확인하지 못했습니다.' : '')
    || signupError(signupMutation.error)
    || (logoutMutation.error ? '로그아웃에 실패했습니다.' : '')

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('login') === 'failed') {
      url.searchParams.delete('login')
      window.history.replaceState(null, '', url)
    }
  }, [])

  function login() {
    setRedirectError('')
    signupMutation.reset()
    logoutMutation.reset()
    window.location.assign(GOOGLE_LOGIN_URL)
  }

  function logout() {
    setEditingProfile(false)
    setRedirectError('')
    signupMutation.reset()
    logoutMutation.mutate()
  }

  function saveProfile(details: ProfileDetails) {
    profileMutation.mutate(details, { onSuccess: () => setEditingProfile(false) })
  }

  return (
    <div className="auth-home">
      <header className="auth-home-header">
        <a href="/" className="auth-home-brand">FireScope <span>KR</span></a>
        <div className="auth-home-actions">
          {user ? <>
            <span title={user.email}>{user.name}</span>
            <button type="button" onClick={() => { profileMutation.reset(); setEditingProfile(true) }} disabled={busy}>회원정보 수정</button>
            <button type="button" onClick={logout} disabled={busy}>로그아웃</button>
          </> : <GoogleLoginButton onClick={login} disabled={busy} />}
        </div>
      </header>
      <main className="auth-home-main">
        <span className="auth-home-eyebrow">KOREA WILDFIRE DATA</span>
        <h1>새로운 문서 작업 공간을 준비하고 있습니다.</h1>
        <p>대한민국 산불 데이터를 선택해 문서로 구성하는 화면을 만들 예정입니다.</p>
        {error && !pendingSignup && <p className="auth-error" role="alert">{error}</p>}
      </main>
      {pendingSignup && <SignupModal profile={pendingSignup} busy={busy} error={error}
        onClose={logout} onSubmit={(details: SignupDetails) => signupMutation.mutate(details)} />}
      {user && editingProfile && <EditProfileModal user={user} busy={profileMutation.isPending}
        error={profileMutation.error ? '회원정보를 저장하지 못했습니다.' : ''}
        onClose={() => setEditingProfile(false)} onSubmit={saveProfile} />}
    </div>
  )
}
