# fsml — MODIS ↔ VIIRS 조화 모델

VIIRS 관측을 "MODIS였다면 잡았을 탐지 수"로 환산해, 2000년부터 지금까지의 화재 기록을
하나의 기준(MODIS 기준)으로 잇는 모델입니다. 결과는 웹앱의 화재 활동 달력에 쓰입니다.

## 폴더 구조

```
apps/model/
├── fsml/                  공용 코드
│   ├── aggregate.py       FIRMS CSV → 격자 칸 × 기간 표 (MODIS·VIIRS 나란히, MODIS Terra/Aqua 분리)
│   ├── landcover.py       MODIS 토지 피복(MCD12C1) → 칸별 `landcover`, `landcover_group`
│   ├── features.py        모델 입력 특징 (VIIRS 통계, 이웃 칸 합, 위도, 계절)
│   ├── splits.py          시간 분할 / 공간(블록) 분할
│   ├── baseline.py        기준선: 위도대 × 월별 비율
│   ├── rules.py           규칙 기반 모듈형 모델 (계수표로 읽을 수 있는 환산)
│   ├── gbm.py             LightGBM 모델 (단조 제약 + Tweedie) 공용 설정·학습
│   ├── compare.py         반복 시험(교차검증)과 AI vs 규칙 판정 기준
│   ├── intervals.py       보정된 오차 범위 (conformalized quantile regression)
│   ├── frp.py             FRP(불 세기) 조화: 같은 모델 구조로 MODIS FRP 합계 맞히기, 결과 표에 FRP 열 붙이기
│   ├── korea.py           한국: 감지점마다 MODIS 기준 가중치, 0.1° × 월 표, 임의 지역(다각형·반경·사각형)의 월별 값과 달력
│   ├── points.py          FIRMS 감지점 → 백엔드 공통 18개 열 (MODIS·VIIRS 같은 열)
│   ├── report.py          산불 이력 확인서: 체크한 항목(A 감지 사실, B 장기 이력, C 신뢰성)을 지역·기간별 JSON으로
│   ├── explain.py         LightGBM 기여도(SHAP)를 규칙 모델의 모듈 단위로 요약
│   ├── evaluate.py        지표, 그래프 (칸 단위 + 달력 합계 단위), 달력 지표(정점 월·이상 판정)
│   ├── export.py          팀에 넘기는 결과 파일 저장 (칸-월마다 더 믿을 수 있는 값 선택, `source` 열)
│   ├── activity.py        화재 활동 지수: 평년(2003~2023) 대비 백분위·5단계 (달력에 보여 줄 값)
│   └── webexport.py       결과 파일 → 웹이 읽는 1° × 월 파일 (형식: packages/shared-schemas)
├── main.py              `extend` (2026~ 이어 붙이기), `frp` (FRP 열 붙이기), `korea` (한국 가중치·0.1° 표), `export-web` (웹 파일 쓰기), `calendar` (상자 하나의 달력, 웹 계산의 기준)
├── scripts/
│   ├── fetch_sample.py    최근 7일 샘플 받기 (MODIS + VIIRS NOAA-20) + 샘플 격자 만들기
│   ├── fetch_firms_api.py 연도 파일 이후 기간(2026~)을 FIRMS API로 받기 (MAP_KEY 필요)
│   ├── export_backend.py  백엔드용 ZIP: 감지점(MODIS·VIIRS 같은 열) + 조화 월별 표 (형식: packages/shared-schemas 3절)
│   ├── build_static_sources.py 고정 열원(화산·플레어·공장) 위치표 → 지구본 NRT 점 거르기용 JSON
│   ├── aggregate.py       FIRMS 과거 데이터 → 격자 표 (`--landcover`로 토지 피복까지)
│   └── build_landcover.py MCD12C1 → 0.5° 칸별 토지 피복 표
├── tests/                 작은 가짜 데이터로 확인하는 테스트 (`.venv/bin/python -m pytest tests -q`)
├── notebooks/
│   ├── 01_explore.ipynb   두 센서 차이 살펴보기
│   ├── 02_baseline.ipynb  기준선 만들고 평가
│   ├── 03_model.ipynb     LightGBM 학습·비교·오차 범위·내보내기
│   ├── 04_rules.ipynb     규칙 모델 적합·계수표·모듈별 효과·LightGBM과 비교
│   ├── 05_decision.ipynb  미리 정한 기준으로 AI vs 규칙 판정 (5회 반복 시험)
│   ├── 06_model_v2.ipynb  LightGBM 개선 실험: 단조 제약·Tweedie·오차 범위 보정·모듈별 기여도
│   ├── 07_reference_satellite.ipynb  기준 위성 비교: MODIS 전체 vs Aqua (Terra 궤도 변화 대응)
│   ├── 08_activity_index.ipynb  화재 활동 지수 정의·검증 (VIIRS 환산 지수 vs 실제 MODIS 지수), 달력 예시
│   ├── 09_noaa20_transfer.ipynb  NOAA-20 대체 검증: NPP로 학습한 모델에 NOAA-20을 넣어도 되나
│   └── 10_frp_model.ipynb FRP 조화: 미리 정한 기준으로 판정, 최종 FRP 모델 저장 (`models/frp/`)
└── data/ models/ exports/ (git에 올리지 않음)
```

## 설치

macOS에서는 LightGBM이 OpenMP 라이브러리를 필요로 합니다.

```bash
brew install libomp
```

```bash
cd ml && python3 -m venv .venv && .venv/bin/pip install -e .
```

테스트(`tests/`)를 돌리려면 `.venv/bin/pip install -e ".[dev]"` 후 `.venv/bin/python -m pytest tests`,
토지 피복 파일을 읽으려면 `.venv/bin/pip install -e ".[landcover]"`를 설치합니다.

노트북 실행:

```bash
cd ml && .venv/bin/jupyter lab
```

## 1) 샘플로 먼저 돌려 보기

```bash
cd apps/model && .venv/bin/python scripts/fetch_sample.py
```

FIRMS 최근 7일치(MODIS + VIIRS S-NPP, 약 42 MB)를 받아 `data/processed/grid_0.5_day_sample.parquet`
(0.5° 격자 × 일 단위)를 만듭니다. 그다음 노트북을 01 → 06 순서로 실행하면 됩니다.
예전에 만든 격자 표에는 낮·밤 / FRP 구간 열이 없으니, 코드를 받은 뒤 한 번 다시 만들어 주세요.
7일로는 계절 패턴을 배울 수 없으니, **코드가 끝까지 도는지 확인하는 용도**입니다.

참고로 2026-10-21~27 샘플(공간 분할, 시험 세트)에서 나온 값입니다:

| 방법 | MAE | 편향 | R² (log) |
| --- | --- | --- | --- |
| LightGBM (Poisson) | 1.24 | -17% | 0.46 |
| 규칙 모델 (6개 모듈) | 1.27 | -34% | 0.33 |
| 기준선 (위도대 × 월 비율) | 1.32 | -27% | 0.26 |
| VIIRS 그대로 | 5.03 | +308% | -1.88 |

시험 세트로 빠진 블록(브라질 등)은 MODIS ÷ VIIRS 비율이 0.25로, 학습 지역(0.17)보다 높습니다.
규칙 모델은 위도대만 알고 있어서 이 지역 차이를 놓쳤고, 위경도·FRP 분포를 보는 LightGBM은 덜 놓쳤습니다.
그래서 규칙 모델의 지역 모듈은 위도대보다 **토지 유형(바이옴)** 기준이 맞아 보입니다.

## AI vs 규칙: 판정 (`05_decision.ipynb`)

"왜 규칙 대신 AI를 썼는가"에 답하는 절차입니다.

1. **결과를 보기 전에 기준을 고정합니다** (`fsml.compare.Criteria`). AI는 아래 3개를 모두 넘어야 채택합니다.
   - 주 지표(**합계 MAE**: 10° 블록 × 기간별 합계 오차)를 최강 규칙 모델보다 평균 **10% 이상** 줄임
   - 반복 시험의 **80% 이상**에서 승리
   - 평균 |편향|이 규칙 모델보다 **5%p 넘게** 커지지 않음
2. 같은 시험을 **5번 반복**합니다. 여러 해 데이터면 최근 5개 연도를 하나씩 시험(그 전 해들로 학습),
   7일 샘플이면 지역 블록을 바꿔 가며 시험합니다.
3. 비교 대상은 **가장 강한 규칙 모델**입니다. 대륙 정보까지 준 규칙 모델도 포함합니다.

7일 샘플 결과 (지역 블록 5회):

| 모델 | 합계 MAE (평균 ± 표준편차) | 칸 R² (log) |
| --- | --- | --- |
| LightGBM | **30.1 ± 9.2** | **0.33** |
| 규칙 (대륙·위도대·계절) | 34.6 ± 11.7 | 0.17 |
| 규칙 (위도대·계절) | 36.7 ± 13.2 | 0.14 |
| 기준선 | 37.2 ± 13.1 | 0.10 |

판정: **AI 채택**. 최강 규칙 모델 대비 합계 오차 평균 11.9% 개선, 5번 중 5번 승리, 평균 |편향| 3.5%p 작음.
다만 개선율이 기준(10%)을 겨우 넘었고 fold 4는 거의 비겼습니다(28.3 vs 29.0). 7일 샘플이라 연습용 판정이었고,
아래 실제 데이터 결과로 확정했습니다.

실제 과거 데이터 결과 (MODIS 신뢰 기간 2012-02 ~ 2024-12, 2020~2024년을 한 해씩 시험하고 그 전 해들로 학습):

| 모델 | 합계 MAE (평균 ± 표준편차) | 칸 R² (log) | 편향 |
| --- | --- | --- | --- |
| LightGBM (단조+Tweedie) | **149.6 ± 49.6** | **0.865** | -0.3% |
| 규칙 (대륙·위도대·계절) | 221.1 ± 52.2 | 0.818 | +0.5% |
| 규칙 (위도대·계절) | 241.4 ± 47.2 | 0.815 | 0.0% |
| 기준선 | 266.6 ± 36.5 | 0.796 | +0.2% |

판정: **AI 채택 (확정)**. 최강 규칙 모델 대비 합계 오차 평균 33.3% 개선, 5년 모두 승리, 평균 |편향| 0.5%p 작음.

- **MODIS 신뢰 기간:** 2021~2025년으로 시험했을 때는 2025년에 모든 모델이 MODIS를 6~10% 많게 예측했습니다.
  Terra 탐지가 줄어(Terra ÷ VIIRS 0.077 → 0.056, Aqua ÷ VIIRS는 그대로) 정답인 MODIS 쪽이 변했기 때문입니다(07).
  그래서 `fsml.features.MODIS_RELIABLE_UNTIL = 2024-12`까지만 학습·시험에 씁니다(`training_rows`). 그때 결과는 153.7 vs 217.4(+30.2%)였습니다.
- 2012-01은 VIIRS가 1월 20일부터라 학습에서 뺍니다(`drop_partial_periods`).

## LightGBM 개선 실험 (`06_model_v2.ipynb`)

실제 과거 데이터, 연도별 5회 반복 시험 결과입니다 (실험 당시 기본은 Poisson, 시험 연도 2021~2025년).

| 변형 | 합계 MAE | 평균 편향 |
| --- | --- | --- |
| LightGBM Tweedie | 152.8 ± 48.0 | -0.2% |
| LightGBM Poisson (이전 기본) | 153.0 ± 47.5 | 0.0% |
| **LightGBM 단조+Tweedie (현재 기본)** | 153.7 ± 49.1 | +0.2% |
| LightGBM 단조 Poisson | 161.2 ± 62.4 | +1.0% |

- 미리 정한 규칙("기본과 비슷하면 단조 제약 버전 우선")대로 **단조+Tweedie를 기본**으로 정했습니다(`fsml/gbm.py`).
  다섯 해 모두 Poisson과 정확도가 거의 같고, "VIIRS 탐지가 늘면 추정도 는다"는 조건을 지킵니다.
  단조 Poisson은 2024년에 크게 틀려 뺐습니다. 7일 샘플에서는 네 변형이 구분되지 않았습니다(29.9~30.3).
- **오차 범위:** 80% 목표에 포함률 81.4%, 평균 폭 13.5건. 보정 폭이 0일 만큼 분위 회귀가 이미 잘 맞았습니다.
  `03_model`의 내보내기는 보정된 구간(`ConformalInterval`)을 씁니다.
- **모듈별 기여도:** FRP 세기 35% › VIIRS 탐지 수 27% › 위치 15% › 주변 칸 7% › FRP 구간 7% › 낮·밤 5% › 계절 4%.
  "두 센서 차이는 불의 크기·세기에 달려 있다"는 선행 연구와 맞습니다. 시험 세트 중 5천 행 표본으로 계산합니다
  (전체와 비중 차이 ±0.002, 전체로 하면 수십 분).

## 기준 위성 비교 (`07_reference_satellite.ipynb`)

2024년부터 Terra 탐지가 줄어서, VIIRS와 같은 오후 13:30에 지나가는 Aqua만 기준으로 삼는 방안을 비교했습니다.
LightGBM으로 연도별 5회 시험했고, 판단 기준은 결과를 보기 전에 정했습니다. 목표값 크기가 달라 오차는 비율로 봅니다.

| 기준 | 상대 합계 오차 | 평균 \|편향\| | 최근 2년 \|편향\| |
| --- | --- | --- | --- |
| **MODIS 전체 (현재)** | **0.109** | **2.6%** | **5.7%** |
| Aqua | 0.117 | 4.2% | 7.0% |
| Terra (참고) | 0.202 | 10.3% | 19.6% |

판정: **MODIS 전체 유지**. Aqua는 기준 2개(상대 오차 5% 이내, 최근 2년 편향 더 작음)를 모두 넘지 못했습니다.

- Terra ÷ VIIRS는 2022년부터 계속 내려가 2025년에는 2012~2023 평균의 0.74배입니다. 궤도 변화로 보입니다.
- Aqua도 해마다 출렁여서(2024년 1.10배) 혼자서는 더 안정적이지 않았습니다. 두 위성을 합치면 출렁임이 일부 상쇄됩니다.
- **달력 주의:** 2025년 실제 MODIS 값은 Terra 감소 때문에 약 9% 낮게 잡혔을 수 있습니다(Aqua ÷ VIIRS는 평년 수준).
  그래서 결과 파일은 2025년부터 VIIRS 환산값을 씁니다(`source = viirs_model`).
- 2002-06까지의 "MODIS 전체"는 Terra 하나뿐이라 2002-07에 탐지 수가 약 3배로 뜁니다. 결과 파일은 이 기간을
  10° 블록 × 월별 (Terra + Aqua) ÷ Terra 비율로 보정합니다(`source = terra_scaled`). 2003~2019년 홀수 해 비율을 짝수 해에
  적용해 보니 블록 합계 오차 중앙값이 2.2%였습니다(위도대 비율 하나로는 10%. 같은 위도대에 아마존과 아프리카가 섞임).

## 화재 활동 지수 (`fsml/activity.py`, `08_activity_index.ipynb`)

달력에는 탐지 수 대신 지역 × 월 합계를 같은 달의 평년(2003~2023년)과 비교한 **백분위(0~100)와 5단계**를 보여 줍니다
(계산법은 아래 "팀에 넘기는 형식"). 보는 사람이 센서별 탐지 수를 비교할 일이 없고, 과제가 요구한 "과거 패턴·이상 상황·위험 시기"가 이 지수 하나로 나옵니다.

**검증:** MODIS가 꺼진 뒤 VIIRS 환산값으로 만든 지수가 실제 MODIS로 만든 지수와 얼마나 같은지 봤습니다.
2020~2024년을 한 해씩 가리고(그 전 해들로 학습한 모델의 예측만 사용), 평년에 불이 난 적 있는 지역-월만 비교했습니다.

| 지수를 만드는 방법 | 10° 지역: 단계 일치 | ±1단계 | 이상 F1 | 2° 지역: 단계 일치 | ±1단계 | 이상 F1 |
| --- | --- | --- | --- | --- | --- | --- |
| **AI 환산 (LightGBM)** | **67.1%** | **95.1%** | **0.669** | **67.1%** | **94.2%** | **0.635** |
| 단순 비율 환산 | 52.5% | 85.3% | 0.474 | 55.9% | 86.8% | 0.483 |
| VIIRS 자체 백분위 (센서별 지표 이어 붙이기) | 51.9% | 91.5% | 0.544 | 49.7% | 89.4% | 0.508 |

- **AI 환산이 다섯 해 모두 가장 좋았습니다**(이상 F1 2020~2024: 0.67, 0.64, 0.56, 0.72, 0.71).
  환산 없이 센서별 백분위를 이어 붙이는 방식보다도 낫습니다. 그래서 "한 눈금으로 맞춘 뒤 지수를 만든다"는 설계를 유지합니다.
- 이상 판정은 재현율(0.72)이 정밀도(0.62)보다 조금 높습니다. 실제보다 "매우 높음"을 약간 더 자주 냅니다.
- 순위를 정수 탐지 수로 매기기 전에는 이상 F1이 0.603이었습니다(아래 "팀에 넘기는 형식" 4번).
- 달력 예시(아마존 남부)에서 2007·2010·2015·2019~2020·2024년 같은 대가뭄 해가 "매우 높음"으로 나옵니다.
- 평년이 2003~2023년으로 고정이라, 산림 벌채가 줄며 불이 꾸준히 줄어든 지역은 최근 해가 "낮음"으로 기웁니다. 평년 대비 지수의 성질입니다.

## NOAA-20 대체 검증 (`09_noaa20_transfer.ipynb`)

모델은 Suomi NPP의 VIIRS로만 학습했습니다. 같은 VIIRS를 단 NOAA-20(JPSS-1, FIRMS 2018-04~)을 **다시 학습하지 않고** 넣어도 되는지,
05와 같은 연도별 시험(2020–2024)으로 확인했습니다. 기준은 실행 전에 정했습니다: NOAA-20 오차 ≤ NPP × 1.10, 규칙 모델보다 5년 중 4년 이상 우세, |편향| 증가 ≤ 5%p.

| 시험 2020–2024 (평균) | 합계 MAE | 편향 |
| --- | --- | --- |
| AI · NPP 입력 | 149.6 | −0.3% |
| **AI · NOAA-20 입력 (학습에 안 씀)** | **118.9** | +1.4% |
| 규칙 (대륙·위도대·계절) · NPP 입력 | 221.1 | +0.5% |

판정: **NOAA-20 대체 가능 (기준 3개 통과)**.

- NOAA-20이 더 좋게 나온 것은 2022·2024년에 NPP 탐지 수가 MODIS의 평소 4.4배에서 2.4~3.2배로 떨어진 달이 있어서입니다(2022-07·08, 2024-07, 2024-11). NPP 자료가 빠진 것으로 보이며 NOAA-20은 정상이었습니다. 나머지 해의 차이는 −6% ~ +11%입니다.
- 화재 활동 지수(10° 지역): 단계 일치 67.1% → 67.4%, 이상 F1 0.669 → 0.684.
- 2025년(최종 모델): 두 입력으로 만든 값의 10° 블록 × 월 상관 0.999, 연 합계 차이 −0.2%.
- 위성 여러 대의 탐지 수는 더하지 않습니다. 같은 VIIRS가 같은 땅을 몇십 분 간격으로 지나가 같은 불을 여러 번 셉니다.

NOAA-20 격자는 `--viirs "data/raw/archive/viirs_noaa20/**/*.csv" --out data/processed/grid_0.5_month_noaa20.parquet`로 만듭니다.
원본은 FIRMS 국가별 연도 파일 `viirs-jpss1_<연도>_all_countries.zip`(2018–2025, 압축 약 2.8 GB)입니다.

## FRP 조화 (`10_frp_model.ipynb`, `fsml/frp.py`)

탐지 수와 같은 모델 구조(특징, Tweedie, 단조 제약)에서 맞힐 대상만 칸 × 월의 **MODIS FRP 합계(MW)** 로 바꿨습니다.
탐지 수는 VIIRS가 MODIS의 약 4.4배지만 FRP 합계는 전 세계로 1.0배 안팎입니다(VIIRS는 같은 불을 작은 화소 여러 개로 나눠 셈).
그래도 칸 × 월로는 VIIRS FRP가 MODIS의 2배 이내인 경우가 54%뿐이라 그대로 쓸 수 없습니다.

기준은 실행 전에 정했습니다(05·09와 같은 연도별 시험 2020–2024, 규칙 모델은 탐지 수 전용이라 비율 기준선과 비교):

| 시험 2020–2024 (평균) | 합계 MAE (MW, 10° 블록 × 월) | 칸 R²(log) | 편향 |
| --- | --- | --- | --- |
| **AI · NPP 입력** | **8,838** | 0.654 | −0.1% |
| AI · NOAA-20 입력 (학습에 안 씀) | 7,446 | 0.646 | +1.8% |
| 비율 기준선 (위도대 × 월) · NPP 입력 | 14,531 | 0.559 | −1.1% |
| VIIRS FRP 그대로 · NPP 입력 | 19,036 | 0.544 | +0.7% |

판정 (`models/frp/decision.json`): **기준 5개 모두 통과**.
- 채택: 합계 오차 39.2% 개선(기준 10%), 5년 중 5년 우세(기준 4년), |편향| 차이 +0.1%p(기준 5%p 이하).
- 2026년(NOAA-20) 적용: NOAA-20 오차 = NPP의 0.84배(기준 1.10배 이하), 기준선보다 5년 모두 우세.
- 80% 범위: 2023–2024 시험 포함률 83.4%(기준 75–85%), 평균 폭 881 MW.
- NOAA-20이 더 좋게 나온 이유는 09와 같습니다(2022·2024년 NPP 자료가 빠진 달).

결과 표에는 `python main.py frp`로 열 5개를 붙입니다(`extend`도 FRP 모델이 있으면 자동으로 붙임):
`modis_frp_sum`, `viirs_frp_sum`(원본 합계), `harmonized_frp`(`modis` 행은 실제 MODIS, `viirs_model` 행은 모델 값,
`terra_scaled` 행은 비움: 격자에 위성별 FRP가 없어 Terra만의 FRP를 보정할 수 없음), `frp_low`, `frp_high`(80% 범위, `viirs_model` 행만).
연 합계로 보면 탐지 1건당 MW가 2019–2024년 41–49, 모델 값인 2025·2026년 45·43으로 이어집니다.
FRP는 MW라서 탐지 수와 더하거나 같은 축에 놓지 않습니다.

## 한국 상세 (`fsml/korea.py`, `main.py korea`)

모델은 0.5° 칸 × 월에서 검증했으므로 다시 학습하지 않고, 0.5° 값을 그 값을 만든 **감지점마다 나눠 줍니다**(가중치 `weight`).
어떤 지역이든(0.1° 칸, 그린 다각형, 사업장 반경) MODIS 기준 값 = 그 안 감지점의 `weight` 합입니다.

| 기간 | 값을 나르는 점 | 점 하나의 가중치 |
| --- | --- | --- |
| 2000-11 ~ 2002-06 (`terra_scaled`) | MODIS(Terra) | 칸의 (Terra + Aqua) ÷ Terra 비율 |
| 2002-07 ~ 2024-12 (`modis`) | MODIS | 1 (실제 MODIS 개수 그대로) |
| 2025-01 ~ (`viirs_model`) | VIIRS (2025 Suomi NPP, 2026 NOAA-20) | 칸의 AI 값 ÷ 칸 안 VIIRS 점 수 (VIIRS 점이 없으면 MODIS 점) |

- 0.5° 칸마다 가중치 합 = 결과 표의 `harmonized` (오차 0, `korea.check`로 매번 확인).
- 나누는 방법 검증 (한국 2013~2024, 실제 MODIS 0.5° 합을 나눠 실제 MODIS 0.1° 값과 비교): VIIRS 점 비율로 나누면
  상관 0.78·오차 0.165, 면적으로 똑같이 나누면 0.32·0.231. 0.2°(약 20 km)로 묶으면 0.87 vs 0.45.
- 0.05°보다 잘게는 나누지 않습니다. MODIS 화소(1~5 km) 위치 오차보다 작아져 의미가 없습니다.
- 범위는 0.5° 칸 범위를 같은 비율로 나눈 근사값이고, FRP는 VIIRS FRP 비율로 나눕니다.
- 상자(33~39°N, 124.5~131°E)에 북한·일본 가장자리가 들어가니 한국 경계로 자릅니다(백엔드).

```bash
.venv/bin/python main.py korea                       # 약 2분 → exports/korea_points.parquet, korea_monthly_0.1deg.parquet
.venv/bin/python scripts/export_backend.py --korea   # → exports/backend/korea/*.zip (형식: packages/shared-schemas 4절)
```

**산불 이력 확인서** (`fsml/report.py`): 지역·기간·체크 항목(A1~C4)을 받아 항목별 값을 JSON으로 돌려줍니다.
형식과 항목표는 `packages/shared-schemas` 5절, 전체 예시는 `packages/shared-schemas/examples/report-uiseong-2025.json`.
```bash
.venv/bin/python main.py report --circle 36.35 128.70 10 --start 2025-03-01 --end 2025-04-30 --items A1,B2,B3
.venv/bin/python main.py serve --port 8001   # 백엔드용: POST /report, GET /items, GET /health (localhost)
```

## 규칙 기반 모델 (`fsml/rules.py`)

`MODIS ≈ Σ(낮·밤) [ Σ(FRP 구간) 계수 × VIIRS 탐지 수 + 이웃 계수 × 이웃 8칸 VIIRS 탐지 수 ]`

| 모듈 | 규칙 |
| --- | --- |
| 1. 고정 열원 제거 | `type 0`만 집계 (aggregate.py) |
| 2. 낮·밤 분리 | 낮과 밤을 따로 환산 |
| 3. 작은 불 보정 | FRP 구간(<2, 2–5, 5–20, ≥20 MW)별 계수 |
| 4. 주변 칸 | VIIRS가 못 본 MODIS 탐지를 이웃 칸 VIIRS 탐지로 설명 |
| 5. 지역·계절 | 위도대 × 계절별 계수 (남반구는 6개월 밀어서 맞춤). `CONTINENT_LEVELS`로 대륙, `LANDCOVER_LEVELS`로 토지 유형(`landcover_group` 열)까지 나눌 수 있음 |
| 6. 희소 그룹 | 데이터가 적은 그룹은 상위 그룹 계수 쪽으로 당김 (`prior_rows`) |

계수는 Poisson 최대우도로 맞춥니다. 계수가 하나면 정확히 `MODIS 합 ÷ VIIRS 합`이고, 학습 기간 합계를 그대로
맞춥니다. 최소제곱으로 맞추면 탐지가 많은 칸에 끌려가 합계가 약 15% 낮게 나와서 바꿨습니다.
`rules.table(0)`, `rules.table(1)`로 계수표를 볼 수 있습니다.

## 2) 실제 과거 데이터로 학습하기

1. FIRMS **국가별 연도 파일**을 받습니다. 로그인·요청 없이 바로 받을 수 있습니다.
   - MODIS C6.1: `https://firms.modaps.eosdis.nasa.gov/data/country/zips/modis_<연도>_all_countries.zip` (2000~2025, 26개, 1.9 GB)
   - VIIRS S-NPP 375 m: `https://firms.modaps.eosdis.nasa.gov/data/country/zips/viirs-snpp_<연도>_all_countries.zip` (2012~2025, 14개, 5.0 GB)
   - 과거(표준 처리) 데이터라 `type` 열이 있습니다. 집계는 기본으로 `type 0`(식생 화재)만 씁니다.
   ```bash
   cd ml && mkdir -p data/raw/archive/zips && cd data/raw/archive
   for y in $(seq 2000 2025); do curl -fL -o zips/modis_$y.zip "https://firms.modaps.eosdis.nasa.gov/data/country/zips/modis_${y}_all_countries.zip"; done
   for y in $(seq 2012 2025); do curl -fL -o zips/viirs_$y.zip "https://firms.modaps.eosdis.nasa.gov/data/country/zips/viirs-snpp_${y}_all_countries.zip"; done
   for y in $(seq 2000 2025); do unzip -q -j -o zips/modis_$y.zip '*.csv' -d modis/$y; done
   for y in $(seq 2012 2025); do unzip -q -j -o zips/viirs_$y.zip '*.csv' -d viirs_snpp/$y; done
   ```
2. 압축을 풀면 약 29 GB이고, 연도 폴더 안에 나라별 CSV가 들어갑니다 (`apps/model/data/`는 git 제외, **커밋 금지**):
   ```
   apps/model/data/raw/archive/modis/<연도>/*.csv
   apps/model/data/raw/archive/viirs_snpp/<연도>/*.csv
   ```
3. 격자 표를 만듭니다 (0.5° × 월):
   ```bash
   cd ml && .venv/bin/python scripts/aggregate.py --modis "data/raw/archive/modis/**/*.csv" --viirs "data/raw/archive/viirs_snpp/**/*.csv" --res 0.5 --period month
   ```
   경로의 `**`는 연도 폴더까지 찾습니다(따옴표 필수). 2025-12까지 기준으로 5,152,123칸-월, 약 91초, 최대 메모리 약 21 GB였습니다.
   결과 `data/processed/grid_0.5_month.parquet` 이 있으면 노트북이 샘플 대신 이걸 씁니다.
   이때는 자동으로 **시간 분할**(MODIS 신뢰 기간(~2024-12) 안에서 마지막 2년 시험, 그 전 해 검증. 지금 데이터로는 2022 검증, 2023–2024 시험)로 평가합니다.
   끝나면 행 수, 두 센서의 운영 기간, `Terra + Aqua == modis_n` 확인 결과, 걸린 시간을 출력합니다.
   토지 피복 표(아래 3)를 먼저 만들었다면 `--landcover`를 붙여 한 번에 붙일 수 있습니다.
4. `notebooks/01_explore.ipynb`를 실행하면 발표용 그림이 `exports/figures/`에 PNG로 저장됩니다
   (git 제외, 팀 공유 드라이브에 올리기).

### 연도 파일 이후 기간 채우기 (2026-01 ~ 오늘)

국가별 연도 파일은 2025년까지라, 그 뒤는 FIRMS Area API로 받습니다 (MODIS + VIIRS NOAA-20).
```bash
cd apps/model
export FIRMS_MAP_KEY=...   # https://firms.modaps.eosdis.nasa.gov/api/map_key/ 에서 이메일로 받는 무료 키. 커밋 금지
.venv/bin/python scripts/fetch_firms_api.py --start 2026-01-01 --end 2026-11-30
.venv/bin/python scripts/aggregate.py --modis "data/raw/api/modis/**/*.csv" \
    --viirs "data/raw/api/viirs_noaa20/**/*.csv" --res 0.5 --period month \
    --out data/processed/grid_0.5_month_2026.parquet
```
- 날짜마다 확정(SP) 데이터가 있으면 SP, 없으면 실시간(NRT)을 받습니다. 하루를 둘 다 받으면 같은 불이 두 번 세어집니다.
- **NRT 파일에는 `type` 열이 없어서**, SP와 같이 집계하면 NRT 행이 `type = 0` 필터에 전부 걸러집니다(NRT 달이 통째로 0).
  그래서 같은 기간 SP의 고정 열원(화산·공장·해상) 위치를 약 1 km 칸으로 모아, NRT 탐지에 `type`을 채웁니다(`type_inferred = 1`).
- 5일씩(API 한도) 받고, 끊겨도 다시 실행하면 이어 받습니다. 받을 수 없는 날이 있으면 끝에 알려 줍니다.
- 마지막 달은 진행 중인 달이라 합계가 평년의 한 달 전체보다 작습니다. 그래서 웹 파일에는 그 달을 `partial`(관측한 날 수)로 적고,
  달력은 "이 속도면 한 달 전체" 값(`projected`)으로 순위를 매깁니다. 관측한 날이 7일 미만이면 웹이 "추정치"로 표시합니다.

그다음 최종 모델로 환산해 결과 파일에 이어 붙이고, 웹 파일을 다시 씁니다:
```bash
.venv/bin/python main.py extend data/processed/grid_0.5_month_2026.parquet --through 2026-11-13
.venv/bin/python main.py export-web
cd ../web && node scripts/check_harmonized.ts   # 웹 계산 = Python 계산 확인
```
- `extend`는 노트북 03의 최종 모델(`models/lgbm_harmonize.txt`)과 같은 80% 범위 모델(`models/interval/`, 없으면 03과 같은 분할로 한 번 맞추고 저장)을 씁니다.
  VIIRS 입력은 NOAA-20입니다(Suomi NPP 실시간 자료는 2026-11-12부터 비어 있고, 노트북 09에서 NOAA-20 입력을 검증).
- 노트북 03이 쓴 원래 결과는 처음 한 번 `exports/harmonized_archive.parquet`로 보관하고, 다시 실행하면 그 위에 새로 붙입니다.
- 노트북 10의 FRP 모델(`models/frp/`)이 있으면 `extend`가 FRP 열도 다시 붙입니다. 처음 한 번은 `main.py frp`로 붙입니다.
- 지구본의 실시간 점(FIRMS 7일 파일)도 `type`이 없어서 가스 플레어·공장이 '화재'로 찍힙니다(점의 약 6%).
  `scripts/build_static_sources.py`로 SP의 고정 열원 위치표(0.01° 칸, 2026 SP 기준 약 2.5만 칸, 255 kB / gzip 77 kB)를
  만들어 웹 Worker에서 거르면 됩니다. 칸 규칙은 `fetch_firms_api.py`와 같습니다.

## 3) 토지 피복 (`landcover` 열)

> 선택 사항입니다. 실제 데이터 판정에서 AI가 채택된 뒤로는 우선순위가 낮습니다(규칙 모델 보강용).

규칙 모델의 지역 모듈을 위도대 대신 **토지 유형(바이옴)** 으로 나누려고 붙입니다.
`landcover_group` 열이 있으면 `rules.py`(`LANDCOVER_LEVELS`), `features.py`, `compare.py`가 자동으로 씁니다.

- **데이터:** MODIS 토지 피복 **MCD12C1 v061** (0.05°, 연 단위, IGBP 분류). LP DAAC에서 받습니다(NASA Earthdata 로그인 필요).
  - 사용 연도: **2015** (대표 연도 하나. 해마다 맞추는 건 나중에 검토). 다른 해를 쓰면 여기를 고쳐 주세요.
  - 층: `Majority_Land_Cover_Type_1` (IGBP). 받은 파일에서 `--list-layers`로 실제 이름을 확인하세요.
- **읽기 도구:** 원본 HDF4는 `pyhdf`, AppEEARS에서 받은 GeoTIFF는 `rasterio`가 필요합니다
  (pip의 rasterio에는 HDF4 드라이버가 없음).
  ```bash
  .venv/bin/pip install pyhdf      # .hdf
  .venv/bin/pip install rasterio   # .tif
  ```
- **만들기:**
  ```bash
  cd ml
  .venv/bin/python scripts/build_landcover.py data/raw/landcover/MCD12C1.A2015001.061.<생성일>.hdf --list-layers
  .venv/bin/python scripts/build_landcover.py data/raw/landcover/MCD12C1.A2015001.061.<생성일>.hdf \
      --attach-to data/processed/grid_0.5_month.parquet
  ```
  `data/processed/landcover_0.5.parquet`(`row`, `col`, `landcover`, `landcover_group`)을 만들고,
  `--attach-to`로 지정한 격자 표에 두 열을 붙여 덮어씁니다. 코드에서는 `fsml.landcover.attach_landcover(grid)`.
- **규칙:** 0.05° 화소 100개(10×10)를 0.5° 칸 하나로 묶고, **물(0)을 뺀** 화소 중 가장 많은 IGBP 클래스를 칸의 값으로 합니다.
  칸 전체가 물이면 0, 동률이면 코드가 작은 클래스. 칸 번호는 `aggregate.py`와 같습니다.
- **`landcover_group`** (규칙 모델 그룹이 너무 잘게 쪼개지지 않도록 묶은 열):

  | 그룹 | IGBP 코드 |
  | --- | --- |
  | `forest` | 1–5 (상록·낙엽 침엽수림/활엽수림, 혼효림) |
  | `savanna` | 8 수목 사바나, 9 사바나 |
  | `grass_shrub` | 6 밀집 관목, 7 개방 관목, 10 초원 |
  | `cropland` | 12 농경지, 14 농경지·자연 식생 혼재 |
  | `other` | 0 물, 11 영구 습지, 13 도시, 15 눈·얼음, 16 나지 |

과거 데이터에는 `type` 열(0 식생 화재, 1 화산, 2 기타 고정 열원, 3 해상)이 있어서,
기본으로 **0(식생 화재)만** 집계합니다. 전부 넣으려면 `--all-types`를 붙이세요.

## 격자 표 (aggregate.py 결과)

| 열 | 뜻 |
| --- | --- |
| `row`, `col`, `lat`, `lon` | 격자 칸 (lat/lon은 칸 중심) |
| `period` | 기간 시작일 (일/주/월) |
| `modis_n`, `viirs_n` | 탐지 수. 센서 운영 기간 안이면 0 이상, 밖이면 비어 있음(NULL) |
| `*_frp_sum`, `*_frp_mean`, `*_frp_p90` | FRP 합계·평균·상위 10% |
| `*_day_frac` | 주간 관측 비율 |
| `*_n_day`, `*_n_night`, `*_n_{day,night}_f{0..3}` | 낮·밤 탐지 수, FRP 구간(<2, 2–5, 5–20, ≥20 MW)별 낮·밤 탐지 수 |
| `modis_n_terra`, `modis_n_aqua` | MODIS 위성별 탐지 수 (`satellite` 열 T/Terra, A/Aqua). 각 위성의 운영 기간(데이터의 첫·마지막 탐지 달) 안이면 0 이상, 밖이면 NULL. `modis_n`이 있는 행에서 `terra.fillna(0) + aqua.fillna(0) == modis_n` |
| `landcover`, `landcover_group` | 토지 피복 (위 3). `--landcover`나 `build_landcover.py --attach-to`로 붙였을 때만 있음 |

**Terra와 Aqua를 나눈 이유:** VIIRS S-NPP와 Aqua는 오후 1:30, Terra는 오전 10:30에 관측합니다.
"Aqua 기준으로 맞출지, Terra + Aqua 합계로 맞출지" 비교하려고 따로 셉니다(01 노트북 4번 그림).
Aqua는 2002년 7월부터 관측했으므로, 그 전 달의 `modis_n_aqua`는 0이 아니라 NULL입니다("불이 없음"과 "위성이 없음"을 구분).
Terra는 2000-11부터 있습니다. 운영 기간은 데이터에서 그 위성의 첫·마지막 탐지 달로 정합니다.

## 달력 지표 (`fsml/evaluate.py`)

| 함수 | 재는 것 |
| --- | --- |
| `season_peak_error(df, pred_col, by)` | 지역 × 연도마다 실제 MODIS와 예측의 화재 시즌 정점 월 차이 (12월↔1월은 1개월). 6개월 이상 관측된 해만 비교 |
| `anomaly_agreement(df, pred_col, by, baseline_years, z)` | 평년(실제 MODIS의 지역 × 달 평균 + z × 표준편차)보다 심한 달을 예측도 똑같이 잡는지 (precision·recall·F1). 평년 연도가 3년 이상인 지역 × 달만 |

`by`에는 보통 `fsml.splits.block_id(df)`로 만든 10° 블록을 씁니다. 비교할 단위가 없으면(7일 샘플 등) 예외 대신 `NaN`, `n=0`을 돌려줍니다.
예시는 `tests/test_calendar_metrics.py`에 있습니다.

두 센서 중 하나라도 탐지가 있는 칸-기간만 들어갑니다(둘 다 0인 칸은 생략).

## 팀에 넘기는 형식

`03_model.ipynb` 마지막 셀이 `exports/harmonized.parquet` 을 만듭니다. 0.5° 칸 × 월, 2000-11부터입니다.

| 열 | 뜻 |
| --- | --- |
| `row`, `col`, `lat`, `lon`, `period` | 칸과 기간 |
| `modis_n`, `viirs_n` | 원본 탐지 수 |
| `predicted` | VIIRS로 예측한 MODIS(Terra + Aqua) 기준 탐지 수 |
| `low`, `high` | 예측의 80% 범위 (10% / 90%) |
| `harmonized` | 달력의 바탕 값 (MODIS 기준 탐지 수). `source`에 따라 고름 |
| `source` | `modis`: 실제 MODIS (2002-07 ~ 2024-12) · `terra_scaled`: Terra만 있던 2000-11 ~ 2002-06, 10° 블록 × 월별 (Terra + Aqua) ÷ Terra 비율로 보정 · `viirs_model`: VIIRS 환산 (2025-01 ~, Terra 궤도 변화로 MODIS를 믿을 수 없는 시기와 MODIS 종료 이후) |
| `modis_frp_sum`, `viirs_frp_sum`, `harmonized_frp`, `frp_low`, `frp_high` | FRP(MW): 원본 합계, MODIS 기준 FRP, 80% 범위 (`main.py frp`, 위 "FRP 조화") |

**달력에는 `harmonized`를 그대로 쓰지 말고 화재 활동 지수로 바꿔 보여 줍니다** (`fsml.activity.activity_index`):

1. 사용자가 고른 영역 안의 칸을 월별로 더합니다. 행이 없는 달은 0입니다 (불이 안 난 칸-월은 행이 없음).
2. 같은 영역, 같은 달의 평년(2003~2023년) 21개 값 중 몇 퍼센트 위치인지 구합니다. 같은 값은 절반으로 셉니다.
3. 5단계로 나눕니다: 매우 낮음 <10 ≤ 낮음 <30 ≤ 보통 <70 ≤ 높음 <90 ≤ **매우 높음(이상)**.
4. **순위는 정수로 반올림한 탐지 수로 매깁니다.** VIIRS 환산값은 0.01건 같은 소수라서, 그대로 비교하면 21년 내내 0이던 달이
   "매우 높음"이 됩니다(2025년 10° 지역에서 "매우 높음"의 28%가 이런 달이었음, 반올림 후 3%).
5. 평년 중앙값(`normal`)이 0인 달은 늘 불이 없는 달이라 흐리게 표시하는 게 좋습니다.

## 데이터 출처

- NASA FIRMS 활성 화재: MODIS Collection 6.1 (MCD14), VIIRS S-NPP 375 m (VNP14IMG), VIIRS NOAA-20 375 m (VJ114IMG, 검증용). NRT 7일 샘플과 과거(표준 처리) 데이터. 퍼블릭 도메인
- MODIS 토지 피복 MCD12C1 v061: Friedl, M., Sulla-Menashe, D. (2022). MODIS/Terra+Aqua Land Cover Type Yearly L3 Global 0.05Deg CMG V061. NASA LP DAAC. https://doi.org/10.5067/MODIS/MCD12C1.061 (사용 연도 2015)

## 다음 할 일

- [x] FIRMS 과거 데이터 → 0.5° × 월 격자 만들기 (2000-11 ~ 2025-12, 515만 칸-월)
- [ ] 토지 피복(MODIS MCD12C1, 0.05°)을 칸별 `landcover` 열로 붙이기 → 규칙 모델 지역 모듈을 바이옴 기준으로
      (코드 준비됨: `scripts/build_landcover.py`. MCD12C1 파일 다운로드 남음)
- [x] 실제 과거 데이터에서 규칙 모델 vs LightGBM 비교 → LightGBM(단조+Tweedie) 채택
- [x] 2024년 이후 Terra 감소 대응: Aqua 기준 비교 → MODIS 전체 유지 (07)
- [x] Terra 감소 이후(2025~)와 Terra만 있던 시기(~2002-06) 처리 → 결과 파일 `source` 열 (VIIRS 환산 / 블록 × 월 보정)
- [x] 화재 활동 지수(평년 대비 백분위·5단계)와 검증 (08)
- [x] FRP(불 세기)도 MODIS 기준으로 조화, 미리 정한 기준 통과 (10)
- [ ] 다경 님 PR 병합 후 달력 지표(`season_peak_error`, `anomaly_agreement`)를 08의 시험 연도 예측에 연결
- [ ] 시간 분할 + 공간 분할 둘 다로 검증 (시간 분할 완료)
- [ ] 결과 형식과 활동 지수 계산을 데이터 엔지니어와 확정, 발표용 검증 그래프 정리
- [ ] (확장) 삼중 비교(Terra·Aqua·VIIRS)로 상황별 연속 가중치 검토
