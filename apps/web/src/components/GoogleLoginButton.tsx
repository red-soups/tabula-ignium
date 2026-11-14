// 구글 로그인 버튼에 사용하는 표시 데이터입니다.
const GOOGLE_LOGIN_DATA = {
  label: 'Google 로그인',
}

type GoogleLoginButtonProps = {
  onClick: () => void
  disabled: boolean
}

function GoogleLogo() {
  return (
    <svg className="google-logo" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.8 2.7-6.5Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2L12 13.5c-.8.6-1.9.9-3 .9a5.3 5.3 0 0 1-5-3.7H1v2.3A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M4 10.7A5.4 5.4 0 0 1 4 7.3V5H1a9 9 0 0 0 0 8l3-2.3Z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.5 1.4L15 2.5A8.5 8.5 0 0 0 9 0a9 9 0 0 0-8 5l3 2.3a5.3 5.3 0 0 1 5-3.7Z" />
    </svg>
  )
}

export function GoogleLoginButton({ onClick, disabled }: GoogleLoginButtonProps) {
  return (
    <button className="google-login-button header-google-login" type="button" aria-label={GOOGLE_LOGIN_DATA.label} onClick={onClick} disabled={disabled}>
      <GoogleLogo />
      <span>{GOOGLE_LOGIN_DATA.label}</span>
    </button>
  )
}
