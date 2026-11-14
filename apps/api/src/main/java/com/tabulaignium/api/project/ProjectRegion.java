package com.tabulaignium.api.project;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "project_regions")
class ProjectRegion {

    @EmbeddedId
    private ProjectRegionId id;

    protected ProjectRegion() {
    }

    ProjectRegion(long projectId, long regionId) {
        this.id = new ProjectRegionId(projectId, regionId);
    }

    Long getRegionId() {
        return id.getRegionId();
    }
}
