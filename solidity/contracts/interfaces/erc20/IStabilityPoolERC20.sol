// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

/**
 * @title IStabilityPoolERC20
 * @notice Interface for StabilityPool with ERC20 collateral
 *
 * The Stability Pool holds mUSD tokens deposited by Stability Pool depositors.
 *
 * When a trove is liquidated, then depending on system conditions, some of its debt gets offset with
 * mUSD in the Stability Pool: that is, the offset debt evaporates, and an equal amount of mUSD tokens
 * in the Stability Pool are burned.
 *
 * Thus, a liquidation causes each depositor to receive a mUSD loss in proportion to their deposit
 * as a share of total deposits. They also receive an ERC20 collateral gain, as the collateral of
 * the liquidated trove is distributed among Stability depositors in the same proportion.
 */
interface IStabilityPoolERC20 {
    // --- Events ---

    event StabilityPoolCollateralBalanceUpdated(uint256 _newBalance);
    event StabilityPoolMUSDBalanceUpdated(uint256 _newBalance);

    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event MUSDTokenAddressChanged(address _newMUSDTokenAddress);
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event SortedTrovesAddressChanged(address _newSortedTrovesAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);

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

    /**
     * @notice Called only once on init, to set addresses of other Liquity contracts
     * @dev Callable only by owner, renounces ownership at the end
     */
    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _musdTokenAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _troveManagerAddress
    ) external;

    /**
     * @notice Deposit mUSD to the Stability Pool
     * @param _amount Amount of mUSD to deposit
     * @dev Sends depositor's accumulated collateral gains to depositor
     */
    function provideToSP(uint256 _amount) external;

    /**
     * @notice Withdraw mUSD from the Stability Pool
     * @param _amount Amount of mUSD to withdraw
     * @dev If _amount > userDeposit, the user withdraws all of their compounded deposit
     * @dev Sends all depositor's accumulated collateral gains to depositor
     */
    function withdrawFromSP(uint256 _amount) external;

    /**
     * @notice Transfer collateral gain to caller's trove
     * @param _upperHint Address of the trove above in the sorted list
     * @param _lowerHint Address of the trove below in the sorted list
     * @dev Transfers the depositor's entire collateral gain from the Stability Pool to the caller's trove
     * @dev Leaves their compounded deposit in the Stability Pool
     */
    function withdrawCollateralGainToTrove(
        address _upperHint,
        address _lowerHint
    ) external;

    /**
     * @notice Receive ERC20 collateral from ActivePool
     * @param _amount Amount of collateral to receive
     * @dev Only callable by ActivePool. Pulls tokens via transferFrom.
     */
    function receiveCollateral(uint256 _amount) external;

    /**
     * @notice Offset debt with Stability Pool deposits
     * @param _principal Principal debt to offset
     * @param _interest Interest debt to offset
     * @param _coll Collateral to distribute to depositors
     * @dev Only callable by TroveManager. Called during liquidation.
     */
    function offset(
        uint256 _principal,
        uint256 _interest,
        uint256 _coll
    ) external;

    /**
     * @notice Returns the total amount of collateral held by the pool
     * @dev Accounted in an internal variable instead of `balance`,
     * to exclude edge cases like collateral received from a self-destruct
     */
    function getCollateralBalance() external view returns (uint256);

    /**
     * @notice Returns mUSD held in the pool
     * @dev Changes when users deposit/withdraw, and when Trove debt is offset
     */
    function getTotalMUSDDeposits() external view returns (uint256);

    /**
     * @notice Calculates the collateral gain earned by the deposit since its last snapshots were taken
     * @param _depositor Address of the depositor
     */
    function getDepositorCollateralGain(
        address _depositor
    ) external view returns (uint256);

    /**
     * @notice Return the user's compounded deposit
     * @param _depositor Address of the depositor
     */
    function getCompoundedMUSDDeposit(
        address _depositor
    ) external view returns (uint256);
}
