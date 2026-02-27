// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../dependencies/CheckContract.sol";
import "../interfaces/IInterestRateManager.sol";
import "../interfaces/erc20/IActivePoolERC20.sol";

/**
 * @title ActivePoolERC20
 * @notice Holds collateral (ERC20) and debt for all active troves.
 *
 * When a trove is liquidated, its collateral and debt are transferred from the Active Pool
 * to either the Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 */
contract ActivePoolERC20 is
    CheckContract,
    IActivePoolERC20,
    OwnableUpgradeable
{
    address public borrowerOperationsAddress;
    address public collSurplusPoolAddress;
    address public defaultPoolAddress;
    IInterestRateManager public interestRateManager;
    address public stabilityPoolAddress;
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
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _interestRateManagerAddress,
        address _stabilityPoolAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_interestRateManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        borrowerOperationsAddress = _borrowerOperationsAddress;
        collSurplusPoolAddress = _collSurplusPoolAddress;
        defaultPoolAddress = _defaultPoolAddress;
        interestRateManager = IInterestRateManager(_interestRateManagerAddress);
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

    // --- Collateral functions ---

    function receiveCollateral(uint256 _amount) external override {
        _requireCallerIsBorrowerOperationsOrDefaultPool();
        _pullCollateral(msg.sender, _amount);
        collateral += _amount;
        emit CollateralReceived(msg.sender, _amount);
        emit ActivePoolCollateralBalanceUpdated(collateral);
    }

    function sendCollateral(
        address _account,
        uint256 _amount
    ) external override {
        _requireCallerIsBOorTroveMorSP();
        collateral -= _amount;
        emit ActivePoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(_account, _amount);
        _sendCollateral(_account, _amount);
    }

    // --- Debt functions ---

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
        _requireCallerIsBOorTroveMorSP();
        principal -= _principal;
        interest -= _interest;
        emit ActivePoolDebtUpdated(principal, interest);
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
        return principal + getInterest();
    }

    function getPrincipal() external view override returns (uint256) {
        return principal;
    }

    function getInterest() public view override returns (uint256) {
        return interest + interestRateManager.getAccruedInterest();
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
}
