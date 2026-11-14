package com.tabulaignium.api.auth;

import java.io.Serial;
import java.util.List;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;

@Service
class GoogleOidcUserService implements OAuth2UserService<OidcUserRequest, OidcUser> {

    static final String SIGNUP_REQUIRED = "SIGNUP_REQUIRED";
    static final String REGISTERED_USER = "REGISTERED_USER";

    private final OidcUserService delegate = new OidcUserService();
    private final GoogleAccountService accounts;

    GoogleOidcUserService(GoogleAccountService accounts) {
        this.accounts = accounts;
    }

    @Override
    public OidcUser loadUser(OidcUserRequest request) {
        OidcUser googleUser = delegate.loadUser(request);
        return new AccountPrincipal(googleUser, accounts.findExistingUser(googleUser));
    }

    static final class AccountPrincipal extends DefaultOidcUser {

        @Serial
        private static final long serialVersionUID = 1L;

        private final Long userId;

        AccountPrincipal(OidcUser googleUser, Long userId) {
            super(List.of(new SimpleGrantedAuthority(userId == null ? SIGNUP_REQUIRED : REGISTERED_USER)),
                    googleUser.getIdToken(), googleUser.getUserInfo());
            this.userId = userId;
        }

        Long userId() {
            return userId;
        }
    }
}
