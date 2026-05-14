// SPDX-License-Identifier: GPL-3.0

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
 * @notice The Default Pool holds the ERC20 collateral and debt (but not mUSD tokens) from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending collateral and debt, its pending collateral and debt is moved
 * from the Default Pool to the Active Pool.
 */
contract DefaultPoolERC20 is
    CheckContract,
    IDefaultPoolERC20,
    OwnableUpgradeable,
    SendCollateralERC20
{
    using SafeERC20 for IERC20;

    address public collateralToken;
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
        address _collateralToken,
        address _activePoolAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        require(
            _collateralToken != address(0),
            "DefaultPoolERC20: Collateral token cannot be zero address"
        );
        checkContract(_activePoolAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        collateralToken = _collateralToken;
        activePoolAddress = _activePoolAddress;
        troveManagerAddress = _troveManagerAddress;
        // slither-disable-end missing-zero-check

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

        renounceOwnership();
    }

    /**
     * @notice Receive ERC20 collateral from ActivePool
     * @dev Tokens must be transferred to this contract before calling this function
     * @param _amount The amount of collateral being received
     */
    function receiveCollateral(uint256 _amount) external override {
        _requireCallerIsActivePool();

        collateral += _amount;
        emit DefaultPoolCollateralBalanceUpdated(collateral);
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

        // Transfer directly to the active pool
        IERC20(collateralToken).safeTransfer(activePool, _amount);
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
