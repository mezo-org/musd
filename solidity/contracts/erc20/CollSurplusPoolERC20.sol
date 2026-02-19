// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../dependencies/CheckContract.sol";
import "./SendCollateralERC20.sol";
import "../interfaces/erc20/ICollSurplusPoolERC20.sol";

/**
 * @title CollSurplusPoolERC20
 * @notice Holds surplus ERC20 collateral from redemptions
 */
contract CollSurplusPoolERC20 is
    CheckContract,
    ICollSurplusPoolERC20,
    OwnableUpgradeable,
    SendCollateralERC20
{
    using SafeERC20 for IERC20;

    string public constant NAME = "CollSurplusPoolERC20";

    address public collateralToken;
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
        address _collateralToken,
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _troveManagerAddress
    ) external override onlyOwner {
        require(
            _collateralToken != address(0),
            "CollSurplusPoolERC20: Collateral token cannot be zero address"
        );
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);

        // checkContract does the zero address check so disable slither warning
        // slither-disable-start missing-zero-check
        collateralToken = _collateralToken;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;
        // slither-disable-end missing-zero-check

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
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

        // slither-disable-next-line events-maths
        collateral += _amount;
    }

    // --- Pool functionality ---

    function accountSurplus(
        address _account,
        uint256 _amount
    ) external override {
        _requireCallerIsTroveManager();

        uint256 newAmount = balances[_account] + _amount;
        balances[_account] = newAmount;

        emit CollBalanceUpdated(_account, newAmount);
    }

    function claimColl(address _account, address _recipient) external override {
        _requireCallerIsBorrowerOperations();
        uint256 claimableColl = balances[_account];
        require(
            claimableColl > 0,
            "CollSurplusPoolERC20: No collateral available to claim"
        );

        balances[_account] = 0;
        emit CollBalanceUpdated(_account, 0);

        collateral -= claimableColl;
        emit CollateralSent(_account, claimableColl);

        _sendCollateral(collateralToken, _recipient, claimableColl);
    }

    function getCollateral(
        address _account
    ) external view override returns (uint) {
        return balances[_account];
    }

    /* Returns the collateral state variable at ActivePool address.
       Not necessarily equal to the raw collateral balance - collateral can be forcibly sent to contracts. */
    function getCollateralBalance() external view override returns (uint) {
        return collateral;
    }

    // --- 'require' functions ---

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
