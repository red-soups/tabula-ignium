package com.tabulaignium.api.firedata;

import java.util.List;
import java.time.LocalDate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
interface FireDataMapper {
    LocalDate findLatestObservationDate();

    FireSummary findSummary(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("fromPeriod") String fromPeriod,
            @Param("toPeriod") String toPeriod,
            @Param("sensor") String sensor,
            @Param("confidenceLevel") String confidenceLevel);

    List<FirePoint> findPoints(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("fromPeriod") String fromPeriod,
            @Param("toPeriod") String toPeriod,
            @Param("sensor") String sensor,
            @Param("confidenceLevel") String confidenceLevel,
            @Param("limit") int limit);

    List<MonthlyFireTrend> findMonthlyTrend(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("fromPeriod") String fromPeriod,
            @Param("toPeriod") String toPeriod,
            @Param("sensor") String sensor);

    List<ConfidenceDistribution> findConfidenceDistribution(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("fromPeriod") String fromPeriod,
            @Param("toPeriod") String toPeriod,
            @Param("sensor") String sensor);

    List<FireIntensityDistribution> findIntensityDistribution(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("fromPeriod") String fromPeriod, @Param("toPeriod") String toPeriod,
            @Param("sensor") String sensor);

    List<DayNightDistribution> findDayNightDistribution(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("fromPeriod") String fromPeriod, @Param("toPeriod") String toPeriod,
            @Param("sensor") String sensor);

    PeriodComparison findPeriodComparison(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("currentFrom") String currentFrom, @Param("currentTo") String currentTo,
            @Param("previousFrom") String previousFrom, @Param("previousTo") String previousTo,
            @Param("sensor") String sensor);

    List<FireHotspot> findHotspots(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("fromPeriod") String fromPeriod, @Param("toPeriod") String toPeriod,
            @Param("sensor") String sensor, @Param("gridMeters") int gridMeters);

    List<YearlyFireTrend> findYearlyTrend(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("through") LocalDate through);

    long countLargeFireYears(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("through") LocalDate through);

    long countYearsWithAnyFire(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("through") LocalDate through);

    List<LargeFireMonth> findLargestFireMonths(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("through") LocalDate through);

    List<HighRiskMonth> findHighRiskMonths(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("through") LocalDate through);

    NearestFire findNearestFire(
            @Param("west") double west, @Param("south") double south,
            @Param("east") double east, @Param("north") double north,
            @Param("start") LocalDate start,
            @Param("end") LocalDate end);
}
