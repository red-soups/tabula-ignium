package com.tabulaignium.api.firedata;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Max;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
class FireDataController {

    private static final String PERIOD_PATTERN = "^[0-9]{4}-(0[1-9]|1[0-2])$";
    private static final String SENSOR_PATTERN = "^(ALL|MODIS|VIIRS)$";
    private static final String CONFIDENCE_PATTERN = "^(ALL|high|nominal|low)$";

    private final FireDataService fireData;

    FireDataController(FireDataService fireData) {
        this.fireData = fireData;
    }

    @GetMapping("/api/regions/{regionId}/fire/summary")
    ResponseEntity<FireSummary> summary(
            @PathVariable @Positive long regionId,
            @RequestParam(required = false) @Pattern(regexp = PERIOD_PATTERN) String fromPeriod,
            @RequestParam(required = false) @Pattern(regexp = PERIOD_PATTERN) String toPeriod,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR_PATTERN) String sensor,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = CONFIDENCE_PATTERN) String confidenceLevel) {
        return ResponseEntity.ok(fireData.summary(
                regionId, fromPeriod, toPeriod, sensor, confidenceLevel));
    }

    @GetMapping("/api/regions/{regionId}/fire/points")
    ResponseEntity<List<FirePoint>> points(
            @PathVariable @Positive long regionId,
            @RequestParam @Pattern(regexp = PERIOD_PATTERN) String period,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR_PATTERN) String sensor,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = CONFIDENCE_PATTERN) String confidenceLevel,
            @RequestParam(defaultValue = "1000") @Positive @Max(2000) int limit) {
        return ResponseEntity.ok(fireData.points(regionId, period, sensor, confidenceLevel, limit));
    }

    @GetMapping("/api/regions/{regionId}/fire/monthly")
    ResponseEntity<List<MonthlyFireTrend>> monthlyTrend(
            @PathVariable @Positive long regionId,
            @RequestParam @Pattern(regexp = PERIOD_PATTERN) String fromPeriod,
            @RequestParam @Pattern(regexp = PERIOD_PATTERN) String toPeriod,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR_PATTERN) String sensor) {
        return ResponseEntity.ok(fireData.monthlyTrend(regionId, fromPeriod, toPeriod, sensor));
    }

    @GetMapping("/api/regions/{regionId}/fire/confidence")
    ResponseEntity<List<ConfidenceDistribution>> confidenceDistribution(
            @PathVariable @Positive long regionId,
            @RequestParam @Pattern(regexp = PERIOD_PATTERN) String fromPeriod,
            @RequestParam @Pattern(regexp = PERIOD_PATTERN) String toPeriod,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR_PATTERN) String sensor) {
        return ResponseEntity.ok(fireData.confidenceDistribution(regionId, fromPeriod, toPeriod, sensor));
    }
}
