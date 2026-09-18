// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Per-parent breed cooldown shared by Kin modules. Not identity.
library KinClock {
    uint64 internal constant MAX_COOLDOWN = 7 days;
    uint64 internal constant DEFAULT_COOLDOWN = 24 hours;

    error Cooldown();
    error CooldownCap();

    function check(
        mapping(uint256 => uint64) storage lastBredAt,
        uint256 parentA,
        uint256 parentB,
        uint64 cooldown
    ) internal view {
        uint64 nowTs = uint64(block.timestamp);
        if (nowTs < lastBredAt[parentA] + cooldown) revert Cooldown();
        if (nowTs < lastBredAt[parentB] + cooldown) revert Cooldown();
    }

    function stamp(mapping(uint256 => uint64) storage lastBredAt, uint256 parentA, uint256 parentB) internal {
        uint64 nowTs = uint64(block.timestamp);
        lastBredAt[parentA] = nowTs;
        lastBredAt[parentB] = nowTs;
    }

    function setCooldown(uint64 next) internal pure returns (uint64) {
        if (next > MAX_COOLDOWN) revert CooldownCap();
        return next;
    }
}
