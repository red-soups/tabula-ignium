package com.tabulaignium.api.firedata;

public record FireIntensityDistribution(
        String intensityLevel,
        long observationCount,
        double percentage,
        double averageFrp,
        double maximumFrp) {
}
