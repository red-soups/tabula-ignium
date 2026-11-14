# 대한민국 지도 데이터

## 지도 배경

- 외부 위성 영상이나 지도 타일을 사용하지 않는다.
- 밝은 단색 배경 위에 DB에서 조회한 행정구역 경계를 SVG로 표시한다.

## 행정 경계

- 정적 지도 JSON 파일은 사용하지 않는다.
- `regions.boundary`에 저장된 PostGIS 경계를 `/api/regions/{regionId}/map`과
  `/api/regions/{parentId}/children/map`으로 조회한다.
- 0단계는 대한민국 외곽선, 1단계는 시·도, 2단계는 시·군·구 표시와 클릭에 사용한다.
- API는 화면 전송량을 줄이기 위해 `ST_SimplifyPreserveTopology`로 경계를 단순화하고
  WGS84 GeoJSON으로 반환한다.
- 선택 결과는 `regionId`, 이름과 경계 범위를 프론트엔드 상태에 보관한다.
