package com.tabulaignium.api.document;

import java.time.OffsetDateTime;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class DocumentExportService {
    private static final int MAX_FEATURE_COUNT = 50;
    private static final int MAX_PDF_BYTES = 20 * 1024 * 1024;
    private static final String HASH_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int HASH_LENGTH = 12;
    private final SecureRandom random = new SecureRandom();
    private final JdbcTemplate jdbc;
    private final LocalDocumentStorage localStorage;
    private final S3DocumentStorage s3Storage;

    DocumentExportService(JdbcTemplate jdbc, LocalDocumentStorage localStorage,
            ObjectProvider<S3DocumentStorage> s3Storage) {
        this.jdbc = jdbc;
        this.localStorage = localStorage;
        this.s3Storage = s3Storage.getIfAvailable();
    }

    @Transactional
    ExportHistory create(Long userId, CreateExport request, byte[] pdf) {
        validate(request, pdf);
        long documentId = jdbc.queryForObject("""
                INSERT INTO documents (user_id, name, description, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?) RETURNING id
                """, Long.class, userId, request.name().strip(), request.description(), userId, userId);

        jdbc.update("""
                INSERT INTO document_areas (document_id, west, south, east, north)
                VALUES (?, ?, ?, ?, ?)
                """, documentId, request.west(), request.south(), request.east(), request.north());

        for (int index = 0; index < request.featureIds().size(); index++) {
            jdbc.update("""
                    INSERT INTO document_features (document_id, feature_id, configuration)
                    SELECT ?, id, CAST(? AS jsonb) FROM features WHERE id = ? AND is_active = TRUE
                    """, documentId, request.configurations().get(index), request.featureIds().get(index));
        }
        Integer savedFeatures = jdbc.queryForObject(
                "SELECT COUNT(*) FROM document_features WHERE document_id = ?", Integer.class, documentId);
        if (savedFeatures == null || savedFeatures != request.featureIds().size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid feature selection");
        }

        String accessHash = newAccessHash();
        String fileName = accessHash + "_" + safeFileName(request.name()) + ".pdf";
        DocumentStorage storage = s3Storage == null ? localStorage : s3Storage;
        DocumentStorage.StoredDocument stored = storage.save(documentId, pdf);
        long historyId = jdbc.queryForObject("""
                INSERT INTO document_export_histories
                    (document_id, created_by, storage_provider, file_path, original_file_name, file_size, access_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
                """, Long.class, documentId, userId, stored.provider(), stored.path(), fileName, pdf.length, accessHash);
        return findById(historyId);
    }

    List<ExportHistory> list(long userId) {
        return jdbc.query(historySql() + " WHERE h.created_by = ? ORDER BY h.created_at DESC", (rs, row) -> new ExportHistory(
                rs.getLong("id"), rs.getLong("document_id"), rs.getString("document_name"),
                rs.getString("creator_name"), rs.getString("storage_provider"), rs.getString("file_path"),
                rs.getString("original_file_name"), rs.getLong("file_size"),
                rs.getString("access_hash"), rs.getObject("created_at", OffsetDateTime.class)), userId);
    }

    StoredExport download(long id, long userId) {
        ExportHistory history = findOne(id, userId);
        return new StoredExport(history.originalFileName(),
                storageFor(history.storageProvider()).read(history.filePath()));
    }

    PublicExport findPublic(String accessHash) {
        ExportHistory history = findByHash(normalizeHash(accessHash));
        return new PublicExport(history.accessHash(), history.documentName(), history.originalFileName(),
                history.fileSize(), history.createdAt());
    }

    StoredExport downloadPublic(String accessHash) {
        ExportHistory history = findByHash(normalizeHash(accessHash));
        return new StoredExport(history.originalFileName(),
                storageFor(history.storageProvider()).read(history.filePath()));
    }

    @Transactional
    void delete(long id, long userId) {
        ExportHistory history = findOne(id, userId);
        jdbc.update("DELETE FROM document_export_histories WHERE id = ? AND created_by = ?", id, userId);
        storageFor(history.storageProvider()).delete(history.filePath());
        jdbc.update("DELETE FROM documents WHERE id = ? AND user_id = ?", history.documentId(), userId);
    }

    private DocumentStorage storageFor(String provider) {
        if (LocalDocumentStorage.PROVIDER.equals(provider)) {
            return localStorage;
        }
        if (S3DocumentStorage.PROVIDER.equals(provider) && s3Storage != null) {
            return s3Storage;
        }
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Document storage is not configured");
    }

    private ExportHistory findOne(long id, long userId) {
        return jdbc.query(historySql() + " WHERE h.id = ? AND h.created_by = ?", (rs, row) -> new ExportHistory(
                rs.getLong("id"), rs.getLong("document_id"), rs.getString("document_name"),
                rs.getString("creator_name"), rs.getString("storage_provider"), rs.getString("file_path"),
                rs.getString("original_file_name"), rs.getLong("file_size"),
                rs.getString("access_hash"), rs.getObject("created_at", OffsetDateTime.class)), id, userId).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Export history not found"));
    }

    private ExportHistory findById(long id) {
        return jdbc.query(historySql() + " WHERE h.id = ?", (rs, row) -> new ExportHistory(
                rs.getLong("id"), rs.getLong("document_id"), rs.getString("document_name"),
                rs.getString("creator_name"), rs.getString("storage_provider"), rs.getString("file_path"),
                rs.getString("original_file_name"), rs.getLong("file_size"),
                rs.getString("access_hash"), rs.getObject("created_at", OffsetDateTime.class)), id).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Export history not found"));
    }

    private ExportHistory findByHash(String accessHash) {
        return jdbc.query(historySql() + " WHERE h.access_hash = ?", (rs, row) -> new ExportHistory(
                rs.getLong("id"), rs.getLong("document_id"), rs.getString("document_name"),
                rs.getString("creator_name"), rs.getString("storage_provider"), rs.getString("file_path"),
                rs.getString("original_file_name"), rs.getLong("file_size"),
                rs.getString("access_hash"), rs.getObject("created_at", OffsetDateTime.class)), accessHash).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Export hash not found"));
    }

    private String historySql() {
        return """
                SELECT h.id, h.document_id, d.name AS document_name, COALESCE(u.name, '산불24') AS creator_name,
                       h.storage_provider, h.file_path, h.original_file_name, h.file_size, h.access_hash, h.created_at
                FROM document_export_histories h
                JOIN documents d ON d.id = h.document_id
                LEFT JOIN users u ON u.id = h.created_by
                """;
    }

    private String newAccessHash() {
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder hash = new StringBuilder(HASH_LENGTH);
            for (int index = 0; index < HASH_LENGTH; index++) {
                hash.append(HASH_ALPHABET.charAt(random.nextInt(HASH_ALPHABET.length())));
            }
            Integer count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM document_export_histories WHERE access_hash = ?", Integer.class, hash.toString());
            if (count != null && count == 0) return hash.toString();
        }
        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Document access hash could not be generated");
    }

    private String normalizeHash(String accessHash) {
        String normalized = accessHash == null ? "" : accessHash.strip().toUpperCase();
        if (!normalized.matches("[A-Z0-9]{12}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid export hash");
        }
        return normalized;
    }

    private void validate(CreateExport request, byte[] pdf) {
        if (request.name() == null || request.name().isBlank() || request.name().length() > 200
                || request.featureIds().isEmpty() || request.featureIds().size() > MAX_FEATURE_COUNT
                || new HashSet<>(request.featureIds()).size() != request.featureIds().size()
                || request.configurations().size() != request.featureIds().size()
                || !validBounds(request)
                || pdf.length < 5 || pdf.length > MAX_PDF_BYTES
                || pdf[0] != '%' || pdf[1] != 'P' || pdf[2] != 'D' || pdf[3] != 'F') {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid document export");
        }
    }

    private boolean validBounds(CreateExport request) {
        return request.west() >= -180 && request.east() <= 180 && request.west() < request.east()
                && request.south() >= -90 && request.north() <= 90 && request.south() < request.north();
    }

    private String safeFileName(String name) {
        String safe = name.strip().replaceAll("[\\\\/:*?\"<>|]", "_");
        return safe.isBlank() ? "산불24-문서" : safe;
    }

    record CreateExport(String name, String description, double west, double south, double east, double north,
            List<Long> featureIds, List<String> configurations) {
    }
    record ExportHistory(long id, long documentId, String documentName, String creatorName,
            String storageProvider, String filePath, String originalFileName, long fileSize,
            String accessHash, OffsetDateTime createdAt) {
    }
    record PublicExport(String accessHash, String documentName, String originalFileName,
            long fileSize, OffsetDateTime createdAt) {
    }
    record StoredExport(String fileName, byte[] content) {
    }
}
