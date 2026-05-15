// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../dependencies/CheckContract.sol";
import "../interfaces/erc20/IDefaultPoolERC20.sol";

/**
 * @title DefaultPoolERC20
 * @notice Holds redistributed collateral (ERC20) and debt from liquidations.
 *
 * The Default Pool holds collateral and debt from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending collateral and debt, its pending collateral
 * and debt is moved from the Default Pool to the Active Pool.
 */
contract DefaultPoolERC20 is
    CheckContract,
    IDefaultPoolERC20,
    OwnableUpgradeable
{
    address public activePoolAddress;
    address public troveManagerAddress;

    IERC20 public collateralToken;

    uint256 internal collateral; // deposited collateral tracker
    uint256 internal principal;
    uint256 internal interest;

    error CollateralTransferFailed();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _collateralToken) external initializer {
        require(_collateralToken != address(0), "Invalid collateral token");
        __Ownable_init(msg.sender);
        collateralToken = IERC20(_collateralToken);
    }

    // --- Contract setters ---

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

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    // --- Collateral functions ---

    /**
     * @notice Receives ERC20 collateral from the ActivePool.
     * @param _amount The amount of collateral to receive.
     * @dev Only callable by ActivePool. Pulls tokens via transferFrom.
     */
    function receiveCollateral(uint256 _amount) external override {
        _requireCallerIsActivePool();
        _pullCollateral(msg.sender, _amount);
        collateral += _amount;
        emit CollateralReceived(msg.sender, _amount);
        emit DefaultPoolCollateralBalanceUpdated(collateral);
    }

    /**
     * @notice Sends ERC20 collateral to the ActivePool.
     * @param _amount The amount of collateral to send.
     * @dev Only callable by TroveManager. Approves ActivePool to pull tokens.
     */
    function sendCollateralToActivePool(uint256 _amount) external override {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        collateral -= _amount;
        emit DefaultPoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(activePool, _amount);

        // Approve the ActivePool to pull the tokens
        bool success = collateralToken.approve(activePool, _amount);
        if (!success) revert CollateralTransferFailed();
    }

    // --- Debt functions ---

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

    // --- Getters ---

    /**
     * @notice Returns the collateral state variable.
     * @dev Not necessarily equal to the contract's raw collateral balance - collateral can be
     * forcibly sent to contracts.
     */
    function getCollateralBalance() external view override returns (uint256) {
        return collateral;
    }

    function getDebt() external view override returns (uint256) {
        return principal + interest;
    }

    function getPrincipal() external view override returns (uint256) {
        return principal;
    }

    function getInterest() external view override returns (uint256) {
        return interest;
    }

    // --- Internal functions ---

    function _pullCollateral(address _from, uint256 _amount) internal {
        if (_amount == 0) return;
        bool success = collateralToken.transferFrom(
            _from,
            address(this),
            _amount
        );
        if (!success) revert CollateralTransferFailed();
    }

    // --- Access control functions ---

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == activePoolAddress,
            "DefaultPool: Caller is not the ActivePool"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "DefaultPool: Caller is not the TroveManager"
        );
    }
}
