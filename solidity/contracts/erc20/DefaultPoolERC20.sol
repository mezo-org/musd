// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../dependencies/CheckContract.sol";
import "./SendCollateralERC20.sol";
import "../interfaces/erc20/IActivePoolERC20.sol";
import "../interfaces/erc20/IDefaultPoolERC20.sol";

/**
 * @title DefaultPoolERC20
 * @notice Holds the ERC20 collateral and debt from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 * @dev When a trove makes an operation that applies its pending collateral and debt, its pending
 * collateral and debt is moved from the Default Pool to the Active Pool.
 *
 * Key differences from native DefaultPool:
 * - Uses ERC20 token instead of native BTC
 * - Replaces receive() with receiveCollateral(uint256)
 * - Uses SafeERC20 for transfers
 */
contract DefaultPoolERC20 is
    CheckContract,
    IDefaultPoolERC20,
    OwnableUpgradeable,
    SendCollateralERC20
{
    using SafeERC20 for IERC20;

    IERC20 public override collateralToken;
    address public activePoolAddress;
    address public troveManagerAddress;

    uint256 internal collateral; // deposited collateral tracker
    uint256 internal principal;
    uint256 internal interest;

    function initialize() external initializer {
        __Ownable_init(msg.sender);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Dependency setters ---

    function setAddresses(
        address _collateralTokenAddress,
        address _activePoolAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        checkContract(_collateralTokenAddress);
        checkContract(_activePoolAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        collateralToken = IERC20(_collateralTokenAddress);
        activePoolAddress = _activePoolAddress;
        troveManagerAddress = _troveManagerAddress;
        // slither-disable-end missing-zero-check

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

        renounceOwnership();
    }

    // --- Collateral receiving function ---

    /**
     * @notice Receives ERC20 collateral into the pool
     * @dev Replaces the native receive() function
     * @param _amount The amount of collateral to receive
     */
    function receiveCollateral(uint256 _amount) external override {
        _requireCallerIsActivePool();
        _receiveCollateralERC20(collateralToken, msg.sender, _amount);
        collateral += _amount;
        emit DefaultPoolCollateralBalanceUpdated(collateral);
        emit CollateralReceived(msg.sender, _amount);
    }

    // --- Debt management ---

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

    // --- Collateral sending ---

    /**
     * @notice Sends collateral to the Active Pool
     * @dev First approves the Active Pool to spend the collateral, then calls receiveCollateral
     * @param _amount The amount of collateral to send
     */
    function sendCollateralToActivePool(uint256 _amount) external override {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        collateral -= _amount;
        emit DefaultPoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(activePool, _amount);

        // Approve and send to ActivePool via receiveCollateral
        collateralToken.safeIncreaseAllowance(activePool, _amount);
        IActivePoolERC20(activePool).receiveCollateral(_amount);
    }

    // --- Getters ---

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

    // --- Access control ---

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "DefaultPoolERC20: Caller is not the TroveManager"
        );
    }

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == activePoolAddress,
            "DefaultPoolERC20: Caller is not the ActivePool"
        );
    }
}
