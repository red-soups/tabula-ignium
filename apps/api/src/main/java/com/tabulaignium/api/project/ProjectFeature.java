package com.tabulaignium.api.project;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "project_features")
class ProjectFeature {

    @EmbeddedId
    private ProjectFeatureId id;

    protected ProjectFeature() {
    }

    ProjectFeature(long projectId, long featureId) {
        this.id = new ProjectFeatureId(projectId, featureId);
    }

    Long getFeatureId() {
        return id.getFeatureId();
    }
}
