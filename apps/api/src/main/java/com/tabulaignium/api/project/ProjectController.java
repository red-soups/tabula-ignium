package com.tabulaignium.api.project;

import com.tabulaignium.api.auth.GoogleOidcUserService.AccountPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/projects")
class ProjectController {

    private final ProjectService projects;
    private final ProjectMapService projectMaps;

    ProjectController(ProjectService projects, ProjectMapService projectMaps) {
        this.projects = projects;
        this.projectMaps = projectMaps;
    }

    @GetMapping
    ResponseEntity<List<ProjectService.ProjectView>> projects(
            @AuthenticationPrincipal AccountPrincipal principal) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(projects.findAll(principal.userId()));
    }

    @PostMapping
    ResponseEntity<ProjectService.ProjectView> create(
            @AuthenticationPrincipal AccountPrincipal principal,
            @Valid @RequestBody CreateProjectRequest request) {
        var project = projects.create(principal.userId(), request.name(), request.description(),
                request.regionIds(), request.featureIds());
        return ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(project);
    }

    @GetMapping("/{projectId}")
    ResponseEntity<ProjectService.ProjectView> project(
            @AuthenticationPrincipal AccountPrincipal principal,
            @PathVariable @Positive Long projectId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(projects.findOne(principal.userId(), projectId));
    }

    @GetMapping("/{projectId}/map")
    ResponseEntity<ProjectMapService.ProjectMap> map(
            @AuthenticationPrincipal AccountPrincipal principal,
            @PathVariable @Positive Long projectId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(projectMaps.find(principal.userId(), projectId));
    }

    @PutMapping("/{projectId}")
    ResponseEntity<ProjectService.ProjectView> update(
            @AuthenticationPrincipal AccountPrincipal principal,
            @PathVariable @Positive Long projectId,
            @Valid @RequestBody CreateProjectRequest request) {
        var project = projects.update(principal.userId(), projectId, request.name(),
                request.description(), request.regionIds(), request.featureIds());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(project);
    }

    @DeleteMapping("/{projectId}")
    ResponseEntity<Void> delete(
            @AuthenticationPrincipal AccountPrincipal principal,
            @PathVariable @Positive Long projectId) {
        projects.delete(principal.userId(), projectId);
        return ResponseEntity.noContent().build();
    }

    record CreateProjectRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 5000) String description,
            @NotEmpty @Size(max = 5) List<@NotNull @Positive Long> regionIds,
            @NotEmpty @Size(max = 10) List<@NotNull @Positive Long> featureIds) {
    }
}
