package com.tabulaignium.api.project;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serial;
import java.io.Serializable;
import java.util.Objects;

@Embeddable
class ProjectFeatureId implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "feature_id", nullable = false)
    private Long featureId;

    protected ProjectFeatureId() {
    }

    ProjectFeatureId(long projectId, long featureId) {
        this.projectId = projectId;
        this.featureId = featureId;
    }

    Long getFeatureId() {
        return featureId;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof ProjectFeatureId that)) return false;
        return Objects.equals(projectId, that.projectId) && Objects.equals(featureId, that.featureId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(projectId, featureId);
    }
}
