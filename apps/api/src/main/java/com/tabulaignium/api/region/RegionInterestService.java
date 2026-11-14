package com.tabulaignium.api.region;

import java.util.List;
import java.util.LinkedHashSet;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
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
        var uniqueIds = new LinkedHashSet<>(regionIds);
        if (uniqueIds.isEmpty() || uniqueIds.size() != regionIds.size() || uniqueIds.size() > MAX_REGIONS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Select between 1 and 5 unique regions");
        }

        if (regions.findAllById(uniqueIds).size() != uniqueIds.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown region id");
        }

        interests.saveAll(uniqueIds.stream()
                .map(regionId -> new UserInterestedRegion(userId, regionId))
                .toList());
    }
}
