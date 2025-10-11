// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IActivePool.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IDefaultPool.sol";
import "./interfaces/IInterestRateManager.sol";
import "./interfaces/IStabilityPool.sol";

/*
 * The Active Pool holds the collateral and debt (but not mUSD tokens) for all active troves.
 *
 * When a trove is liquidated, it's collateral and debt are transferred from the Active Pool, to either the
 * Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 *
 */
contract ActivePool is
    CheckContract,
    IActivePool,
    OwnableUpgradeable,
    SendCollateral
{
    address public borrowerOperationsAddress;
    address public collSurplusPoolAddress;
    address public defaultPoolAddress;
    IInterestRateManager public interestRateManager;
    address public reversibleCallOptionManagerAddress;
    address public stabilityPoolAddress;
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

    // --- Fallback function ---

    // This executes when the contract receives BTC
    // solhint-disable no-complex-fallback
    receive() external payable {
        _requireCallerIsBorrowerOperationsOrDefaultPool();
        collateral += msg.value;
        emit ActivePoolCollateralBalanceUpdated(collateral);
    }

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _interestRateManagerAddress,
        address _reversibleCallOptionManagerAddress,
        address _stabilityPoolAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_interestRateManagerAddress);
        if (_reversibleCallOptionManagerAddress != address(0)) {
            checkContract(_reversibleCallOptionManagerAddress);
        }
        checkContract(_stabilityPoolAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        borrowerOperationsAddress = _borrowerOperationsAddress;
        collSurplusPoolAddress = _collSurplusPoolAddress;
        defaultPoolAddress = _defaultPoolAddress;
        interestRateManager = IInterestRateManager(_interestRateManagerAddress);
        reversibleCallOptionManagerAddress = _reversibleCallOptionManagerAddress;
        stabilityPoolAddress = _stabilityPoolAddress;
        troveManagerAddress = _troveManagerAddress;
        // slither-disable-end missing-zero-check

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit InterestRateManagerAddressChanged(_interestRateManagerAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    function increaseDebt(
        uint256 _principal,
        uint256 _interest
    ) external override {
        _requireCallerIsBorrowerOperationsOrTroveManagerOrInterestRateManager();
        principal += _principal;
        interest += _interest;
        emit ActivePoolDebtUpdated(principal, interest);
    }

    function decreaseDebt(
        uint256 _principal,
        uint256 _interest
    ) external override {
        _requireCallerIsBOorTroveMorSPorReversibleCallOptionManager();
        principal -= _principal;
        interest -= _interest;
        emit ActivePoolDebtUpdated(principal, interest);
    }

    function sendCollateral(address _account, uint256 _amount) external {
        _requireCallerIsBOorTroveMorSPorReversibleCallOptionManager();
        collateral -= _amount;
        emit ActivePoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(_account, _amount);

        _sendCollateral(_account, _amount);
    }

    /*
     * Returns the collateral state variable.
     *
     * Not necessarily equal to the the contract's raw collateral balance - collateral can be forcibly sent to contracts.
     */
    function getCollateralBalance() external view override returns (uint) {
        return collateral;
    }

    function getDebt() external view override returns (uint) {
        return principal + getInterest();
    }

    function getPrincipal() external view override returns (uint) {
        return principal;
    }

    function getInterest() public view override returns (uint) {
        return interest + interestRateManager.getAccruedInterest();
    }

    function _requireCallerIsBorrowerOperationsOrDefaultPool() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == defaultPoolAddress,
            "ActivePool: Caller is neither BorrowerOperations nor Default Pool"
        );
    }

    function _requireCallerIsBorrowerOperationsOrTroveManagerOrInterestRateManager()
        internal
        view
    {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress ||
                msg.sender == address(interestRateManager),
            "ActivePool: Caller must be BorrowerOperations, TroveManager, or InterestRateManager"
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

    function _requireCallerIsBOorTroveMorSPorReversibleCallOptionManager() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress ||
                msg.sender == stabilityPoolAddress ||
                msg.sender == reversibleCallOptionManagerAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool nor ReversibleCallOptionManager"
        );
    }
}
