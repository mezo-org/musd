// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "./BaseMath.sol";
import "./InterestRateMath.sol";
import "./LiquityMath.sol";
import "../interfaces/IActivePool.sol";
import "../interfaces/IDefaultPool.sol";
import "../interfaces/IInterestRateManager.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/ILiquityBase.sol";

/*
 * Base contract for TroveManager, BorrowerOperations and StabilityPool. Contains global system constants and
 * common functions.
 */
abstract contract LiquityBase is BaseMath, ILiquityBase {
    uint256 public constant _100pct = 1e18; // 1e18 == 100%

    // Minimum collateral ratio for individual troves
    uint256 public constant MCR = 1.1e18; // 110%

    // Critical system collateral ratio. If the system's total collateral ratio (TCR) falls below the CCR, Recovery Mode is triggered.
    uint256 public constant CCR = 1.5e18; // 150%

    // Amount of mUSD to be locked in gas pool on opening troves
    uint256 public constant MUSD_GAS_COMPENSATION = 2e18;

    uint256 public constant PERCENT_DIVISOR = 200; // dividing by 200 yields 0.5%

    // slither-disable-next-line all
    IActivePool public activePool;

    // slither-disable-next-line all
    IDefaultPool public defaultPool;

    // slither-disable-next-line all
    IInterestRateManager public interestRateManager;

    // slither-disable-next-line all
    IPriceFeed public override priceFeed;

    // slither-disable-next-line unused-state
    uint256[50] private __gap;

    // --- Gas compensation functions ---

    function getEntireSystemColl()
        public
        view
        virtual
        returns (uint256 entireSystemColl)
    {
        uint256 activeColl = activePool.getCollateralBalance();
        uint256 liquidatedColl = defaultPool.getCollateralBalance();

        return activeColl + liquidatedColl;
    }

    function getEntireSystemDebt()
        public
        view
        virtual
        returns (uint256 entireSystemDebt)
    {
        uint256 activeDebt = activePool.getDebt();
        uint256 closedDebt = defaultPool.getDebt();

        return activeDebt + closedDebt;
    }

    function _getTCR(
        uint256 _price
    ) internal view virtual returns (uint256 TCR) {
        uint256 entireSystemColl = getEntireSystemColl();
        uint256 entireSystemDebt = getEntireSystemDebt();

        TCR = LiquityMath._computeCR(
            entireSystemColl,
            entireSystemDebt,
            _price
        );
        return TCR;
    }

    function _checkRecoveryMode(
        uint256 _price
    ) internal view virtual returns (bool) {
        uint256 TCR = _getTCR(_price);
        return TCR < CCR;
    }

    // Return the amount of collateral to be drawn from a trove's collateral and sent as gas compensation.
    function _getCollGasCompensation(
        uint256 _entireColl
    ) internal pure virtual returns (uint) {
        return _entireColl / PERCENT_DIVISOR;
    }

    // Returns the composite debt (drawn debt + gas compensation) of a trove,
    // for the purpose of ICR calculation
    function _getCompositeDebt(uint256 _debt) internal pure returns (uint) {
        return _debt + MUSD_GAS_COMPENSATION;
    }

    function _getNetDebt(uint256 _debt) internal pure returns (uint) {
        return _debt - MUSD_GAS_COMPENSATION;
    }
}
