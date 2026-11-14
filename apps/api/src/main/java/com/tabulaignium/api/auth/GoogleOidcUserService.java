package com.tabulaignium.api.auth;

import java.io.Serial;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;

@Service
class GoogleOidcUserService implements OAuth2UserService<OidcUserRequest, OidcUser> {

    private final OidcUserService delegate = new OidcUserService();
    private final GoogleAccountService accounts;

    GoogleOidcUserService(GoogleAccountService accounts) {
        this.accounts = accounts;
    }

    @Override
    public OidcUser loadUser(OidcUserRequest request) {
        OidcUser googleUser = delegate.loadUser(request);
        return new AccountPrincipal(googleUser, accounts.findOrCreateUser(googleUser));
    }

    static final class AccountPrincipal extends DefaultOidcUser {

        @Serial
        private static final long serialVersionUID = 1L;

        private final long userId;

        AccountPrincipal(OidcUser googleUser, long userId) {
            super(googleUser.getAuthorities(), googleUser.getIdToken(), googleUser.getUserInfo());
            this.userId = userId;
        }

        long userId() {
            return userId;
        }
    }
}
