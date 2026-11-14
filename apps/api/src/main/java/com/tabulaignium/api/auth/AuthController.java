package com.tabulaignium.api.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.tabulaignium.api.auth.GoogleOidcUserService.AccountPrincipal;
import com.tabulaignium.api.region.RegionInterestService;

@RestController
class AuthController {

    private static final Set<String> NATIONALITY_CODES = Locale.getISOCountries(Locale.IsoCountryCode.PART1_ALPHA2);

    private final UserRepository users;
    private final GoogleAccountService accounts;
    private final SecurityContextRepository securityContexts;
    private final CsrfTokenRepository csrfTokens;
    private final UserProfileService profiles;
    private final RegionInterestService regionInterests;

    AuthController(UserRepository users, GoogleAccountService accounts,
            SecurityContextRepository securityContexts, CsrfTokenRepository csrfTokens,
            UserProfileService profiles, RegionInterestService regionInterests) {
        this.users = users;
        this.accounts = accounts;
        this.securityContexts = securityContexts;
        this.csrfTokens = csrfTokens;
        this.profiles = profiles;
        this.regionInterests = regionInterests;
    }

    @GetMapping("/api/me")
    ResponseEntity<?> me(@AuthenticationPrincipal AccountPrincipal principal) {
        if (principal.userId() == null) {
            return uncached(new PendingSignup(true, principal.getFullName(), GoogleAccountService.verifiedEmail(principal)));
        }
        return users.findById(principal.userId())
                .map(user -> uncached(currentUser(user)))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    @PostMapping("/api/signup")
    ResponseEntity<CurrentUser> signup(@AuthenticationPrincipal AccountPrincipal principal,
            OAuth2AuthenticationToken authentication, @Valid @RequestBody SignupRequest signup,
            HttpServletRequest request, HttpServletResponse response) {
        if (!NATIONALITY_CODES.contains(signup.nationalityCode())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown nationality code");
        }

        long userId = accounts.completeSignup(principal, signup.name().strip(),
                signup.nationalityCode(), signup.regionIds());
        User user = users.findById(userId).orElseThrow();
        var registered = new AccountPrincipal(principal, userId);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new OAuth2AuthenticationToken(registered,
                registered.getAuthorities(), authentication.getAuthorizedClientRegistrationId()));

        request.changeSessionId();
        csrfTokens.saveToken(null, request, response);
        SecurityContextHolder.setContext(context);
        securityContexts.saveContext(context, request, response);
        return uncached(currentUser(user));
    }

    @PutMapping("/api/me")
    ResponseEntity<CurrentUser> updateMe(@AuthenticationPrincipal AccountPrincipal principal,
            @Valid @RequestBody ProfileRequest profile) {
        if (!NATIONALITY_CODES.contains(profile.nationalityCode())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown nationality code");
        }
        User user = profiles.update(principal.userId(), profile.name().strip(),
                profile.nationalityCode(), profile.regionIds());
        return uncached(currentUser(user));
    }

    @GetMapping("/api/csrf")
    ResponseEntity<CsrfResponse> csrf(CsrfToken csrfToken) {
        return uncached(new CsrfResponse(csrfToken.getHeaderName(), csrfToken.getToken()));
    }

    private CurrentUser currentUser(User user) {
        return new CurrentUser(user.getId(), user.getName(), user.getEmail(),
                user.getNationalityCode(), regionInterests.selectedRegions(user.getId()));
    }

    private static <T> ResponseEntity<T> uncached(T response) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(response);
    }

    record SignupRequest(@NotBlank @Size(max = 100) String name,
            @NotBlank @Pattern(regexp = "[A-Z]{2}") String nationalityCode,
            @NotEmpty @Size(max = 5) List<@Positive Long> regionIds) {
    }

    record ProfileRequest(@NotBlank @Size(max = 100) String name,
            @NotBlank @Pattern(regexp = "[A-Z]{2}") String nationalityCode,
            @NotEmpty @Size(max = 5) List<@Positive Long> regionIds) {
    }

    record PendingSignup(boolean registrationRequired, String name, String email) {
    }

    record CurrentUser(long id, String name, String email, String nationalityCode,
            List<RegionInterestService.SelectedRegion> interestedRegions) {
    }

    record CsrfResponse(String headerName, String token) {
    }
}
