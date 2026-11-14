package com.tabulaignium.api.firedata;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
interface FireDataMapper {

    boolean existsRegion(@Param("regionId") long regionId);

    FireSummary findSummary(
            @Param("regionId") long regionId,
            @Param("fromPeriod") String fromPeriod,
            @Param("toPeriod") String toPeriod,
            @Param("sensor") String sensor,
            @Param("confidenceLevel") String confidenceLevel);

    List<FirePoint> findPoints(
            @Param("regionId") long regionId,
            @Param("period") String period,
            @Param("sensor") String sensor,
            @Param("confidenceLevel") String confidenceLevel,
            @Param("limit") int limit);

    List<MonthlyFireTrend> findMonthlyTrend(
            @Param("regionId") long regionId,
            @Param("fromPeriod") String fromPeriod,
            @Param("toPeriod") String toPeriod,
            @Param("sensor") String sensor);

    List<ConfidenceDistribution> findConfidenceDistribution(
            @Param("regionId") long regionId,
            @Param("fromPeriod") String fromPeriod,
            @Param("toPeriod") String toPeriod,
            @Param("sensor") String sensor);
}
