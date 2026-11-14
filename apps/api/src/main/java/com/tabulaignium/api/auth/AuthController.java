package com.tabulaignium.api.auth;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class AuthController {

    private final UserRepository users;

    AuthController(UserRepository users) {
        this.users = users;
    }

    @GetMapping("/api/me")
    ResponseEntity<CurrentUser> me(@AuthenticationPrincipal GoogleOidcUserService.AccountPrincipal principal) {
        return users.findById(principal.userId())
                .map(user -> ResponseEntity.ok()
                        .cacheControl(CacheControl.noStore())
                        .body(new CurrentUser(user.getId(), user.getName(), user.getEmail())))
                .orElseGet(() -> ResponseEntity.status(401).build());
    }

    @GetMapping("/api/csrf")
    ResponseEntity<CsrfResponse> csrf(CsrfToken csrfToken) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new CsrfResponse(csrfToken.getHeaderName(), csrfToken.getToken()));
    }

    record CurrentUser(long id, String name, String email) {
    }

    record CsrfResponse(String headerName, String token) {
    }
}
