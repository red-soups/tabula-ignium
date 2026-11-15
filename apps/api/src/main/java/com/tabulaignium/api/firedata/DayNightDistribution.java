package com.tabulaignium.api.firedata;

public record DayNightDistribution(
        String periodType,
        long observationCount,
        double percentage,
        double averageFrp,
        double maximumFrp) {
}
