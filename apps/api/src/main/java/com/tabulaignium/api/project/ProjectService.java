package com.tabulaignium.api.project;

import com.tabulaignium.api.region.Region;
import com.tabulaignium.api.region.RegionRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class ProjectService {

    private final ProjectRepository projects;
    private final ProjectRegionRepository projectRegions;
    private final ProjectFeatureRepository projectFeatures;
    private final RegionRepository regions;
    private final FeatureRepository features;

    ProjectService(ProjectRepository projects, ProjectRegionRepository projectRegions,
            ProjectFeatureRepository projectFeatures, RegionRepository regions,
            FeatureRepository features) {
        this.projects = projects;
        this.projectRegions = projectRegions;
        this.projectFeatures = projectFeatures;
        this.regions = regions;
        this.features = features;
    }

    @Transactional(readOnly = true)
    List<ProjectView> findAll(long userId) {
        return projects.findByUserIdOrderByUpdatedAtDesc(userId).stream()
                .map(this::toView)
                .toList();
    }

    @Transactional
    ProjectView create(long userId, String name, String description,
            List<Long> regionIds, List<Long> featureIds) {
        var selection = validateSelection(regionIds, featureIds);

        Project project = projects.save(new Project(userId, name.strip(), normalizeDescription(description)));
        long projectId = project.getId();
        saveSelection(projectId, selection);
        return toView(project);
    }

    @Transactional
    ProjectView update(long userId, long projectId, String name, String description,
            List<Long> regionIds, List<Long> featureIds) {
        var selection = validateSelection(regionIds, featureIds);
        Project project = projects.findByIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        project.update(name.strip(), normalizeDescription(description), userId);

        projectRegions.deleteByIdProjectId(projectId);
        projectFeatures.deleteByIdProjectId(projectId);
        projectRegions.flush();
        projectFeatures.flush();
        saveSelection(projectId, selection);
        return toView(project);
    }

    @Transactional
    void delete(long userId, long projectId) {
        Project project = projects.findByIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        projects.delete(project);
    }

    private Selection validateSelection(List<Long> regionIds, List<Long> featureIds) {
        var uniqueRegionIds = uniqueIds(regionIds, 5, "regions");
        var uniqueFeatureIds = uniqueIds(featureIds, 10, "features");
        if (regions.findAllById(uniqueRegionIds).size() != uniqueRegionIds.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown region id");
        }
        var selectedFeatures = features.findAllById(uniqueFeatureIds);
        if (selectedFeatures.size() != uniqueFeatureIds.size()
                || selectedFeatures.stream().anyMatch(feature -> !feature.isActive())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown or inactive feature id");
        }
        return new Selection(uniqueRegionIds, uniqueFeatureIds);
    }

    private void saveSelection(long projectId, Selection selection) {
        projectRegions.saveAll(selection.regionIds().stream()
                .map(regionId -> new ProjectRegion(projectId, regionId))
                .toList());
        projectFeatures.saveAll(selection.featureIds().stream()
                .map(featureId -> new ProjectFeature(projectId, featureId))
                .toList());
    }

    private static String normalizeDescription(String description) {
        return description == null || description.isBlank() ? null : description.strip();
    }

    private static LinkedHashSet<Long> uniqueIds(List<Long> ids, int maximum, String label) {
        var uniqueIds = new LinkedHashSet<>(ids);
        if (uniqueIds.isEmpty() || uniqueIds.size() != ids.size() || uniqueIds.size() > maximum) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Select unique " + label + " within the allowed limit");
        }
        return uniqueIds;
    }

    private ProjectView toView(Project project) {
        var regionIds = projectRegions.findByIdProjectId(project.getId()).stream()
                .map(ProjectRegion::getRegionId)
                .toList();
        var featureIds = projectFeatures.findByIdProjectId(project.getId()).stream()
                .map(ProjectFeature::getFeatureId)
                .toList();
        var selectedRegions = regions.findAllById(regionIds).stream()
                .sorted(Comparator.comparing(Region::getName))
                .map(region -> new RegionView(region.getId(), region.getName()))
                .toList();
        var selectedFeatures = features.findAllById(featureIds).stream()
                .sorted(Comparator.comparing(Feature::getId))
                .map(feature -> new FeatureView(feature.getId(), feature.getName()))
                .toList();
        return new ProjectView(project.getId(), project.getName(), project.getDescription(),
                selectedRegions, selectedFeatures, project.getUpdatedAt());
    }

    record ProjectView(long id, String name, String description,
            List<RegionView> regions, List<FeatureView> features, Instant updatedAt) {
    }

    record RegionView(long id, String name) {
    }

    record FeatureView(long id, String name) {
    }

    private record Selection(LinkedHashSet<Long> regionIds, LinkedHashSet<Long> featureIds) {
    }
}
