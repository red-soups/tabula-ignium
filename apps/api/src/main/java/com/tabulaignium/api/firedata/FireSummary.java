package com.tabulaignium.api.firedata;

import java.time.LocalDateTime;

public record FireSummary(
        long regionId,
        long observationCount,
        long observedDayCount,
        LocalDateTime earliestObservation,
        LocalDateTime latestObservation,
        Double averageFrp,
        Double maximumFrp,
        Double totalFrp) {
}
