// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../TroveManager.sol";

/* Tester contract inherits from TroveManager, and provides external functions
for testing the parent's internal functions. */

contract TroveManagerTester is TroveManager {
    function getCompositeDebt(uint256 _debt) external pure returns (uint) {
        return _getCompositeDebt(_debt);
    }

    function computeICR(
        uint256 _coll,
        uint256 _debt,
        uint256 _price
    ) external pure returns (uint) {
        return LiquityMath._computeCR(_coll, _debt, _price);
    }

    function calculateInterestOwed(
        uint256 _principal,
        uint16 _interestRate,
        uint256 startTime,
        uint256 endTime
    ) external pure returns (uint256) {
        return
            InterestRateMath.calculateInterestOwed(
                _principal,
                _interestRate,
                startTime,
                endTime
            );
    }
}
