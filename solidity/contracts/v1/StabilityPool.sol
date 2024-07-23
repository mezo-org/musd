// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/LiquityBase.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IBorrowerOperations.sol";
import "../token/IMUSD.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/IStabilityPool.sol";
import "./interfaces/ITroveManager.sol";

contract StabilityPool is
    LiquityBase,
    Ownable,
    CheckContract,
    SendCollateral,
    IStabilityPool
{
    address public collateralAddress;

    IBorrowerOperations public borrowerOperations;

    ITroveManager public troveManager;

    IMUSD public musd;

    // Needed to check if there are pending liquidations
    ISortedTroves public sortedTroves;

    constructor() Ownable(msg.sender) {}

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress,
        address _musdTokenAddress,
        address _sortedTrovesAddress,
        address _priceFeedAddress,
        address _collateralAddress
    ) external override onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(_musdTokenAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_priceFeedAddress);
        if (_collateralAddress != address(0)) {
            checkContract(_collateralAddress);
        }

        borrowerOperations = IBorrowerOperations(_borrowerOperationsAddress);
        troveManager = ITroveManager(_troveManagerAddress);
        activePool = IActivePool(_activePoolAddress);
        musd = IMUSD(_musdTokenAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        collateralAddress = _collateralAddress;

        require(
            (Ownable(_borrowerOperationsAddress).owner() != address(0) ||
                borrowerOperations.collateralAddress() == _collateralAddress) &&
                (Ownable(_activePoolAddress).owner() != address(0) ||
                    activePool.collateralAddress() == _collateralAddress),
            "The same collateral address must be used for the entire set of contracts"
        );

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit CollateralAddressChanged(_collateralAddress);

        renounceOwnership();
    }

    // --- External Depositor Functions ---

    /*  provideToSP():
     *
     * - Sends depositor's accumulated gains (collateral) to depositor
     */
    function provideToSP(uint256 _amount) external override {}

    /*  withdrawFromSP():
     *
     * - Sends all depositor's accumulated gains (collateral) to depositor
     *
     * If _amount > userDeposit, the user withdraws all of their compounded deposit.
     */
    function withdrawFromSP(uint256 _amount) external override {}

    /* withdrawCollateralGainToTrove:
     * - Transfers the depositor's entire collateral gain from the Stability Pool to the caller's trove
     * - Leaves their compounded deposit in the Stability Pool
     * - Updates snapshots for deposit */
    function withdrawCollateralGainToTrove(
        address _upperHint,
        address _lowerHint
    ) external override {}

    // --- Liquidation functions ---

    /*
     * Cancels out the specified debt against the MUSD contained in the Stability Pool (as far as possible)
     * and transfers the Trove's collateral from ActivePool to StabilityPool.
     * Only called by liquidation functions in the TroveManager.
     */
    function offset(
        uint256 _debtToOffset,
        uint256 _collToAdd
    ) external override {}

    // When ERC20 token collateral is received this function needs to be called
    function updateCollateralBalance(uint256 _amount) external override {}

    // --- Getters for public variables. Required by IPool interface ---

    function getCollateralBalance() external view override returns (uint) {}

    function getTotalMUSDDeposits() external view override returns (uint) {}

    // --- Reward calculator functions for depositor ---

    /* Calculates the collateral gain earned by the deposit since its last snapshots were taken.
     * Given by the formula:  E = d0 * (S - S(0))/P(0)
     * where S(0) and P(0) are the depositor's snapshots of the sum S and product P, respectively.
     * d0 is the last recorded deposit value.
     */
    function getDepositorCollateralGain(
        address _depositor
    ) public view override returns (uint) {}

    // --- Compounded deposit ---

    /*
     * Return the user's compounded deposit. Given by the formula:  d = d0 * P/P(0)
     * where P(0) is the depositor's snapshot of the product P, taken when they last updated their deposit.
     */
    function getCompoundedMUSDDeposit(
        address _depositor
    ) public view override returns (uint) {}
}
