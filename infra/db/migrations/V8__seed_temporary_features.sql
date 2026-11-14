-- 프로젝트 기능 API가 연결되기 전 사용할 임시 기능 1~10을 등록한다.
INSERT INTO features (id, code, name, description, is_active)
VALUES
    (1, 'feature-1', '기능 1', '임시 프로젝트 기능 1', TRUE),
    (2, 'feature-2', '기능 2', '임시 프로젝트 기능 2', TRUE),
    (3, 'feature-3', '기능 3', '임시 프로젝트 기능 3', TRUE),
    (4, 'feature-4', '기능 4', '임시 프로젝트 기능 4', TRUE),
    (5, 'feature-5', '기능 5', '임시 프로젝트 기능 5', TRUE),
    (6, 'feature-6', '기능 6', '임시 프로젝트 기능 6', TRUE),
    (7, 'feature-7', '기능 7', '임시 프로젝트 기능 7', TRUE),
    (8, 'feature-8', '기능 8', '임시 프로젝트 기능 8', TRUE),
    (9, 'feature-9', '기능 9', '임시 프로젝트 기능 9', TRUE),
    (10, 'feature-10', '기능 10', '임시 프로젝트 기능 10', TRUE)
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

SELECT setval(
    pg_get_serial_sequence('features', 'id'),
    GREATEST((SELECT MAX(id) FROM features), 1),
    TRUE
);
