# Google 로그인 API

Spring Security가 Google과 OIDC 인증을 처리합니다. 인증에 성공하면 JPA로 서비스 계정을 조회하거나 등록하고, 브라우저에 `HttpOnly` 세션 쿠키를 발급합니다.

## Google Cloud 설정

Google Auth Platform의 **Clients**에서 **Web application** 클라이언트를 생성합니다. 로컬 개발용 **Authorized redirect URI**에 다음 주소를 등록하세요.

```text
http://localhost:8080/login/oauth2/code/google
```

클라이언트 ID와 Secret은 백엔드 환경 변수 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`에 설정합니다. 접근 권한이 제한된 앱이면 **Audience**에서 로그인할 계정의 권한을 확인하세요. 요청 범위는 `openid`, `email`, `profile`입니다. [Google 웹 서버용 OAuth 설정](https://developers.google.com/identity/protocols/oauth2/web-server) · [Google Auth Platform Audience](https://support.google.com/cloud/answer/15549945)

## 로컬 실행과 확인

1. 저장소 루트에서 `docker compose up -d --wait db`로 PostgreSQL을 실행합니다. 새 환경이라면 먼저 `.env.example`을 `.env`로 복사하고 로컬 비밀번호를 정하세요. 처음 만든 DB에 `docker compose run --rm flyway -baselineOnMigrate=true -baselineVersion=0 migrate`를 실행해 스키마를 적용합니다. Spring은 Compose의 Flyway가 적용한 스키마를 검증합니다.
2. 백엔드 터미널에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DB_PASSWORD`를 환경 변수로 설정합니다. `DB_PASSWORD`는 저장소 루트 `.env`의 값입니다. 기본 DB 주소는 `localhost:5433/tabula_ignium`입니다. 접속 정보가 다르면 `DB_URL`과 `DB_USER`도 설정하세요.
3. `apps/api`에서 `./mvnw spring-boot:run`을 실행합니다. 브라우저에서 `http://localhost:8080/oauth2/authorization/google`을 열고 로그인합니다. `WEB_ORIGIN`을 설정하지 않은 경우 로그인 성공 후 `/api/me`에서 내 정보가 JSON으로 표시됩니다. 처음과 두 번째 로그인에서 같은 `id`가 반환되는지 확인할 수 있습니다.

웹과 연동할 때는 `WEB_ORIGIN`에 웹 주소를 설정하세요. 로그인 성공 시 웹 루트, 실패 시 웹 루트의 `?login=failed`로 이동합니다. 프론트엔드의 로그인 버튼은 브라우저를 로그인 시작 주소로 이동시키고, API 호출은 같은 오리진의 프록시를 통해 보내는 구성을 사용할 수 있습니다. 로컬에서는 로그인 시작 주소와 콜백 모두 `localhost`를 사용하세요.

배포 시 같은 외부 오리진에서 `/api`, `/oauth2`, `/login/oauth2/code`를 백엔드로 전달합니다. `WEB_ORIGIN`, `GOOGLE_REDIRECT_URI`에 공개 HTTPS 주소를 지정하고 Google Cloud에도 같은 콜백 URL을 등록합니다. `SESSION_COOKIE_SECURE=true`로 설정하세요.

## 계정 연결

- 최초 로그인에서는 검증된 Google 이메일로 `users`에 사용자를 등록하고, `oauth_accounts`에 `provider=google`, `provider_user_id=<Google sub>`로 연결합니다. 두 행은 같은 JPA 트랜잭션에서 저장합니다.
- 다음 로그인부터는 `provider`와 `sub`로 기존 사용자를 찾습니다. 같은 계정에 대한 동시 가입은 DB 고유 제약으로 중복을 막고, 롤백 후 먼저 저장된 계정을 읽습니다.
- 다른 Google 계정이 이미 등록된 이메일을 사용하면 로그인 요청을 거절합니다. 계정 연결 기준은 Google의 `sub`입니다. [Google 계정 식별자 안내](https://developers.google.com/identity/openid-connect/openid-connect)

## API 계약

| 요청 | 결과 |
| --- | --- |
| `GET /oauth2/authorization/google` | 브라우저를 Google 로그인으로 리디렉션합니다. |
| `GET /login/oauth2/code/google` | Google 인증 콜백입니다. `WEB_ORIGIN`이 비어 있으면 성공 시 `/api/me`로 이동하고, 실패 시 `401`을 반환합니다. |
| `GET /api/me` | 로그인 상태라면 `200`과 `{ "id": 1, "name": "사용자", "email": "user@example.com" }`을 반환합니다. 세션이 없으면 `401`입니다. |
| `GET /api/csrf` | 로그인 상태에서 `{ "headerName": "...", "token": "..." }`을 반환합니다. |
| `POST /api/logout` | CSRF 응답의 헤더 이름과 토큰을 넣어 호출합니다. 서비스 세션을 종료하고 `204`를 반환합니다. 토큰이 없거나 유효하지 않으면 `403`입니다. |

`/api/csrf`와 `/api/logout` 호출에는 로그인할 때 받은 세션 쿠키가 필요합니다. [Spring Security CSRF 문서](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html)

## 검증 범위

로컬 PostgreSQL에 기존 V1 SQL을 적용한 임시 데이터베이스와 서명된 ID 토큰을 발급하는 모의 OIDC 서버로 검증했습니다.

- 첫 로그인과 재로그인에서 같은 서비스 사용자 ID를 반환하며, 동시 첫 로그인에서도 두 테이블에 각각 한 행만 생성됩니다.
- 미검증 이메일과 이미 연결된 이메일을 사용하는 다른 Google 계정의 가입을 거절합니다.
- 비로그인 상태의 `/api/me`는 `401`, CSRF 토큰 없는 로그아웃은 `403`입니다. 유효한 토큰으로 로그아웃하면 `204`이고, 이전 세션 쿠키로 다시 접근하면 `401`입니다.

실제 Google 계정으로 로그인하려면 위의 Google Cloud 클라이언트를 설정한 뒤 브라우저에서 확인합니다.
