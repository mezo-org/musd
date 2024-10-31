// slither-disable-start reentrancy-benign
// slither-disable-start reentrancy-events
// slither-disable-start reentrancy-no-eth

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/LiquityBase.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IGasPool.sol";
import "./token/IMUSD.sol";
import "./interfaces/IStabilityPool.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/ITroveManager.sol";
import "./interfaces/IPCV.sol";

contract TroveManager is LiquityBase, Ownable, CheckContract, ITroveManager {
    enum TroveManagerOperation {
        applyPendingRewards,
        liquidateInNormalMode,
        liquidateInRecoveryMode,
        redeemCollateral
    }

    // Store the necessary data for a trove
    struct Trove {
        uint256 coll;
        uint256 debt;
        uint256 interestOwed;
        uint256 stake;
        Status status;
        uint16 interestRate;
        uint256 lastInterestUpdateTime;
        uint128 arrayIndex;
    }

    // Object containing the collateral and MUSD snapshots for a given active trove
    struct RewardSnapshot {
        uint256 collateral;
        uint256 MUSDDebt;
    }

    struct LocalVariables_OuterLiquidationFunction {
        uint256 price;
        uint256 MUSDInStabPool;
        bool recoveryModeAtStart;
        uint256 liquidatedDebt;
        uint256 liquidatedColl;
    }

    struct LocalVariables_InnerSingleLiquidateFunction {
        uint256 collToLiquidate;
        uint256 pendingDebtReward;
        uint256 pendingCollReward;
    }

    struct LiquidationTotals {
        uint256 totalCollInSequence;
        uint256 totalDebtInSequence;
        uint256 totalCollGasCompensation;
        uint256 totalMUSDGasCompensation;
        uint256 totalDebtToOffset;
        uint256 totalCollToSendToSP;
        uint256 totalDebtToRedistribute;
        uint256 totalCollToRedistribute;
        uint256 totalCollSurplus;
    }

    struct LocalVariables_LiquidationSequence {
        uint256 remainingMUSDInStabPool;
        uint256 i;
        uint256 ICR;
        address user;
        bool backToNormalMode;
        uint256 entireSystemDebt;
        uint256 entireSystemColl;
    }

    struct LiquidationValues {
        uint256 entireTroveDebt;
        uint256 entireTroveColl;
        uint256 collGasCompensation;
        uint256 MUSDGasCompensation;
        uint256 debtToOffset;
        uint256 collToSendToSP;
        uint256 debtToRedistribute;
        uint256 collToRedistribute;
        uint256 collSurplus;
    }

    struct ContractsCache {
        IActivePool activePool;
        IDefaultPool defaultPool;
        IMUSD musdToken;
        IPCV pcv;
        ISortedTroves sortedTroves;
        ICollSurplusPool collSurplusPool;
        address gasPoolAddress;
    }

    struct SingleRedemptionValues {
        uint256 MUSDLot;
        uint256 collateralLot;
        bool cancelledPartial;
    }

    struct RedemptionTotals {
        uint256 remainingMUSD;
        uint256 totalMUSDToRedeem;
        uint256 totalCollateralDrawn;
        uint256 collateralFee;
        uint256 collateralToSendToRedeemer;
        uint256 decayedBaseRate;
        uint256 price;
        uint256 totalMUSDDebtAtStart;
    }

    // --- Connected contract declarations ---

    address public borrowerOperationsAddress;

    IStabilityPool public override stabilityPool;

    address public gasPoolAddress;

    ICollSurplusPool public collSurplusPool;

    IMUSD public musdToken;

    IPCV public override pcv;

    // A doubly linked list of Troves, sorted by their sorted by their collateral ratios
    ISortedTroves public sortedTroves;

    // --- Data structures ---

    /*
     * Half-life of 12h. 12h = 720 min
     * (1/2) = d^720 => d = (1/2)^(1/720)
     */
    uint256 public constant MINUTE_DECAY_FACTOR = 999037758833783000;
    uint256 public constant REDEMPTION_FEE_FLOOR =
        (DECIMAL_PRECISION * 5) / 1000; // 0.5%
    uint256 public constant MAX_BORROWING_FEE = (DECIMAL_PRECISION * 5) / 100; // 5%

    /*
     * BETA: 18 digit decimal. Parameter by which to divide the redeemed fraction, in order to calc the new base rate from a redemption.
     * Corresponds to (1 / ALPHA) in the white paper.
     */
    uint256 public constant BETA = 2;

    uint256 public baseRate;

    // The timestamp of the latest fee operation (redemption or new MUSD issuance)
    uint256 public lastFeeOperationTime;

    mapping(address => Trove) public Troves;

    uint256 public totalStakes;

    // Snapshot of the value of totalStakes, taken immediately after the latest liquidation
    uint256 public totalStakesSnapshot;

    // Snapshot of the total collateral across the ActivePool and DefaultPool, immediately after the latest liquidation.
    uint256 public totalCollateralSnapshot;

    /*
     * L_Collateral and L_MUSDDebt track the sums of accumulated liquidation rewards per unit staked. During its lifetime, each stake earns:
     *
     * An collateral gain of ( stake * [L_Collateral - L_Collateral(0)] )
     * A MUSDDebt increase  of ( stake * [L_MUSDDebt - L_MUSDDebt(0)] )
     *
     * Where L_Collateral(0) and L_MUSDDebt(0) are snapshots of L_Collateral and L_MUSDDebt for the active Trove taken at the instant the stake was made
     */
    uint256 public L_Collateral;
    uint256 public L_MUSDDebt;

    // Array of all active trove addresses - used to to compute an approximate hint off-chain, for the sorted list insertion
    // slither-disable-next-line similar-names
    address[] public TroveOwners;

    // Error trackers for the trove redistribution calculation
    uint256 public lastCollateralError_Redistribution;
    uint256 public lastMUSDDebtError_Redistribution;

    // Map addresses with active troves to their RewardSnapshot
    mapping(address => RewardSnapshot) public rewardSnapshots;

    // Array of historical interest rate changes
    InterestRateChange[] public interestRateHistory;

    // Current interest rate per year in basis points
    uint16 public interestRate;

    // Maximum interest rate that can be set, defaults to 100% (10000 bps)
    uint16 public maxInterestRate = 10000;

    // Proposed interest rate -- must be approved by governance after a minimum delay
    uint16 public proposedInterestRate;
    uint256 public proposalTime;

    // Minimum time delay between interest rate proposal and approval
    uint256 public constant MIN_DELAY = 7 days;

    uint256 public constant SECONDS_IN_A_YEAR = 365 * 24 * 60 * 60;

    modifier onlyOwnerOrGovernance() {
        require(
            msg.sender == owner() || msg.sender == pcv.council(),
            "TroveManager: Only governance can call this function"
        );
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _gasPoolAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _stabilityPoolAddress
    ) external override onlyOwner {
        checkContract(_activePoolAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_musdTokenAddress);
        checkContract(_pcvAddress);
        checkContract(_priceFeedAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_stabilityPoolAddress);

        // slither-disable-next-line missing-zero-check
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePool = IActivePool(_activePoolAddress);
        defaultPool = IDefaultPool(_defaultPoolAddress);
        stabilityPool = IStabilityPool(_stabilityPoolAddress);
        // slither-disable-next-line missing-zero-check
        gasPoolAddress = _gasPoolAddress;
        collSurplusPool = ICollSurplusPool(_collSurplusPoolAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        musdToken = IMUSD(_musdTokenAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        pcv = IPCV(_pcvAddress);

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit GasPoolAddressChanged(_gasPoolAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit PCVAddressChanged(_pcvAddress);

        renounceOwnership();
    }

    function liquidate(address _borrower) external override {
        _requireTroveIsActive(_borrower);

        address[] memory borrowers = new address[](1);
        borrowers[0] = _borrower;
        batchLiquidateTroves(borrowers);
    }

    function liquidateTroves(uint256 _n) external override {
        ContractsCache memory contractsCache = ContractsCache(
            activePool,
            defaultPool,
            IMUSD(address(0)),
            IPCV(address(0)),
            sortedTroves,
            ICollSurplusPool(address(0)),
            address(0)
        );
        IStabilityPool stabilityPoolCached = stabilityPool;

        // slither-disable-next-line uninitialized-local
        LocalVariables_OuterLiquidationFunction memory vars;

        LiquidationTotals memory totals;

        vars.price = priceFeed.fetchPrice();
        vars.MUSDInStabPool = stabilityPoolCached.getTotalMUSDDeposits();
        vars.recoveryModeAtStart = _checkRecoveryMode(vars.price);

        // Perform the appropriate liquidation sequence - tally the values, and obtain their totals
        if (vars.recoveryModeAtStart) {
            totals = _getTotalsFromLiquidateTrovesSequenceRecoveryMode(
                contractsCache,
                vars.price,
                vars.MUSDInStabPool,
                _n
            );
        } else {
            // if !vars.recoveryModeAtStart
            totals = _getTotalsFromLiquidateTrovesSequenceNormalMode(
                contractsCache.activePool,
                contractsCache.defaultPool,
                vars.price,
                vars.MUSDInStabPool,
                _n
            );
        }

        require(
            totals.totalDebtInSequence > 0,
            "TroveManager: nothing to liquidate"
        );

        // Move liquidated collateral and MUSD to the appropriate pools
        stabilityPoolCached.offset(
            totals.totalDebtToOffset,
            totals.totalCollToSendToSP
        );
        _redistributeDebtAndColl(
            contractsCache.activePool,
            contractsCache.defaultPool,
            totals.totalDebtToRedistribute,
            totals.totalCollToRedistribute
        );
        if (totals.totalCollSurplus > 0) {
            contractsCache.activePool.sendCollateral(
                address(collSurplusPool),
                totals.totalCollSurplus
            );
        }

        // Update system snapshots
        _updateSystemSnapshotsExcludeCollRemainder(
            contractsCache.activePool,
            totals.totalCollGasCompensation
        );

        vars.liquidatedDebt = totals.totalDebtInSequence;
        vars.liquidatedColl =
            totals.totalCollInSequence -
            totals.totalCollGasCompensation -
            totals.totalCollSurplus;
        emit Liquidation(
            vars.liquidatedDebt,
            vars.liquidatedColl,
            totals.totalCollGasCompensation,
            totals.totalMUSDGasCompensation
        );

        // Send gas compensation to caller
        _sendGasCompensation(
            contractsCache.activePool,
            msg.sender,
            totals.totalMUSDGasCompensation,
            totals.totalCollGasCompensation
        );
    }

    /* Send _MUSDamount MUSD to the system and redeem the corresponding amount of collateral from as many Troves as are needed to fill the redemption
     * request.  Applies pending rewards to a Trove before reducing its debt and coll.
     *
     * Note that if _amount is very large, this function can run out of gas, specially if traversed troves are small. This can be easily avoided by
     * splitting the total _amount in appropriate chunks and calling the function multiple times.
     *
     * Param `_maxIterations` can also be provided, so the loop through Troves is capped (if it’s zero, it will be ignored).This makes it easier to
     * avoid OOG for the frontend, as only knowing approximately the average cost of an iteration is enough, without needing to know the “topology”
     * of the trove list. It also avoids the need to set the cap in stone in the contract, nor doing gas calculations, as both gas price and opcode
     * costs can vary.
     *
     * All Troves that are redeemed from -- with the likely exception of the last one -- will end up with no debt left, therefore they will be closed.
     * If the last Trove does have some remaining debt, it has a finite ICR, and the reinsertion could be anywhere in the list, therefore it requires a hint.
     * A frontend should use getRedemptionHints() to calculate what the ICR of this Trove will be after redemption, and pass a hint for its position
     * in the sortedTroves list along with the ICR value that the hint was found for.
     *
     * If another transaction modifies the list between calling getRedemptionHints() and passing the hints to redeemCollateral(), it
     * is very likely that the last (partially) redeemed Trove would end up with a different ICR than what the hint is for. In this case the
     * redemption will stop after the last completely redeemed Trove and the sender will keep the remaining MUSD amount, which they can attempt
     * to redeem later.
     */
    function redeemCollateral(
        uint256 _MUSDAmount,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint256 _partialRedemptionHintNICR,
        uint256 _maxIterations,
        uint256 _maxFeePercentage
    ) external override {
        ContractsCache memory contractsCache = ContractsCache(
            activePool,
            defaultPool,
            musdToken,
            pcv,
            sortedTroves,
            collSurplusPool,
            gasPoolAddress
        );
        // slither-disable-next-line uninitialized-local
        RedemptionTotals memory totals;

        _requireValidMaxFeePercentage(_maxFeePercentage);
        totals.price = priceFeed.fetchPrice();
        _requireTCRoverMCR(totals.price);
        _requireAmountGreaterThanZero(_MUSDAmount);
        _requireMUSDBalanceCoversRedemption(
            contractsCache.musdToken,
            msg.sender,
            _MUSDAmount
        );

        totals.totalMUSDDebtAtStart = getEntireSystemDebt();
        totals.remainingMUSD = _MUSDAmount;
        address currentBorrower;

        if (
            _isValidFirstRedemptionHint(
                contractsCache.sortedTroves,
                _firstRedemptionHint,
                totals.price
            )
        ) {
            currentBorrower = _firstRedemptionHint;
        } else {
            currentBorrower = contractsCache.sortedTroves.getLast();
            // Find the first trove with ICR >= MCR
            while (
                currentBorrower != address(0) &&
                getCurrentICR(currentBorrower, totals.price) < MCR
            ) {
                // slither-disable-next-line calls-loop
                currentBorrower = contractsCache.sortedTroves.getPrev(
                    currentBorrower
                );
            }
        }

        // Loop through the Troves starting from the one with lowest collateral ratio until _amount of MUSD is exchanged for collateral
        if (_maxIterations == 0) {
            _maxIterations = type(uint256).max;
        }
        while (
            currentBorrower != address(0) &&
            totals.remainingMUSD > 0 &&
            _maxIterations > 0
        ) {
            _maxIterations--;
            // Save the address of the Trove preceding the current one, before potentially modifying the list
            // slither-disable-next-line calls-loop
            address nextUserToCheck = contractsCache.sortedTroves.getPrev(
                currentBorrower
            );

            _applyPendingRewards(
                contractsCache.activePool,
                contractsCache.defaultPool,
                currentBorrower
            );

            SingleRedemptionValues
                memory singleRedemption = _redeemCollateralFromTrove(
                    contractsCache,
                    currentBorrower,
                    totals.remainingMUSD,
                    totals.price,
                    _upperPartialRedemptionHint,
                    _lowerPartialRedemptionHint,
                    _partialRedemptionHintNICR
                );

            if (singleRedemption.cancelledPartial) break; // Partial redemption was cancelled (out-of-date hint, or new net debt < minimum), therefore we could not redeem from the last Trove

            totals.totalMUSDToRedeem += singleRedemption.MUSDLot;
            totals.totalCollateralDrawn += singleRedemption.collateralLot;

            totals.remainingMUSD -= singleRedemption.MUSDLot;
            currentBorrower = nextUserToCheck;
        }
        require(
            totals.totalCollateralDrawn > 0,
            "TroveManager: Unable to redeem any amount"
        );

        // Decay the baseRate due to time passed, and then increase it according to the size of this redemption.
        // Use the saved total MUSD supply value, from before it was reduced by the redemption.
        _updateBaseRateFromRedemption(
            totals.totalCollateralDrawn,
            totals.price,
            totals.totalMUSDDebtAtStart
        );

        // Calculate the collateral fee
        totals.collateralFee = _getRedemptionFee(totals.totalCollateralDrawn);

        _requireUserAcceptsFee(
            totals.collateralFee,
            totals.totalCollateralDrawn,
            _maxFeePercentage
        );

        // Send the collateral fee to the PCV contract
        contractsCache.activePool.sendCollateral(
            address(contractsCache.pcv),
            totals.collateralFee
        );

        totals.collateralToSendToRedeemer =
            totals.totalCollateralDrawn -
            totals.collateralFee;

        emit Redemption(
            _MUSDAmount,
            totals.totalMUSDToRedeem,
            totals.totalCollateralDrawn,
            totals.collateralFee
        );

        // Burn the total MUSD that is cancelled with debt, and send the redeemed collateral to msg.sender
        contractsCache.musdToken.burn(msg.sender, totals.totalMUSDToRedeem);
        // Update Active Pool MUSD, and send collateral to account
        contractsCache.activePool.decreaseMUSDDebt(totals.totalMUSDToRedeem);
        contractsCache.activePool.sendCollateral(
            msg.sender,
            totals.collateralToSendToRedeemer
        );
    }

    function updateStakeAndTotalStakes(
        address _borrower
    ) external override returns (uint) {
        _requireCallerIsBorrowerOperations();
        return _updateStakeAndTotalStakes(_borrower);
    }

    // Update borrower's snapshots of L_Collateral and L_MUSDDebt to reflect the current values
    function updateTroveRewardSnapshots(address _borrower) external override {
        _requireCallerIsBorrowerOperations();
        return _updateTroveRewardSnapshots(_borrower);
    }

    // Push the owner's address to the Trove owners list, and record the corresponding array index on the Trove struct
    function addTroveOwnerToArray(
        address _borrower
    ) external override returns (uint256 index) {
        _requireCallerIsBorrowerOperations();
        return _addTroveOwnerToArray(_borrower);
    }

    function applyPendingRewards(address _borrower) external override {
        _requireCallerIsBorrowerOperations();
        return _applyPendingRewards(activePool, defaultPool, _borrower);
    }

    function closeTrove(address _borrower) external override {
        _requireCallerIsBorrowerOperations();
        return _closeTrove(_borrower, Status.closedByOwner);
    }

    function removeStake(address _borrower) external override {
        _requireCallerIsBorrowerOperations();
        return _removeStake(_borrower);
    }

    // Updates the baseRate state variable based on time elapsed since the last redemption or MUSD borrowing operation.
    function decayBaseRateFromBorrowing() external override {
        _requireCallerIsBorrowerOperations();

        uint256 decayedBaseRate = _calcDecayedBaseRate();
        assert(decayedBaseRate <= DECIMAL_PRECISION); // The baseRate can decay to 0

        baseRate = decayedBaseRate;
        emit BaseRateUpdated(decayedBaseRate);

        _updateLastFeeOpTime();
    }

    // --- Trove property setters, called by BorrowerOperations ---

    function setTroveStatus(
        address _borrower,
        Status _status
    ) external override {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].status = _status;
    }

    function increaseTroveColl(
        address _borrower,
        uint256 _collIncrease
    ) external override returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint256 newColl = Troves[_borrower].coll + _collIncrease;
        Troves[_borrower].coll = newColl;
        return newColl;
    }

    function decreaseTroveColl(
        address _borrower,
        uint256 _collDecrease
    ) external override returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint256 newColl = Troves[_borrower].coll - _collDecrease;
        Troves[_borrower].coll = newColl;
        return newColl;
    }

    function increaseTroveDebt(
        address _borrower,
        uint256 _debtIncrease
    ) external override returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint256 newDebt = Troves[_borrower].debt + _debtIncrease;
        Troves[_borrower].debt = newDebt;
        return newDebt;
    }

    function decreaseTroveDebt(
        address _borrower,
        uint256 _debtDecrease
    ) external override returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint256 newDebt = Troves[_borrower].debt - _debtDecrease;
        Troves[_borrower].debt = newDebt;
        return newDebt;
    }

    function setTroveInterestRate(address _borrower, uint16 _rate) external {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].interestRate = _rate;
    }

    function setTroveLastInterestUpdateTime(
        address _borrower,
        uint256 _timestamp
    ) external {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].lastInterestUpdateTime = _timestamp;
    }

    function proposeInterestRate(
        uint16 _newProposedInterestRate
    ) external onlyOwnerOrGovernance {
        require(
            _newProposedInterestRate <= maxInterestRate,
            "Interest rate exceeds the maximum interest rate"
        );
        proposedInterestRate = _newProposedInterestRate;

        // solhint-disable-next-line not-rely-on-time
        proposalTime = block.timestamp;
        emit InterestRateProposed(proposedInterestRate, proposalTime);
    }

    function approveInterestRate() external onlyOwnerOrGovernance {
        // solhint-disable-next-line not-rely-on-time
        require(
            block.timestamp >= proposalTime + MIN_DELAY,
            "Proposal delay not met"
        );
        _setInterestRate(proposedInterestRate);
    }

    function setMaxInterestRate(
        uint16 _newMaxInterestRate
    ) external onlyOwnerOrGovernance {
        maxInterestRate = _newMaxInterestRate;
        emit MaxInterestRateUpdated(_newMaxInterestRate);
    }

    function getTroveOwnersCount() external view override returns (uint) {
        return TroveOwners.length;
    }

    function getTroveFromTroveOwnersArray(
        uint256 _index
    ) external view override returns (address) {
        return TroveOwners[_index];
    }

    function getNominalICR(
        address _borrower
    ) external view override returns (uint) {
        (
            uint256 currentCollateral,
            uint256 currentMUSDDebt
        ) = _getCurrentTroveAmounts(_borrower);

        uint256 NICR = LiquityMath._computeNominalCR(
            currentCollateral,
            currentMUSDDebt
        );
        return NICR;
    }

    function getRedemptionFeeWithDecay(
        uint256 _collateralDrawn
    ) external view override returns (uint) {
        return
            _calcRedemptionFee(getRedemptionRateWithDecay(), _collateralDrawn);
    }

    function getInterestRateHistory()
        external
        view
        returns (InterestRateChange[] memory)
    {
        return interestRateHistory;
    }

    // --- Borrowing fee functions ---

    function getBorrowingFee(
        uint256 MUSDDebt
    ) external view override returns (uint) {
        return _calcBorrowingFee(getBorrowingRate(), MUSDDebt);
    }

    function getBorrowingFeeWithDecay(
        uint256 _MUSDDebt
    ) external view override returns (uint) {
        return _calcBorrowingFee(getBorrowingRateWithDecay(), _MUSDDebt);
    }

    function getTroveStatus(
        address _borrower
    ) external view override returns (Status) {
        return Troves[_borrower].status;
    }

    function getTroveStake(
        address _borrower
    ) external view override returns (uint) {
        return Troves[_borrower].stake;
    }

    function getTroveDebt(
        address _borrower
    ) external view override returns (uint) {
        return Troves[_borrower].debt;
    }

    function getTroveInterestOwed(
        address _borrower
    ) external view returns (uint) {
        return Troves[_borrower].interestOwed;
    }

    function getTroveInterestRate(
        address _borrower
    ) external view returns (uint16) {
        return Troves[_borrower].interestRate;
    }

    function getTroveLastInterestUpdateTime(
        address _borrower
    ) external view returns (uint) {
        return Troves[_borrower].lastInterestUpdateTime;
    }

    function getTroveColl(
        address _borrower
    ) external view override returns (uint) {
        return Troves[_borrower].coll;
    }

    function getTCR(uint256 _price) external view override returns (uint) {
        return _getTCR(_price);
    }

    function checkRecoveryMode(
        uint256 _price
    ) external view override returns (bool) {
        return _checkRecoveryMode(_price);
    }

    /*
     * Attempt to liquidate a custom list of troves provided by the caller.
     */
    function batchLiquidateTroves(
        address[] memory _troveArray
    ) public override {
        require(
            _troveArray.length != 0,
            "TroveManager: Calldata address array must not be empty"
        );

        IActivePool activePoolCached = activePool;
        IDefaultPool defaultPoolCached = defaultPool;
        IStabilityPool stabilityPoolCached = stabilityPool;

        // slither-disable-next-line uninitialized-local
        LocalVariables_OuterLiquidationFunction memory vars;
        // slither-disable-next-line uninitialized-local
        LiquidationTotals memory totals;

        vars.price = priceFeed.fetchPrice();
        vars.MUSDInStabPool = stabilityPoolCached.getTotalMUSDDeposits();
        vars.recoveryModeAtStart = _checkRecoveryMode(vars.price);

        // Perform the appropriate liquidation sequence - tally values and obtain their totals.
        if (vars.recoveryModeAtStart) {
            totals = _getTotalFromBatchLiquidateRecoveryMode(
                activePoolCached,
                defaultPoolCached,
                vars.price,
                vars.MUSDInStabPool,
                _troveArray
            );
        } else {
            //  if !vars.recoveryModeAtStart
            totals = _getTotalsFromBatchLiquidateNormalMode(
                activePoolCached,
                defaultPoolCached,
                vars.price,
                vars.MUSDInStabPool,
                _troveArray
            );
        }

        require(
            totals.totalDebtInSequence > 0,
            "TroveManager: nothing to liquidate"
        );

        // Move liquidated collateral and MUSD to the appropriate pools
        stabilityPoolCached.offset(
            totals.totalDebtToOffset,
            totals.totalCollToSendToSP
        );
        _redistributeDebtAndColl(
            activePoolCached,
            defaultPoolCached,
            totals.totalDebtToRedistribute,
            totals.totalCollToRedistribute
        );
        if (totals.totalCollSurplus > 0) {
            activePoolCached.sendCollateral(
                address(collSurplusPool),
                totals.totalCollSurplus
            );
        }

        // Update system snapshots
        _updateSystemSnapshotsExcludeCollRemainder(
            activePoolCached,
            totals.totalCollGasCompensation
        );

        vars.liquidatedDebt = totals.totalDebtInSequence;
        vars.liquidatedColl =
            totals.totalCollInSequence -
            totals.totalCollGasCompensation -
            totals.totalCollSurplus;
        emit Liquidation(
            vars.liquidatedDebt,
            vars.liquidatedColl,
            totals.totalCollGasCompensation,
            totals.totalMUSDGasCompensation
        );

        // Send gas compensation to caller
        _sendGasCompensation(
            activePoolCached,
            msg.sender,
            totals.totalMUSDGasCompensation,
            totals.totalCollGasCompensation
        );
    }

    // TODO Change access modifier to limit calls to the contracts that need to call this
    function updateDebtWithInterest(address _borrower) public {
        uint256 interestOwed = calculateInterestOwed(_borrower);
        Troves[_borrower].debt += interestOwed;
        // solhint-disable-next-line not-rely-on-time
        Troves[_borrower].lastInterestUpdateTime = block.timestamp;
    }

    // Calculate the interest owed on a trove.  Note this is using simple interest and not compounding for simplicity.
    function calculateInterestOwed(
        address _borrower
    ) public view returns (uint256) {
        Trove storage trove = Troves[_borrower];
        // slither-disable-start divide-before-multiply
        uint256 interestRatePerSecond = (interestRate * DECIMAL_PRECISION) /
            (10000 * SECONDS_IN_A_YEAR);
        // solhint-disable-next-line not-rely-on-time
        uint256 timeElapsed = block.timestamp - trove.lastInterestUpdateTime;
        uint256 interestOwed = (trove.debt *
            interestRatePerSecond *
            timeElapsed) / DECIMAL_PRECISION;
        // slither-disable-end divide-before-multiply
        return interestOwed;
    }

    function getRedemptionRateWithDecay() public view override returns (uint) {
        return _calcRedemptionRate(_calcDecayedBaseRate());
    }

    function getCurrentICR(
        address _borrower,
        uint256 _price
    ) public view override returns (uint) {
        (
            uint256 currentCollateral,
            uint256 currentMUSDDebt
        ) = _getCurrentTroveAmounts(_borrower);
        uint256 ICR = LiquityMath._computeCR(
            currentCollateral,
            currentMUSDDebt,
            _price
        );
        return ICR;
    }

    function hasPendingRewards(
        address _borrower
    ) public view override returns (bool) {
        /*
         * A Trove has pending rewards if its snapshot is less than the current rewards per-unit-staked sum:
         * this indicates that rewards have occured since the snapshot was made, and the user therefore has
         * pending rewards
         */
        if (Troves[_borrower].status != Status.active) {
            return false;
        }

        return (rewardSnapshots[_borrower].collateral < L_Collateral);
    }

    function getEntireDebtAndColl(
        address _borrower
    )
        public
        view
        override
        returns (
            uint256 debt,
            uint256 coll,
            uint256 pendingMUSDDebtReward,
            uint256 pendingCollateralReward
        )
    {
        debt = Troves[_borrower].debt;
        coll = Troves[_borrower].coll;

        pendingMUSDDebtReward = getPendingMUSDDebtReward(_borrower);
        pendingCollateralReward = getPendingCollateralReward(_borrower);

        debt += pendingMUSDDebtReward;
        coll += pendingCollateralReward;
    }

    function getBorrowingRate() public view override returns (uint) {
        return _calcBorrowingRate(baseRate);
    }

    function getBorrowingRateWithDecay() public view override returns (uint) {
        return _calcBorrowingRate(_calcDecayedBaseRate());
    }

    function getPendingCollateralReward(
        address _borrower
    ) public view override returns (uint) {
        uint256 snapshotCollateral = rewardSnapshots[_borrower].collateral;
        uint256 rewardPerUnitStaked = L_Collateral - snapshotCollateral;

        if (
            rewardPerUnitStaked == 0 ||
            Troves[_borrower].status != Status.active
        ) {
            return 0;
        }

        uint256 stake = Troves[_borrower].stake;

        uint256 pendingCollateralReward = (stake * rewardPerUnitStaked) /
            DECIMAL_PRECISION;

        return pendingCollateralReward;
    }

    function getPendingMUSDDebtReward(
        address _borrower
    ) public view override returns (uint) {
        uint256 snapshotMUSDDebt = rewardSnapshots[_borrower].MUSDDebt;
        uint256 rewardPerUnitStaked = L_MUSDDebt - snapshotMUSDDebt;

        if (
            rewardPerUnitStaked == 0 ||
            Troves[_borrower].status != Status.active
        ) {
            return 0;
        }

        uint256 stake = Troves[_borrower].stake;

        uint256 pendingMUSDDebtReward = (stake * rewardPerUnitStaked) /
            DECIMAL_PRECISION;

        return pendingMUSDDebtReward;
    }

    function getRedemptionRate() public view override returns (uint) {
        return _calcRedemptionRate(baseRate);
    }

    // Internal function to set the interest rate.  Changes must be proposed and approved by governance.
    function _setInterestRate(uint16 _newInterestRate) internal {
        require(
            _newInterestRate <= maxInterestRate,
            "Interest rate exceeds the maximum interest rate"
        );
        interestRate = _newInterestRate;
        interestRateHistory.push(
            InterestRateChange(_newInterestRate, block.number)
        );
        emit InterestRateUpdated(_newInterestRate);
    }

    /*
     * This function is used when the liquidateTroves sequence starts during Recovery Mode. However, it
     * handle the case where the system *leaves* Recovery Mode, part way through the liquidation sequence
     */
    function _getTotalsFromLiquidateTrovesSequenceRecoveryMode(
        ContractsCache memory _contractsCache,
        uint256 _price,
        uint256 _MUSDInStabPool,
        uint256 _n
    ) internal returns (LiquidationTotals memory totals) {
        // slither-disable-next-line uninitialized-local
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;

        vars.remainingMUSDInStabPool = _MUSDInStabPool;
        vars.backToNormalMode = false;
        vars.entireSystemDebt = getEntireSystemDebt();
        vars.entireSystemColl = getEntireSystemColl();

        vars.user = _contractsCache.sortedTroves.getLast();
        address firstUser = _contractsCache.sortedTroves.getFirst();
        for (vars.i = 0; vars.i < _n && vars.user != firstUser; vars.i++) {
            // we need to cache it, because current user is likely going to be deleted
            address nextUser = _contractsCache.sortedTroves.getPrev(vars.user);

            vars.ICR = getCurrentICR(vars.user, _price);

            if (!vars.backToNormalMode) {
                // Break the loop if ICR is greater than MCR and Stability Pool is empty
                if (vars.ICR >= MCR && vars.remainingMUSDInStabPool == 0) {
                    break;
                }

                uint256 TCR = LiquityMath._computeCR(
                    vars.entireSystemColl,
                    vars.entireSystemDebt,
                    _price
                );

                singleLiquidation = _liquidateRecoveryMode(
                    _contractsCache.activePool,
                    _contractsCache.defaultPool,
                    vars.user,
                    vars.ICR,
                    vars.remainingMUSDInStabPool,
                    TCR,
                    _price
                );

                // Update aggregate trackers
                vars.remainingMUSDInStabPool -= singleLiquidation.debtToOffset;
                vars.entireSystemDebt -= singleLiquidation.debtToOffset;
                vars.entireSystemColl -=
                    singleLiquidation.collToSendToSP +
                    singleLiquidation.collGasCompensation +
                    singleLiquidation.collSurplus;

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );

                vars.backToNormalMode = !_checkPotentialRecoveryMode(
                    vars.entireSystemColl,
                    vars.entireSystemDebt,
                    _price
                );
            } else if (vars.backToNormalMode && vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _contractsCache.activePool,
                    _contractsCache.defaultPool,
                    vars.user,
                    vars.remainingMUSDInStabPool
                );

                vars.remainingMUSDInStabPool -= singleLiquidation.debtToOffset;

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );
            } else break; // break if the loop reaches a Trove with ICR >= MCR

            vars.user = nextUser;
        }
    }

    function _getTotalsFromLiquidateTrovesSequenceNormalMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint256 _price,
        uint256 _MUSDInStabPool,
        uint256 _n
    ) internal returns (LiquidationTotals memory totals) {
        // slither-disable-next-line uninitialized-local
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;
        ISortedTroves sortedTrovesCached = sortedTroves;

        vars.remainingMUSDInStabPool = _MUSDInStabPool;

        for (vars.i = 0; vars.i < _n; vars.i++) {
            vars.user = sortedTrovesCached.getLast();
            vars.ICR = getCurrentICR(vars.user, _price);

            if (vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.remainingMUSDInStabPool
                );

                vars.remainingMUSDInStabPool -= singleLiquidation.debtToOffset;

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );
            } else break; // break if the loop reaches a Trove with ICR >= MCR
        }
    }

    /*
     * This function has two impacts on the baseRate state variable:
     * 1) decays the baseRate based on time passed since last redemption or MUSD borrowing operation.
     * then,
     * 2) increases the baseRate based on the amount redeemed, as a proportion of total debt
     */
    function _updateBaseRateFromRedemption(
        uint256 _collateralDrawn,
        uint256 _price,
        uint256 _totalMUSDDebt
    ) internal returns (uint) {
        uint256 decayedBaseRate = _calcDecayedBaseRate();

        /* Convert the drawn collateral back to MUSD at face value rate (1 MUSD:1 USD), in order to get
         * the fraction of total supply that was redeemed at face value. */
        uint256 redeemedMUSDFraction = (_collateralDrawn * _price) /
            _totalMUSDDebt;

        uint256 newBaseRate = decayedBaseRate + (redeemedMUSDFraction / BETA);
        newBaseRate = LiquityMath._min(newBaseRate, DECIMAL_PRECISION); // cap baseRate at a maximum of 100%
        //assert(newBaseRate <= DECIMAL_PRECISION); // This is already enforced in the line above
        assert(newBaseRate > 0); // Base rate is always non-zero after redemption

        // Update the baseRate state variable
        baseRate = newBaseRate;
        emit BaseRateUpdated(newBaseRate);

        _updateLastFeeOpTime();

        return newBaseRate;
    }

    // Add the borrowers's coll and debt rewards earned from redistributions, to their Trove
    function _applyPendingRewards(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        address _borrower
    ) internal {
        if (hasPendingRewards(_borrower)) {
            _requireTroveIsActive(_borrower);

            // Compute pending rewards
            uint256 pendingCollateralReward = getPendingCollateralReward(
                _borrower
            );
            uint256 pendingMUSDDebtReward = getPendingMUSDDebtReward(_borrower);

            // Apply pending rewards to trove's state
            Troves[_borrower].coll += pendingCollateralReward;
            Troves[_borrower].debt += pendingMUSDDebtReward;

            _updateTroveRewardSnapshots(_borrower);

            // Transfer from DefaultPool to ActivePool
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                pendingMUSDDebtReward,
                pendingCollateralReward
            );

            emit TroveUpdated(
                _borrower,
                Troves[_borrower].debt,
                Troves[_borrower].coll,
                Troves[_borrower].stake,
                uint8(TroveManagerOperation.applyPendingRewards)
            );
        }
    }

    function _sendGasCompensation(
        IActivePool _activePool,
        address _liquidator,
        uint256 _MUSD,
        uint256 _collateral
    ) internal {
        if (_MUSD > 0) {
            IGasPool(gasPoolAddress).sendMUSD(_liquidator, _MUSD);
        }

        if (_collateral > 0) {
            _activePool.sendCollateral(_liquidator, _collateral);
        }
    }

    /*
     * Updates snapshots of system total stakes and total collateral, excluding a given collateral remainder from the calculation.
     * Used in a liquidation sequence.
     *
     * The calculation excludes a portion of collateral that is in the ActivePool:
     *
     * the total collateral gas compensation from the liquidation sequence
     *
     * The collateral as compensation must be excluded as it is always sent out at the very end of the liquidation sequence.
     */
    function _updateSystemSnapshotsExcludeCollRemainder(
        IActivePool _activePool,
        uint256 _collRemainder
    ) internal {
        totalStakesSnapshot = totalStakes;

        uint256 activeColl = _activePool.getCollateralBalance();
        uint256 liquidatedColl = defaultPool.getCollateralBalance();
        totalCollateralSnapshot = activeColl - _collRemainder + liquidatedColl;

        emit SystemSnapshotsUpdated(
            totalStakesSnapshot,
            totalCollateralSnapshot
        );
    }

    function _redistributeDebtAndColl(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint256 _debt,
        uint256 _coll
    ) internal {
        if (_debt == 0) {
            return;
        }

        /*
         * Add distributed coll and debt rewards-per-unit-staked to the running totals. Division uses a "feedback"
         * error correction, to keep the cumulative error low in the running totals L_Collateral and L_MUSDDebt:
         *
         * 1) Form numerators which compensate for the floor division errors that occurred the last time this
         * function was called.
         * 2) Calculate "per-unit-staked" ratios.
         * 3) Multiply each ratio back by its denominator, to reveal the current floor division error.
         * 4) Store these errors for use in the next correction when this function is called.
         * 5) Note: static analysis tools complain about this "division before multiplication", however, it is intended.
         */
        uint256 collateralNumerator = _coll *
            DECIMAL_PRECISION +
            lastCollateralError_Redistribution;
        uint256 MUSDDebtNumerator = _debt *
            DECIMAL_PRECISION +
            lastMUSDDebtError_Redistribution;

        // Get the per-unit-staked terms
        // slither-disable-next-line divide-before-multiply
        uint256 collateralRewardPerUnitStaked = collateralNumerator /
            totalStakes;
        // slither-disable-next-line divide-before-multiply
        uint256 MUSDDebtRewardPerUnitStaked = MUSDDebtNumerator / totalStakes;

        lastCollateralError_Redistribution =
            collateralNumerator -
            (collateralRewardPerUnitStaked * totalStakes);
        lastMUSDDebtError_Redistribution =
            MUSDDebtNumerator -
            (MUSDDebtRewardPerUnitStaked * totalStakes);

        // Add per-unit-staked terms to the running totals
        L_Collateral += collateralRewardPerUnitStaked;
        L_MUSDDebt += MUSDDebtRewardPerUnitStaked;

        emit LTermsUpdated(L_Collateral, L_MUSDDebt);

        // Transfer coll and debt from ActivePool to DefaultPool
        _activePool.decreaseMUSDDebt(_debt);
        _defaultPool.increaseMUSDDebt(_debt);
        _activePool.sendCollateral(address(_defaultPool), _coll);
    }

    // Liquidate one trove, in Normal Mode.
    function _liquidateNormalMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        address _borrower,
        uint256 _MUSDInStabPool
    ) internal returns (LiquidationValues memory singleLiquidation) {
        // slither-disable-next-line uninitialized-local
        LocalVariables_InnerSingleLiquidateFunction memory vars;

        (
            singleLiquidation.entireTroveDebt,
            singleLiquidation.entireTroveColl,
            vars.pendingDebtReward,
            vars.pendingCollReward
        ) = getEntireDebtAndColl(_borrower);

        _movePendingTroveRewardsToActivePool(
            _activePool,
            _defaultPool,
            vars.pendingDebtReward,
            vars.pendingCollReward
        );
        _removeStake(_borrower);

        singleLiquidation.collGasCompensation = _getCollGasCompensation(
            singleLiquidation.entireTroveColl
        );
        singleLiquidation.MUSDGasCompensation = MUSD_GAS_COMPENSATION;
        uint256 collToLiquidate = singleLiquidation.entireTroveColl -
            singleLiquidation.collGasCompensation;

        (
            singleLiquidation.debtToOffset,
            singleLiquidation.collToSendToSP,
            singleLiquidation.debtToRedistribute,
            singleLiquidation.collToRedistribute
        ) = _getOffsetAndRedistributionVals(
            singleLiquidation.entireTroveDebt,
            collToLiquidate,
            _MUSDInStabPool
        );

        _closeTrove(_borrower, Status.closedByLiquidation);
        emit TroveLiquidated(
            _borrower,
            singleLiquidation.entireTroveDebt,
            singleLiquidation.entireTroveColl,
            uint8(TroveManagerOperation.liquidateInNormalMode)
        );
        emit TroveUpdated(
            _borrower,
            0,
            0,
            0,
            uint8(TroveManagerOperation.liquidateInNormalMode)
        );
        return singleLiquidation;
    }

    // Remove borrower's stake from the totalStakes sum, and set their stake to 0
    function _removeStake(address _borrower) internal {
        uint256 stake = Troves[_borrower].stake;
        // slither-disable-next-line costly-loop
        totalStakes -= stake;
        Troves[_borrower].stake = 0;
    }

    function _getTotalsFromBatchLiquidateNormalMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint256 _price,
        uint256 _MUSDInStabPool,
        address[] memory _troveArray
    ) internal returns (LiquidationTotals memory totals) {
        // slither-disable-next-line uninitialized-local
        LocalVariables_LiquidationSequence memory vars;
        // slither-disable-next-line uninitialized-local
        LiquidationValues memory singleLiquidation;

        vars.remainingMUSDInStabPool = _MUSDInStabPool;

        for (vars.i = 0; vars.i < _troveArray.length; vars.i++) {
            vars.user = _troveArray[vars.i];
            vars.ICR = getCurrentICR(vars.user, _price);

            if (vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.remainingMUSDInStabPool
                );
                vars.remainingMUSDInStabPool -= singleLiquidation.debtToOffset;

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );
            }
        }
    }

    /*
     * This function is used when the batch liquidation sequence starts during Recovery Mode. However, it
     * handle the case where the system *leaves* Recovery Mode, part way through the liquidation sequence
     */
    function _getTotalFromBatchLiquidateRecoveryMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint256 _price,
        uint256 _MUSDInStabPool,
        address[] memory _troveArray
    ) internal returns (LiquidationTotals memory totals) {
        // slither-disable-next-line uninitialized-local
        LocalVariables_LiquidationSequence memory vars;
        // slither-disable-next-line uninitialized-local
        LiquidationValues memory singleLiquidation;

        vars.remainingMUSDInStabPool = _MUSDInStabPool;
        vars.backToNormalMode = false;
        vars.entireSystemDebt = getEntireSystemDebt();
        vars.entireSystemColl = getEntireSystemColl();

        for (vars.i = 0; vars.i < _troveArray.length; vars.i++) {
            vars.user = _troveArray[vars.i];
            // Skip non-active troves
            if (Troves[vars.user].status != Status.active) {
                continue;
            }
            vars.ICR = getCurrentICR(vars.user, _price);

            if (!vars.backToNormalMode) {
                // Skip this trove if ICR is greater than MCR and Stability Pool is empty
                if (vars.ICR >= MCR && vars.remainingMUSDInStabPool == 0) {
                    continue;
                }

                uint256 TCR = LiquityMath._computeCR(
                    vars.entireSystemColl,
                    vars.entireSystemDebt,
                    _price
                );

                singleLiquidation = _liquidateRecoveryMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.ICR,
                    vars.remainingMUSDInStabPool,
                    TCR,
                    _price
                );

                // Update aggregate trackers
                vars.remainingMUSDInStabPool -= singleLiquidation.debtToOffset;
                vars.entireSystemDebt -= singleLiquidation.debtToOffset;
                vars.entireSystemColl -=
                    singleLiquidation.collToSendToSP +
                    singleLiquidation.collGasCompensation +
                    singleLiquidation.collSurplus;

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );

                vars.backToNormalMode = !_checkPotentialRecoveryMode(
                    vars.entireSystemColl,
                    vars.entireSystemDebt,
                    _price
                );
            } else if (vars.backToNormalMode && vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.remainingMUSDInStabPool
                );
                vars.remainingMUSDInStabPool -= singleLiquidation.debtToOffset;

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );
            } else continue; // In Normal Mode skip troves with ICR >= MCR
        }
    }

    // Liquidate one trove, in Recovery Mode.
    function _liquidateRecoveryMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        address _borrower,
        uint256 _ICR,
        uint256 _MUSDInStabPool,
        uint256 _TCR,
        uint256 _price
    ) internal returns (LiquidationValues memory singleLiquidation) {
        // slither-disable-next-line uninitialized-local
        LocalVariables_InnerSingleLiquidateFunction memory vars;
        if (TroveOwners.length <= 1) {
            return singleLiquidation;
        } // don't liquidate if last trove
        (
            singleLiquidation.entireTroveDebt,
            singleLiquidation.entireTroveColl,
            vars.pendingDebtReward,
            vars.pendingCollReward
        ) = getEntireDebtAndColl(_borrower);

        singleLiquidation.collGasCompensation = _getCollGasCompensation(
            singleLiquidation.entireTroveColl
        );
        singleLiquidation.MUSDGasCompensation = MUSD_GAS_COMPENSATION;
        vars.collToLiquidate =
            singleLiquidation.entireTroveColl -
            singleLiquidation.collGasCompensation;

        // If ICR <= 100%, purely redistribute the Trove across all active Troves
        if (_ICR <= _100pct) {
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                vars.pendingDebtReward,
                vars.pendingCollReward
            );
            _removeStake(_borrower);

            singleLiquidation.debtToOffset = 0;
            singleLiquidation.collToSendToSP = 0;
            singleLiquidation.debtToRedistribute = singleLiquidation
                .entireTroveDebt;
            singleLiquidation.collToRedistribute = vars.collToLiquidate;

            _closeTrove(_borrower, Status.closedByLiquidation);
            emit TroveLiquidated(
                _borrower,
                singleLiquidation.entireTroveDebt,
                singleLiquidation.entireTroveColl,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );

            // If 100% < ICR < MCR, offset as much as possible, and redistribute the remainder
        } else if ((_ICR > _100pct) && (_ICR < MCR)) {
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                vars.pendingDebtReward,
                vars.pendingCollReward
            );
            _removeStake(_borrower);

            (
                singleLiquidation.debtToOffset,
                singleLiquidation.collToSendToSP,
                singleLiquidation.debtToRedistribute,
                singleLiquidation.collToRedistribute
            ) = _getOffsetAndRedistributionVals(
                singleLiquidation.entireTroveDebt,
                vars.collToLiquidate,
                _MUSDInStabPool
            );

            _closeTrove(_borrower, Status.closedByLiquidation);
            emit TroveLiquidated(
                _borrower,
                singleLiquidation.entireTroveDebt,
                singleLiquidation.entireTroveColl,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );
            /*
             * If 110% <= ICR < current TCR (accounting for the preceding liquidations in the current sequence)
             * and there is MUSD in the Stability Pool, only offset, with no redistribution,
             * but at a capped rate of 1.1 and only if the whole debt can be liquidated.
             * The remainder due to the capped rate will be claimable as collateral surplus.
             */
        } else if (
            (_ICR >= MCR) &&
            (_ICR < _TCR) &&
            (singleLiquidation.entireTroveDebt <= _MUSDInStabPool)
        ) {
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                vars.pendingDebtReward,
                vars.pendingCollReward
            );
            assert(_MUSDInStabPool != 0);

            _removeStake(_borrower);
            singleLiquidation = _getCappedOffsetVals(
                singleLiquidation.entireTroveDebt,
                singleLiquidation.entireTroveColl,
                _price
            );

            _closeTrove(_borrower, Status.closedByLiquidation);
            if (singleLiquidation.collSurplus > 0) {
                collSurplusPool.accountSurplus(
                    _borrower,
                    singleLiquidation.collSurplus
                );
            }

            emit TroveLiquidated(
                _borrower,
                singleLiquidation.entireTroveDebt,
                singleLiquidation.collToSendToSP,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );
        } else {
            // if (_ICR >= MCR && ( _ICR >= _TCR || singleLiquidation.entireTroveDebt > _MUSDInStabPool))
            // slither-disable-next-line uninitialized-local
            LiquidationValues memory zeroVals;
            return zeroVals;
        }

        return singleLiquidation;
    }

    /*
     * Called when a full redemption occurs, and closes the trove.
     * The redeemer swaps (debt - liquidation reserve) MUSD for (debt - liquidation reserve) worth of collateral, so the MUSD liquidation reserve left corresponds to the remaining debt.
     * In order to close the trove, the MUSD liquidation reserve is burned, and the corresponding debt is removed from the active pool.
     * The debt recorded on the trove's struct is zero'd elswhere, in _closeTrove.
     * Any surplus collateral left in the trove, is sent to the Coll surplus pool, and can be later claimed by the borrower.
     */
    function _redeemCloseTrove(
        ContractsCache memory _contractsCache,
        address _borrower,
        uint256 _MUSD,
        uint256 _collateral
    ) internal {
        // slither-disable-next-line calls-loop
        _contractsCache.musdToken.burn(gasPoolAddress, _MUSD);
        // Update Active Pool MUSD, and send collateral to account
        // slither-disable-next-line calls-loop
        _contractsCache.activePool.decreaseMUSDDebt(_MUSD);

        // send collateral from Active Pool to CollSurplus Pool
        // slither-disable-next-line calls-loop
        _contractsCache.collSurplusPool.accountSurplus(_borrower, _collateral);
        // slither-disable-next-line calls-loop
        _contractsCache.activePool.sendCollateral(
            address(_contractsCache.collSurplusPool),
            _collateral
        );
    }

    // Redeem as much collateral as possible from _borrower's Trove in exchange for MUSD up to _maxMUSDamount
    function _redeemCollateralFromTrove(
        ContractsCache memory _contractsCache,
        address _borrower,
        uint256 _maxMUSDamount,
        uint256 _price,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint256 _partialRedemptionHintNICR
    ) internal returns (SingleRedemptionValues memory singleRedemption) {
        // Determine the remaining amount (lot) to be redeemed, capped by the entire debt of the Trove minus the liquidation reserve
        singleRedemption.MUSDLot = LiquityMath._min(
            _maxMUSDamount,
            Troves[_borrower].debt - MUSD_GAS_COMPENSATION
        );

        // Get the collateralLot of equivalent value in USD
        singleRedemption.collateralLot =
            (singleRedemption.MUSDLot * DECIMAL_PRECISION) /
            _price;

        // Decrease the debt and collateral of the current Trove according to the MUSD lot and corresponding collateral to send
        uint256 newDebt = Troves[_borrower].debt - singleRedemption.MUSDLot;
        uint256 newColl = Troves[_borrower].coll -
            singleRedemption.collateralLot;

        if (newDebt == MUSD_GAS_COMPENSATION) {
            // No debt left in the Trove (except for the liquidation reserve), therefore the trove gets closed
            _removeStake(_borrower);
            _closeTrove(_borrower, Status.closedByRedemption);
            _redeemCloseTrove(
                _contractsCache,
                _borrower,
                MUSD_GAS_COMPENSATION,
                newColl
            );
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                uint8(TroveManagerOperation.redeemCollateral)
            );
        } else {
            uint256 newNICR = LiquityMath._computeNominalCR(newColl, newDebt);

            /*
             * If the provided hint is out of date, we bail since trying to reinsert without a good hint will almost
             * certainly result in running out of gas.
             *
             * If the resultant net debt of the partial is less than the minimum, net debt we bail.
             */
            if (
                newNICR != _partialRedemptionHintNICR ||
                _getNetDebt(newDebt) < MIN_NET_DEBT
            ) {
                singleRedemption.cancelledPartial = true;
                return singleRedemption;
            }

            // slither-disable-next-line calls-loop
            _contractsCache.sortedTroves.reInsert(
                _borrower,
                newNICR,
                _upperPartialRedemptionHint,
                _lowerPartialRedemptionHint
            );

            Troves[_borrower].debt = newDebt;
            Troves[_borrower].coll = newColl;
            _updateStakeAndTotalStakes(_borrower);

            emit TroveUpdated(
                _borrower,
                newDebt,
                newColl,
                Troves[_borrower].stake,
                uint8(TroveManagerOperation.redeemCollateral)
            );
        }

        return singleRedemption;
    }

    // Update borrower's stake based on their latest collateral value
    function _updateStakeAndTotalStakes(
        address _borrower
    ) internal returns (uint) {
        uint256 newStake = _computeNewStake(Troves[_borrower].coll);
        uint256 oldStake = Troves[_borrower].stake;
        Troves[_borrower].stake = newStake;

        // slither-disable-next-line costly-loop
        totalStakes = totalStakes - oldStake + newStake;
        emit TotalStakesUpdated(totalStakes);

        return newStake;
    }

    function _updateTroveRewardSnapshots(address _borrower) internal {
        rewardSnapshots[_borrower].collateral = L_Collateral;
        rewardSnapshots[_borrower].MUSDDebt = L_MUSDDebt;
        emit TroveSnapshotsUpdated(L_Collateral, L_MUSDDebt);
    }

    function _addTroveOwnerToArray(
        address _borrower
    ) internal returns (uint128 index) {
        /* Max array size is 2**128 - 1, i.e. ~3e30 troves. No risk of overflow, since troves have minimum MUSD
        debt of liquidation reserve plus MIN_NET_DEBT. 3e30 MUSD dwarfs the value of all wealth in the world ( which is < 1e15 USD). */

        // Push the Troveowner to the array
        TroveOwners.push(_borrower);

        // Record the index of the new Troveowner on their Trove struct
        index = uint128(TroveOwners.length - 1);
        Troves[_borrower].arrayIndex = index;

        return index;
    }

    function _updateLastFeeOpTime() internal {
        // solhint-disable-next-line not-rely-on-time
        uint256 timePassed = block.timestamp - lastFeeOperationTime;

        if (timePassed >= 1 minutes) {
            // solhint-disable-next-line not-rely-on-time
            lastFeeOperationTime = block.timestamp;
            // solhint-disable-next-line not-rely-on-time
            emit LastFeeOpTimeUpdated(block.timestamp);
        }
    }

    // Move a Trove's pending debt and collateral rewards from distributions, from the Default Pool to the Active Pool
    function _movePendingTroveRewardsToActivePool(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint256 _MUSD,
        uint256 _collateral
    ) internal {
        // slither-disable-next-line calls-loop
        _defaultPool.decreaseMUSDDebt(_MUSD);
        // slither-disable-next-line calls-loop
        _activePool.increaseMUSDDebt(_MUSD);
        // slither-disable-next-line calls-loop
        _defaultPool.sendCollateralToActivePool(_collateral);
    }

    function _closeTrove(address _borrower, Status closedStatus) internal {
        assert(
            closedStatus != Status.nonExistent && closedStatus != Status.active
        );

        uint256 TroveOwnersArrayLength = TroveOwners.length;
        // slither-disable-next-line calls-loop
        if (musdToken.mintList(borrowerOperationsAddress)) {
            _requireMoreThanOneTroveInSystem(TroveOwnersArrayLength);
        }

        Troves[_borrower].status = closedStatus;
        Troves[_borrower].coll = 0;
        Troves[_borrower].debt = 0;

        rewardSnapshots[_borrower].collateral = 0;
        rewardSnapshots[_borrower].MUSDDebt = 0;

        _removeTroveOwner(_borrower, TroveOwnersArrayLength);
        // slither-disable-next-line calls-loop
        sortedTroves.remove(_borrower);
    }

    /*
     * Remove a Trove owner from the TroveOwners array, not preserving array order. Removing owner 'B' does the following:
     * [A B C D E] => [A E C D], and updates E's Trove struct to point to its new array index.
     */
    function _removeTroveOwner(
        address _borrower,
        uint256 TroveOwnersArrayLength
    ) internal {
        Status troveStatus = Troves[_borrower].status;
        // It’s set in caller function `_closeTrove`
        assert(
            troveStatus != Status.nonExistent && troveStatus != Status.active
        );

        uint128 index = Troves[_borrower].arrayIndex;
        uint256 length = TroveOwnersArrayLength;
        uint256 idxLast = length - 1;

        assert(index <= idxLast);

        address addressToMove = TroveOwners[idxLast];

        TroveOwners[index] = addressToMove;
        Troves[addressToMove].arrayIndex = index;
        emit TroveIndexUpdated(addressToMove, index);

        // slither-disable-next-line costly-loop
        TroveOwners.pop();
    }

    function _isValidFirstRedemptionHint(
        ISortedTroves _sortedTroves,
        address _firstRedemptionHint,
        uint256 _price
    ) internal view returns (bool) {
        if (
            _firstRedemptionHint == address(0) ||
            !_sortedTroves.contains(_firstRedemptionHint) ||
            getCurrentICR(_firstRedemptionHint, _price) < MCR
        ) {
            return false;
        }

        address nextTrove = _sortedTroves.getNext(_firstRedemptionHint);
        return
            nextTrove == address(0) || getCurrentICR(nextTrove, _price) < MCR;
    }

    function _requireTCRoverMCR(uint256 _price) internal view {
        require(
            _getTCR(_price) >= MCR,
            "TroveManager: Cannot redeem when TCR < MCR"
        );
    }

    function _requireMUSDBalanceCoversRedemption(
        IMUSD _musd,
        address _redeemer,
        uint256 _amount
    ) internal view {
        require(
            _musd.balanceOf(_redeemer) >= _amount,
            "TroveManager: Requested redemption amount must be <= user's MUSD token balance"
        );
    }

    function _requireMoreThanOneTroveInSystem(
        uint256 TroveOwnersArrayLength
    ) internal view {
        // slither-disable-next-line calls-loop
        require(
            TroveOwnersArrayLength > 1 && sortedTroves.getSize() > 1,
            "TroveManager: Only one trove in the system"
        );
    }

    function _getCurrentTroveAmounts(
        address _borrower
    ) internal view returns (uint, uint) {
        uint256 pendingCollateralReward = getPendingCollateralReward(_borrower);
        uint256 pendingMUSDDebtReward = getPendingMUSDDebtReward(_borrower);

        uint256 currentCollateral = Troves[_borrower].coll +
            pendingCollateralReward;
        uint256 currentMUSDDebt = Troves[_borrower].debt +
            pendingMUSDDebtReward;

        return (currentCollateral, currentMUSDDebt);
    }

    // Calculate a new stake based on the snapshots of the totalStakes and totalCollateral taken at the last liquidation
    function _computeNewStake(uint256 _coll) internal view returns (uint) {
        uint256 stake;
        if (totalCollateralSnapshot == 0) {
            stake = _coll;
        } else {
            /*
             * The following assert() holds true because:
             * - The system always contains >= 1 trove
             * - When we close or liquidate a trove, we redistribute the pending rewards, so if all troves were closed/liquidated,
             * rewards would’ve been emptied and totalCollateralSnapshot would be zero too.
             */
            assert(totalStakesSnapshot > 0);
            stake = (_coll * totalStakesSnapshot) / totalCollateralSnapshot;
        }
        return stake;
    }

    function _getRedemptionFee(
        uint256 _collateralDrawn
    ) internal view returns (uint) {
        return _calcRedemptionFee(getRedemptionRate(), _collateralDrawn);
    }

    function _calcDecayedBaseRate() internal view returns (uint) {
        uint256 minutesPassed = _minutesPassedSinceLastFeeOp();
        uint256 decayFactor = LiquityMath._decPow(
            MINUTE_DECAY_FACTOR,
            minutesPassed
        );

        return (baseRate * decayFactor) / DECIMAL_PRECISION;
    }

    function _minutesPassedSinceLastFeeOp() internal view returns (uint) {
        // solhint-disable-next-line not-rely-on-time
        return (block.timestamp - lastFeeOperationTime) / 1 minutes;
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "TroveManager: Caller is not the BorrowerOperations contract"
        );
    }

    function _requireTroveIsActive(address _borrower) internal view {
        require(
            Troves[_borrower].status == Status.active,
            "TroveManager: Trove does not exist or is closed"
        );
    }

    /* In a full liquidation, returns the values for a trove's coll and debt to be offset, and coll and debt to be
     * redistributed to active troves.
     */
    function _getOffsetAndRedistributionVals(
        uint256 _debt,
        uint256 _coll,
        uint256 _MUSDInStabPool
    )
        internal
        pure
        returns (
            uint256 debtToOffset,
            uint256 collToSendToSP,
            uint256 debtToRedistribute,
            uint256 collToRedistribute
        )
    {
        if (_MUSDInStabPool > 0) {
            /*
             * Offset as much debt & collateral as possible against the Stability Pool, and redistribute the remainder
             * between all active troves.
             *
             *  If the trove's debt is larger than the deposited MUSD in the Stability Pool:
             *
             *  - Offset an amount of the trove's debt equal to the MUSD in the Stability Pool
             *  - Send a fraction of the trove's collateral to the Stability Pool, equal to the fraction of its offset debt
             *
             */
            debtToOffset = LiquityMath._min(_debt, _MUSDInStabPool);
            collToSendToSP = (_coll * debtToOffset) / _debt;
            debtToRedistribute = _debt - debtToOffset;
            collToRedistribute = _coll - collToSendToSP;
        } else {
            debtToOffset = 0;
            collToSendToSP = 0;
            debtToRedistribute = _debt;
            collToRedistribute = _coll;
        }
    }

    function _requireAmountGreaterThanZero(uint256 _amount) internal pure {
        require(_amount > 0, "TroveManager: Amount must be greater than zero");
    }

    function _requireValidMaxFeePercentage(
        uint256 _maxFeePercentage
    ) internal pure {
        require(
            _maxFeePercentage >= REDEMPTION_FEE_FLOOR &&
                _maxFeePercentage <= DECIMAL_PRECISION,
            "Max fee percentage must be between 0.5% and 100%"
        );
    }

    // Check whether or not the system *would be* in Recovery Mode, given an collateral:USD price, and the entire system coll and debt.
    function _checkPotentialRecoveryMode(
        uint256 _entireSystemColl,
        uint256 _entireSystemDebt,
        uint256 _price
    ) internal pure returns (bool) {
        uint256 TCR = LiquityMath._computeCR(
            _entireSystemColl,
            _entireSystemDebt,
            _price
        );

        return TCR < CCR;
    }

    /*
     *  Get its offset coll/debt and collateral gas comp, and close the trove.
     */
    function _getCappedOffsetVals(
        uint256 _entireTroveDebt,
        uint256 _entireTroveColl,
        uint256 _price
    ) internal pure returns (LiquidationValues memory singleLiquidation) {
        singleLiquidation.entireTroveDebt = _entireTroveDebt;
        singleLiquidation.entireTroveColl = _entireTroveColl;
        uint256 cappedCollPortion = (_entireTroveDebt * MCR) / _price;

        singleLiquidation.collGasCompensation = _getCollGasCompensation(
            cappedCollPortion
        );
        singleLiquidation.MUSDGasCompensation = MUSD_GAS_COMPENSATION;

        singleLiquidation.debtToOffset = _entireTroveDebt;
        singleLiquidation.collToSendToSP =
            cappedCollPortion -
            singleLiquidation.collGasCompensation;
        singleLiquidation.collSurplus = _entireTroveColl - cappedCollPortion;
        singleLiquidation.debtToRedistribute = 0;
        singleLiquidation.collToRedistribute = 0;
    }

    function _addLiquidationValuesToTotals(
        LiquidationTotals memory oldTotals,
        LiquidationValues memory singleLiquidation
    ) internal pure returns (LiquidationTotals memory newTotals) {
        // Tally all the values with their respective running totals
        newTotals.totalCollGasCompensation =
            oldTotals.totalCollGasCompensation +
            singleLiquidation.collGasCompensation;
        newTotals.totalMUSDGasCompensation =
            oldTotals.totalMUSDGasCompensation +
            singleLiquidation.MUSDGasCompensation;
        newTotals.totalDebtInSequence =
            oldTotals.totalDebtInSequence +
            singleLiquidation.entireTroveDebt;
        newTotals.totalCollInSequence =
            oldTotals.totalCollInSequence +
            singleLiquidation.entireTroveColl;
        newTotals.totalDebtToOffset =
            oldTotals.totalDebtToOffset +
            singleLiquidation.debtToOffset;
        newTotals.totalCollToSendToSP =
            oldTotals.totalCollToSendToSP +
            singleLiquidation.collToSendToSP;
        newTotals.totalDebtToRedistribute =
            oldTotals.totalDebtToRedistribute +
            singleLiquidation.debtToRedistribute;
        newTotals.totalCollToRedistribute =
            oldTotals.totalCollToRedistribute +
            singleLiquidation.collToRedistribute;
        newTotals.totalCollSurplus =
            oldTotals.totalCollSurplus +
            singleLiquidation.collSurplus;

        return newTotals;
    }

    function _calcBorrowingFee(
        uint256 _borrowingRate,
        uint256 _MUSDDebt
    ) internal pure returns (uint) {
        return (_borrowingRate * _MUSDDebt) / DECIMAL_PRECISION;
    }

    function _calcBorrowingRate(
        uint256 _baseRate
    ) internal pure returns (uint) {
        return
            LiquityMath._min(
                BORROWING_FEE_FLOOR + _baseRate,
                MAX_BORROWING_FEE
            );
    }

    function _calcRedemptionFee(
        uint256 _redemptionRate,
        uint256 _collateralDrawn
    ) internal pure returns (uint) {
        uint256 redemptionFee = (_redemptionRate * _collateralDrawn) /
            DECIMAL_PRECISION;
        require(
            redemptionFee < _collateralDrawn,
            "TroveManager: Fee would eat up all returned collateral"
        );
        return redemptionFee;
    }

    function _calcRedemptionRate(
        uint256 _baseRate
    ) internal pure returns (uint) {
        return
            LiquityMath._min(
                REDEMPTION_FEE_FLOOR + _baseRate,
                DECIMAL_PRECISION // cap at a maximum of 100%
            );
    }
}
// slither-disable-end reentrancy-benign
// slither-disable-end reentrancy-events
// slither-disable-end reentrancy-no-eth
