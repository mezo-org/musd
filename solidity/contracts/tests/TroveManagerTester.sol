// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../TroveManagerV2.sol";

/* Tester contract inherits from TroveManager, and provides external functions
for testing the parent's internal functions. */

contract TroveManagerTester is TroveManagerV2 {
    function unprotectedDecayBaseRateFromBorrowing() external returns (uint) {
        baseRate = _calcDecayedBaseRate();
        assert(baseRate <= DECIMAL_PRECISION);

        _updateLastFeeOpTime();
        return baseRate;
    }

    function setLastFeeOpTimeToNow() external {
        // solhint-disable-next-line not-rely-on-time
        lastFeeOperationTime = block.timestamp;
    }

    function setBaseRate(uint256 _baseRate) external {
        baseRate = _baseRate;
    }

    function callInternalRemoveTroveOwner(address _troveOwner) external {
        uint256 troveOwnersArrayLength = TroveOwners.length;
        _removeTroveOwner(_troveOwner, troveOwnersArrayLength);
    }

    function minutesPassedSinceLastFeeOp() external view returns (uint) {
        return _minutesPassedSinceLastFeeOp();
    }

    function callGetRedemptionFee(
        uint256 _collateralDrawn
    ) external view returns (uint) {
        return _getRedemptionFee(_collateralDrawn);
    }

    function computeICR(
        uint256 _coll,
        uint256 _debt,
        uint256 _price
    ) external pure returns (uint) {
        return LiquityMath._computeCR(_coll, _debt, _price);
    }

    function getCollGasCompensation(
        uint256 _coll
    ) external pure returns (uint) {
        return _getCollGasCompensation(_coll);
    }

    function getMUSDGasCompensation() external pure returns (uint) {
        return MUSD_GAS_COMPENSATION;
    }

    function getCompositeDebt(uint256 _debt) external pure returns (uint) {
        return _getCompositeDebt(_debt);
    }

    function getActualDebtFromComposite(
        uint256 _debtVal
    ) external pure returns (uint) {
        return _getNetDebt(_debtVal);
    }
}
