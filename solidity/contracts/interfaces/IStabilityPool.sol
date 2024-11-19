// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

/*
 * The Stability Pool holds mUSD tokens deposited by Stability Pool depositors.
 *
 * When a trove is liquidated, then depending on system conditions, some of its debt gets offset with
 * mUSD in the Stability Pool: that is, the offset debt evaporates, and an equal amount of mUSD tokens in the Stability Pool are burned.
 *
 * Thus, a liquidation causes each depositor to receive a mUSD loss in proportion to their deposit as a share of total deposits.
 * They also receive an collateral gain, as the collateral of the liquidated trove is distributed among Stability depositors
 * in the same proportion.
 *
 * When a liquidation occurs, it depletes every deposit by the same fraction: for example, a liquidation that depletes 40%
 * of the total mUSD in the Stability Pool, depletes 40% of each deposit.
 *
 * A deposit that has experienced a series of liquidations is termed a "compounded deposit": each liquidation depletes the deposit,
 * multiplying it by some factor in range ]0,1[
 *
 * Please see the implementation spec in the proof document, which closely follows on from the compounded deposit / collateral gain derivations:
 * https://github.com/liquity/liquity/blob/master/papers/Scalable_Reward_Distribution_with_Compounding_Stakes.pdf
 *
 */
interface IStabilityPool {
    // --- Events ---

    event StabilityPoolCollateralBalanceUpdated(uint256 _newBalance);
    event StabilityPoolMUSDBalanceUpdated(uint256 _newBalance);

    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event MUSDTokenAddressChanged(address _newMUSDTokenAddress);
    event SortedTrovesAddressChanged(address _newSortedTrovesAddress);
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event CollateralAddressChanged(address _newCollateralAddress);

    event PUpdated(uint256 _P);
    event SUpdated(uint256 _S, uint128 _epoch, uint128 _scale);
    event EpochUpdated(uint128 _currentEpoch);
    event ScaleUpdated(uint128 _currentScale);

    event DepositSnapshotUpdated(
        address indexed _depositor,
        uint256 _P,
        uint256 _S
    );
    event UserDepositChanged(address indexed _depositor, uint256 _newDeposit);

    event CollateralGainWithdrawn(
        address indexed _depositor,
        uint256 _collateral,
        uint256 _MUSDLoss
    );
    event CollateralSent(address _to, uint256 _amount);

    // --- Functions ---

    /*
     * Called only once on init, to set addresses of other Liquity contracts
     * Callable only by owner, renounces ownership at the end
     */
    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress,
        address _musdTokenAddress,
        address _sortedTrovesAddress,
        address _priceFeedAddress,
        address _collateralAddress
    ) external;

    /*
     * Initial checks:
     * - _amount is not zero
     * ---
     * - Sends depositor's accumulated gains (collateral) to depositor
     */
    function provideToSP(uint256 _amount) external;

    /*
     * Initial checks:
     * - _amount is zero or there are no under collateralized troves left in the system
     * - User has a non zero deposit
     * ---
     * - Sends all depositor's accumulated gains (collateral) to depositor
     * - Decreases deposit stake, and takes new snapshot.
     *
     * If _amount > userDeposit, the user withdraws all of their compounded deposit.
     */
    function withdrawFromSP(uint256 _amount) external;

    /*
     * Initial checks:
     * - User has a non zero deposit
     * - User has an open trove
     * - User has some collateral gain
     * ---
     * - Transfers the depositor's entire collateral gain from the Stability Pool to the caller's trove
     * - Leaves their compounded deposit in the Stability Pool
     * - Updates snapshots for deposit
     */
    function withdrawCollateralGainToTrove(
        address _upperHint,
        address _lowerHint
    ) external;

    /*
     * Initial checks:
     * - Caller is TroveManager
     * ---
     * Cancels out the specified debt against the mUSD contained in the Stability Pool (as far as possible)
     * and transfers the Trove's collateral from ActivePool to StabilityPool.
     * Only called by liquidation functions in the TroveManager.
     */
    function offset(uint256 _debt, uint256 _coll) external;

    /*
     * Returns the total amount of collateral held by the pool, accounted in an internal variable instead of `balance`,
     * to exclude edge cases like collateral received from a self-destruct.
     */
    function getCollateralBalance() external view returns (uint);

    /*
     * Returns mUSD held in the pool. Changes when users deposit/withdraw, and when Trove debt is offset.
     */
    function getTotalMUSDDeposits() external view returns (uint);

    /*
     * Calculates the collateral gain earned by the deposit since its last snapshots were taken.
     */
    function getDepositorCollateralGain(
        address _depositor
    ) external view returns (uint);

    /*
     * Return the user's compounded deposit.
     */
    function getCompoundedMUSDDeposit(
        address _depositor
    ) external view returns (uint);

    /*
     * Fallback function
     * Only callable by Active Pool, it just accounts for BTC received
     * receive() external payable;
     */

    function collateralAddress() external view returns (address);
}
