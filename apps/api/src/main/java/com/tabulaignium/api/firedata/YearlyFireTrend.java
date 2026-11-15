package com.tabulaignium.api.firedata;

public record YearlyFireTrend(
        int year,
        double harmonized,
        Double low,
        Double high,
        boolean complete,
        Double harmonizedFrp,
        Double mwPerDetection,
        long rawModis,
        Long rawViirs) {
}
