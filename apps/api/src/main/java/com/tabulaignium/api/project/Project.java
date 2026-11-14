package com.tabulaignium.api.project;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "projects")
class Project {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "updated_by", nullable = false)
    private Long updatedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Project() {
    }

    Project(long userId, String name, String description) {
        var now = Instant.now();
        this.userId = userId;
        this.name = name;
        this.description = description;
        this.createdBy = userId;
        this.updatedBy = userId;
        this.createdAt = now;
        this.updatedAt = now;
    }

    void update(String name, String description, long userId) {
        this.name = name;
        this.description = description;
        this.updatedBy = userId;
        this.updatedAt = Instant.now();
    }

    Long getId() {
        return id;
    }

    String getName() {
        return name;
    }

    String getDescription() {
        return description;
    }

    Instant getUpdatedAt() {
        return updatedAt;
    }
}
