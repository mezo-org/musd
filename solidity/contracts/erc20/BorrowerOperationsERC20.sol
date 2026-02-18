// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../dependencies/CheckContract.sol";
import "../dependencies/InterestRateMath.sol";
import "../dependencies/LiquityBase.sol";
import "./SendCollateralERC20.sol";
import "../interfaces/erc20/IBorrowerOperationsERC20.sol";
import "../interfaces/erc20/IActivePoolERC20.sol";
import "../interfaces/erc20/ICollSurplusPoolERC20.sol";
import "../interfaces/IGovernableVariables.sol";
import "../interfaces/IInterestRateManager.sol";
import "../interfaces/IPCV.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/ITroveManager.sol";
import "../token/IMUSD.sol";

/**
 * @title BorrowerOperationsERC20
 * @notice Main user interface for trove management with ERC20 collateral
 * @dev This is a skeleton implementation demonstrating the ERC20 pattern.
 *      Key differences from native version:
 *      - No payable modifiers
 *      - Explicit _collAmount parameters instead of msg.value
 *      - ERC20 transferFrom for deposits
 *      - ERC20 transfer for withdrawals
 *
 *      Full implementation requires:
 *      - Complete internal functions (_openTrove, _adjustTrove, _closeTrove, _refinance)
 *      - All helper functions from original BorrowerOperations
 *      - Proper integration with ERC20 pool contracts
 *      - Comprehensive testing
 */
contract BorrowerOperationsERC20 is
    CheckContract,
    IBorrowerOperationsERC20,
    LiquityBase,
    OwnableUpgradeable,
    SendCollateralERC20
{
    using SafeERC20 for IERC20;

    // --- Variable container structs (same as native version) ---

    struct LocalVariables_adjustTrove {
        uint256 price;
        uint256 collChange;
        uint256 netDebtChange;
        bool isCollIncrease;
        uint256 debt;
        uint256 coll;
        uint256 oldICR;
        uint256 newICR;
        uint256 newTCR;
        uint256 fee;
        uint256 newColl;
        uint256 newPrincipal;
        uint256 newInterest;
        uint256 stake;
        uint256 interestOwed;
        uint256 principalAdjustment;
        uint256 interestAdjustment;
        bool isRecoveryMode;
        uint256 newNICR;
        uint256 maxBorrowingCapacity;
        uint16 interestRate;
    }

    struct LocalVariables_openTrove {
        uint256 price;
        uint256 fee;
        uint256 netDebt;
        uint256 ICR;
        uint256 NICR;
        uint256 stake;
        uint256 arrayIndex;
        uint16 interestRate;
    }

    struct ContractsCache {
        ITroveManager troveManager;
        IActivePoolERC20 activePoolERC20;
        IMUSD musd;
        IInterestRateManager interestRateManager;
    }

    enum BorrowerOperation {
        openTrove,
        closeTrove,
        adjustTrove,
        refinanceTrove
    }

    string public constant name = "BorrowerOperationsERC20";
    uint256 public constant MIN_NET_DEBT_MIN = 50e18;

    // Connected contract declarations
    address public collateralToken;
    IActivePoolERC20 public activePoolERC20;
    ITroveManager public troveManager;
    address public gasPoolAddress;
    IGovernableVariables internal _governableVariables;
    address public pcvAddress;
    address public stabilityPoolAddress;
    address public borrowerOperationsSignaturesAddress;
    ICollSurplusPoolERC20 public collSurplusPool;
    IMUSD public musd;
    IPCV public pcv;

    ISortedTroves public sortedTroves;

    uint8 public refinancingFeePercentage;

    // Governable Variables
    uint256 public minNetDebt;
    uint256 public proposedMinNetDebt;
    uint256 public proposedMinNetDebtTime;

    uint256 public borrowingRate;
    uint256 public proposedBorrowingRate;
    uint256 public proposedBorrowingRateTime;

    uint256 public redemptionRate;
    uint256 public proposedRedemptionRate;
    uint256 public proposedRedemptionRateTime;

    modifier onlyGovernance() {
        require(
            msg.sender == pcv.council() || msg.sender == pcv.treasury(),
            "BorrowerOpsERC20: Only governance can call this function"
        );
        _;
    }

    function initialize() external initializer {
        __Ownable_init(msg.sender);
        refinancingFeePercentage = 20;
        minNetDebt = 1800e18;

        borrowingRate = DECIMAL_PRECISION / 1000; // 0.1%
        proposedBorrowingRate = borrowingRate;
        // solhint-disable-next-line not-rely-on-time
        proposedBorrowingRateTime = block.timestamp;

        redemptionRate = (DECIMAL_PRECISION * 3) / 400; // 0.75%
        proposedRedemptionRate = redemptionRate;
        // solhint-disable-next-line not-rely-on-time
        proposedRedemptionRateTime = block.timestamp;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Contract Setup ---

    function setAddresses(
        address[13] memory addresses
    ) external override onlyOwner {
        require(
            addresses[0] != address(0),
            "BorrowerOpsERC20: Collateral token cannot be zero"
        );

        // Check all contracts
        checkContract(addresses[1]); // activePool
        checkContract(addresses[2]); // defaultPool
        checkContract(addresses[3]); // stabilityPool
        checkContract(addresses[4]); // gasPool
        checkContract(addresses[5]); // collSurplusPool
        checkContract(addresses[6]); // priceFeed
        checkContract(addresses[7]); // sortedTroves
        checkContract(addresses[8]); // musdToken
        checkContract(addresses[9]); // troveManager
        checkContract(addresses[10]); // interestRateManager
        checkContract(addresses[11]); // governableVariables
        checkContract(addresses[12]); // pcv

        collateralToken = addresses[0];
        activePoolERC20 = IActivePoolERC20(addresses[1]);
        stabilityPoolAddress = addresses[3];
        gasPoolAddress = addresses[4];
        collSurplusPool = ICollSurplusPoolERC20(addresses[5]);
        priceFeed = IPriceFeed(addresses[6]);
        sortedTroves = ISortedTroves(addresses[7]);
        musd = IMUSD(addresses[8]);
        troveManager = ITroveManager(addresses[9]);
        interestRateManager = IInterestRateManager(addresses[10]);
        _governableVariables = IGovernableVariables(addresses[11]);
        pcvAddress = addresses[12];
        pcv = IPCV(addresses[12]);

        emit ActivePoolAddressChanged(addresses[1]);
        emit DefaultPoolAddressChanged(addresses[2]);
        emit StabilityPoolAddressChanged(addresses[3]);
        emit GasPoolAddressChanged(addresses[4]);
        emit CollSurplusPoolAddressChanged(addresses[5]);
        emit PriceFeedAddressChanged(addresses[6]);
        emit SortedTrovesAddressChanged(addresses[7]);
        emit MUSDTokenAddressChanged(addresses[8]);
        emit TroveManagerAddressChanged(addresses[9]);
        emit InterestRateManagerAddressChanged(addresses[10]);
        emit GovernableVariablesAddressChanged(addresses[11]);
        emit PCVAddressChanged(addresses[12]);

        renounceOwnership();
    }

    // --- Borrower Trove Operations ---

    /**
     * @notice Open a new trove with ERC20 collateral
     * @dev User must approve this contract to spend collateralToken first
     * @param _collAmount Amount of ERC20 collateral to deposit
     * @param _debtAmount Amount of mUSD to borrow
     */
    function openTrove(
        uint256 _collAmount,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        // Transfer collateral from user to ActivePoolERC20
        IERC20(collateralToken).safeTransferFrom(
            msg.sender,
            address(activePoolERC20),
            _collAmount
        );

        // Notify ActivePoolERC20 of the deposit
        activePoolERC20.receiveCollateral(_collAmount);

        // TODO: Implement _openTrove internal function
        // This would include all the logic from the native version:
        // - Validate minimum debt
        // - Calculate fees
        // - Check collateralization ratio
        // - Mint mUSD
        // - Update trove state
        // - Insert into sorted troves

        revert("BorrowerOpsERC20: openTrove not fully implemented");
    }

    /**
     * @notice Add ERC20 collateral to an existing trove
     */
    function addColl(
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        require(
            _collAmount > 0,
            "BorrowerOpsERC20: Cannot add zero collateral"
        );

        // Transfer collateral from user to ActivePoolERC20
        IERC20(collateralToken).safeTransferFrom(
            msg.sender,
            address(activePoolERC20),
            _collAmount
        );

        // Notify ActivePoolERC20 of the deposit
        activePoolERC20.receiveCollateral(_collAmount);

        // TODO: Implement _adjustTrove with collateral increase
        revert("BorrowerOpsERC20: addColl not fully implemented");
    }

    /**
     * @notice Withdraw ERC20 collateral from trove
     */
    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        // TODO: Implement _adjustTrove with collateral withdrawal
        // This would:
        // - Validate ICR remains above MCR
        // - Update trove state
        // - Call activePool.sendCollateral to user
        revert("BorrowerOpsERC20: withdrawColl not fully implemented");
    }

    /**
     * @notice Withdraw mUSD (increase debt)
     */
    function withdrawMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        // TODO: Same logic as native version
        revert("BorrowerOpsERC20: withdrawMUSD not fully implemented");
    }

    /**
     * @notice Repay mUSD (decrease debt)
     */
    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        // TODO: Same logic as native version
        revert("BorrowerOpsERC20: repayMUSD not fully implemented");
    }

    /**
     * @notice Close trove by repaying all debt
     */
    function closeTrove() external override {
        // TODO: Implement _closeTrove
        // - Burn user's mUSD
        // - Return collateral via activePool.sendCollateral
        // - Remove from sorted troves
        revert("BorrowerOpsERC20: closeTrove not fully implemented");
    }

    /**
     * @notice Adjust trove with both collateral and debt changes
     * @param _collDeposit Amount of collateral to deposit (0 if none)
     * @param _collWithdrawal Amount of collateral to withdraw (0 if none)
     */
    function adjustTrove(
        uint256 _collDeposit,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external override {
        require(
            _collDeposit == 0 || _collWithdrawal == 0,
            "BorrowerOpsERC20: Cannot deposit and withdraw"
        );

        if (_collDeposit > 0) {
            // Transfer collateral from user
            IERC20(collateralToken).safeTransferFrom(
                msg.sender,
                address(activePoolERC20),
                _collDeposit
            );
            activePoolERC20.receiveCollateral(_collDeposit);
        }

        // TODO: Implement full _adjustTrove logic
        revert("BorrowerOpsERC20: adjustTrove not fully implemented");
    }

    /**
     * @notice Refinance to current interest rate
     */
    function refinance(
        address _upperHint,
        address _lowerHint
    ) external override {
        // TODO: Implement _refinance
        revert("BorrowerOpsERC20: refinance not fully implemented");
    }

    /**
     * @notice Claim surplus collateral after redemption
     */
    function claimCollateral() external override {
        collSurplusPool.claimColl(msg.sender, msg.sender);
    }

    // --- Restricted Functions (for signatures contract) ---

    function restrictedOpenTrove(
        address _borrower,
        address _recipient,
        uint256 _collAmount,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _requireCallerIsBorrowerOperationsSignatures();
        // TODO: Implement
        revert("BorrowerOpsERC20: restrictedOpenTrove not fully implemented");
    }

    function restrictedCloseTrove(
        address _borrower,
        address _caller,
        address _recipient
    ) external override {
        _requireCallerIsBorrowerOperationsSignatures();
        // TODO: Implement
        revert("BorrowerOpsERC20: restrictedCloseTrove not fully implemented");
    }

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
    ) external override {
        _requireCallerIsBorrowerOperationsSignatures();
        // TODO: Implement
        revert("BorrowerOpsERC20: restrictedAdjustTrove not fully implemented");
    }

    function restrictedRefinance(
        address _borrower,
        address _upperHint,
        address _lowerHint
    ) external override {
        _requireCallerIsBorrowerOperationsSignatures();
        // TODO: Implement
        revert("BorrowerOpsERC20: restrictedRefinance not fully implemented");
    }

    function restrictedClaimCollateral(
        address _borrower,
        address _recipient
    ) external override {
        _requireCallerIsBorrowerOperationsSignatures();
        collSurplusPool.claimColl(_borrower, _recipient);
    }

    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _requireCallerIsStabilityPool();
        // TODO: Implement
        revert(
            "BorrowerOpsERC20: moveCollateralGainToTrove not fully implemented"
        );
    }

    // --- PCV Functions ---

    function mintBootstrapLoanFromPCV(uint256 _musdToMint) external {
        require(
            msg.sender == pcvAddress,
            "BorrowerOpsERC20: caller must be PCV"
        );
        musd.mint(pcvAddress, _musdToMint);
    }

    function burnDebtFromPCV(uint256 _musdToBurn) external virtual {
        require(
            msg.sender == pcvAddress,
            "BorrowerOpsERC20: caller must be PCV"
        );
        musd.burn(pcvAddress, _musdToBurn);
    }

    // --- Governance Functions ---

    function setRefinancingFeePercentage(
        uint8 _refinanceFeePercentage
    ) external override onlyGovernance {
        require(
            _refinanceFeePercentage <= 100,
            "BorrowerOpsERC20: Fee percentage must be <= 100"
        );
        refinancingFeePercentage = _refinanceFeePercentage;
        emit RefinancingFeePercentageChanged(_refinanceFeePercentage);
    }

    function proposeMinNetDebt(
        uint256 _minNetDebt
    ) external override onlyGovernance {
        require(
            _minNetDebt >= MIN_NET_DEBT_MIN,
            "BorrowerOpsERC20: Min net debt too low"
        );
        proposedMinNetDebt = _minNetDebt;
        // solhint-disable-next-line not-rely-on-time
        proposedMinNetDebtTime = block.timestamp;
        emit MinNetDebtProposed(_minNetDebt, block.timestamp);
    }

    function approveMinNetDebt() external override onlyGovernance {
        require(
            // solhint-disable-next-line not-rely-on-time
            block.timestamp >= proposedMinNetDebtTime + 7 days,
            "BorrowerOpsERC20: Governance delay not met"
        );
        minNetDebt = proposedMinNetDebt;
        emit MinNetDebtChanged(minNetDebt);
    }

    function proposeBorrowingRate(
        uint256 _fee
    ) external override onlyGovernance {
        proposedBorrowingRate = _fee;
        // solhint-disable-next-line not-rely-on-time
        proposedBorrowingRateTime = block.timestamp;
        emit BorrowingRateProposed(_fee, block.timestamp);
    }

    function approveBorrowingRate() external override onlyGovernance {
        require(
            // solhint-disable-next-line not-rely-on-time
            block.timestamp >= proposedBorrowingRateTime + 7 days,
            "BorrowerOpsERC20: Governance delay not met"
        );
        borrowingRate = proposedBorrowingRate;
        emit BorrowingRateChanged(borrowingRate);
    }

    function proposeRedemptionRate(
        uint256 _fee
    ) external override onlyGovernance {
        proposedRedemptionRate = _fee;
        // solhint-disable-next-line not-rely-on-time
        proposedRedemptionRateTime = block.timestamp;
        emit RedemptionRateProposed(_fee, block.timestamp);
    }

    function approveRedemptionRate() external override onlyGovernance {
        require(
            // solhint-disable-next-line not-rely-on-time
            block.timestamp >= proposedRedemptionRateTime + 7 days,
            "BorrowerOpsERC20: Governance delay not met"
        );
        redemptionRate = proposedRedemptionRate;
        emit RedemptionRateChanged(redemptionRate);
    }

    // --- View Functions ---

    function getBorrowingFee(
        uint256 _debt
    ) external view override returns (uint) {
        return _calcBorrowingFee(_debt);
    }

    function getRedemptionRate(
        uint256 _collateralDrawn
    ) external view override returns (uint256) {
        return _calcRedemptionRate(_collateralDrawn);
    }

    function governableVariables()
        external
        view
        override
        returns (IGovernableVariables)
    {
        return _governableVariables;
    }

    // --- Internal Helper Functions ---

    function _calcBorrowingFee(uint256 _debt) internal view returns (uint) {
        return (_debt * borrowingRate) / DECIMAL_PRECISION;
    }

    function _calcRedemptionRate(
        uint256 _collateralDrawn
    ) internal view returns (uint256) {
        return (_collateralDrawn * redemptionRate) / DECIMAL_PRECISION;
    }

    // --- Require Functions ---

    function _requireCallerIsBorrowerOperationsSignatures() internal view {
        require(
            msg.sender == borrowerOperationsSignaturesAddress,
            "BorrowerOpsERC20: Caller not BorrowerOperationsSignatures"
        );
    }

    function _requireCallerIsStabilityPool() internal view {
        require(
            msg.sender == stabilityPoolAddress,
            "BorrowerOpsERC20: Caller is not Stability Pool"
        );
    }

    // NOTE: Full implementation would include many more internal functions:
    // - _openTrove
    // - _adjustTrove
    // - _closeTrove
    // - _refinance
    // - _updateTroveFromAdjustment
    // - _moveTokensAndCollateralfromAdjustment
    // - _withdrawMUSD
    // - _repayMUSD
    // - And many validation functions
    //
    // See native BorrowerOperations.sol for complete implementation details
}
