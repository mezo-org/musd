// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../dependencies/CheckContract.sol";
import "./SendCollateralERC20.sol";
import "../interfaces/erc20/IActivePoolERC20.sol";
import "../interfaces/IInterestRateManager.sol";

/**
 * @title ActivePoolERC20
 * @notice The Active Pool holds the ERC20 collateral and debt (but not mUSD tokens) for all active troves.
 *
 * When a trove is liquidated, its collateral and debt are transferred from the Active Pool, to either the
 * Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 */
contract ActivePoolERC20 is
    CheckContract,
    IActivePoolERC20,
    OwnableUpgradeable,
    SendCollateralERC20
{
    using SafeERC20 for IERC20;

    address public collateralToken;
    address public borrowerOperationsAddress;
    address public collSurplusPoolAddress;
    address public defaultPoolAddress;
    IInterestRateManager public interestRateManager;
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

    // --- Contract setters ---

    function setAddresses(
        address _collateralToken,
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _interestRateManagerAddress,
        address _stabilityPoolAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        require(
            _collateralToken != address(0),
            "ActivePoolERC20: Collateral token cannot be zero address"
        );
        checkContract(_borrowerOperationsAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_interestRateManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        collateralToken = _collateralToken;
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

    /**
     * @notice Receive ERC20 collateral from BorrowerOperations or DefaultPool
     * @dev Tokens must be transferred to this contract before calling this function
     * @param _amount The amount of collateral being received
     */
    function receiveCollateral(uint256 _amount) external override {
        _requireCallerIsBorrowerOperationsOrDefaultPool();

        collateral += _amount;
        emit ActivePoolCollateralBalanceUpdated(collateral);
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
        _requireCallerIsBOorTroveMorSP();
        principal -= _principal;
        interest -= _interest;
        emit ActivePoolDebtUpdated(principal, interest);
    }

    function sendCollateral(address _account, uint256 _amount) external {
        _requireCallerIsBOorTroveMorSP();
        collateral -= _amount;
        emit ActivePoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(_account, _amount);

        _sendCollateral(collateralToken, _account, _amount);
    }

    /*
     * Returns the collateral state variable.
     *
     * Not necessarily equal to the contract's raw collateral balance - collateral can be forcibly sent to contracts.
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
            "ActivePoolERC20: Caller is neither BorrowerOperations nor Default Pool"
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
            "ActivePoolERC20: Caller must be BorrowerOperations, TroveManager, or InterestRateManager"
        );
    }

    function _requireCallerIsBOorTroveMorSP() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress ||
                msg.sender == stabilityPoolAddress,
            "ActivePoolERC20: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool"
        );
    }
}
