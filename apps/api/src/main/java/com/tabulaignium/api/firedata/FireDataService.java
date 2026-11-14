package com.tabulaignium.api.firedata;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
class FireDataService {

    private final FireDataMapper fireData;

    FireDataService(FireDataMapper fireData) {
        this.fireData = fireData;
    }

    FireSummary summary(long regionId, String fromPeriod, String toPeriod,
            String sensor, String confidenceLevel) {
        validatePeriodRange(fromPeriod, toPeriod);

        FireSummary summary = fireData.findSummary(
                regionId, fromPeriod, toPeriod, sensor, confidenceLevel);
        if (summary == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Region not found");
        }
        return summary;
    }

    List<FirePoint> points(long regionId, String period, String sensor,
            String confidenceLevel, int limit) {
        requireRegion(regionId);
        return fireData.findPoints(regionId, period, sensor, confidenceLevel, Math.min(limit, 2_000));
    }

    List<MonthlyFireTrend> monthlyTrend(long regionId, String fromPeriod,
            String toPeriod, String sensor) {
        validatePeriodRange(fromPeriod, toPeriod);
        requireRegion(regionId);
        return fireData.findMonthlyTrend(regionId, fromPeriod, toPeriod, sensor);
    }

    List<ConfidenceDistribution> confidenceDistribution(long regionId, String fromPeriod,
            String toPeriod, String sensor) {
        validatePeriodRange(fromPeriod, toPeriod);
        requireRegion(regionId);
        return fireData.findConfidenceDistribution(regionId, fromPeriod, toPeriod, sensor);
    }

    private void requireRegion(long regionId) {
        if (!fireData.existsRegion(regionId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Region not found");
        }
    }

    private void validatePeriodRange(String fromPeriod, String toPeriod) {
        if (fromPeriod != null && toPeriod != null && fromPeriod.compareTo(toPeriod) > 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "fromPeriod must not be later than toPeriod");
        }
    }
}
