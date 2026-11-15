package com.tabulaignium.api.firedata;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
class FireDataController {
    private static final String PERIOD = "^[0-9]{4}-(0[1-9]|1[0-2])$";
    private static final String SENSOR = "^(ALL|MODIS|VIIRS)$";
    private static final String CONFIDENCE = "^(ALL|high|nominal|low)$";
    private final FireDataService fireData;

    FireDataController(FireDataService fireData) { this.fireData = fireData; }

    @GetMapping("/api/fire/summary")
    ResponseEntity<FireSummary> summary(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north,
            @RequestParam(required = false) @Pattern(regexp = PERIOD) String fromPeriod,
            @RequestParam(required = false) @Pattern(regexp = PERIOD) String toPeriod,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR) String sensor,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = CONFIDENCE) String confidenceLevel) {
        return ResponseEntity.ok(fireData.summary(area(west, south, east, north), fromPeriod, toPeriod, sensor, confidenceLevel));
    }

    @GetMapping("/api/fire/points")
    ResponseEntity<List<FirePoint>> points(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north,
            @RequestParam @Pattern(regexp = PERIOD) String period,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR) String sensor,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = CONFIDENCE) String confidenceLevel,
            @RequestParam(defaultValue = "1000") @Positive @Max(2000) int limit) {
        return ResponseEntity.ok(fireData.points(area(west, south, east, north), period, sensor, confidenceLevel, limit));
    }

    @GetMapping("/api/fire/monthly")
    ResponseEntity<List<MonthlyFireTrend>> monthly(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north,
            @RequestParam @Pattern(regexp = PERIOD) String fromPeriod,
            @RequestParam @Pattern(regexp = PERIOD) String toPeriod,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR) String sensor) {
        return ResponseEntity.ok(fireData.monthlyTrend(area(west, south, east, north), fromPeriod, toPeriod, sensor));
    }

    @GetMapping("/api/fire/confidence")
    ResponseEntity<List<ConfidenceDistribution>> confidence(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north,
            @RequestParam @Pattern(regexp = PERIOD) String fromPeriod,
            @RequestParam @Pattern(regexp = PERIOD) String toPeriod,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR) String sensor) {
        return ResponseEntity.ok(fireData.confidenceDistribution(area(west, south, east, north), fromPeriod, toPeriod, sensor));
    }

    @GetMapping("/api/fire/intensity")
    ResponseEntity<List<FireIntensityDistribution>> intensity(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north,
            @RequestParam @Pattern(regexp = PERIOD) String fromPeriod,
            @RequestParam @Pattern(regexp = PERIOD) String toPeriod,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR) String sensor) {
        return ResponseEntity.ok(fireData.intensityDistribution(area(west, south, east, north), fromPeriod, toPeriod, sensor));
    }

    @GetMapping("/api/fire/day-night")
    ResponseEntity<List<DayNightDistribution>> dayNight(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north,
            @RequestParam @Pattern(regexp = PERIOD) String fromPeriod,
            @RequestParam @Pattern(regexp = PERIOD) String toPeriod,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR) String sensor) {
        return ResponseEntity.ok(fireData.dayNightDistribution(area(west, south, east, north), fromPeriod, toPeriod, sensor));
    }

    @GetMapping("/api/fire/period-comparison")
    ResponseEntity<PeriodComparison> periodComparison(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north,
            @RequestParam @Pattern(regexp = PERIOD) String fromPeriod,
            @RequestParam @Pattern(regexp = PERIOD) String toPeriod,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR) String sensor) {
        return ResponseEntity.ok(fireData.periodComparison(area(west, south, east, north), fromPeriod, toPeriod, sensor));
    }

    @GetMapping("/api/fire/hotspots")
    ResponseEntity<List<FireHotspot>> hotspots(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north,
            @RequestParam @Pattern(regexp = PERIOD) String fromPeriod,
            @RequestParam @Pattern(regexp = PERIOD) String toPeriod,
            @RequestParam(defaultValue = "ALL") @Pattern(regexp = SENSOR) String sensor,
            @RequestParam(defaultValue = "5000") int gridMeters) {
        return ResponseEntity.ok(fireData.hotspots(area(west, south, east, north), fromPeriod, toPeriod, sensor, gridMeters));
    }

    @GetMapping("/api/fire/yearly")
    ResponseEntity<List<YearlyFireTrend>> yearly(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north) {
        return ResponseEntity.ok(fireData.yearlyTrend(area(west, south, east, north)));
    }

    @GetMapping("/api/fire/large-fire-frequency")
    ResponseEntity<LargeFireFrequency> largeFire(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north) {
        return ResponseEntity.ok(fireData.largeFireFrequency(area(west, south, east, north)));
    }

    @GetMapping("/api/fire/high-risk-months")
    ResponseEntity<List<HighRiskMonth>> highRisk(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north) {
        return ResponseEntity.ok(fireData.highRiskMonths(area(west, south, east, north)));
    }

    @GetMapping("/api/fire/nearest")
    ResponseEntity<NearestFire> nearest(
            @RequestParam double west, @RequestParam double south, @RequestParam double east, @RequestParam double north,
            @RequestParam LocalDate start, @RequestParam LocalDate end) {
        return ResponseEntity.ok(fireData.nearestFire(area(west, south, east, north), start, end));
    }

    private FireBounds area(double west, double south, double east, double north) {
        return new FireBounds(west, south, east, north);
    }
}
