package com.tabulaignium.api.project;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
interface ProjectBoundaryMapper {

    List<BoundaryRow> findByProjectId(long projectId);

    record BoundaryRow(long id, String name, short level, double west,
            double east, double south, double north, String geometryGeoJson) {
    }
}
