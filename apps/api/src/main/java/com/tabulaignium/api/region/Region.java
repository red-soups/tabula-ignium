package com.tabulaignium.api.region;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "regions")
public class Region {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "name_ko", nullable = false, length = 200)
    private String nameKo;

    @Column(name = "country_code", nullable = false, length = 2)
    private String countryCode;

    @Column(name = "region_level", nullable = false)
    private Short regionLevel;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_region_id")
    private Region parent;

    protected Region() {
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return nameKo;
    }

    public String getNameKo() {
        return nameKo;
    }

    public String getNameEn() {
        return name;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public Short getRegionLevel() {
        return regionLevel;
    }

    Region getParent() {
        return parent;
    }
}
