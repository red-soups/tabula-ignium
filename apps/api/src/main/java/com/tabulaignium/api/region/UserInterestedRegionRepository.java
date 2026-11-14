package com.tabulaignium.api.region;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface UserInterestedRegionRepository
        extends JpaRepository<UserInterestedRegion, UserInterestedRegionId> {

    List<UserInterestedRegion> findByIdUserId(Long userId);
}
