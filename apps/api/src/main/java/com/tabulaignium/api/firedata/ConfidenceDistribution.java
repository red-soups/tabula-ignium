package com.tabulaignium.api.firedata;

public record ConfidenceDistribution(
        String confidenceLevel,
        long observationCount,
        double percentage) {
}
