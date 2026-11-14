# 프로젝트 페이지 지도 API

프로젝트 페이지는 로그인한 사용자가 소유한 프로젝트의 설정과 선택 지역의 좌표 범위를 읽습니다. 두 요청은 `GET`이며 CSRF 토큰은 필요하지 않습니다. 프로젝트가 없거나 다른 사용자의 프로젝트이면 `404`를 반환합니다. 로그인 세션이 없으면 `401`을 반환합니다.

## `GET /api/projects/{projectId}`

프로젝트의 이름, 설명, 설정 지역, 설정 기능, 수정 시각을 반환합니다. 기존 `GET /api/projects`의 한 항목과 같은 형식입니다.

```json
{
  "id": 1,
  "name": "한반도 관측",
  "description": "선택 지역 관측",
  "regions": [{ "id": 76904, "name": "Buk-gu [North Distrikt]" }],
  "features": [{ "id": 1, "name": "기능 1" }],
  "updatedAt": "2026-11-14T09:00:00Z"
}
```

## `GET /api/projects/{projectId}/map`

프로젝트에 설정된 지역의 PostGIS 경계에서 외접 좌표 범위를 계산하여 반환합니다. 지구본에는 경계선을 그리지 않고 이 범위가 화면에 들어오도록 카메라를 이동·확대합니다.

```json
{
  "projectId": 1,
  "regions": [{
    "id": 76904,
    "name": "Buk-gu [North Distrikt]",
    "level": 2,
    "west": 128.4,
    "east": 128.7,
    "south": 35.8,
    "north": 36.0
  }]
}
```

`west`, `east`, `south`, `north`는 경계 외접 상자의 경도·위도입니다. 프론트엔드는 화면의 가로·세로 비율을 고려해 확대 수준을 계산하고, 화면 크기가 바뀌면 다시 맞춥니다. `level`은 국가 0, 시·도 1, 군·구 2입니다.

프로젝트 소유권 확인과 프로젝트 기본 정보는 JPA로 처리하고, 좌표 범위 조회는 MyBatis·PostGIS로 처리합니다. 경계 원본은 기존 `regions.boundary`를 사용하므로 별도 지도용 마이그레이션은 없습니다.
