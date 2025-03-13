// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

library InterestRateMath {
    // https://sibenotes.com/maths/how-many-seconds-are-in-a-year/
    // 365.2425 days per year * 24 hours per day *
    // 60 minutes per hour * 60 seconds per minute
    uint256 public constant SECONDS_IN_A_YEAR = 31_556_952;
    uint256 private constant BPS = 10_000;

    function calculateInterestOwed(
        uint256 _principal,
        uint16 _interestRate,
        uint256 _startTime,
        uint256 _endTime
    ) internal pure returns (uint256) {
        uint256 timeElapsed = _endTime - _startTime;
        return
            (_principal * _interestRate * timeElapsed) /
            (BPS * SECONDS_IN_A_YEAR);
    }

    function calculateAggregatedInterestOwed(
        uint256 _interestNumerator,
        uint256 _startTime,
        uint256 _endTime
    ) internal pure returns (uint256) {
        uint256 timeElapsed = _endTime - _startTime;
        return (timeElapsed * _interestNumerator) / (BPS * SECONDS_IN_A_YEAR);
    }
}
