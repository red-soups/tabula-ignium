package com.tabulaignium.api.region;

import jakarta.validation.constraints.Positive;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@Validated
@RestController
class RegionController {

    private final RegionRepository regions;
    private final RegionMapService regionMaps;

    RegionController(RegionRepository regions, RegionMapService regionMaps) {
        this.regions = regions;
        this.regionMaps = regionMaps;
    }

    @GetMapping("/api/regions")
    ResponseEntity<List<RegionResponse>> regions(
            @RequestParam(required = false) @Positive Long parentId) {
        List<Region> result;
        if (parentId == null) {
            result = regions.findByParentIsNullOrderByNameKoAsc();
        } else {
            regions.findById(parentId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Region not found"));
            result = regions.findByParentIdOrderByNameKoAsc(parentId);
        }

        var response = result.stream()
                .map(region -> new RegionResponse(region.getId(), region.getName(),
                        region.getCountryCode(), region.getRegionLevel()))
                .toList();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(response);
    }

    record RegionResponse(long id, String name, String countryCode, Short level) {
    }

    @GetMapping("/api/regions/{regionId}/map")
    ResponseEntity<RegionMapService.RegionMap> regionMap(
            @PathVariable @Positive long regionId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(regionMaps.find(regionId));
    }

    @GetMapping("/api/regions/{parentId}/children/map")
    ResponseEntity<List<RegionMapService.RegionMap>> childRegionMaps(
            @PathVariable @Positive long parentId) {
        regions.findById(parentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Region not found"));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(regionMaps.findChildren(parentId));
    }
}
