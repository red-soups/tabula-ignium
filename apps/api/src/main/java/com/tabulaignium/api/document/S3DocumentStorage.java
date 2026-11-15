package com.tabulaignium.api.document;

import java.time.LocalDate;
import java.util.UUID;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

@Component
@ConditionalOnProperty(name = "document.s3.bucket")
class S3DocumentStorage implements DocumentStorage {
    static final String PROVIDER = "S3";
    private static final Logger log = LoggerFactory.getLogger(S3DocumentStorage.class);

    private final String bucket;
    private final S3Client client;

    S3DocumentStorage(@Value("${document.s3.bucket}") String bucket) {
        this.bucket = bucket.strip();
        if (this.bucket.isEmpty()) {
            throw new IllegalArgumentException("DOCUMENT_S3_BUCKET must specify a bucket name");
        }
        this.client = S3Client.create();
    }

    @Override
    public StoredDocument save(long documentId, byte[] content) {
        LocalDate today = LocalDate.now();
        String key = "documents/%d/%02d/%d-%s.pdf".formatted(
                today.getYear(), today.getMonthValue(), documentId, UUID.randomUUID());
        try {
            client.putObject(request -> request.bucket(bucket).key(key).contentType("application/pdf"),
                    RequestBody.fromBytes(content));
        } catch (SdkException exception) {
            deleteQuietly(key);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "PDF could not be stored in S3", exception);
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status == STATUS_ROLLED_BACK) {
                        deleteQuietly(key);
                    }
                }
            });
        }
        return new StoredDocument(PROVIDER, key);
    }

    @Override
    public byte[] read(String key) {
        try {
            return client.getObjectAsBytes(request -> request.bucket(bucket).key(key)).asByteArray();
        } catch (NoSuchKeyException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "PDF file not found", exception);
        } catch (SdkException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "PDF could not be read from S3", exception);
        }
    }

    @Override
    public void delete(String key) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    deleteQuietly(key);
                }
            });
            return;
        }

        client.deleteObject(request -> request.bucket(bucket).key(key));
    }

    private void deleteQuietly(String key) {
        try {
            client.deleteObject(request -> request.bucket(bucket).key(key));
        } catch (SdkException exception) {
            log.warn("Could not clean up S3 object {}", key, exception);
        }
    }

    @PreDestroy
    void close() {
        client.close();
    }
}
