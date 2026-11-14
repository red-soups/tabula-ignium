package com.tabulaignium.api.region;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serial;
import java.io.Serializable;
import java.util.Objects;

@Embeddable
class UserInterestedRegionId implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "region_id", nullable = false)
    private Long regionId;

    protected UserInterestedRegionId() {
    }

    UserInterestedRegionId(Long userId, Long regionId) {
        this.userId = userId;
        this.regionId = regionId;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof UserInterestedRegionId that)) return false;
        return Objects.equals(userId, that.userId) && Objects.equals(regionId, that.regionId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, regionId);
    }
}
