# 회원정보 수정 API

Google 로그인과 회원가입을 마친 사용자가 자신의 이름, 국적, 관심 지역을 수정하는 API입니다. 별도의 본인 확인 화면이나 Google 재인증 절차는 없습니다. 기존 로그인 세션과 CSRF 토큰은 필요합니다.

## 수정 전 정보 조회

`GET /api/me`는 현재 로그인한 사용자의 정보를 반환합니다. 수정 모달은 이 응답으로 기존 값을 채웁니다.

```json
{
  "id": 42,
  "name": "홍길동",
  "email": "user@example.com",
  "nationalityCode": "KR",
  "interestedRegions": [
    { "id": 101, "label": "대한민국 서울특별시" },
    { "id": 102, "label": "미국 California" }
  ]
}
```

`interestedRegions`의 `id`가 수정 요청에 사용할 지역 ID입니다. `label`은 국가부터 선택 지역까지의 이름을 합친 표시용 문자열입니다. 국가와 하위 지역 목록은 `GET /api/regions` 및 `GET /api/regions?parentId={id}`로 조회합니다. 가입 대기 중인 사용자의 `GET /api/me` 응답은 별도의 `registrationRequired` 형태이며, 회원정보 수정 대상이 아닙니다.

## 수정 요청

`PUT /api/me`

| 항목 | 값 |
| --- | --- |
| 인증 | Google 로그인 및 회원가입이 완료된 사용자의 `JSESSIONID` 쿠키 |
| CSRF | `GET /api/csrf`에서 받은 `headerName`을 헤더 이름으로, `token`을 헤더 값으로 전달 |
| Content-Type | `application/json` |

```json
{
  "name": "새 이름",
  "nationalityCode": "KR",
  "regionIds": [101, 102]
}
```

| 필드 | 규칙 |
| --- | --- |
| `name` | 필수, 공백만 입력할 수 없음, 최대 100자. 저장할 때 앞뒤 공백을 제거합니다. |
| `nationalityCode` | 필수, ISO 3166-1 alpha-2 국가 코드. 대문자 2자리여야 하며 실제 국가 코드여야 합니다. |
| `regionIds` | 필수, 서로 다른 유효한 지역 ID 1~5개. 각 ID는 양의 정수입니다. |

요청에는 `email` 필드가 없습니다. 이메일은 Google 로그인으로 등록된 값을 유지하며 이 API로 변경할 수 없습니다. `regionIds`는 **추가할 지역만** 보내는 값이 아니라 저장할 관심 지역의 **전체 목록**입니다. 기존 목록에서 빠진 지역은 삭제되고 새 ID는 추가됩니다.

### 성공 응답

`200 OK`와 갱신된 사용자 정보가 반환됩니다. 형식은 등록 사용자의 `GET /api/me` 응답과 같습니다. 응답에는 `Cache-Control: no-store`가 적용됩니다. 사용자 이름·국적·관심 지역은 하나의 JPA 트랜잭션에서 변경됩니다.

### 오류 응답

| 상태 | 경우 |
| --- | --- |
| `400 Bad Request` | 필수 값 누락, 이름 길이 초과, 잘못된 국가 코드, 지역 ID 중복·존재하지 않음·1~5개 범위 위반 |
| `401 Unauthorized` | 로그인 세션이 없거나 계정이 더 이상 존재하지 않음. 요청 조건에 따라 세션이 없을 때 CSRF 검사에서 `403`이 먼저 반환될 수 있습니다. |
| `403 Forbidden` | 회원가입을 마치지 않은 계정이 요청하거나 CSRF 토큰이 없거나 맞지 않음 |

## 로컬에서 확인하기

1. 프론트엔드(`http://localhost:5173`)에서 Google 로그인과 회원가입을 완료합니다.
2. `GET /api/me`로 현재 이름·국적·관심 지역을 확인합니다.
3. 같은 세션에서 `GET /api/csrf`를 호출합니다. 예를 들어 응답이 `{ "headerName": "X-CSRF-TOKEN", "token": "..." }`이면 수정 요청에 `X-CSRF-TOKEN` 헤더를 추가합니다.
4. 같은 `JSESSIONID` 쿠키와 CSRF 헤더로 `PUT /api/me`에 새 값을 보냅니다.
5. `200` 응답과 다시 조회한 `GET /api/me`의 값이 일치하는지 확인합니다. `email`은 이전과 같아야 합니다.

브라우저 UI에서는 로그인 후 헤더의 **회원정보 수정** 버튼을 눌러 모달에서 수정할 수 있습니다. 모달은 이메일을 읽기 전용으로 표시합니다.
