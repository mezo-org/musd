// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./dependencies/CheckContract.sol";
import "./dependencies/OwnableUpgradeable.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IActivePool.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ICollSurplusPool.sol";

contract CollSurplusPool is
    CheckContract,
    ICollSurplusPool,
    OwnableUpgradeable,
    SendCollateral
{
    string public constant NAME = "CollSurplusPool";

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

    // --- Fallback function ---

    // solhint-disable no-complex-fallback
    receive() external payable {
        _requireCallerIsActivePool();
        // slither-disable-next-line events-maths
        collateral += msg.value;
    }

    // --- Contract setters ---

    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _troveManagerAddress
    ) external override onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);

        // checkContract does the zero address check so disable slither warning
        // slither-disable-start missing-zero-check
        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;
        // slither-disable-end missing-zero-check

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

        renounceOwnership();
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
            "CollSurplusPool: No collateral available to claim"
        );

        balances[_account] = 0;
        emit CollBalanceUpdated(_account, 0);

        collateral -= claimableColl;
        emit CollateralSent(_account, claimableColl);

        _sendCollateral(_recipient, claimableColl);
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
