package com.tabulaignium.api.feature;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface FeatureRepository extends JpaRepository<Feature, Long> {

    List<Feature> findByActiveTrueOrderByIdAsc();
}
