// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IStabilityPoolERC20
 * @notice Interface for the Stability Pool that uses ERC20 tokens as collateral
 * @dev The Stability Pool holds mUSD tokens deposited by Stability Pool depositors.
 *
 * When a trove is liquidated, then depending on system conditions, some of its debt gets offset with
 * mUSD in the Stability Pool: that is, the offset debt evaporates, and an equal amount of mUSD tokens
 * in the Stability Pool are burned.
 *
 * Thus, a liquidation causes each depositor to receive a mUSD loss in proportion to their deposit as
 * a share of total deposits. They also receive a collateral gain, as the ERC20 collateral of the
 * liquidated trove is distributed among Stability depositors in the same proportion.
 *
 * When a liquidation occurs, it depletes every deposit by the same fraction: for example, a liquidation
 * that depletes 40% of the total mUSD in the Stability Pool, depletes 40% of each deposit.
 *
 * A deposit that has experienced a series of liquidations is termed a "compounded deposit": each
 * liquidation depletes the deposit, multiplying it by some factor in range ]0,1[
 */
interface IStabilityPoolERC20 {
    // --- Events ---

    event StabilityPoolCollateralBalanceUpdated(uint256 _newBalance);
    event StabilityPoolMUSDBalanceUpdated(uint256 _newBalance);

    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event CollateralTokenAddressChanged(address _newCollateralTokenAddress);
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
    event CollateralReceived(address _from, uint256 _amount);

    // --- Functions ---

    /**
     * @notice Returns the ERC20 collateral token used by this pool
     */
    function collateralToken() external view returns (IERC20);

    /**
     * @notice Called only once on init, to set addresses of other protocol contracts
     * @dev Callable only by owner, renounces ownership at the end
     */
    function setAddresses(
        address _collateralTokenAddress,
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _musdTokenAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _troveManagerAddress
    ) external;

    /**
     * @notice Receive ERC20 collateral from ActivePool during liquidation
     * @dev Only callable by ActivePool
     * @param _amount The amount of collateral to receive
     */
    function receiveCollateral(uint256 _amount) external;

    /**
     * @notice Deposit mUSD to the Stability Pool
     * @dev Sends depositor's accumulated gains (collateral) to depositor
     * @param _amount The amount of mUSD to deposit (must be non-zero)
     */
    function provideToSP(uint256 _amount) external;

    /**
     * @notice Withdraw mUSD from the Stability Pool
     * @dev Sends all depositor's accumulated gains (collateral) to depositor.
     *      If _amount > userDeposit, the user withdraws all of their compounded deposit.
     * @param _amount The amount of mUSD to withdraw (zero is allowed if no undercollateralized troves)
     */
    function withdrawFromSP(uint256 _amount) external;

    /**
     * @notice Transfer the depositor's entire collateral gain from the Stability Pool to their trove
     * @dev Leaves their compounded deposit in the Stability Pool and updates snapshots
     * @param _upperHint Upper hint for trove list position
     * @param _lowerHint Lower hint for trove list position
     */
    function withdrawCollateralGainToTrove(
        address _upperHint,
        address _lowerHint
    ) external;

    /**
     * @notice Cancel out debt against mUSD in the Stability Pool and receive liquidated collateral
     * @dev Only callable by TroveManager during liquidations
     * @param _principal The principal debt to offset
     * @param _interest The interest debt to offset
     * @param _coll The collateral to add to the pool
     */
    function offset(
        uint256 _principal,
        uint256 _interest,
        uint256 _coll
    ) external;

    /**
     * @notice Returns the total amount of ERC20 collateral held by the pool
     * @dev Accounted in an internal variable instead of `balanceOf` to exclude edge cases
     */
    function getCollateralBalance() external view returns (uint256);

    /**
     * @notice Returns the total mUSD held in the pool
     * @dev Changes when users deposit/withdraw, and when Trove debt is offset
     */
    function getTotalMUSDDeposits() external view returns (uint256);

    /**
     * @notice Calculates the collateral gain earned by the deposit since its last snapshots were taken
     * @param _depositor The address of the depositor
     * @return The amount of collateral gained
     */
    function getDepositorCollateralGain(
        address _depositor
    ) external view returns (uint256);

    /**
     * @notice Return the user's compounded deposit
     * @param _depositor The address of the depositor
     * @return The compounded mUSD deposit
     */
    function getCompoundedMUSDDeposit(
        address _depositor
    ) external view returns (uint256);
}
