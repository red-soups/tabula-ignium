package com.tabulaignium.api.firedata;

import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
class FireDataService {
    private final FireDataMapper fireData;
    FireDataService(FireDataMapper fireData) { this.fireData = fireData; }

    FireSummary summary(FireBounds a, String from, String to, String sensor, String confidence) {
        validateArea(a); validatePeriodRange(from, to);
        return fireData.findSummary(a.west(), a.south(), a.east(), a.north(), from, to, sensor, confidence);
    }

    List<FirePoint> points(FireBounds a, String period, String sensor, String confidence, int limit) {
        validateArea(a);
        return fireData.findPoints(a.west(), a.south(), a.east(), a.north(), period, sensor, confidence, Math.min(limit, 2_000));
    }

    List<MonthlyFireTrend> monthlyTrend(FireBounds a, String from, String to, String sensor) {
        validateArea(a); validatePeriodRange(from, to);
        return fireData.findMonthlyTrend(a.west(), a.south(), a.east(), a.north(), from, to, sensor);
    }

    List<ConfidenceDistribution> confidenceDistribution(FireBounds a, String from, String to, String sensor) {
        validateArea(a); validatePeriodRange(from, to);
        return fireData.findConfidenceDistribution(a.west(), a.south(), a.east(), a.north(), from, to, sensor);
    }

    List<YearlyFireTrend> yearlyTrend(FireBounds a) {
        validateArea(a);
        return fireData.findYearlyTrend(a.west(), a.south(), a.east(), a.north(), latestDate());
    }

    LargeFireFrequency largeFireFrequency(FireBounds a) {
        validateArea(a); LocalDate through = latestDate();
        long years = fireData.countLargeFireYears(a.west(), a.south(), a.east(), a.north(), through);
        return new LargeFireFrequency(years, years == 0 ? null : 25.0 / years,
                fireData.countYearsWithAnyFire(a.west(), a.south(), a.east(), a.north(), through),
                fireData.findLargestFireMonths(a.west(), a.south(), a.east(), a.north(), through));
    }

    List<HighRiskMonth> highRiskMonths(FireBounds a) {
        validateArea(a);
        return fireData.findHighRiskMonths(a.west(), a.south(), a.east(), a.north(), latestDate());
    }

    NearestFire nearestFire(FireBounds a, LocalDate start, LocalDate end) {
        validateArea(a);
        if (start.isAfter(end)) badRequest("start must not be later than end");
        return fireData.findNearestFire(a.west(), a.south(), a.east(), a.north(), start, end);
    }

    private LocalDate latestDate() {
        LocalDate latest = fireData.findLatestObservationDate();
        if (latest == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Fire data not found");
        return latest;
    }

    private void validateArea(FireBounds a) {
        if (!Double.isFinite(a.west()) || !Double.isFinite(a.south()) || !Double.isFinite(a.east()) || !Double.isFinite(a.north())
                || a.west() < -180 || a.east() > 180 || a.south() < -90 || a.north() > 90
                || a.west() >= a.east() || a.south() >= a.north()) badRequest("Invalid analysis bounds");
    }

    private void validatePeriodRange(String from, String to) {
        if (from != null && to != null && from.compareTo(to) > 0) badRequest("fromPeriod must not be later than toPeriod");
    }

    private void badRequest(String message) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
