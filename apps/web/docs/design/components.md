# 산불24 컴포넌트 규격

참고한 구조: 정부24(plus.gov.kr) — 흰 카드, 옅은 회색 바탕, 큰 글자, 단계 표시. 정부 상징·문구·색은 쓰지 않는다.
토큰은 `tokens.json`, 실제 값은 `apps/web/src/styles/theme.css`. 모든 색은 변수로만 쓴다.

```
머리글 (portal-header)
  구성      로고(왼쪽) · 바로가기 버튼(오른쪽: 문서 진위 확인, 처음으로)
  크기      높이 64px (640px 이하 60px), 화면 위에 고정
  토큰      bg surface 96% + blur, 아래 선 border
  a11y      첫 요소로 "본문 바로가기" 링크, 바로가기 버튼은 아이콘 + 글자

경로 표시 (portal-breadcrumb)
  구성      홈 › 산불 이력 확인서 발급 › 현재 단계
  토큰      text-subtle 13px, 현재 위치 text 600
  a11y      <nav aria-label="현재 위치">

카드 (workspace-sidebar, workspace-main)
  토큰      bg surface, border, radius xl(16), shadow card, 안쪽 여백 28px
  배치      960px 이상: 왼쪽 320~400px + 오른쪽 나머지, 그 아래는 한 줄

서비스 타일 (workspace-service)
  변형      primary(초록 바탕), 기본(흰 바탕)
  구성      아이콘 칸 44px · 제목 17px/700 · 설명 13px · 오른쪽 화살표
  상태      hover(바탕 surface-tint, 선 accent-line), focus-visible(2px accent), disabled(투명도 .45)

단계 표시 (workspace-stepper)
  구성      3단계 원 32px + 이름, 사이 선 2px
  상태      현재(accent 채움), 완료(accent 테두리 + 체크), 남음(회색)
  a11y      <ol>, 현재 단계에 aria-current="step"

버튼
  primary   bg accent, 글자 on-accent, 높이 48~52px, radius md(8)
  secondary 흰 바탕 + accent 테두리 (데이터 미리보기, 범위 그리기)
  상태      hover(accent-hover / accent-soft), disabled(bg border, 글자 text-subtle)

입력칸 (select, month, search, text)
  크기      높이 44px (문서 이름 48px), 글자 15px
  토큰      테두리 border-input(3.08:1), focus 테두리 accent + 3px 링
  a11y      모든 칸에 <label>

항목 카드 (workspace-feature-card)
  구성      아이콘 칸 44px · 번호 · 이름 17px · 설명 13px · 오른쪽 위 체크 원 24px
  상태      기본, hover, 선택(bg surface-tint, 테두리 accent 2px, 체크 채움), focus-within(2px accent)
  배치      한 칸 최소 300px 자동 줄바꿈, 설정이 열린 카드는 한 줄 전체

발급 막대 (workspace-document-create)
  구성      선택 개수 · 문서 이름 입력 · 문서 미리보기 버튼
  동작      화면 아래에 붙어 따라옴 (sticky)

대화상자 (fire-preview-modal, document-preview-dialog, public-document-dialog)
  토큰      bg surface, radius xl, shadow pop, 뒤 배경 overlay + blur
  머리      작은 분류(accent 13px) · 제목 22~24px · 닫기 40px
  아래      닫기(secondary) · 적용/다운로드(primary)
```

글자와 바탕 색 20쌍의 대비를 검사해 모두 WCAG AA(본문 4.5:1, 입력칸 테두리 3:1) 이상이다.
