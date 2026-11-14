package com.tabulaignium.api.region;

import org.springframework.data.jpa.repository.JpaRepository;

interface UserInterestedRegionRepository
        extends JpaRepository<UserInterestedRegion, UserInterestedRegionId> {
}
