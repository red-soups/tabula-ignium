package com.tabulaignium.api.auth;

import com.tabulaignium.api.region.RegionInterestService;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
class GoogleAccountService {

    private static final String PROVIDER = "google";

    private final UserRepository users;
    private final OAuthAccountRepository accounts;
    private final RegionInterestService regionInterests;
    private final TransactionTemplate transactions;

    GoogleAccountService(UserRepository users, OAuthAccountRepository accounts,
            RegionInterestService regionInterests, TransactionTemplate transactions) {
        this.users = users;
        this.accounts = accounts;
        this.regionInterests = regionInterests;
        this.transactions = transactions;
    }

    Long findExistingUser(OidcUser googleUser) {
        String subject = googleUser.getSubject();
        if (subject == null || subject.isBlank() || subject.length() > 255) {
            throw new OAuth2AuthenticationException("invalid_google_subject");
        }
        verifiedEmail(googleUser);
        return transactions.execute(status -> findUserId(subject).orElse(null));
    }

    long completeSignup(OidcUser googleUser, String name, List<Long> regionIds) {
        String subject = googleUser.getSubject();
        String email = verifiedEmail(googleUser);

        try {
            return transactions.execute(status -> findUserId(subject).orElseGet(() -> {
                rejectEmailConflict(email);
                User user = users.save(new User(name, email));
                accounts.save(new OAuthAccount(user, PROVIDER, subject));
                regionInterests.attach(user.getId(), regionIds);
                return user.getId();
            }));
        } catch (DataIntegrityViolationException failure) {
            // Look up the winning insert after this transaction has rolled back.
            return transactions.execute(status -> findUserId(subject).orElseGet(() -> {
                rejectEmailConflict(email);
                throw failure;
            }));
        }
    }

    static String verifiedEmail(OidcUser googleUser) {
        String email = googleUser.getEmail();
        if (!Boolean.TRUE.equals(googleUser.getEmailVerified()) || email == null
                || email.isBlank() || email.length() > 255) {
            throw new OAuth2AuthenticationException("unverified_google_email");
        }
        return email.toLowerCase(Locale.ROOT);
    }

    private Optional<Long> findUserId(String subject) {
        return accounts.findByProviderAndProviderUserId(PROVIDER, subject)
                .map(account -> account.getUser().getId());
    }

    private void rejectEmailConflict(String email) {
        if (users.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already registered");
        }
    }
}
