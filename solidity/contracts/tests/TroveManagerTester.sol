// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../TroveManager.sol";

/* Tester contract inherits from TroveManager, and provides external functions
for testing the parent's internal functions. */

contract TroveManagerTester is TroveManager {
    function setBaseRate(uint256 _baseRate) external {
        baseRate = _baseRate;
    }

    function callUpdateDefaultPoolInterest() external {
        updateDefaultPoolInterest();
    }

    function computeICR(
        uint256 _coll,
        uint256 _debt,
        uint256 _price
    ) external pure returns (uint) {
        return LiquityMath._computeCR(_coll, _debt, _price);
    }

    function getMUSDGasCompensation() external pure returns (uint) {
        return MUSD_GAS_COMPENSATION;
    }

    function getCompositeDebt(uint256 _debt) external pure returns (uint) {
        return _getCompositeDebt(_debt);
    }
}
