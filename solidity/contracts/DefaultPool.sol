// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IActivePool.sol";
import "./interfaces/IDefaultPool.sol";

/*
 * The Default Pool holds the collateral and debt (but not mUSD tokens) from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending collateral and debt, its pending collateral and debt is moved
 * from the Default Pool to the Active Pool.
 */
contract DefaultPool is Ownable, CheckContract, SendCollateral, IDefaultPool {
    address public activePoolAddress;
    address public collateralAddress;
    address public troveManagerAddress;
    uint256 internal collateral; // deposited collateral tracker
    uint256 internal principal;
    uint256 internal interest;

    constructor() Ownable(msg.sender) {}

    // solhint-disable no-complex-fallback
    receive() external payable {
        _requireCallerIsActivePool();
        require(
            collateralAddress == address(0),
            "DefaultPool: ERC20 collateral needed, not BTC"
        );
        collateral += msg.value;
        emit DefaultPoolCollateralBalanceUpdated(collateral);
    }

    // --- Dependency setters ---

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress,
        address _collateralAddress
    ) external onlyOwner {
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        if (_collateralAddress != address(0)) {
            checkContract(_collateralAddress);
        }

        // slither-disable-next-line missing-zero-check
        troveManagerAddress = _troveManagerAddress;
        // slither-disable-next-line missing-zero-check
        activePoolAddress = _activePoolAddress;
        collateralAddress = _collateralAddress;

        require(
            (Ownable(_activePoolAddress).owner() != address(0) ||
                IActivePool(_activePoolAddress).collateralAddress() ==
                _collateralAddress),
            "The same collateral address must be used for the entire set of contracts"
        );

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit CollateralAddressChanged(_collateralAddress);

        renounceOwnership();
    }

    function increaseDebt(
        uint256 _principal,
        uint256 _interest
    ) external override {
        _requireCallerIsTroveManager();
        principal += _principal;
        interest += _interest;
        emit DefaultPoolDebtUpdated(principal, interest);
    }

    function decreaseDebt(
        uint256 _principal,
        uint256 _interest
    ) external override {
        _requireCallerIsTroveManager();
        principal -= _principal;
        interest -= _interest;
        emit DefaultPoolDebtUpdated(principal, interest);
    }

    function sendCollateralToActivePool(uint256 _amount) external override {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        collateral -= _amount;
        emit DefaultPoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(activePool, _amount);

        sendCollateral(IERC20(collateralAddress), activePool, _amount);
    }

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

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "DefaultPool: Caller is not the TroveManager"
        );
    }

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == activePoolAddress,
            "DefaultPool: Caller is not the ActivePool"
        );
    }
}
