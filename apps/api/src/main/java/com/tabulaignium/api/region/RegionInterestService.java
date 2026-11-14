package com.tabulaignium.api.region;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RegionInterestService {

    private static final int MAX_REGIONS = 5;

    private final RegionRepository regions;
    private final UserInterestedRegionRepository interests;

    RegionInterestService(RegionRepository regions, UserInterestedRegionRepository interests) {
        this.regions = regions;
        this.interests = interests;
    }

    public void attach(long userId, List<Long> regionIds) {
        var uniqueIds = validate(regionIds);
        interests.saveAll(uniqueIds.stream()
                .map(regionId -> new UserInterestedRegion(userId, regionId))
                .toList());
    }

    @Transactional(readOnly = true)
    public List<SelectedRegion> selectedRegions(long userId) {
        var ids = interests.findByIdUserId(userId).stream()
                .map(UserInterestedRegion::getRegionId).toList();
        return regions.findAllById(ids).stream()
                .map(region -> new SelectedRegion(region.getId(), label(region)))
                .sorted((left, right) -> left.label().compareTo(right.label()))
                .toList();
    }

    public void replace(long userId, List<Long> regionIds) {
        var nextIds = validate(regionIds);
        var current = interests.findByIdUserId(userId);
        Set<Long> currentIds = current.stream().map(UserInterestedRegion::getRegionId)
                .collect(java.util.stream.Collectors.toSet());

        var removed = current.stream()
                .filter(interest -> !nextIds.contains(interest.getRegionId())).toList();
        if (!removed.isEmpty()) {
            interests.deleteAll(removed);
            interests.flush();
        }
        interests.saveAll(nextIds.stream()
                .filter(regionId -> !currentIds.contains(regionId))
                .map(regionId -> new UserInterestedRegion(userId, regionId)).toList());
    }

    private LinkedHashSet<Long> validate(List<Long> regionIds) {
        var uniqueIds = new LinkedHashSet<>(regionIds);
        if (uniqueIds.isEmpty() || uniqueIds.size() != regionIds.size() || uniqueIds.size() > MAX_REGIONS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Select between 1 and 5 unique regions");
        }

        if (regions.findAllById(uniqueIds).size() != uniqueIds.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown region id");
        }

        return uniqueIds;
    }

    private String label(Region region) {
        var names = new ArrayList<String>();
        for (Region current = region; current != null; current = current.getParent()) {
            if (current.getRegionLevel() > 0) {
                names.addFirst(current.getName());
            }
        }
        return String.join(" ", names);
    }

    public record SelectedRegion(long id, String label) {
    }
}
