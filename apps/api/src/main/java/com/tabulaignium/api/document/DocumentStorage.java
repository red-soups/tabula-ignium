package com.tabulaignium.api.document;

interface DocumentStorage {
    StoredDocument save(long documentId, byte[] content);
    byte[] read(String path);
    void delete(String path);

    record StoredDocument(String provider, String path) {
    }
}
