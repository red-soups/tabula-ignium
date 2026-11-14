-- ============================================
-- 1. REGION HIERARCHY
-- ============================================

ALTER TABLE regions
    ADD COLUMN parent_region_id BIGINT,
    ADD COLUMN region_level SMALLINT;

ALTER TABLE regions
    ADD CONSTRAINT fk_regions_parent
        FOREIGN KEY (parent_region_id)
        REFERENCES regions(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT ck_regions_level_range
        CHECK (region_level BETWEEN 0 AND 2),
    ADD CONSTRAINT ck_regions_parent_by_level
        CHECK (
            (region_level = 0 AND parent_region_id IS NULL)
            OR
            (region_level IN (1, 2) AND parent_region_id IS NOT NULL)
        );

CREATE INDEX idx_regions_parent_region_id
    ON regions (parent_region_id);

CREATE INDEX idx_regions_country_level
    ON regions (country_code, region_level);


-- ============================================
-- 2. LOAD SOUTH KOREAN ADM0 / ADM1 / ADM2
-- ============================================

-- GeoJSON 원본을 DB 컨테이너의 /region-data에 읽기 전용으로 마운트한다.
-- 경계가 Polygon인 경우에도 regions.boundary 타입에 맞게 MultiPolygon으로 정규화한다.
CREATE TEMP TABLE korean_region_source (
    region_code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    region_type VARCHAR(30) NOT NULL,
    region_level SMALLINT NOT NULL,
    boundary GEOMETRY(MULTIPOLYGON, 4326) NOT NULL
) ON COMMIT DROP;

WITH features AS (
    SELECT jsonb_array_elements(
        pg_read_file('/region-data/adm0.geojson')::JSONB -> 'features'
    ) AS feature
)
INSERT INTO korean_region_source (
    region_code,
    name,
    region_type,
    region_level,
    boundary
)
SELECT
    'ADM0:' || (feature -> 'properties' ->> 'shapeGroup'),
    feature -> 'properties' ->> 'shapeName',
    feature -> 'properties' ->> 'shapeType',
    0,
    ST_Multi(
        ST_CollectionExtract(
            ST_MakeValid(
                ST_SetSRID(ST_GeomFromGeoJSON(feature -> 'geometry'), 4326)
            ),
            3
        )
    )::GEOMETRY(MULTIPOLYGON, 4326)
FROM features
WHERE feature -> 'properties' ->> 'shapeGroup' = 'KOR';

WITH features AS (
    SELECT jsonb_array_elements(
        pg_read_file('/region-data/adm1.geojson')::JSONB -> 'features'
    ) AS feature
)
INSERT INTO korean_region_source (
    region_code,
    name,
    region_type,
    region_level,
    boundary
)
SELECT
    'ADM1:KOR:' || (feature -> 'properties' ->> 'shapeID'),
    feature -> 'properties' ->> 'shapeName',
    feature -> 'properties' ->> 'shapeType',
    1,
    ST_Multi(
        ST_CollectionExtract(
            ST_MakeValid(
                ST_SetSRID(ST_GeomFromGeoJSON(feature -> 'geometry'), 4326)
            ),
            3
        )
    )::GEOMETRY(MULTIPOLYGON, 4326)
FROM features
WHERE feature -> 'properties' ->> 'shapeGroup' = 'KOR';

WITH features AS (
    SELECT jsonb_array_elements(
        pg_read_file('/region-data/adm2.geojson')::JSONB -> 'features'
    ) AS feature
)
INSERT INTO korean_region_source (
    region_code,
    name,
    region_type,
    region_level,
    boundary
)
SELECT
    'ADM2:KOR:' || (feature -> 'properties' ->> 'shapeID'),
    feature -> 'properties' ->> 'shapeName',
    feature -> 'properties' ->> 'shapeType',
    2,
    ST_Multi(
        ST_CollectionExtract(
            ST_MakeValid(
                ST_SetSRID(ST_GeomFromGeoJSON(feature -> 'geometry'), 4326)
            ),
            3
        )
    )::GEOMETRY(MULTIPOLYGON, 4326)
FROM features
WHERE feature -> 'properties' ->> 'shapeGroup' = 'KOR';

-- ADM0: 대한민국
INSERT INTO regions (
    region_code,
    name,
    country_code,
    region_type,
    boundary,
    parent_region_id,
    region_level
)
SELECT
    region_code,
    name,
    'KR',
    region_type,
    boundary,
    NULL,
    0
FROM korean_region_source
WHERE region_level = 0;

-- ADM1: 17개 시·도는 대한민국을 부모로 연결한다.
INSERT INTO regions (
    region_code,
    name,
    country_code,
    region_type,
    boundary,
    parent_region_id,
    region_level
)
SELECT
    source.region_code,
    source.name,
    'KR',
    source.region_type,
    source.boundary,
    country.id,
    1
FROM korean_region_source source
CROSS JOIN regions country
WHERE source.region_level = 1
  AND country.region_code = 'ADM0:KOR';

-- ADM2: 내부점이 포함되는 ADM1을 부모로 사용한다. 경계 오차가 있으면
-- 가장 넓게 겹치는 ADM1을 선택한다.
INSERT INTO regions (
    region_code,
    name,
    country_code,
    region_type,
    boundary,
    parent_region_id,
    region_level
)
SELECT
    source.region_code,
    source.name,
    'KR',
    source.region_type,
    source.boundary,
    parent.id,
    2
FROM korean_region_source source
JOIN LATERAL (
    SELECT candidate.id
    FROM regions candidate
    WHERE candidate.country_code = 'KR'
      AND candidate.region_level = 1
    ORDER BY
        ST_Covers(candidate.boundary, ST_PointOnSurface(source.boundary)) DESC,
        ST_Intersects(candidate.boundary, source.boundary) DESC,
        CASE
            WHEN ST_Intersects(candidate.boundary, source.boundary)
            THEN ST_Area(ST_Intersection(candidate.boundary, source.boundary))
            ELSE 0
        END DESC,
        ST_Distance(candidate.boundary, source.boundary) ASC,
        candidate.id
    LIMIT 1
) parent ON TRUE
WHERE source.region_level = 2;

ALTER TABLE regions
    ALTER COLUMN region_level SET NOT NULL;


-- ============================================
-- 3. REGION HIERARCHY VALIDATION
-- ============================================

CREATE FUNCTION validate_region_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    parent_level SMALLINT;
    parent_country_code VARCHAR(2);
BEGIN
    IF NEW.region_level = 0 THEN
        RETURN NEW;
    END IF;

    SELECT region_level, country_code
      INTO parent_level, parent_country_code
      FROM regions
     WHERE id = NEW.parent_region_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent region % does not exist', NEW.parent_region_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF parent_level IS DISTINCT FROM NEW.region_level - 1 THEN
        RAISE EXCEPTION 'Region level % requires a parent at level %',
            NEW.region_level, NEW.region_level - 1
            USING ERRCODE = 'check_violation';
    END IF;

    IF parent_country_code IS DISTINCT FROM NEW.country_code THEN
        RAISE EXCEPTION 'Region and parent region must use the same country code'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_regions_validate_hierarchy
    BEFORE INSERT OR UPDATE OF parent_region_id, region_level, country_code
    ON regions
    FOR EACH ROW
    EXECUTE FUNCTION validate_region_hierarchy();


-- ============================================
-- 4. USER INTERESTED REGION LIMIT
-- ============================================

CREATE FUNCTION enforce_user_interested_regions_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.user_id = OLD.user_id THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('user_interested_regions:' || NEW.user_id::TEXT, 0)
    );

    IF (
        SELECT COUNT(*)
          FROM user_interested_regions
         WHERE user_id = NEW.user_id
    ) >= 5 THEN
        RAISE EXCEPTION 'A user can register up to 5 interested regions'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_interested_regions_limit
    BEFORE INSERT OR UPDATE OF user_id
    ON user_interested_regions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_user_interested_regions_limit();


-- ============================================
-- 5. IMPORT VALIDATION
-- ============================================

DO $$
DECLARE
    adm0_count INTEGER;
    adm1_count INTEGER;
    adm2_count INTEGER;
BEGIN
    SELECT COUNT(*) FILTER (WHERE region_level = 0),
           COUNT(*) FILTER (WHERE region_level = 1),
           COUNT(*) FILTER (WHERE region_level = 2)
      INTO adm0_count, adm1_count, adm2_count
      FROM regions
     WHERE country_code = 'KR';

    IF adm0_count <> 1 OR adm1_count <> 17 OR adm2_count <> 228 THEN
        RAISE EXCEPTION
            'Korean region import failed: ADM0 %, ADM1 %, ADM2 %',
            adm0_count, adm1_count, adm2_count;
    END IF;
END;
$$;

ANALYZE regions;
