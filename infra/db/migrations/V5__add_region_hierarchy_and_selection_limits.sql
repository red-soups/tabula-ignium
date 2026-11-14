-- ============================================
-- 1. USER NATIONALITY VALIDATION
-- ============================================

-- 신규·수정 사용자부터 ISO 3166-1 alpha-2 형식과 필수 입력을 적용한다.
-- NOT VALID는 기존 데이터에 NULL 또는 잘못된 값이 있어도 마이그레이션을
-- 중단하지 않으면서 이후 INSERT/UPDATE에는 제약을 적용한다.
ALTER TABLE users
    ADD CONSTRAINT ck_users_nationality_code_required
        CHECK (nationality_code IS NOT NULL) NOT VALID,
    ADD CONSTRAINT ck_users_nationality_code_format
        CHECK (nationality_code ~ '^[A-Z]{2}$') NOT VALID;


-- ============================================
-- 2. REGION HIERARCHY
-- ============================================

ALTER TABLE regions
    ADD COLUMN parent_region_id BIGINT,
    ADD COLUMN region_level SMALLINT;

ALTER TABLE regions
    ADD CONSTRAINT fk_regions_parent
        FOREIGN KEY (parent_region_id)
        REFERENCES regions(id)
        ON DELETE RESTRICT
        NOT VALID,
    ADD CONSTRAINT ck_regions_level_range
        CHECK (region_level BETWEEN 0 AND 2) NOT VALID,
    ADD CONSTRAINT ck_regions_parent_by_level
        CHECK (
            (region_level = 0 AND parent_region_id IS NULL)
            OR
            (region_level IN (1, 2) AND parent_region_id IS NOT NULL)
        ) NOT VALID,
    ADD CONSTRAINT ck_regions_level_required
        CHECK (region_level IS NOT NULL) NOT VALID;

-- 0 → 1 → 2단계 드롭다운 조회용 인덱스
CREATE INDEX idx_regions_parent_region_id
    ON regions (parent_region_id);

CREATE INDEX idx_regions_country_level
    ON regions (country_code, region_level);

-- 부모 지역은 같은 국가이며 정확히 한 단계 상위여야 한다.
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
-- 3. USER INTERESTED REGION LIMIT
-- ============================================

CREATE FUNCTION enforce_user_interested_regions_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.user_id = OLD.user_id THEN
        RETURN NEW;
    END IF;

    -- 동일 사용자의 동시 요청도 합계 5개를 넘지 않도록 직렬화한다.
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
-- 4. PROJECT REGION LIMIT
-- ============================================

CREATE FUNCTION enforce_project_regions_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.project_id = OLD.project_id THEN
        RETURN NEW;
    END IF;

    -- 동일 프로젝트의 동시 요청도 합계 5개를 넘지 않도록 직렬화한다.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('project_regions:' || NEW.project_id::TEXT, 0)
    );

    IF (
        SELECT COUNT(*)
          FROM project_regions
         WHERE project_id = NEW.project_id
    ) >= 5 THEN
        RAISE EXCEPTION 'A project can register up to 5 regions'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_regions_limit
    BEFORE INSERT OR UPDATE OF project_id
    ON project_regions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_regions_limit();
