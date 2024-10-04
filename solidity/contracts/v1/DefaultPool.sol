// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IDefaultPool.sol";
import "./interfaces/IActivePool.sol";

/*
 * The Default Pool holds the collateral and MUSD debt (but not MUSD tokens) from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending collateral and MUSD debt, its pending collateral and MUSD debt is moved
 * from the Default Pool to the Active Pool.
 */
contract DefaultPool is Ownable, CheckContract, SendCollateral, IDefaultPool {
    address public activePoolAddress;
    address public troveManagerAddress;
    uint256 internal collateral; // deposited collateral tracker
    uint256 internal MUSDDebt; // debt

    constructor() Ownable(msg.sender) {}

    // solhint-disable no-complex-fallback
    receive() external payable {
        _requireCallerIsActivePool();
        collateral += msg.value;
        emit DefaultPoolCollateralBalanceUpdated(collateral);
    }

    // --- Dependency setters ---

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress
    ) external onlyOwner {
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);

        // slither-disable-next-line missing-zero-check
        troveManagerAddress = _troveManagerAddress;
        // slither-disable-next-line missing-zero-check
        activePoolAddress = _activePoolAddress;

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

        renounceOwnership();
    }

    function increaseMUSDDebt(uint256 _amount) external override {
        _requireCallerIsTroveManager();
        MUSDDebt += _amount;
        emit DefaultPoolMUSDDebtUpdated(MUSDDebt);
    }

    function decreaseMUSDDebt(uint256 _amount) external override {
        _requireCallerIsTroveManager();
        MUSDDebt -= _amount;
        emit DefaultPoolMUSDDebtUpdated(MUSDDebt);
    }

    function sendCollateralToActivePool(uint256 _amount) external override {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        collateral -= _amount;
        emit DefaultPoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(activePool, _amount);

        sendCollateral(IERC20(address(0)), activePool, _amount);
        if (collateralAddress == address(0)) {
            return;
        }
        IActivePool(activePool).updateCollateralBalance(_amount);
    }

    // When ERC20 token collateral is received this function needs to be called
    function updateCollateralBalance(uint256 _amount) external override {
        _requireCallerIsActivePool();
        require(
            collateralAddress != address(0),
            "DefaultPool: BTC collateral needed, not ERC20"
        );
        collateral += _amount;
        emit DefaultPoolCollateralBalanceUpdated(collateral);
    }

    function getCollateralBalance() external view override returns (uint) {
        return collateral;
    }

    function getMUSDDebt() external view override returns (uint) {
        return MUSDDebt;
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
