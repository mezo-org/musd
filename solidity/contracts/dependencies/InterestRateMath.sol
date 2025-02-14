// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

library InterestRateMath {
    uint256 private constant SECONDS_IN_A_YEAR = 365 * 24 * 60 * 60;

    function calculateInterestOwed(
        uint256 _principal,
        uint16 _interestRate,
        uint256 startTime,
        uint256 endTime
    ) internal pure returns (uint256) {
        uint256 timeElapsed = endTime - startTime;
        return
            (_principal * _interestRate * timeElapsed) /
            (10000 * SECONDS_IN_A_YEAR);
    }
}
