# 지구본 영상 출처

지구본 미리보기와 프로젝트 페이지는 [FireScope 저장소](https://github.com/red-soups/firescope)의 `EarthGlobe` 기반 렌더러와 텍스처 생성 결과를 함께 사용합니다. 두 화면 모두 확대하면 EOX의 Sentinel-2 cloudless 2024 타일을 불러옵니다.

프로젝트 페이지는 프로젝트에 설정된 지역의 좌표 범위로 카메라를 맞춥니다. 미리보기에는 프로젝트 지역 데이터를 연결하지 않고 `src/data/mockFireLocations.ts`의 가상 화재 좌표만 빨간 점으로 표시합니다. 미리보기 확대는 마우스 휠 또는 트랙패드로 조작합니다. 두 화면 모두 경계선과 경계·지명 타일을 표시하지 않습니다.

- `public/textures/earth_day.jpg`: Sentinel-2 cloudless 2024 © EOX IT Services GmbH. Contains modified Copernicus Sentinel data 2024. CC BY-NC-SA 4.0.
- `public/textures/earth_night.jpg`: NASA GIBS VIIRS Black Marble 2016.
- `public/textures/earth_water.jpg`: NASA GIBS OSM Land/Water Map에서 만든 바다 마스크.
- `public/textures/earth_clouds.jpg`: NASA Visible Earth Blue Marble 구름 합성.

낮 영상에는 비상업적 이용 조건이 있으므로 상업 배포 전 별도 사용 허가 또는 대체 영상을 확인해야 합니다. 시연 화재 좌표는 `src/data/mockFireLocations.ts`의 가상 데이터입니다.
