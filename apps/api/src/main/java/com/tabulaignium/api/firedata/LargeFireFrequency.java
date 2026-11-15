package com.tabulaignium.api.firedata;

import java.util.List;

public record LargeFireFrequency(
        long occurrenceYearCount,
        Double returnPeriodYears,
        long yearsWithAnyFire,
        List<LargeFireMonth> largestMonths) {
}
