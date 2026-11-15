package com.tabulaignium.api.document;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
class LocalDocumentStorage implements DocumentStorage {
    static final String PROVIDER = "LOCAL";
    private final Path root;

    LocalDocumentStorage(@Value("${app.documents.storage-root:../../data/documents}") String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
    }

    @Override
    public StoredDocument save(long documentId, byte[] content) {
        LocalDate today = LocalDate.now();
        String relative = "%d/%02d/%d-%s.pdf".formatted(
                today.getYear(), today.getMonthValue(), documentId, UUID.randomUUID());
        Path target = resolve(relative);
        try {
            Files.createDirectories(target.getParent());
            Files.write(target, content, StandardOpenOption.CREATE_NEW);
            return new StoredDocument(PROVIDER, relative);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "PDF file could not be stored", exception);
        }
    }

    @Override
    public byte[] read(String path) {
        try {
            return Files.readAllBytes(resolve(path));
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "PDF file not found", exception);
        }
    }

    @Override
    public void delete(String path) {
        try {
            Files.deleteIfExists(resolve(path));
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "PDF file could not be deleted", exception);
        }
    }

    private Path resolve(String relative) {
        Path resolved = root.resolve(relative).normalize();
        if (!resolved.startsWith(root)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid document path");
        }
        return resolved;
    }
}
