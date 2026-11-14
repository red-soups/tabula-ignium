package com.tabulaignium.api.region;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "user_interested_regions")
class UserInterestedRegion {

    @EmbeddedId
    private UserInterestedRegionId id;

    protected UserInterestedRegion() {
    }

    UserInterestedRegion(long userId, long regionId) {
        this.id = new UserInterestedRegionId(userId, regionId);
    }

    long getRegionId() {
        return id.getRegionId();
    }
}
