// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./BaseMath.sol";
import "./LiquityMath.sol";
import "../interfaces/IActivePool.sol";
import "../interfaces/IDefaultPool.sol";
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
    uint256 public constant MUSD_GAS_COMPENSATION = 200e18;

    uint256 public constant PERCENT_DIVISOR = 200; // dividing by 200 yields 0.5%

    uint256 public constant BORROWING_FEE_FLOOR = ((DECIMAL_PRECISION * 5) /
        1000); // 0.5%

    // slither-disable-next-line all
    IActivePool public activePool;

    // slither-disable-next-line all
    IDefaultPool public defaultPool;

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
}
