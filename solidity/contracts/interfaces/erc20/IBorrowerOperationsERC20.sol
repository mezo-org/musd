// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IBorrowerOperationsERC20
 * @notice Interface for BorrowerOperations with ERC20 collateral
 *
 * The BorrowerOperations contract is the main user interface for trove management.
 * Users can open troves, add/remove collateral, borrow/repay mUSD, and close troves.
 *
 * Key differences from native BorrowerOperations:
 * - openTrove takes an explicit _collAmount parameter instead of using msg.value
 * - addColl takes an explicit _collAmount parameter instead of using msg.value
 * - adjustTrove takes _collDeposit for collateral to add (instead of msg.value)
 * - moveCollateralGainToTrove takes _collAmount from StabilityPool
 * - All collateral-adding functions are NOT payable
 * - ERC20 collateral is pulled via approve+transferFrom pattern
 */
interface IBorrowerOperationsERC20 {
    // --- Events ---

    event ActivePoolAddressChanged(address _activePoolAddress);
    event BorrowingRateChanged(uint256 borrowingRate);
    event BorrowingRateProposed(
        uint256 proposedBorrowingRate,
        uint256 proposedBorrowingRateTime
    );
    event CollSurplusPoolAddressChanged(address _collSurplusPoolAddress);
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

    // --- Functions ---

    /**
     * @notice Open a new trove with ERC20 collateral
     * @param _collAmount Amount of ERC20 collateral to deposit
     * @param _debtAmount Amount of mUSD to borrow
     * @param _upperHint Address of a trove with an ICR >= new ICR
     * @param _lowerHint Address of a trove with an ICR <= new ICR
     * @dev User must approve collateral before calling
     */
    function openTrove(
        uint256 _collAmount,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external;

    /**
     * @notice Add ERC20 collateral to an existing trove
     * @param _collAmount Amount of ERC20 collateral to add
     * @param _upperHint Address of a trove with an ICR >= new ICR
     * @param _lowerHint Address of a trove with an ICR <= new ICR
     * @dev User must approve collateral before calling
     */
    function addColl(
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external;

    /**
     * @notice Move collateral gain from StabilityPool to borrower's trove
     * @param _borrower Address of the trove owner
     * @param _collAmount Amount of collateral to move
     * @param _upperHint Address of a trove with an ICR >= new ICR
     * @param _lowerHint Address of a trove with an ICR <= new ICR
     * @dev Only callable by StabilityPool. Collateral is pulled via transferFrom.
     */
    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external;

    /**
     * @notice Withdraw ERC20 collateral from a trove
     * @param _amount Amount of collateral to withdraw
     * @param _upperHint Address of a trove with an ICR >= new ICR
     * @param _lowerHint Address of a trove with an ICR <= new ICR
     */
    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    /**
     * @notice Withdraw mUSD from a trove (borrow more)
     * @param _amount Amount of mUSD to borrow
     * @param _upperHint Address of a trove with an ICR >= new ICR
     * @param _lowerHint Address of a trove with an ICR <= new ICR
     */
    function withdrawMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    /**
     * @notice Repay mUSD to a trove
     * @param _amount Amount of mUSD to repay
     * @param _upperHint Address of a trove with an ICR >= new ICR
     * @param _lowerHint Address of a trove with an ICR <= new ICR
     */
    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    /**
     * @notice Close a trove and return all ERC20 collateral to the owner
     */
    function closeTrove() external;

    /**
     * @notice Adjust a trove's collateral and/or debt
     * @param _collDeposit Amount of ERC20 collateral to add (0 if withdrawing)
     * @param _collWithdrawal Amount of collateral to withdraw (0 if depositing)
     * @param _debtChange Amount to change debt by
     * @param _isDebtIncrease True if borrowing more, false if repaying
     * @param _upperHint Address of a trove with an ICR >= new ICR
     * @param _lowerHint Address of a trove with an ICR <= new ICR
     * @dev User must approve collateral before calling if _collDeposit > 0
     */
    function adjustTrove(
        uint256 _collDeposit,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external;

    /**
     * @notice Claim surplus collateral after a liquidation or redemption
     */
    function claimCollateral() external;

    /**
     * @notice Mints the bootstrap loan from PCV
     * @param _musdToMint Amount of MUSD to mint
     * @dev Only callable by PCV address
     */
    function mintBootstrapLoanFromPCV(uint256 _musdToMint) external;

    /**
     * @notice Burns debt repayment from PCV
     * @param _musdToBurn Amount of MUSD to burn
     * @dev Only callable by PCV address
     */
    function burnDebtFromPCV(uint256 _musdToBurn) external;

    // --- View Functions ---

    /**
     * @notice Returns the ERC20 collateral token
     */
    function collateralToken() external view returns (IERC20);

    /**
     * @notice Returns the stability pool address
     */
    function stabilityPoolAddress() external view returns (address);

    /**
     * @notice Returns the borrowing fee for a given debt amount
     * @param _debt Amount of debt
     * @return The borrowing fee
     */
    function getBorrowingFee(uint256 _debt) external view returns (uint256);

    /**
     * @notice Returns the minimum net debt required for a trove
     */
    function minNetDebt() external view returns (uint256);
}
