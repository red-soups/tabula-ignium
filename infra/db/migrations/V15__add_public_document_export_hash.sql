ALTER TABLE documents
    ALTER COLUMN user_id DROP NOT NULL,
    ALTER COLUMN created_by DROP NOT NULL,
    ALTER COLUMN updated_by DROP NOT NULL;

ALTER TABLE document_export_histories
    ALTER COLUMN created_by DROP NOT NULL,
    ADD COLUMN access_hash VARCHAR(12);

UPDATE document_export_histories
SET access_hash = UPPER(SUBSTRING(MD5(id::TEXT || created_at::TEXT) FROM 1 FOR 12))
WHERE access_hash IS NULL;

ALTER TABLE document_export_histories
    ALTER COLUMN access_hash SET NOT NULL,
    ADD CONSTRAINT uq_document_export_histories_access_hash UNIQUE (access_hash),
    ADD CONSTRAINT chk_document_export_histories_access_hash
        CHECK (access_hash ~ '^[A-Z0-9]{12}$');

CREATE INDEX idx_document_export_histories_access_hash
    ON document_export_histories (access_hash);

COMMENT ON COLUMN document_export_histories.access_hash IS
    '비로그인 재다운로드에 사용하는 12자리 공개 접근 해시';
