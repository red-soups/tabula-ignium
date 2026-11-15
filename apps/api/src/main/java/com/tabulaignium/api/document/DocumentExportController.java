package com.tabulaignium.api.document;

import com.tabulaignium.api.auth.GoogleOidcUserService.AccountPrincipal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
class DocumentExportController {
    private final DocumentExportService exports;
    DocumentExportController(DocumentExportService exports) { this.exports = exports; }

    @PostMapping(path = "/api/document-exports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<DocumentExportService.ExportHistory> create(
            @AuthenticationPrincipal AccountPrincipal principal,
            @RequestParam String documentName,
            @RequestParam(defaultValue = "") String description,
            @RequestParam double west, @RequestParam double south,
            @RequestParam double east, @RequestParam double north,
            @RequestParam List<Long> featureIds,
            @RequestParam List<String> configurations,
            @RequestParam MultipartFile file) throws java.io.IOException {
        var request = new DocumentExportService.CreateExport(documentName, description,
                west, south, east, north, featureIds, configurations);
        return ResponseEntity.ok(exports.create(principal == null ? null : principal.userId(), request, file.getBytes()));
    }

    @GetMapping("/api/document-exports/public/{accessHash}")
    DocumentExportService.PublicExport findPublic(@PathVariable String accessHash) {
        return exports.findPublic(accessHash);
    }

    @GetMapping("/api/document-exports/public/{accessHash}/file")
    ResponseEntity<byte[]> downloadPublic(@PathVariable String accessHash) {
        var file = exports.downloadPublic(accessHash);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(file.fileName(), StandardCharsets.UTF_8).build().toString())
                .body(file.content());
    }

    @GetMapping("/api/document-exports")
    List<DocumentExportService.ExportHistory> list(@AuthenticationPrincipal AccountPrincipal principal) {
        return exports.list(principal.userId());
    }

    @GetMapping("/api/document-exports/{id}/file")
    ResponseEntity<byte[]> download(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable long id) {
        var file = exports.download(id, principal.userId());
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(file.fileName(), StandardCharsets.UTF_8).build().toString())
                .body(file.content());
    }

    @DeleteMapping("/api/document-exports/{id}")
    ResponseEntity<Void> delete(@AuthenticationPrincipal AccountPrincipal principal, @PathVariable long id) {
        exports.delete(id, principal.userId());
        return ResponseEntity.noContent().build();
    }
}
