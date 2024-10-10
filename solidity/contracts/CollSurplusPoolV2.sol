// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateralV2.sol";
import "./interfaces/ICollSurplusPoolV2.sol";
import "./interfaces/IBorrowerOperationsV2.sol";
import "./interfaces/IActivePoolV2.sol";

contract CollSurplusPoolV2 is
    Ownable,
    CheckContract,
    SendCollateralV2,
    ICollSurplusPoolV2
{
    string public constant NAME = "CollSurplusPool";

    address public activePoolAddress;
    address public borrowerOperationsAddress;
    address public collateralAddress;
    address public troveManagerAddress;

    // deposited collateral tracker
    uint256 internal collateral;
    // Collateral surplus claimable by trove owners
    mapping(address => uint) internal balances;

    constructor() Ownable(msg.sender) {}

    // --- Fallback function ---

    // solhint-disable no-complex-fallback
    receive() external payable {
        _requireCallerIsActivePool();
        require(
            collateralAddress == address(0),
            "CollSurplusPool: ERC20 collateral needed, not BTC"
        );
        // slither-disable-next-line events-maths
        collateral += msg.value;
    }

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress,
        address _collateralAddress
    ) external override onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        if (_collateralAddress != address(0)) {
            checkContract(_collateralAddress);
        }

        // checkContract does the zero address check so disable slither warning
        // slither-disable-start missing-zero-check
        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;
        collateralAddress = _collateralAddress;
        // slither-disable-end missing-zero-check

        require(
            (Ownable(_activePoolAddress).owner() != address(0) ||
                IActivePoolV2(_activePoolAddress).collateralAddress() ==
                _collateralAddress) &&
                (Ownable(_borrowerOperationsAddress).owner() != address(0) ||
                    IBorrowerOperationsV2(_borrowerOperationsAddress)
                        .collateralAddress() ==
                    _collateralAddress),
            "The same collateral address must be used for the entire set of contracts"
        );

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit CollateralAddressChanged(_collateralAddress);

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

    function claimColl(address _account) external override {
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

        sendCollateral(IERC20(collateralAddress), _account, claimableColl);
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
