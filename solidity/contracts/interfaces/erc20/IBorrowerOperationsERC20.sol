// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../IGovernableVariables.sol";

/// @title IBorrowerOperationsERC20
/// @notice Interface for the ERC20 collateral version of BorrowerOperations
/// @dev Main user interface for trove management with ERC20 collateral tokens
interface IBorrowerOperationsERC20 {
    // --- Events ---

    event ActivePoolAddressChanged(address _activePoolAddress);
    event BorrowingRateChanged(uint256 borrowingRate);
    event BorrowingRateProposed(
        uint256 proposedBorrowingRate,
        uint256 proposedBorrowingRateTime
    );
    event BorrowerOperationsSignaturesAddressChanged(
        address _borrowerOperationsSignaturesAddress
    );
    event CollSurplusPoolAddressChanged(address _collSurplusPoolAddress);
    event CollateralTokenAddressChanged(address _collateralTokenAddress);
    event DefaultPoolAddressChanged(address _defaultPoolAddress);
    event GasPoolAddressChanged(address _gasPoolAddress);
    event GovernableVariablesAddressChanged(
        address _governableVariablesAddress
    );
    event InterestRateManagerAddressChanged(
        address _interestRateManagerAddress
    );
    event MUSDTokenAddressChanged(address _musdTokenAddress);
    event MinNetDebtChanged(uint256 _minNetDebt);
    event MinNetDebtProposed(uint256 _minNetDebt, uint256 _proposalTime);
    event PCVAddressChanged(address _pcvAddress);
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event RedemptionRateChanged(uint256 redemptionRate);
    event RedemptionRateProposed(
        uint256 proposedRedemptionRate,
        uint256 proposedRedemptionRateTime
    );
    event RefinancingFeePercentageChanged(uint8 _refinanceFeePercentage);
    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event StabilityPoolAddressChanged(address _stabilityPoolAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event TroveCreated(address indexed _borrower, uint256 arrayIndex);
    event TroveUpdated(
        address indexed _borrower,
        uint256 _principal,
        uint256 _interest,
        uint256 _coll,
        uint256 _stake,
        uint16 _interestRate,
        uint256 _lastInterestUpdateTime,
        uint8 _operation
    );
    event BorrowingFeePaid(address indexed _borrower, uint256 _fee);
    event RefinancingFeePaid(address indexed _borrower, uint256 _fee);

    // --- Functions ---

    /// @notice Returns the collateral token address
    function collateralToken() external view returns (IERC20);

    /// @notice Set all contract addresses
    /// @param addresses Array of 14 addresses in order:
    ///   [0] activePool, [1] borrowerOperationsSignatures, [2] collSurplusPool,
    ///   [3] collateralToken, [4] defaultPool, [5] gasPool, [6] governableVariables,
    ///   [7] interestRateManager, [8] musd, [9] pcv, [10] priceFeed,
    ///   [11] sortedTroves, [12] stabilityPool, [13] troveManager
    function setAddresses(address[14] memory addresses) external;

    /// @notice Set the refinancing fee percentage
    /// @param _refinanceFeePercentage The new refinancing fee percentage (0-100)
    function setRefinancingFeePercentage(
        uint8 _refinanceFeePercentage
    ) external;

    /// @notice Open a new trove with ERC20 collateral
    /// @param _collAmount Amount of collateral to deposit
    /// @param _debtAmount Amount of mUSD to borrow
    /// @param _upperHint Address of the trove above in the sorted list
    /// @param _lowerHint Address of the trove below in the sorted list
    function openTrove(
        uint256 _collAmount,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external;

    /// @notice Open a new trove on behalf of another user (restricted to signatures contract)
    /// @param _borrower The address that will own the trove
    /// @param _recipient The address that will receive the mUSD
    /// @param _collAmount Amount of collateral to deposit
    /// @param _debtAmount Amount of mUSD to borrow
    /// @param _upperHint Address of the trove above in the sorted list
    /// @param _lowerHint Address of the trove below in the sorted list
    function restrictedOpenTrove(
        address _borrower,
        address _recipient,
        uint256 _collAmount,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external;

    /// @notice Propose a new minimum net debt value
    /// @param _minNetDebt The proposed minimum net debt
    function proposeMinNetDebt(uint256 _minNetDebt) external;

    /// @notice Approve the proposed minimum net debt after timelock
    function approveMinNetDebt() external;

    /// @notice Propose a new borrowing rate
    /// @param _fee The proposed borrowing rate
    function proposeBorrowingRate(uint256 _fee) external;

    /// @notice Approve the proposed borrowing rate after timelock
    function approveBorrowingRate() external;

    /// @notice Propose a new redemption rate
    /// @param _fee The proposed redemption rate
    function proposeRedemptionRate(uint256 _fee) external;

    /// @notice Approve the proposed redemption rate after timelock
    function approveRedemptionRate() external;

    /// @notice Add collateral to an existing trove
    /// @param _collAmount Amount of collateral to add
    /// @param _upperHint Address of the trove above in the sorted list
    /// @param _lowerHint Address of the trove below in the sorted list
    function addColl(
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external;

    /// @notice Move collateral gain from stability pool to a trove (restricted to stability pool)
    /// @param _borrower The trove owner
    /// @param _collAmount Amount of collateral to move
    /// @param _upperHint Address of the trove above in the sorted list
    /// @param _lowerHint Address of the trove below in the sorted list
    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external;

    /// @notice Withdraw collateral from a trove
    /// @param _amount Amount of collateral to withdraw
    /// @param _upperHint Address of the trove above in the sorted list
    /// @param _lowerHint Address of the trove below in the sorted list
    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    /// @notice Withdraw mUSD from a trove (increase debt)
    /// @param _amount Amount of mUSD to withdraw
    /// @param _upperHint Address of the trove above in the sorted list
    /// @param _lowerHint Address of the trove below in the sorted list
    function withdrawMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    /// @notice Repay mUSD to a trove (decrease debt)
    /// @param _amount Amount of mUSD to repay
    /// @param _upperHint Address of the trove above in the sorted list
    /// @param _lowerHint Address of the trove below in the sorted list
    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    /// @notice Close a trove by repaying all debt
    function closeTrove() external;

    /// @notice Close a trove on behalf of another user (restricted to signatures contract)
    /// @param _borrower The trove owner
    /// @param _caller The address calling this function
    /// @param _recipient The address that will receive the collateral
    function restrictedCloseTrove(
        address _borrower,
        address _caller,
        address _recipient
    ) external;

    /// @notice Refinance a trove to the current interest rate
    /// @param _upperHint Address of the trove above in the sorted list
    /// @param _lowerHint Address of the trove below in the sorted list
    function refinance(address _upperHint, address _lowerHint) external;

    /// @notice Refinance a trove on behalf of another user (restricted to signatures contract)
    /// @param _borrower The trove owner
    /// @param _upperHint Address of the trove above in the sorted list
    /// @param _lowerHint Address of the trove below in the sorted list
    function restrictedRefinance(
        address _borrower,
        address _upperHint,
        address _lowerHint
    ) external;

    /// @notice Adjust a trove's collateral and/or debt
    /// @param _collDeposit Amount of collateral to deposit (0 if withdrawing)
    /// @param _collWithdrawal Amount of collateral to withdraw (0 if depositing)
    /// @param _debtChange Amount of debt change
    /// @param _isDebtIncrease True if increasing debt, false if repaying
    /// @param _upperHint Address of the trove above in the sorted list
    /// @param _lowerHint Address of the trove below in the sorted list
    function adjustTrove(
        uint256 _collDeposit,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external;

    /// @notice Adjust a trove on behalf of another user (restricted to signatures contract)
    /// @param _borrower The trove owner
    /// @param _recipient The address that will receive mUSD (if borrowing) or collateral (if withdrawing)
    /// @param _caller The address calling this function
    /// @param _collDeposit Amount of collateral to deposit
    /// @param _collWithdrawal Amount of collateral to withdraw
    /// @param _mUSDChange Amount of debt change
    /// @param _isDebtIncrease True if increasing debt, false if repaying
    /// @param _upperHint Address of the trove above in the sorted list
    /// @param _lowerHint Address of the trove below in the sorted list
    function restrictedAdjustTrove(
        address _borrower,
        address _recipient,
        address _caller,
        uint256 _collDeposit,
        uint256 _collWithdrawal,
        uint256 _mUSDChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external;

    /// @notice Claim collateral from the surplus pool after liquidation or redemption
    function claimCollateral() external;

    /// @notice Claim collateral on behalf of another user (restricted to signatures contract)
    /// @param _borrower The original trove owner
    /// @param _recipient The address that will receive the collateral
    function restrictedClaimCollateral(
        address _borrower,
        address _recipient
    ) external;

    /// @notice Returns the governable variables contract
    function governableVariables() external view returns (IGovernableVariables);

    /// @notice Calculate the borrowing fee for a given debt amount
    /// @param _debt The debt amount
    /// @return The borrowing fee
    function getBorrowingFee(uint256 _debt) external view returns (uint);

    /// @notice Calculate the redemption fee for a given collateral amount
    /// @param _collateralDrawn The collateral amount being redeemed
    /// @return The redemption fee
    function getRedemptionRate(
        uint256 _collateralDrawn
    ) external view returns (uint256);

    /// @notice Returns the minimum net debt requirement
    function minNetDebt() external view returns (uint256);
}
