INSERT INTO features (
    code,
    name,
    description,
    is_active
)
VALUES
    (
        'FIRE_SUMMARY',
        '화재 관측 요약',
        '선택한 행정구역의 관측 건수, 최근 관측일, 관측일 수와 FRP 요약을 제공합니다.',
        TRUE
    ),
    (
        'FIRE_LOCATION_MAP',
        '화재 관측 위치',
        '선택한 행정구역의 화재 관측 위치를 FRP 강도와 함께 지도에 표시합니다.',
        TRUE
    ),
    (
        'MONTHLY_FIRE_TREND',
        '월별 관측 추이',
        '선택한 행정구역의 월별 관측 건수와 FRP 추이를 제공합니다.',
        TRUE
    ),
    (
        'CONFIDENCE_ANALYSIS',
        '관측 신뢰도',
        '선택한 행정구역의 high, nominal, low 신뢰도별 관측 분포를 제공합니다.',
        TRUE
    );
