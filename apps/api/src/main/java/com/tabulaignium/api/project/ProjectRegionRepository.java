package com.tabulaignium.api.project;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface ProjectRegionRepository extends JpaRepository<ProjectRegion, ProjectRegionId> {

    List<ProjectRegion> findByIdProjectId(Long projectId);

    void deleteByIdProjectId(Long projectId);
}
