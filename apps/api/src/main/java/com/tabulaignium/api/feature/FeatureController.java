package com.tabulaignium.api.feature;

import java.time.Duration;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class FeatureController {

    private final FeatureRepository features;

    FeatureController(FeatureRepository features) {
        this.features = features;
    }

    @GetMapping("/api/features")
    ResponseEntity<List<FeatureResponse>> features() {
        var response = features.findByActiveTrueOrderByIdAsc().stream()
                .map(feature -> new FeatureResponse(
                        feature.getId(),
                        feature.getCode(),
                        feature.getName(),
                        feature.getDescription()))
                .toList();

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)))
                .body(response);
    }

    record FeatureResponse(long id, String code, String name, String description) {
    }
}
