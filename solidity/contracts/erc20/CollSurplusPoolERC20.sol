// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../dependencies/CheckContract.sol";
import "../interfaces/erc20/ICollSurplusPoolERC20.sol";

/**
 * @title CollSurplusPoolERC20
 * @notice Holds surplus ERC20 collateral claimable by users after full redemptions.
 *
 * When a trove is fully redeemed against, and the collateral value exceeds the debt,
 * the surplus collateral is sent here and credited to the trove owner's balance.
 * The owner can then claim their surplus collateral through BorrowerOperations.
 */
contract CollSurplusPoolERC20 is
    CheckContract,
    ICollSurplusPoolERC20,
    OwnableUpgradeable
{
    string public constant NAME = "CollSurplusPoolERC20";

    address public activePoolAddress;
    address public borrowerOperationsAddress;
    address public troveManagerAddress;

    IERC20 public collateralToken;

    // Deposited collateral tracker
    uint256 internal collateral;
    // Collateral surplus claimable by trove owners
    mapping(address => uint256) internal balances;

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
        address _borrowerOperationsAddress,
        address _troveManagerAddress
    ) external override onlyOwner {
        checkContract(_activePoolAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        activePoolAddress = _activePoolAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        // slither-disable-end missing-zero-check

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    // --- Pool functionality ---

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
    }

    /**
     * @notice Records a surplus collateral amount for an account.
     * @param _account The account to credit the surplus to.
     * @param _amount The amount of surplus collateral.
     * @dev Only callable by TroveManager.
     */
    function accountSurplus(
        address _account,
        uint256 _amount
    ) external override {
        _requireCallerIsTroveManager();

        uint256 newAmount = balances[_account] + _amount;
        balances[_account] = newAmount;

        emit CollBalanceUpdated(_account, newAmount);
    }

    /**
     * @notice Claims surplus collateral for an account.
     * @param _account The account whose surplus is being claimed.
     * @param _recipient The address to receive the collateral.
     * @dev Only callable by BorrowerOperations.
     */
    function claimColl(address _account, address _recipient) external override {
        _requireCallerIsBorrowerOperations();
        uint256 claimableColl = balances[_account];
        require(
            claimableColl > 0,
            "CollSurplusPool: No collateral available to claim"
        );

        balances[_account] = 0;
        emit CollBalanceUpdated(_account, 0);

        collateral -= claimableColl;
        emit CollateralSent(_recipient, claimableColl);

        _sendCollateral(_recipient, claimableColl);
    }

    // --- Getters ---

    /**
     * @notice Returns the claimable collateral for an account.
     * @param _account The account to query.
     * @return The amount of claimable collateral.
     */
    function getCollateral(
        address _account
    ) external view override returns (uint256) {
        return balances[_account];
    }

    /**
     * @notice Returns the total collateral held by the pool.
     * @dev Not necessarily equal to the contract's raw token balance -
     * tokens can be forcibly sent to contracts.
     * @return The total collateral balance.
     */
    function getCollateralBalance() external view override returns (uint256) {
        return collateral;
    }

    // --- Internal functions ---

    function _sendCollateral(address _recipient, uint256 _amount) internal {
        if (_amount == 0) return;
        bool success = collateralToken.transfer(_recipient, _amount);
        if (!success) revert CollateralTransferFailed();
    }

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

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "CollSurplusPool: Caller is not Borrower Operations"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "CollSurplusPool: Caller is not TroveManager"
        );
    }

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == activePoolAddress,
            "CollSurplusPool: Caller is not Active Pool"
        );
    }
}
