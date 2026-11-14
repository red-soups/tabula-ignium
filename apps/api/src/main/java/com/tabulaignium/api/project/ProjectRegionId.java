package com.tabulaignium.api.project;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serial;
import java.io.Serializable;
import java.util.Objects;

@Embeddable
class ProjectRegionId implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "region_id", nullable = false)
    private Long regionId;

    protected ProjectRegionId() {
    }

    ProjectRegionId(long projectId, long regionId) {
        this.projectId = projectId;
        this.regionId = regionId;
    }

    Long getRegionId() {
        return regionId;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof ProjectRegionId that)) return false;
        return Objects.equals(projectId, that.projectId) && Objects.equals(regionId, that.regionId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(projectId, regionId);
    }
}
