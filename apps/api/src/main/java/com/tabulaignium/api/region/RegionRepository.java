package com.tabulaignium.api.region;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RegionRepository extends JpaRepository<Region, Long> {

    List<Region> findByParentIsNullOrderByNameAsc();

    List<Region> findByParentIdOrderByNameAsc(Long parentId);
}
