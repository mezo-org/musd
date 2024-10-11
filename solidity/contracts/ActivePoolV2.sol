// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IActivePool.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IDefaultPool.sol";
import "./interfaces/IStabilityPool.sol";

/*
 * The Active Pool holds the collateral and MUSD debt (but not MUSD tokens) for all active troves.
 *
 * When a trove is liquidated, it's collateral and MUSD debt are transferred from the Active Pool, to either the
 * Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 *
 */
contract ActivePoolV2 is Ownable, CheckContract, SendCollateral, IActivePool {
    address public borrowerOperationsAddress;
    address public collateralAddress;
    address public collSurplusPoolAddress;
    address public defaultPoolAddress;
    address public stabilityPoolAddress;
    address public troveManagerAddress;
    uint256 internal collateral; // deposited collateral tracker
    uint256 internal MUSDDebt;

    constructor() Ownable(msg.sender) {}

    // --- Fallback function ---

    // This executes when the contract receives BTC
    // solhint-disable no-complex-fallback
    receive() external payable {
        _requireCallerIsBorrowerOperationsOrDefaultPool();
        require(
            collateralAddress == address(0),
            "ActivePool: ERC20 collateral needed, not BTC"
        );
        collateral += msg.value;
        emit ActivePoolCollateralBalanceUpdated(collateral);
    }

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _collateralAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _troveManagerAddress,
        address _stabilityPoolAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        if (_collateralAddress != address(0)) {
            checkContract(_collateralAddress);
        }
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-next-line missing-zero-check
        borrowerOperationsAddress = _borrowerOperationsAddress;
        collateralAddress = _collateralAddress;
        // slither-disable-next-line missing-zero-check
        collSurplusPoolAddress = _collSurplusPoolAddress;
        // slither-disable-next-line missing-zero-check
        defaultPoolAddress = _defaultPoolAddress;
        // slither-disable-next-line missing-zero-check
        stabilityPoolAddress = _stabilityPoolAddress;
        // slither-disable-next-line missing-zero-check
        troveManagerAddress = _troveManagerAddress;

        require(
            (Ownable(_borrowerOperationsAddress).owner() != address(0) ||
                IBorrowerOperations(_borrowerOperationsAddress)
                    .collateralAddress() ==
                _collateralAddress) &&
                (Ownable(_collSurplusPoolAddress).owner() != address(0) ||
                    ICollSurplusPool(_collSurplusPoolAddress)
                        .collateralAddress() ==
                    _collateralAddress) &&
                (Ownable(_defaultPoolAddress).owner() != address(0) ||
                    IDefaultPool(_defaultPoolAddress).collateralAddress() ==
                    _collateralAddress) &&
                (Ownable(_stabilityPoolAddress).owner() != address(0) ||
                    IStabilityPool(stabilityPoolAddress).collateralAddress() ==
                    _collateralAddress),
            "The same collateral address must be used for the entire set of contracts"
        );

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit CollateralAddressChanged(_collateralAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    function increaseMUSDDebt(uint256 _amount) external override {
        _requireCallerIsBorrowerOperationsOrTroveManager();
        MUSDDebt += _amount;
        emit ActivePoolMUSDDebtUpdated(MUSDDebt);
    }

    function decreaseMUSDDebt(uint256 _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        MUSDDebt -= _amount;
        emit ActivePoolMUSDDebtUpdated(MUSDDebt);
    }

    function sendCollateral(
        address _account,
        uint256 _amount
    ) external override {
        _requireCallerIsBOorTroveMorSP();
        collateral -= _amount;
        emit ActivePoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(_account, _amount);

        sendCollateral(IERC20(collateralAddress), _account, _amount);
    }

    /*
     * Returns the collateral state variable.
     *
     * Not necessarily equal to the the contract's raw collateral balance - collateral can be forcibly sent to contracts.
     */
    function getCollateralBalance() external view override returns (uint) {
        return collateral;
    }

    function getMUSDDebt() external view override returns (uint) {
        return MUSDDebt;
    }

    function _requireCallerIsBorrowerOperationsOrDefaultPool() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == defaultPoolAddress,
            "ActivePool: Caller is neither BorrowerOperations nor Default Pool"
        );
    }

    function _requireCallerIsBorrowerOperationsOrTroveManager() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager"
        );
    }

    function _requireCallerIsBOorTroveMorSP() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress ||
                msg.sender == stabilityPoolAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool"
        );
    }
}
