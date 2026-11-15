package com.tabulaignium.api.firedata;

public record FireHotspot(
        int hotspotRank,
        double centerLatitude,
        double centerLongitude,
        long observationCount,
        double averageFrp,
        double maximumFrp) {
}
