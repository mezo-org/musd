// SPDX-License-Identifier: MIT

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
 * @notice Holds the ERC20 collateral and debt (but not mUSD tokens) for all active troves.
 * @dev When a trove is liquidated, its collateral and debt are transferred from the Active Pool
 * to either the Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 *
 * Key differences from native ActivePool:
 * - Uses ERC20 token instead of native BTC
 * - Replaces receive() with receiveCollateral(uint256)
 * - Uses SafeERC20 for transfers
 */
contract ActivePoolERC20 is
    CheckContract,
    IActivePoolERC20,
    OwnableUpgradeable,
    SendCollateralERC20
{
    using SafeERC20 for IERC20;

    IERC20 public override collateralToken;
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
        address _collateralTokenAddress,
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _interestRateManagerAddress,
        address _stabilityPoolAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        checkContract(_collateralTokenAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_interestRateManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        collateralToken = IERC20(_collateralTokenAddress);
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

    // --- Collateral receiving function ---

    /**
     * @notice Receives ERC20 collateral into the pool
     * @dev Replaces the native receive() function
     * @param _amount The amount of collateral to receive
     */
    function receiveCollateral(uint256 _amount) external override {
        _requireCallerIsBorrowerOperationsOrDefaultPool();
        _receiveCollateralERC20(collateralToken, msg.sender, _amount);
        collateral += _amount;
        emit ActivePoolCollateralBalanceUpdated(collateral);
        emit CollateralReceived(msg.sender, _amount);
    }

    // --- Debt management ---

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

    // --- Collateral sending ---

    function sendCollateral(address _account, uint256 _amount) external {
        _requireCallerIsBOorTroveMorSP();
        collateral -= _amount;
        emit ActivePoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(_account, _amount);

        _sendCollateralERC20(collateralToken, _account, _amount);
    }

    // --- Getters ---

    /**
     * @notice Returns the collateral state variable.
     * @dev Not necessarily equal to the contract's raw collateral balance -
     * collateral can be forcibly sent to contracts.
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

    // --- Access control ---

    function _requireCallerIsBorrowerOperationsOrDefaultPool() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == defaultPoolAddress,
            "ActivePoolERC20: Caller is neither BO nor Default Pool"
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
            "ActivePoolERC20: Caller must be BO, TM, or IRM"
        );
    }

    function _requireCallerIsBOorTroveMorSP() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == troveManagerAddress ||
                msg.sender == stabilityPoolAddress,
            "ActivePoolERC20: Caller is neither BO nor TM nor SP"
        );
    }
}
