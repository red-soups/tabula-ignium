-- ============================================
-- 1. FIRE_POINTS
-- ============================================

CREATE TABLE fire_points (
    sensor TEXT,
    satellite TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    acq_date DATE,
    acq_time_utc CHAR(4),
    confidence TEXT,
    confidence_level TEXT,
    frp REAL,
    daynight CHAR(1),
    bright_fire REAL,
    bright_bg REAL,
    scan REAL,
    track REAL,
    version TEXT,
    type SMALLINT,
    type_inferred SMALLINT,
    data_source TEXT,

    -- 적재 후 월별 격자 데이터와 조인하기 위해 채운다.
    cell_row SMALLINT,
    cell_col SMALLINT,
    period CHAR(7)
);


-- ============================================
-- 2. FIRE_HARMONIZED_MONTHLY
-- ============================================

CREATE TABLE fire_harmonized_monthly (
    cell_row SMALLINT,
    cell_col SMALLINT,
    latitude REAL,
    longitude REAL,
    period CHAR(7),
    modis_n INTEGER,
    viirs_n INTEGER,
    harmonized DOUBLE PRECISION,
    low DOUBLE PRECISION,
    high DOUBLE PRECISION,
    source TEXT,
    days_observed SMALLINT
);
