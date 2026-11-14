package com.tabulaignium.api.auth;

import static com.tabulaignium.api.auth.GoogleOidcUserService.REGISTERED_USER;
import static com.tabulaignium.api.auth.GoogleOidcUserService.SIGNUP_REQUIRED;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizedClientRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;

@Configuration
class SecurityConfig {

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    CsrfTokenRepository csrfTokenRepository() {
        return new HttpSessionCsrfTokenRepository();
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, GoogleOidcUserService googleUsers,
            SecurityContextRepository securityContexts, CsrfTokenRepository csrfTokens,
            @Value("${app.auth.web-origin:}") String webOrigin) throws Exception {
        String loginSuccessUrl = "/api/me";
        var loginFailure = new SimpleUrlAuthenticationFailureHandler();
        if (!webOrigin.isBlank()) {
            URI origin = URI.create(webOrigin);
            if (origin.getHost() == null || !("https".equals(origin.getScheme()) || "http".equals(origin.getScheme()))
                    || origin.getUserInfo() != null || origin.getQuery() != null || origin.getFragment() != null
                    || !origin.getPath().isEmpty() && !"/".equals(origin.getPath())) {
                throw new IllegalArgumentException("WEB_ORIGIN must be an HTTP or HTTPS origin");
            }
            loginSuccessUrl = origin.resolve("/").toString();
            loginFailure.setDefaultFailureUrl(origin.resolve("/?login=failed").toString());
        }
        String successUrl = loginSuccessUrl;

        return http
                .securityContext(context -> context.securityContextRepository(securityContexts))
                .csrf(csrf -> csrf.csrfTokenRepository(csrfTokens))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers("/oauth2/authorization/google", "/login/oauth2/code/google", "/error")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/me", "/api/csrf").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/signup").hasAuthority(SIGNUP_REQUIRED)
                        .anyRequest().hasAuthority(REGISTERED_USER))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .requestCache(cache -> cache.disable())
                .oauth2Login(oauth -> oauth
                        .authorizedClientRepository(new HttpSessionOAuth2AuthorizedClientRepository())
                        .userInfoEndpoint(userInfo -> userInfo.oidcUserService(googleUsers))
                        .defaultSuccessUrl(successUrl, true)
                        .failureHandler(loginFailure))
                .logout(logout -> logout
                        .logoutUrl("/api/logout")
                        .deleteCookies("JSESSIONID")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
                .build();
    }
}
