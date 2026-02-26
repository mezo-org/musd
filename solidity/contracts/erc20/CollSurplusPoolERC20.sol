// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../dependencies/CheckContract.sol";
import "./SendCollateralERC20.sol";
import "../interfaces/erc20/ICollSurplusPoolERC20.sol";

/**
 * @title CollSurplusPoolERC20
 * @notice Stores surplus ERC20 collateral from liquidations that can be claimed by trove owners
 * @dev Key differences from native CollSurplusPool:
 * - Uses ERC20 token instead of native BTC
 * - Replaces receive() with receiveCollateral(uint256)
 * - Uses SafeERC20 for transfers
 */
contract CollSurplusPoolERC20 is
    CheckContract,
    ICollSurplusPoolERC20,
    OwnableUpgradeable,
    SendCollateralERC20
{
    using SafeERC20 for IERC20;

    string public constant NAME = "CollSurplusPoolERC20";

    IERC20 public override collateralToken;
    address public activePoolAddress;
    address public borrowerOperationsAddress;
    address public troveManagerAddress;

    // deposited collateral tracker
    uint256 internal collateral;
    // Collateral surplus claimable by trove owners
    mapping(address => uint) internal balances;

    function initialize() external initializer {
        __Ownable_init(msg.sender);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Contract setters ---

    function setAddresses(
        address _collateralTokenAddress,
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _troveManagerAddress
    ) external override onlyOwner {
        checkContract(_collateralTokenAddress);
        checkContract(_activePoolAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        collateralToken = IERC20(_collateralTokenAddress);
        activePoolAddress = _activePoolAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        // slither-disable-end missing-zero-check

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

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
        // slither-disable-next-line events-maths
        collateral += _amount;
        emit CollateralReceived(msg.sender, _amount);
    }

    // --- Pool functionality ---

    /**
     * @notice Accounts for surplus collateral for a liquidated trove owner
     * @param _account The address of the liquidated trove owner
     * @param _amount The amount of surplus collateral
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
     * @notice Claims collateral surplus for an account
     * @param _account The address of the trove owner claiming their surplus
     * @param _recipient The address to receive the collateral
     */
    function claimColl(
        address _account,
        address _recipient
    ) external override {
        _requireCallerIsBorrowerOperations();
        uint256 claimableColl = balances[_account];
        require(
            claimableColl > 0,
            "CollSurplusPoolERC20: No collateral available to claim"
        );

        balances[_account] = 0;
        emit CollBalanceUpdated(_account, 0);

        collateral -= claimableColl;
        emit CollateralSent(_recipient, claimableColl);

        _sendCollateralERC20(collateralToken, _recipient, claimableColl);
    }

    // --- Getters ---

    /**
     * @notice Gets the claimable collateral for an account
     * @param _account The address to check
     * @return The amount of claimable collateral
     */
    function getCollateral(
        address _account
    ) external view override returns (uint) {
        return balances[_account];
    }

    /**
     * @notice Returns the collateral state variable
     * @dev Not necessarily equal to the raw collateral balance -
     * collateral can be forcibly sent to contracts.
     */
    function getCollateralBalance() external view override returns (uint) {
        return collateral;
    }

    // --- Access control ---

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "CollSurplusPoolERC20: Caller is not Borrower Operations"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == troveManagerAddress,
            "CollSurplusPoolERC20: Caller is not TroveManager"
        );
    }

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == activePoolAddress,
            "CollSurplusPoolERC20: Caller is not Active Pool"
        );
    }
}
