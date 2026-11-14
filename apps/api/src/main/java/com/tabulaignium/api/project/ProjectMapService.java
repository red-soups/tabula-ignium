package com.tabulaignium.api.project;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class ProjectMapService {

    private final ProjectRepository projects;
    private final ProjectBoundaryMapper boundaries;

    ProjectMapService(ProjectRepository projects, ProjectBoundaryMapper boundaries) {
        this.projects = projects;
        this.boundaries = boundaries;
    }

    @Transactional(readOnly = true)
    ProjectMap find(long userId, long projectId) {
        if (projects.findByIdAndUserId(projectId, userId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found");
        }
        return new ProjectMap(projectId, boundaries.findByProjectId(projectId));
    }

    record ProjectMap(long projectId, List<ProjectBoundaryMapper.BoundaryRow> regions) {
    }
}
