-- ============================================
-- V7: Import ADM2 regions
-- ============================================
-- staging.adm2_raw 데이터를 2단계(군·구) 지역으로 가져온다.
-- ADM2 원본에는 부모 코드가 없으므로 공간 포함 관계로 ADM1 부모를 찾는다.

-- 1. ADM2 원본 정규화
CREATE TEMP TABLE tmp_adm2_source
ON COMMIT DROP
AS
SELECT
    normalized.ogc_fid,
    normalized.shapeid,
    normalized.shapegroup,
    normalized.name,
    normalized.country_code,
    normalized.region_type,
    normalized.boundary
FROM (
    SELECT
        source.ogc_fid,
        source.shapeid,
        source.shapegroup,
        source.shapename AS name,
        country.iso2 AS country_code,
        COALESCE(source.shapetype, 'ADM2') AS region_type,
        ST_Multi(
            ST_CollectionExtract(
                ST_MakeValid(source.geom),
                3
            )
        )::GEOMETRY(MULTIPOLYGON, 4326) AS boundary
    FROM staging.adm2_raw source
    INNER JOIN staging.iso3_iso2 country
        ON country.iso3 = source.shapegroup
    WHERE source.geom IS NOT NULL
      AND NOT ST_IsEmpty(source.geom)
      AND source.shapeid IS NOT NULL
      AND source.shapename IS NOT NULL
) normalized
WHERE NOT ST_IsEmpty(normalized.boundary);


-- 2. ADM2 내부점이 포함되는 ADM1 부모를 우선 탐색
CREATE TEMP TABLE tmp_adm2_mapped
ON COMMIT DROP
AS
WITH direct_parent AS (
    SELECT DISTINCT ON (source.ogc_fid)
        source.ogc_fid,
        source.shapeid,
        source.shapegroup,
        source.name,
        source.country_code,
        source.region_type,
        source.boundary,
        parent.id AS parent_region_id
    FROM tmp_adm2_source source
    INNER JOIN public.regions parent
        ON parent.country_code = source.country_code
       AND parent.region_level = 1
       AND parent.boundary IS NOT NULL
       AND ST_Covers(
            parent.boundary,
            ST_PointOnSurface(source.boundary)
       )
    ORDER BY source.ogc_fid, parent.id
),
unmatched AS (
    SELECT source.*
    FROM tmp_adm2_source source
    LEFT JOIN direct_parent mapped
        ON mapped.ogc_fid = source.ogc_fid
    WHERE mapped.ogc_fid IS NULL
),
fallback_parent AS (
    -- 내부점이 ADM1에 포함되지 않는 경계 오차 데이터는
    -- 가장 많이 겹치는 동일 국가 ADM1을 부모로 사용한다.
    SELECT
        source.ogc_fid,
        source.shapeid,
        source.shapegroup,
        source.name,
        source.country_code,
        source.region_type,
        source.boundary,
        parent.id AS parent_region_id
    FROM unmatched source
    INNER JOIN LATERAL (
        SELECT candidate.id
        FROM public.regions candidate
        WHERE candidate.country_code = source.country_code
          AND candidate.region_level = 1
          AND candidate.boundary IS NOT NULL
        ORDER BY
            ST_Area(
                ST_Intersection(
                    candidate.boundary,
                    source.boundary
                )
            ) DESC,
            ST_Distance(
                candidate.boundary,
                source.boundary
            ) ASC,
            candidate.id
        LIMIT 1
    ) parent
        ON TRUE
)
SELECT * FROM direct_parent

UNION ALL

SELECT * FROM fallback_parent;


-- 3. 부모를 찾지 못한 ADM2가 있으면 마이그레이션 중단
DO $$
DECLARE
    source_count BIGINT;
    mapped_count BIGINT;
BEGIN
    SELECT COUNT(*)
      INTO source_count
      FROM tmp_adm2_source;

    SELECT COUNT(*)
      INTO mapped_count
      FROM tmp_adm2_mapped;

    IF source_count <> mapped_count THEN
        RAISE EXCEPTION
            'ADM2 parent mapping failed: source %, mapped %',
            source_count,
            mapped_count;
    END IF;
END;
$$;


-- 4. ADM2를 regions에 등록
INSERT INTO public.regions (
    region_code,
    name,
    country_code,
    region_type,
    boundary,
    parent_region_id,
    region_level
)
SELECT
    'ADM2:' || mapped.shapegroup || ':' || mapped.shapeid,
    mapped.name,
    mapped.country_code,
    mapped.region_type,
    mapped.boundary,
    mapped.parent_region_id,
    2
FROM tmp_adm2_mapped mapped
ON CONFLICT (region_code)
DO UPDATE SET
    name = EXCLUDED.name,
    country_code = EXCLUDED.country_code,
    region_type = EXCLUDED.region_type,
    boundary = EXCLUDED.boundary,
    parent_region_id = EXCLUDED.parent_region_id,
    region_level = EXCLUDED.region_level;


-- 5. 등록 결과 검증
DO $$
DECLARE
    missing_count BIGINT;
BEGIN
    SELECT COUNT(*)
      INTO missing_count
      FROM tmp_adm2_mapped mapped
      LEFT JOIN public.regions region
        ON region.region_code =
           'ADM2:' || mapped.shapegroup || ':' || mapped.shapeid
       AND region.region_level = 2
       AND region.parent_region_id = mapped.parent_region_id
     WHERE region.id IS NULL;

    IF missing_count > 0 THEN
        RAISE EXCEPTION
            'ADM2 import validation failed: % rows missing',
            missing_count;
    END IF;
END;
$$;


-- 6. 통계 정보 갱신
ANALYZE public.regions;