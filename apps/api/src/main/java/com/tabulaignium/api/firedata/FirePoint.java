package com.tabulaignium.api.firedata;

import java.time.LocalDateTime;

public record FirePoint(
        long id,
        double latitude,
        double longitude,
        double frp,
        String confidenceLevel,
        String sensor,
        String period,
        LocalDateTime observedAt) {
}
