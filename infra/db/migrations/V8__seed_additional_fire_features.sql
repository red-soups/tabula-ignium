INSERT INTO features (
    code,
    name,
    description,
    is_active
)
VALUES
    (
        'YEARLY_FIRE_TREND',
        '연도별 화재 추이',
        '센서 교체 영향을 보정한 연도별 화재 관측 추이와 FRP 변화를 제공합니다.',
        TRUE
    ),
    (
        'LARGE_FIRE_FREQUENCY',
        '큰 산불 발생 빈도',
        '평년보다 관측 강도가 크게 높았던 시기와 반복 빈도를 제공합니다.',
        TRUE
    ),
    (
        'HIGH_RISK_SEASON',
        '고위험 시기',
        '과거 월별 분포를 기준으로 산불 관측 위험이 높은 시기를 제공합니다.',
        TRUE
    ),
    (
        'NEAREST_FIRE',
        '가장 가까운 화재',
        '선택 지역 중심에서 가장 가까운 화재 관측과 거리별 관측 건수를 제공합니다.',
        TRUE
    );
