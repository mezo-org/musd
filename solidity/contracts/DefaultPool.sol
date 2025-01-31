// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
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
contract DefaultPool is
    CheckContract,
    IDefaultPool,
    Initializable,
    OwnableUpgradeable,
    SendCollateral
{
    address public activePoolAddress;
    address public troveManagerAddress;

    uint256 internal collateral; // deposited collateral tracker
    uint256 internal principal;
    uint256 internal interest;
    uint256 internal lastInterestUpdatedTime;

    function initialize(address _owner) external virtual initializer {
        __Ownable_init_unchained(_owner);
    }

    // solhint-disable no-complex-fallback
    receive() external payable {
        _requireCallerIsActivePool();
        collateral += msg.value;
        emit DefaultPoolCollateralBalanceUpdated(collateral);
    }

    // --- Dependency setters ---

    function setAddresses(
        address _activePoolAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        checkContract(_activePoolAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        activePoolAddress = _activePoolAddress;
        troveManagerAddress = _troveManagerAddress;
        // slither-disable-end missing-zero-check

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

        renounceOwnership();
    }

    function increaseDebt(
        uint256 _principal,
        uint256 _interest
    ) external override {
        _requireCallerIsTroveManager();
        principal += _principal;
        interest += _interest;
        // solhint-disable-next-line not-rely-on-time
        lastInterestUpdatedTime = block.timestamp;
        emit DefaultPoolDebtUpdated(principal, interest);
    }

    function decreaseDebt(
        uint256 _principal,
        uint256 _interest
    ) external override {
        _requireCallerIsTroveManager();
        principal -= _principal;
        interest -= _interest;
        // solhint-disable-next-line not-rely-on-time
        lastInterestUpdatedTime = block.timestamp;
        emit DefaultPoolDebtUpdated(principal, interest);
    }

    function sendCollateralToActivePool(uint256 _amount) external override {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        collateral -= _amount;
        emit DefaultPoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(activePool, _amount);

        _sendCollateral(activePool, _amount);
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

    function getLastInterestUpdatedTime()
        external
        view
        override
        returns (uint)
    {
        return lastInterestUpdatedTime;
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
