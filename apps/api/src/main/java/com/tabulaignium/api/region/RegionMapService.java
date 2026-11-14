package com.tabulaignium.api.region;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
class RegionMapService {

    private static final String REGION_MAP_SQL = """
            SELECT id,
                   parent_region_id,
                   name,
                   region_level,
                   ST_XMin(Box3D(boundary)) AS west,
                   ST_XMax(Box3D(boundary)) AS east,
                   ST_YMin(Box3D(boundary)) AS south,
                   ST_YMax(Box3D(boundary)) AS north,
                   ST_AsGeoJSON(
                       ST_SimplifyPreserveTopology(
                           boundary,
                           GREATEST(
                               0.00002,
                               GREATEST(
                                   ST_XMax(Box3D(boundary)) - ST_XMin(Box3D(boundary)),
                                   ST_YMax(Box3D(boundary)) - ST_YMin(Box3D(boundary))
                               ) / 350
                           )
                       ),
                       6
                   ) AS geometry_geo_json
              FROM regions
             WHERE id = ?
               AND boundary IS NOT NULL
            """;

    private final JdbcTemplate jdbc;

    RegionMapService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    RegionMap find(long regionId) {
        List<RegionMap> result = jdbc.query(REGION_MAP_SQL, this::mapRegion, regionId);

        return result.stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Region map not found"));
    }

    List<RegionMap> findChildren(long parentId) {
        String childrenSql = REGION_MAP_SQL.replace("WHERE id = ?", "WHERE parent_region_id = ?")
                + " ORDER BY name";
        return jdbc.query(childrenSql, this::mapRegion, parentId);
    }

    private RegionMap mapRegion(java.sql.ResultSet row, int rowNumber) throws java.sql.SQLException {
        return new RegionMap(
                row.getLong("id"),
                row.getObject("parent_region_id", Long.class),
                row.getString("name"),
                row.getShort("region_level"),
                row.getDouble("west"),
                row.getDouble("east"),
                row.getDouble("south"),
                row.getDouble("north"),
                row.getString("geometry_geo_json"));
    }

    record RegionMap(long id, Long parentId, String name, short level, double west, double east,
            double south, double north, String geometryGeoJson) {
    }
}
