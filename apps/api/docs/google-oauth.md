# Google 로그인 API

Spring Security가 Google과 OIDC 인증을 처리합니다. 인증에 성공하면 JPA로 연결된 서비스 계정을 조회하고, 브라우저에 `HttpOnly` 세션 쿠키를 발급합니다.

## Google Cloud 설정

Google Auth Platform의 **Clients**에서 **Web application** 클라이언트를 생성합니다. 로컬 개발용 **Authorized redirect URI**에 다음 주소를 등록하세요.

```text
http://localhost:8080/login/oauth2/code/google
```

클라이언트 ID와 Secret은 백엔드 환경 변수 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`에 설정합니다. 접근 권한이 제한된 앱이면 **Audience**에서 로그인할 계정의 권한을 확인하세요. 요청 범위는 `openid`, `email`, `profile`입니다. [Google 웹 서버용 OAuth 설정](https://developers.google.com/identity/protocols/oauth2/web-server) · [Google Auth Platform Audience](https://support.google.com/cloud/answer/15549945)

## 로컬 실행과 확인

1. 저장소 루트에서 `docker compose up -d --wait db`로 PostgreSQL을 실행합니다. 새 환경이라면 먼저 `.env.example`을 `.env`로 복사하고 로컬 비밀번호를 정하세요. 처음 만든 DB에 `docker compose run --rm flyway -baselineOnMigrate=true -baselineVersion=0 migrate`를 실행해 스키마를 적용합니다. Spring은 Compose의 Flyway가 적용한 스키마를 검증합니다.
2. 백엔드 터미널에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DB_PASSWORD`를 환경 변수로 설정합니다. `DB_PASSWORD`는 저장소 루트 `.env`의 값입니다. 기본 DB 주소는 `localhost:5433/tabula_ignium`입니다. 접속 정보가 다르면 `DB_URL`과 `DB_USER`도 설정하세요.
3. `apps/api`에서 `./mvnw spring-boot:run`을 실행합니다. 브라우저에서 `http://localhost:8080/oauth2/authorization/google`을 열고 로그인합니다. `WEB_ORIGIN`을 설정하지 않은 경우 로그인 성공 후 `/api/me`에서 내 정보가 JSON으로 표시됩니다. 기존 사용자는 서비스 사용자 `id`를 받고, 신규 사용자는 `registrationRequired: true`와 검증된 이메일을 받습니다.

프론트엔드와 함께 실행할 때는 백엔드에 `WEB_ORIGIN=http://localhost:5173`을 설정합니다. 별도 터미널에서 `apps/web`로 이동해 `npm ci`와 `npm run dev`를 실행하고 `http://localhost:5173`을 엽니다. Vite가 `/api`와 `/oauth2` 요청을 백엔드에 전달합니다. Google 콜백은 `http://localhost:8080/login/oauth2/code/google`에서 받고, 성공하면 웹 홈으로, 실패하면 웹 홈의 `?login=failed`로 이동합니다.

배포 시 같은 외부 오리진에서 `/api`, `/oauth2`, `/login/oauth2/code`를 백엔드로 전달합니다. `WEB_ORIGIN`, `GOOGLE_REDIRECT_URI`에 공개 HTTPS 주소를 지정하고 Google Cloud에도 같은 콜백 URL을 등록합니다. `SESSION_COOKIE_SECURE=true`로 설정하세요.

## 계정 연결

- 이미 연결된 Google 계정은 `provider=google`과 Google의 `sub`로 기존 사용자를 찾아 바로 로그인합니다.
- 첫 Google 인증은 서버 세션에 가입 대기 상태를 만듭니다. 회원가입 화면에는 Google 이메일이 읽기 전용으로 표시됩니다. 이름과 국적을 입력해 가입을 완료하면 서버가 세션에서 검증된 이메일을 읽고, 이름·이메일·국적과 Google 계정 연결을 하나의 JPA 트랜잭션에서 저장합니다. 가입에는 DB의 Flyway V5가 필요합니다.
- 다른 Google 계정에 이미 연결된 이메일로 가입하면 `409`를 반환합니다. 동일 Google 계정의 동시 가입은 DB 고유 제약으로 중복을 막고, 롤백 후 먼저 저장된 계정을 사용합니다. [Google 계정 식별자 안내](https://developers.google.com/identity/openid-connect/openid-connect)

## API 계약

| 요청 | 결과 |
| --- | --- |
| `GET /oauth2/authorization/google` | 브라우저를 Google 로그인으로 리디렉션합니다. |
| `GET /login/oauth2/code/google` | Google 인증 콜백입니다. `WEB_ORIGIN`이 비어 있으면 성공 시 `/api/me`로 이동하고 실패 시 `401`을 반환합니다. |
| `GET /api/me` | 등록 사용자는 `200`과 `{ "id": 1, "name": "사용자", "email": "user@example.com" }`을 받습니다. 가입 대기 중에는 `200`과 `{ "registrationRequired": true, "name": "사용자", "email": "user@example.com" }`을 받습니다. 세션이 없으면 `401`입니다. |
| `GET /api/csrf` | Google 인증이 완료된 세션에 `{ "headerName": "...", "token": "..." }`을 반환합니다. |
| `POST /api/signup` | 가입 대기 세션에서 `{ "name": "사용자", "nationalityCode": "KR" }`을 보냅니다. 성공하면 세션이 갱신되고 `200`과 등록 사용자 정보가 반환됩니다. |
| `POST /api/logout` | 세션을 종료하고 `204`를 반환합니다. 가입 대기 세션도 같은 방식으로 취소할 수 있습니다. |

`POST` 요청에는 `/api/csrf`에서 받은 헤더와 토큰이 필요합니다. 가입 완료 시 세션 ID가 갱신되므로 Postman에서 수동으로 쿠키를 관리한다면 새 `JSESSIONID`를 사용하세요. 다음 `POST` 전에 새 CSRF 토큰을 조회합니다. [Spring Security CSRF 문서](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html)
