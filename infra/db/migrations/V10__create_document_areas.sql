CREATE TABLE document_areas (
    document_id BIGINT PRIMARY KEY,
    west DOUBLE PRECISION NOT NULL,
    south DOUBLE PRECISION NOT NULL,
    east DOUBLE PRECISION NOT NULL,
    north DOUBLE PRECISION NOT NULL,
    boundary GEOMETRY(POLYGON, 4326)
        GENERATED ALWAYS AS (ST_MakeEnvelope(west, south, east, north, 4326)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_document_areas_document
        FOREIGN KEY (document_id)
        REFERENCES documents(id)
        ON DELETE CASCADE,
    CONSTRAINT chk_document_areas_longitude
        CHECK (west >= -180 AND east <= 180 AND west < east),
    CONSTRAINT chk_document_areas_latitude
        CHECK (south >= -90 AND north <= 90 AND south < north)
);

CREATE INDEX idx_document_areas_boundary
    ON document_areas USING GIST (boundary);

COMMENT ON TABLE document_areas IS '사용자가 지도에서 직접 지정한 문서 분석 사각 범위';
COMMENT ON TABLE document_regions IS '행정구역 기반 문서 범위(레거시). 신규 문서는 document_areas 사용';
