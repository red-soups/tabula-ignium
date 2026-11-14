package com.tabulaignium.api.firedata;

public record MonthlyFireTrend(
        String period,
        long observationCount,
        double totalFrp,
        double averageFrp) {
}
