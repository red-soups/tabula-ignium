package com.tabulaignium.api.firedata;

public record PeriodComparison(
        String currentFromPeriod,
        String currentToPeriod,
        String previousFromPeriod,
        String previousToPeriod,
        long currentObservationCount,
        long previousObservationCount,
        Double observationChangeRate,
        Double currentAverageFrp,
        Double previousAverageFrp,
        Double averageFrpChangeRate,
        Double currentMaximumFrp,
        Double previousMaximumFrp) {
}
