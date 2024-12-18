// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IActivePool.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IDefaultPool.sol";
import "./interfaces/IStabilityPool.sol";

/*
 * The Active Pool holds the collateral and debt (but not mUSD tokens) for all active troves.
 *
 * When a trove is liquidated, it's collateral and debt are transferred from the Active Pool, to either the
 * Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 *
 */
contract ActivePool is Ownable, CheckContract, SendCollateral, IActivePool {
    address public borrowerOperationsAddress;
    address public collSurplusPoolAddress;
    address public collateralAddress;
    address public defaultPoolAddress;
    address public interestRateManagerAddress;
    address public stabilityPoolAddress;
    address public troveManagerAddress;

    uint256 internal collateral; // deposited collateral tracker
    uint256 internal principal;
    uint256 internal interest;

    constructor() Ownable(msg.sender) {}

    // --- Fallback function ---

    // This executes when the contract receives BTC
    // solhint-disable no-complex-fallback
    receive() external payable {
        _requireCallerIsBorrowerOperationsOrDefaultPool();
        require(
            collateralAddress == address(0),
            "ActivePool: ERC20 collateral needed, not BTC"
        );
        collateral += msg.value;
        emit ActivePoolCollateralBalanceUpdated(collateral);
    }

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _interestRateManagerAddress,
        address _stabilityPoolAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_interestRateManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        borrowerOperationsAddress = _borrowerOperationsAddress;
        collateralAddress = address(0);
        collSurplusPoolAddress = _collSurplusPoolAddress;
        defaultPoolAddress = _defaultPoolAddress;
        interestRateManagerAddress = _interestRateManagerAddress;
        stabilityPoolAddress = _stabilityPoolAddress;
        troveManagerAddress = _troveManagerAddress;
        // slither-disable-end missing-zero-check

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit InterestRateManagerAddressChanged(_interestRateManagerAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    function increaseDebt(
        uint256 _principal,
        uint256 _interest
    ) external override {
        _requireCallerIsBorrowerOperationsOrTroveManagerOrInterestRateManager();
        principal += _principal;
        interest += _interest;
        emit ActivePoolDebtUpdated(principal, interest);
    }

    function decreaseDebt(
        uint256 _principal,
        uint256 _interest
    ) external override {
        _requireCallerIsBOorTroveMorSP();
        principal -= _principal;
        interest -= _interest;
        emit ActivePoolDebtUpdated(principal, interest);
    }

    function sendCollateral(
        address _account,
        uint256 _amount
    ) external override {
        _requireCallerIsBOorTroveMorSP();
        collateral -= _amount;
        emit ActivePoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(_account, _amount);

        sendCollateral(IERC20(collateralAddress), _account, _amount);
    }

    /*
     * Returns the collateral state variable.
     *
     * Not necessarily equal to the the contract's raw collateral balance - collateral can be forcibly sent to contracts.
     */
    function getCollateralBalance() external view override returns (uint) {
        return collateral;
    }

    function getDebt() external view override returns (uint) {
        return principal + interest;
    }

    function getPrincipal() external view override returns (uint) {
        return principal;
    }

    function getInterest() external view override returns (uint) {
        return interest;
    }

    function _requireCallerIsBorrowerOperationsOrDefaultPool() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == defaultPoolAddress,
            "ActivePool: Caller is neither BorrowerOperations nor Default Pool"
        );
    }

    function _requireCallerIsBorrowerOperationsOrTroveManagerOrInterestRateManager()
        internal
        view
    {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress ||
                msg.sender == interestRateManagerAddress,
            "ActivePool: Caller must be BorrowerOperations, TroveManager, or InterestRateManager"
        );
    }

    function _requireCallerIsBOorTroveMorSP() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress ||
                msg.sender == stabilityPoolAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool"
        );
    }
}
