-- GeoJSON 경계의 미세한 겹침 때문에 인접 도로 잘못 연결된 광역시·특별시의
-- ADM2 부모를 행정구역 기준으로 바로잡는다.
WITH corrections(child_name, current_parent, target_parent) AS (VALUES
    ('Eunpyeong-gu', 'Gyeonggi', 'Seoul'),
    ('Gangdong-gu', 'Gyeonggi', 'Seoul'),
    ('Ganghwa-gun', 'Gyeonggi', 'Incheon'),
    ('Gyeyang-gu', 'Gyeonggi', 'Incheon'),
    ('Ongjin-gun', 'Gyeonggi', 'Incheon'),
    ('Buk-gu [North Distrikt]', 'South Gyeongsang', 'Busan'),
    ('Gangseo-gu', 'South Gyeongsang', 'Busan'),
    ('Gijang-gun', 'South Gyeongsang', 'Busan'),
    ('Dong-gu', 'South Chungcheong', 'Daejeon'),
    ('Dong-gu [East District]', 'South Jeolla', 'Gwangju'),
    ('Gwangsan-gu', 'South Jeolla', 'Gwangju'),
    ('Nam-gu [South District]', 'South Jeolla', 'Gwangju'),
    ('Seo-gu [West District]', 'South Jeolla', 'Gwangju'),
    ('Sejong-si', 'North Chungcheong', 'Sejong'),
    ('Dalseong-gun', 'North Gyeongsang', 'Daegu'),
    ('Gunwi-gun', 'North Gyeongsang', 'Daegu'),
    ('Uljin-gun', 'Gangwon', 'North Gyeongsang')
), resolved AS (
    SELECT child.id AS child_id, target.id AS target_id
    FROM corrections correction
    JOIN regions current ON current.name = correction.current_parent AND current.region_level = 1
    JOIN regions child ON child.name = correction.child_name
                      AND child.parent_region_id = current.id
                      AND child.region_level = 2
    JOIN regions target ON target.name = correction.target_parent AND target.region_level = 1
)
UPDATE regions child
SET parent_region_id = resolved.target_id
FROM resolved
WHERE child.id = resolved.child_id;

DO $$
DECLARE
    incorrect_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO incorrect_count
    FROM regions child
    JOIN regions parent ON parent.id = child.parent_region_id
    WHERE (child.name IN ('Eunpyeong-gu', 'Gangdong-gu') AND parent.name <> 'Seoul')
       OR (child.name IN ('Ganghwa-gun', 'Gyeyang-gu', 'Ongjin-gun') AND parent.name <> 'Incheon')
       OR (child.name = 'Sejong-si' AND parent.name <> 'Sejong')
       OR (child.name = 'Uljin-gun' AND parent.name <> 'North Gyeongsang');

    IF incorrect_count <> 0 THEN
        RAISE EXCEPTION 'Metropolitan region parent correction failed';
    END IF;
END $$;
