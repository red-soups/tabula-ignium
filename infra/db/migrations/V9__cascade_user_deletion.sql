-- V9__cascade_user_deletion.sql

ALTER TABLE projects
    DROP CONSTRAINT fk_projects_user,
    DROP CONSTRAINT fk_projects_created_by,
    DROP CONSTRAINT fk_projects_updated_by;

ALTER TABLE projects
    ADD CONSTRAINT fk_projects_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    ADD CONSTRAINT fk_projects_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE CASCADE,

    ADD CONSTRAINT fk_projects_updated_by
        FOREIGN KEY (updated_by)
        REFERENCES users(id)
        ON DELETE CASCADE;

ALTER TABLE excel_export_histories
    DROP CONSTRAINT fk_excel_export_histories_user;

ALTER TABLE excel_export_histories
    ADD CONSTRAINT fk_excel_export_histories_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;