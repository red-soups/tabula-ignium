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
            @Param("period") String period,
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
