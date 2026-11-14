-- ============================================
-- V6: Prepare Global Region Data Import
-- ============================================

-- 1. 원본 데이터 적재용 스키마
CREATE SCHEMA IF NOT EXISTS staging;

-- 2. ISO3 → ISO2 국가 코드 변환 테이블
CREATE TABLE IF NOT EXISTS staging.iso3_iso2 (
    iso3 VARCHAR(3) PRIMARY KEY,
    iso2 VARCHAR(2) NOT NULL
);

-- 3. 코소보 특수 코드
INSERT INTO staging.iso3_iso2 (iso3, iso2)
VALUES ('XKX', 'XK')
ON CONFLICT (iso3)
DO UPDATE SET iso2 = EXCLUDED.iso2;

-- 4. regions 공간 인덱스
CREATE INDEX IF NOT EXISTS idx_regions_boundary_gist
ON public.regions
USING GIST (boundary);