INSERT INTO features (code, name, description, is_active)
VALUES
    (
        'FIRE_INTENSITY',
        '화재 강도 등급',
        'FRP를 약함, 보통, 강함, 매우 강함으로 구분해 관측 분포와 평균 강도를 제공합니다.',
        TRUE
    ),
    (
        'DAY_NIGHT_COMPARISON',
        '주·야간 화재 비교',
        '주간과 야간의 화재 관측 건수, 비율, 평균 및 최대 FRP를 비교합니다.',
        TRUE
    ),
    (
        'PERIOD_COMPARISON',
        '이전 기간 비교',
        '선택 기간과 바로 이전의 동일한 길이 기간을 비교해 관측 건수와 평균 FRP 증감률을 제공합니다.',
        TRUE
    ),
    (
        'FIRE_HOTSPOTS',
        '화재 집중 구역',
        '선택 범위를 격자로 나누어 화재 관측이 집중된 상위 5개 구역을 제공합니다.',
        TRUE
    )
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();
