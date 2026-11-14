package com.tabulaignium.api.project;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface ProjectFeatureRepository extends JpaRepository<ProjectFeature, ProjectFeatureId> {

    List<ProjectFeature> findByIdProjectId(Long projectId);

    void deleteByIdProjectId(Long projectId);
}
