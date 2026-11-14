# 인수인계: 데이터 · 달력 지표 담당 (AI 어시스턴트용 브리프)

이 문서는 Tabula Ignium 팀의 **데이터·달력 지표 담당** 팀원과, 그 팀원을 돕는 AI 어시스턴트가 읽고 바로 작업을 시작할 수 있도록 쓴 것입니다.
모델 쪽(규칙 모델·LightGBM·판정)은 강영한(GitHub `YounghanKang`)이 맡고 있습니다. 이 문서의 범위 밖 파일은 고치지 말고, 필요하면 PR 설명이나 메시지로 제안해 주세요.

---

## 1. 프로젝트 배경

- **대회:** NASA Space Apps Challenge 2026, 챌린지 *Harmonization of MODIS and VIIRS Hot Spots*
  (https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)
- **요구 사항:** 위성 화재 핫스팟 기록은 센서별(MODIS 2000년~, 1 km / VIIRS 2012년~, 375 m)로 나뉘어 있고 서로 직접 비교할 수 없다.
  이를 **조화(harmonize)** 해서, 사용자가 고른 지역의 **화재 활동 달력**(과거 패턴, 이상 상황, 위험 시기)을 보여주는 웹앱을 만든다.
- **우리 접근:** 격자 칸 × 월마다 "VIIRS 관측 → MODIS 기준 탐지 수"로 환산하는 모델을 만든다.
  - 두 센서가 겹치는 2012년 이후로 학습하고, 2000년부터 현재까지 하나의 기준(MODIS 기준)으로 잇는다.
  - 규칙 기반 모델과 LightGBM을 **결과를 보기 전에 정한 기준**으로 비교해서 하나를 고른다.
- **팀:** Red Soups (4명). 저장소 https://github.com/red-soups/tabula-ignium (비공개, Organization `red-soups`). 모델은 `apps/model`. 2026-11-14 전 기록은 red-soups/firescope
- **웹앱:** https://firescope-theta.vercel.app (three.js 지구본 + NASA FIRMS 실시간 데이터)

### 지금까지 결과 (FIRMS 최근 7일 샘플, 지역 블록 5회 반복 시험)

| 모델 | 달력 합계 오차 (평균 ± 표준편차) | 칸 R² (log) |
| --- | --- | --- |
| LightGBM (Poisson) | 30.1 ± 9.2 | 0.33 |
| 규칙 (대륙·위도대·계절) | 34.6 ± 11.7 | 0.17 |
| 규칙 (위도대·계절) | 36.7 ± 13.2 | 0.14 |
| 기준선 (위도대 × 월 비율) | 37.2 ± 13.1 | 0.10 |

7일치라 연습용입니다. **실제 과거 데이터로 다시 돌려야 최종 결정을 할 수 있고, 그 데이터를 만드는 것이 이 역할의 핵심입니다.**

---

## 2. 맡은 일

| # | 작업 | 산출물 | 우선순위 |
| --- | --- | --- | --- |
| 1 | FIRMS 과거 데이터 요청·다운로드 | `apps/model/data/raw/archive/...` CSV | **최우선 (오늘)** |
| 2 | 격자 표에 MODIS Terra/Aqua 분리 열 추가 | `fsml/aggregate.py` 수정 | 높음 |
| 3 | 실제 데이터로 0.5° × 월 격자 표 만들기 | `apps/model/data/processed/grid_0.5_month.parquet` | 높음 |
| 4 | 토지 피복(MCD12C1)을 칸별 `landcover` 열로 붙이기 | `fsml/landcover.py` (새 파일) + 스크립트 | 높음 |
| 5 | 달력 지표 함수 두 개 | `fsml/evaluate.py`에 함수 추가 | 중간 |
| 6 | 실제 데이터로 탐색 노트북(01) 실행, 발표용 그림 | `apps/model/exports/figures/*.png` | 중간 |

데이터가 오기 전에도 2·4·5번 코드는 **7일 샘플로 먼저 만들고 시험할 수 있습니다** (아래 "환경 설정" 참고).

### 작업 1. FIRMS 과거 데이터 요청 (사람이 직접 해야 함)

계정 로그인과 이메일 확인이 필요해서 AI가 대신할 수 없습니다. 팀원이 직접 요청하세요.

- FIRMS Archive Download: https://firms.modaps.eosdis.nasa.gov/download/
  - **MODIS Collection 6.1**: 2000-11-01 ~ 가장 최근
  - **VIIRS S-NPP 375 m**: 2012-01-20 ~ 가장 최근 (NOAA-20·21은 이번 학습에 쓰지 않음)
  - 형식 **CSV**, 범위 **전 세계**
- 처리 후 다운로드 링크가 옵니다. 받은 파일 위치:
  ```
  apps/model/data/raw/archive/modis/*.csv
  apps/model/data/raw/archive/viirs_snpp/*.csv
  ```
- 과거(확정) 데이터에는 `type` 열이 있습니다 (0 식생 화재, 1 화산, 2 기타 고정 열원, 3 해상). 집계는 기본으로 `type 0`만 씁니다.
- 원본 CSV는 합쳐서 약 30 GB 안팎으로 예상됩니다. `apps/model/data/`는 git에서 제외되어 있으니 **절대 커밋하지 마세요.**

### 작업 2. MODIS Terra/Aqua 분리 열

- **이유:** VIIRS S-NPP(오후 1:30 관측)와 짝이 가장 깔끔한 건 Aqua(오후 1:30)입니다. Terra는 오전 10:30에 관측합니다. 모델 쪽에서 "Aqua 기준으로 맞출지, Terra+Aqua 합계로 맞출지"를 비교하려면 둘을 따로 세야 합니다.
- **할 일:** MODIS의 `satellite` 열(`T`/`Terra`, `A`/`Aqua`)로 탐지 수를 나눈 **`modis_n_terra`, `modis_n_aqua`** 열을 격자 표에 추가합니다.
  - 다른 탐지 수 열과 같은 규칙을 따릅니다. 센서 운영 기간 안이면 0 이상(없으면 0), 운영 기간 밖이면 NULL.
  - VIIRS에는 이 열을 만들지 않아도 됩니다.
- **지켜야 할 것:** 기존 열 이름과 의미를 바꾸지 마세요. `rules.py`, `features.py`, 노트북이 그 열들을 씁니다.

### 작업 3. 실제 격자 표 만들기

```bash
cd ml && .venv/bin/python scripts/aggregate.py --modis "data/raw/archive/modis/*.csv" --viirs "data/raw/archive/viirs_snpp/*.csv" --res 0.5 --period month
```

- 결과: `apps/model/data/processed/grid_0.5_month.parquet`. 이 파일이 있으면 모든 노트북이 7일 샘플 대신 이걸 씁니다.
- 끝나면 강영한에게 알려 주세요: 행 수, 기간(시작~끝), 두 센서의 운영 기간, 걸린 시간.

### 작업 4. 토지 피복 (`landcover` 열)

- **데이터:** MODIS 토지 피복 **MCD12C1** (0.05° 격자, 연 단위, IGBP 분류).
  - LP DAAC에서 받습니다. NASA Earthdata 로그인이 필요해서 다운로드는 사람이 해야 합니다.
  - 제가 알기로 IGBP 분류 층 이름은 `Majority_Land_Cover_Type_1`입니다. 파일을 열어 실제 이름을 꼭 확인하세요.
  - 원본은 HDF4 형식입니다. Mac에서 HDF4 읽기가 번거로우면, AppEEARS로 GeoTIFF를 받는 방법도 있습니다.
- **만들 것:** `fsml/landcover.py`
  - 0.05° 화소를 0.5° 칸(`row`, `col`은 `fsml/aggregate.py`와 같은 방식)으로 묶어, 물(water)을 뺀 화소 중 **가장 많은 IGBP 클래스**를 칸의 값으로 정합니다.
  - 결과를 `apps/model/data/processed/landcover_0.5.parquet`(`row`, `col`, `landcover`)로 저장하는 스크립트를 `scripts/`에 둡니다.
  - 격자 표에 붙이는 함수 `attach_landcover(grid: pd.DataFrame, path) -> pd.DataFrame`을 만듭니다.
- **열 이름은 정확히 `landcover`(정수 IGBP 코드)로 해 주세요.** `features.py`와 `rules.py`가 이 이름의 열이 있으면 자동으로 씁니다.
- **연도:** 처음엔 대표 연도 하나(예: 2015)로 시작하고, 어느 해를 썼는지 README에 적어 주세요. 해마다 맞추는 건 나중에 생각합니다.
- **IGBP 코드를 묶을지:** 17개 클래스 그대로 쓰면 규칙 모델 그룹이 너무 잘게 쪼개질 수 있습니다. 숲 / 사바나 / 초원·관목 / 농경지 / 기타 정도로 묶은 열(`landcover_group`)도 함께 제안해 주세요.

### 작업 5. 달력 지표 함수

판정 노트북(`05_decision`)의 TODO인 "화재 시즌 정점 월"과 "이상 판정 일치율"을 잴 함수입니다. 강영한이 이 함수들을 `compare.py`에 연결하니, **아래 모양(시그니처)을 지켜 주세요.**

```python
def season_peak_error(df: pd.DataFrame, pred_col: str, by: list[str]) -> dict[str, float]:
    """지역(by) × 연도마다 실제 MODIS(`modis_n`)와 예측(`pred_col`)의 정점 월을 비교.

    반환: {"mean_abs_months": 평균 정점 월 차이 (12월과 1월은 1개월 차이로 계산),
           "within_1_month": 차이가 1개월 이내인 비율, "n": 비교한 지역-연도 수}
    """

def anomaly_agreement(df: pd.DataFrame, pred_col: str, by: list[str],
                      baseline_years: tuple[int, int], z: float = 1.0) -> dict[str, float]:
    """평년(baseline_years)보다 심한 달을 실제와 예측이 똑같이 잡는지.

    평년값: 지역 × 달(1~12월)마다 baseline_years의 **실제 MODIS** 평균·표준편차.
    이상 판정: 값 > 평균 + z × 표준편차. 예측도 같은 평년값과 비교한다
    (실제 서비스에서 앞으로의 환산값을 과거 MODIS 평년과 비교하는 상황과 같다).
    반환: {"precision", "recall", "f1", "n_anomalies_true", "n"}
    """
```

- `df`에는 `period`, `modis_n`, `pred_col`, 그리고 `by`에 적힌 열이 있습니다. 지역 열 예시: `fsml.splits.block_id(df)`로 만든 10° 블록.
- 연도가 모자라면(평년을 못 만들면) 예외 대신 `NaN`과 `n=0`을 돌려 주세요. 7일 샘플에서도 노트북이 멈추면 안 됩니다.
- 가능하면 작은 가짜 데이터로 직접 확인하는 예시를 함께 남겨 주세요. 예: 정점이 3월과 4월이면 1개월 차이

### 작업 6. 탐색 노트북과 발표 그림

- 실제 격자 표로 `notebooks/01_explore.ipynb`를 실행합니다.
- 발표에 쓸 그림 2~3장을 `apps/model/exports/figures/`에 PNG로 저장합니다. 이 폴더는 git에서 제외되니, 팀 공유 드라이브에 따로 올리세요.
  - 같은 칸에서 VIIRS vs MODIS 탐지 수 산점도
  - 위도대(또는 토지 유형)별 MODIS ÷ VIIRS 비율
  - 연도별 전 세계 합계: 2012년 전후로 두 센서가 어떻게 다른지

---

## 3. 환경 설정

```bash
git clone https://github.com/red-soups/tabula-ignium.git && cd tabula-ignium/apps/model
brew install libomp            # macOS만 해당. LightGBM에 필요
python3 -m venv .venv && .venv/bin/pip install -e .
.venv/bin/python scripts/fetch_sample.py   # 최근 7일 샘플 (약 42 MB) → data/processed/grid_0.5_day_sample.parquet
.venv/bin/jupyter lab
```

코드 구조와 격자 표의 열 설명은 `apps/model/README.md`에 있습니다. 먼저 읽어 주세요.

### 격자 표 형식 (주고받는 약속)

| 열 | 뜻 |
| --- | --- |
| `row`, `col`, `lat`, `lon` | 0.5° 칸. `row = floor((90 - lat) / res)`, `col = floor((lon + 180) / res)`, lat/lon은 칸 중심 |
| `period` | 기간 시작일 (월 단위면 매월 1일) |
| `modis_*`, `viirs_*` | 센서별 통계. 아래 열이 센서마다 있음 |
| `*_n`, `*_frp_sum` | 탐지 수, FRP 합 (운영 기간 안이면 0 이상, 밖이면 NULL) |
| `*_n_day`, `*_n_night` | 낮·밤 탐지 수 |
| `*_n_{day,night}_f{0..3}` | FRP 구간(<2, 2–5, 5–20, ≥20 MW)별 낮·밤 탐지 수 |
| `*_frp_mean`, `*_frp_p90`, `*_day_frac` | FRP 평균, 상위 10%, 낮 관측 비율 |
| **(추가 예정)** `modis_n_terra`, `modis_n_aqua` | 작업 2 |
| **(추가 예정)** `landcover` (+ `landcover_group`) | 작업 4 |

---

## 4. 작업 규칙

- **고쳐도 되는 파일:** `fsml/aggregate.py`, `fsml/landcover.py`(새 파일), `fsml/evaluate.py`(달력 지표 부분), `scripts/`, `notebooks/01_explore.ipynb`, `apps/model/README.md`의 데이터 관련 부분
- **고치지 말 것 (강영한 담당):** `fsml/rules.py`, `fsml/gbm.py`, `fsml/features.py`, `fsml/compare.py`, `fsml/export.py`, `fsml/baseline.py`, `fsml/splits.py`, 노트북 02~05.
  바꿔야 할 것 같으면 PR 설명이나 메시지로 제안해 주세요.
- **기존 열은 이름·의미를 바꾸지 않고 추가만 합니다.**
- **브랜치와 PR:** `feat/ml-data-<내용>` 브랜치에서 작업하고 `main`으로 PR을 올립니다. 리뷰는 강영한이 합니다.
- **커밋 메시지:** 한국어, 첫 줄은 `model: <무엇을 했는지>` 형식 (폴더를 옮기기 전 커밋은 `ml/:`)
- **노트북은 실행 결과를 지우고 커밋합니다:**
  ```bash
  .venv/bin/jupyter nbconvert --clear-output --inplace notebooks/01_explore.ipynb
  ```
- **데이터·모델·결과 파일은 커밋하지 않습니다.** `apps/model/.gitignore`가 `data/`, `models/`, `exports/`, `.venv/`를 제외합니다.
- **PR을 올리기 전 확인:** 7일 샘플로 노트북 01~05가 모두 끝까지 실행되는지 봅니다.
  ```bash
  for nb in notebooks/0*.ipynb; do .venv/bin/jupyter nbconvert --to notebook --execute --output-dir /tmp/nbcheck "$nb" || echo "FAIL $nb"; done
  ```
- **출처 표기:** 새로 쓰는 데이터(MCD12C1 등)는 `apps/model/README.md`와 루트 `README.md`의 출처 목록에 추가합니다.

---

## 5. 완료 기준

- [ ] 과거 데이터 요청 완료, 파일을 정해진 경로에 배치
- [ ] `modis_n_terra`, `modis_n_aqua` 열 추가. 둘을 더하면 `modis_n`과 같음
- [ ] `grid_0.5_month.parquet` 생성. 행 수·기간·소요 시간을 공유
- [ ] `landcover`(+ `landcover_group`) 열을 붙이는 함수와 스크립트. 사용한 연도를 README에 적음
- [ ] `season_peak_error`, `anomaly_agreement`가 위 시그니처대로 동작. 연도가 모자라면 `NaN` 반환
- [ ] 실제 데이터로 01 노트북 실행, 발표용 그림 2~3장 공유
- [ ] 노트북 01~05가 7일 샘플로 모두 실행되는 상태에서 PR

---

## 6. 2차 요청 (2026-11-10, PR 리뷰 결과와 다음 할 일)

먼저 최신 `main`을 받아 이 절을 읽어 주세요. 1차 작업 이후 `main`에서 바뀐 것이 많습니다.

### 6-1. 그동안 `main`에서 바뀐 것

| 무엇 | 내용 |
| --- | --- |
| 과거 데이터 | **강영한이 받아 둠.** FIRMS "국가별 연도 파일"은 로그인 없이 받을 수 있습니다: `https://firms.modaps.eosdis.nasa.gov/data/country/zips/modis_<연도>_all_countries.zip` (2000~2025, 26개, 1.9 GB), `viirs-snpp_<연도>_all_countries.zip` (2012~2025, 14개, 5.0 GB). 압축을 풀면 약 29 GB이고, 위치는 `apps/model/data/raw/archive/modis/<연도>/*.csv`, `apps/model/data/raw/archive/viirs_snpp/<연도>/*.csv` |
| 월 격자 표 | **PR 브랜치 코드로 만듦.** `grid_0.5_month.parquet`: 5,152,123칸-월, 2000-11 ~ 2025-12, 집계 91초(최대 메모리 약 21 GB). Terra+Aqua 합 일치, Aqua NULL은 2002-07 전까지, VIIRS NULL은 2012-01 전까지로 모두 정상. 파일은 강영한이 공유 드라이브에 올립니다 |
| 최종 모델 | 실제 데이터 판정에서 LightGBM(단조 제약 + Tweedie) 채택. 2020~2024년 시험에서 최강 규칙 모델 대비 합계 오차 33.3% 개선, 5년 모두 승리 |
| MODIS 신뢰 기간 | 노트북 07: Terra 궤도 변화로 2025년 Terra ÷ VIIRS가 평년의 0.74배. 그래서 `fsml/features.py`의 `MODIS_RELIABLE_UNTIL = "2024-12-01"`까지만 정답으로 씁니다(`training_rows`) |
| 결과 파일 | `exports/harmonized.parquet`에 `source` 열 추가: `modis`(2002-07~2024-12 실제), `terra_scaled`(~2002-06, Terra만 있던 시기를 10° 블록 × 월별 비율로 보정), `viirs_model`(2025~, VIIRS 환산) |
| **화재 활동 지수** | 새 모듈 `fsml/activity.py`. 달력에는 탐지 수 대신 이 지수를 보여 줍니다. 지역 × 월 합계를 같은 달의 평년(2003~2023년)과 비교한 백분위(0~100)이고, 5단계로 나누며 **백분위 90 이상이 "이상"**입니다. 불 없는 달 0 채우기 포함. 노트북 08 검증(2020~2024, 10° 지역): AI 환산 지수가 실제 MODIS 지수와 단계 일치 67%, 이상 F1 0.67로, 단순 비율(0.47)이나 VIIRS 자체 백분위(0.54)보다 좋음. 순위는 정수로 반올림한 탐지 수로 매김 |
| 2012-01 | VIIRS가 1월 20일부터라 모델 쪽에서 `drop_partial_periods`로 뺍니다. `aggregate.py`는 그대로 둬도 됩니다 |

### 6-2. PR 리뷰 결과 (`feat/ml-data-terra-aqua-landcover-calendar`)

**통과:** 테스트 14개 통과, 실제 7일 샘플(2026-10-21~27)로 노트북 01~05 끝까지 실행, 기존 열이 main과 완전히 같음,
Terra + Aqua = `modis_n`(모든 칸), 05 판정 결과도 그대로. **Aqua 발사 전 NULL 판단은 맞습니다**(위성이 없으면 NULL, 봤는데 불이 없으면 0).

**고칠 것 1 (필수): 달력 지표가 불 없는 달을 빠뜨림**

격자에는 불이 난 칸-월만 행이 있습니다. 그런데 `_monthly`가 행이 없는 달을 "관측 안 함"으로 보고 있습니다.

| 경우 | 지금 결과 | 0을 채운 결과 |
| --- | --- | --- |
| 6~9월에만 불나는 지역, 8년치 → `season_peak_error` | `n=0` (6개월 기준에 걸려 통째로 빠짐) | 8개 연도 비교 |
| 8년 중 3년만 5월에 불 (0, 0, 10, 0, 12, 0, 0, 80) → `anomaly_agreement` 평년 평균 | 34 (불 난 해만으로 계산) | 12.75 |

- 고치는 법: 집계를 `fsml.activity.monthly_totals(df, cols, region)`로 바꾸면 됩니다(main에 있음). 지역마다 첫 달~마지막 달을 모두 깔고 행이 없는 달을 0으로 채우며, 센서가 꺼진 기간은 NULL로 둡니다.
- 지역 열이 여러 개(`by`)면 하나로 합친 열을 만들어 넘겨 주세요.
- **위 두 경우를 테스트로 추가해 주세요.**

**고칠 것 2 (필수): 최신 `main` 합치기**

`git pull origin main`. `apps/model/README.md`에서 충돌이 날 수 있습니다. 데이터 관련 절은 다경 님 내용을, 모델 결과(05~08)와 할 일 목록은 `main` 내용을 남겨 주세요.

**고칠 것 3: README의 과거 데이터 받는 법**

"FIRMS Archive Download에서 요청" 대신 위 6-1의 국가별 연도 파일로 바꿔 주세요. 파일이 연도 폴더 안에 있으니
집계 명령의 경로는 `--modis "data/raw/archive/modis/**/*.csv" --viirs "data/raw/archive/viirs_snpp/**/*.csv"`입니다(스크립트가 `**`를 지원함).

**정의 맞추기: `anomaly_agreement`의 이상 기준**

지금은 "평균 + z × 표준편차"인데, 달력에 보여 줄 지수는 "평년 백분위 90 이상"입니다. 화면과 평가가 같은 정의를 쓰도록
`method="percentile"` 옵션을 추가하고 `fsml.activity.percentile`을 재사용해 주세요. 기존 z 방식은 옵션으로 남겨도 됩니다.
`season_peak_error`는 그대로 유효합니다.

**병합 때 강영한이 할 것:** 제안한 `pyproject.toml` 의존성(pytest 등) 추가.

### 6-3. 다음 할 일

| # | 작업 | 산출물 | 우선순위 |
| --- | --- | --- | --- |
| 1 | 위 고칠 것 1~3과 정의 맞추기 → PR 갱신 | PR | **최우선** |
| 2 | MCD12C1 2015 파일 받기(Earthdata 무료 계정, 사람이 직접) → `landcover` 붙이기 | `landcover_0.5.parquet`, 격자 갱신 | 중간 |
| 3 | 실제 월 격자로 01 실행 → 발표 그림 (노트북 08의 달력 예시와 같은 색: 낮음 파랑 · 보통 회색 · 높음 빨강) | `exports/figures/*.png` | 중간 |

- 달력 지표를 시험 연도 예측(노트북 08)에 연결하는 건 강영한이 합니다. 1번에서 함수만 고쳐 주세요.
- **고쳐도 되는 파일**은 4절과 같습니다. 새로 생긴 `fsml/activity.py`, `fsml/export.py`, 노트북 06~08은 강영한 담당이라, 바꿀 게 있으면 제안해 주세요.
