// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../TroveManager.sol";

/* Tester contract inherits from TroveManager, and provides external functions
for testing the parent's internal functions. */

contract TroveManagerTester is TroveManager {
    function callUpdateDefaultPoolInterest() external {
        updateDefaultPoolInterest();
    }

    function getMUSDGasCompensation() external view returns (uint) {
        return borrowerOperations.musdGasCompensation();
    }

    function getCompositeDebt(uint256 _debt) external view returns (uint) {
        return borrowerOperations.getCompositeDebt(_debt);
    }

    function computeICR(
        uint256 _coll,
        uint256 _debt,
        uint256 _price
    ) external pure returns (uint) {
        return LiquityMath._computeCR(_coll, _debt, _price);
    }
}
