package com.tabulaignium.api.auth;

import com.tabulaignium.api.region.RegionInterestService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class UserProfileService {

    private final UserRepository users;
    private final RegionInterestService regionInterests;

    UserProfileService(UserRepository users, RegionInterestService regionInterests) {
        this.users = users;
        this.regionInterests = regionInterests;
    }

    @Transactional
    User update(long userId, String name, List<Long> regionIds) {
        User user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        regionInterests.replace(userId, regionIds);
        user.updateProfile(name);
        return user;
    }
}
