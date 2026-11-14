# 대한민국 지도 데이터

## 위성 영상

- 지도 바탕은 EOX의 **EOxCloudless 2016/2017** WMTS를 브라우저에서 현재 보이는 범위에 한해 불러온다.
- 타일 주소: `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84/{z}/{y}/{x}.jpg`
- [EOX 이용 안내](https://cloudless.eox.at/documentation/faq)에 따르면 이 연도 영상은 CC BY 4.0이며, 출처 표시를 조건으로 상업용 앱의 배경 지도에도 사용할 수 있다. 공개 타일 서버에는 공정 사용 기준이 적용되고 가용성 보장은 없다.
- 지도 화면에 `EOxCloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)`와 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 링크를 표시한다. 향후 지도 영상이 문서에 포함된다면 문서에도 출처를 표시해야 한다.
- 2018년 이후 EOxCloudless 공개 타일은 이용 조건이 다르므로 연도만 바꾸어 연결하지 않는다.

## 행정 경계

- `src/data/koreaMap.json`은 [geoBoundaries gbOpen 대한민국 ADM0](https://www.geoboundaries.org/api/current/gbOpen/KOR/ADM0/) 및 [ADM1](https://www.geoboundaries.org/api/current/gbOpen/KOR/ADM1/)의 단순화 GeoJSON에서 국가 1개와 시도 17개의 도형을 합친 정적 파일이다. 지도 렌더링에 필요한 이름과 단계만 남기고 좌표를 소수점 셋째 자리로 반올림했다.
- 위 두 자료의 메타데이터에는 원본 라이선스가 `Public Domain`으로 명시되어 있다. 지도 화면에는 geoBoundaries 출처 링크를 표시한다.
- 행정 경계는 지도 표시용이다. 사용자가 선택한 직사각형은 프론트엔드 state에서 `west`, `south`, `east`, `north` 좌표로 관리하며, 이후 API 요청에 사용할 수 있다.
