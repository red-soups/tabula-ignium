package com.tabulaignium.api.project;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

interface ProjectRepository extends JpaRepository<Project, Long> {

    List<Project> findByUserIdOrderByUpdatedAtDesc(Long userId);

    Optional<Project> findByIdAndUserId(Long id, Long userId);
}
