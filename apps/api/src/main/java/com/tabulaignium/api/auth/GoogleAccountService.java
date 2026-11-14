package com.tabulaignium.api.auth;

import java.util.Locale;
import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
class GoogleAccountService {

    private static final String PROVIDER = "google";

    private final UserRepository users;
    private final OAuthAccountRepository accounts;
    private final TransactionTemplate transactions;

    GoogleAccountService(UserRepository users, OAuthAccountRepository accounts,
            TransactionTemplate transactions) {
        this.users = users;
        this.accounts = accounts;
        this.transactions = transactions;
    }

    long findOrCreateUser(OidcUser googleUser) {
        String subject = googleUser.getSubject();
        if (subject == null || subject.isBlank() || subject.length() > 255) {
            throw new OAuth2AuthenticationException("invalid_google_subject");
        }

        String email = googleUser.getEmail();
        if (!Boolean.TRUE.equals(googleUser.getEmailVerified()) || email == null
                || email.isBlank() || email.length() > 255) {
            throw new OAuth2AuthenticationException("unverified_google_email");
        }
        String normalizedEmail = email.toLowerCase(Locale.ROOT);

        try {
            return transactions.execute(status -> findUserId(subject)
                    .orElseGet(() -> registerUser(googleUser.getFullName(), normalizedEmail, subject)));
        } catch (DataIntegrityViolationException failure) {
            // A concurrent insert may have won. Read again after the failed transaction rolls back.
            return transactions.execute(status -> findUserId(subject).orElseGet(() -> {
                rejectEmailConflict(normalizedEmail);
                throw failure;
            }));
        }
    }

    private Optional<Long> findUserId(String subject) {
        return accounts.findByProviderAndProviderUserId(PROVIDER, subject)
                .map(account -> account.getUser().getId());
    }

    private long registerUser(String name, String email, String subject) {
        rejectEmailConflict(email);
        User user = users.save(new User(displayName(name, email), email));
        accounts.save(new OAuthAccount(user, PROVIDER, subject));
        return user.getId();
    }

    private void rejectEmailConflict(String email) {
        if (users.existsByEmailIgnoreCase(email)) {
            throw new OAuth2AuthenticationException("account_email_conflict");
        }
    }

    private String displayName(String name, String email) {
        String value = name == null || name.isBlank() ? email : name.strip();
        int length = value.codePointCount(0, value.length());
        return value.substring(0, value.offsetByCodePoints(0, Math.min(length, 100)));
    }
}
