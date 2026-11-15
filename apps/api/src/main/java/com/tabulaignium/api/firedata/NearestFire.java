package com.tabulaignium.api.firedata;

import java.time.LocalDateTime;

public record NearestFire(
        long id,
        double latitude,
        double longitude,
        double distanceKm,
        double frp,
        String sensor,
        String confidenceLevel,
        LocalDateTime observedAt,
        long within1Km,
        long within5Km,
        long within10Km) {
}
