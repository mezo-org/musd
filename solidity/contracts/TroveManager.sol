// slither-disable-start reentrancy-benign
// slither-disable-start reentrancy-events
// slither-disable-start reentrancy-no-eth

// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./dependencies/CheckContract.sol";
import "./dependencies/InterestRateMath.sol";
import "./dependencies/LiquityBase.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IGasPool.sol";
import "./interfaces/IInterestRateManager.sol";
import "./interfaces/IPCV.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/IStabilityPool.sol";
import "./interfaces/ITroveManager.sol";
import "./token/IMUSD.sol";

contract TroveManager is
    CheckContract,
    ITroveManager,
    LiquityBase,
    OwnableUpgradeable
{
    enum TroveManagerOperation {
        applyPendingRewards,
        liquidate,
        redeemCollateral
    }

    // Store the necessary data for a trove
    struct Trove {
        uint256 coll;
        uint256 principal;
        uint256 interestOwed;
        uint256 stake;
        Status status;
        uint16 interestRate;
        uint256 lastInterestUpdateTime;
        uint256 maxBorrowingCapacity;
        uint128 arrayIndex;
    }

    // Object containing the collateral and mUSD snapshots for a given active trove
    struct RewardSnapshot {
        uint256 collateral;
        uint256 principal;
        uint256 interest;
    }

    struct LocalVariables_OuterLiquidationFunction {
        uint256 price;
        uint256 mUSDInStabPool;
        uint256 liquidatedColl;
    }

    struct LocalVariables_redeemCollateralFromTrove {
        uint256 newDebt;
        uint256 newColl;
        uint256 newPrincipal;
        uint256 interestPayment;
        uint256 upperBoundNICR;
        uint256 newNICR;
        uint256 mUSDLot;
    }

    struct LocalVariables_InnerSingleLiquidateFunction {
        uint256 collToLiquidate;
        uint256 pendingColl;
        uint256 pendingPrincipal;
        uint256 pendingInterest;
    }

    struct LiquidationTotals {
        uint256 totalCollInSequence;
        uint256 totalPrincipalInSequence;
        uint256 totalInterestInSequence;
        uint256 totalCollGasCompensation;
        uint256 totalMUSDGasCompensation;
        uint256 totalPrincipalToOffset;
        uint256 totalInterestToOffset;
        uint256 totalCollToSendToSP;
        uint256 totalPrincipalToRedistribute;
        uint256 totalInterestToRedistribute;
        uint256 totalCollToRedistribute;
    }

    struct LocalVariables_LiquidationSequence {
        uint256 remainingMUSDInStabPool;
        uint256 i;
        uint256 ICR;
        address user;
        uint256 entireSystemDebt;
        uint256 entireSystemColl;
    }

    struct LocalVariables_redeemCollateral {
        uint256 minNetDebt;
        uint16 interestRate;
    }

    struct LiquidationValues {
        uint256 entireTrovePrincipal;
        uint256 entireTroveInterest;
        uint256 entireTroveColl;
        uint256 collGasCompensation;
        uint256 mUSDGasCompensation;
        uint256 principalToOffset;
        uint256 interestToOffset;
        uint256 collToSendToSP;
        uint256 principalToRedistribute;
        uint256 interestToRedistribute;
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
        uint256 principal;
        uint256 interest;
        uint256 collateralLot;
        bool cancelledPartial;
    }

    struct RedemptionTotals {
        uint256 remainingMUSD;
        uint256 totalPrincipalToRedeem;
        uint256 totalInterestToRedeem;
        uint256 totalCollateralDrawn;
        uint256 collateralFee;
        uint256 collateralToSendToRedeemer;
        uint256 price;
        uint256 totalDebtAtStart;
    }

    // --- Connected contract declarations ---

    IBorrowerOperations public borrowerOperations;
    ICollSurplusPool public collSurplusPool;
    address public gasPoolAddress;
    IMUSD public musdToken;
    IPCV public override pcv;
    address public reversibleCallOptionManagerAddress;
    // A doubly linked list of Troves, sorted by their sorted by their collateral ratios
    ISortedTroves public sortedTroves;
    IStabilityPool public override stabilityPool;

    // --- Data structures ---

    mapping(address => Trove) public Troves;

    uint256 public totalStakes;

    // Snapshot of the value of totalStakes, taken immediately after the latest liquidation
    uint256 public totalStakesSnapshot;

    // Snapshot of the total collateral across the ActivePool and DefaultPool, immediately after the latest liquidation.
    uint256 public totalCollateralSnapshot;

    /*
     * L_Collateral, L_Principal, and L_Interest track the sums of accumulated
     * pending liquidations per unit staked. During its lifetime, each stake
     * earns:
     *
     * An collateral gain of ( stake * [L_Collateral - L_Collateral(0)] )
     * A principal increase  of ( stake * [L_Principal - L_Principal(0)] )
     * An interest increase  of ( stake * [L_Interest - L_Interest(0)] )
     *
     * Where L_Collateral(0), L_Principal(0), and L_Interest(0) are snapshots of
     * L_Collateral, L_Principal, and L_Interest for the active Trove taken at the
     * instant the stake was made
     */
    uint256 public L_Collateral;
    uint256 public L_Principal;
    uint256 public L_Interest;

    // Array of all active trove addresses - used to to compute an approximate hint off-chain, for the sorted list insertion
    // slither-disable-next-line similar-names
    address[] public TroveOwners;

    // Error trackers for the trove redistribution calculation
    uint256 public lastCollateralError_Redistribution;
    uint256 public lastPrincipalError_Redistribution;
    uint256 public lastInterestError_Redistribution;

    // Map addresses with active troves to their RewardSnapshot
    mapping(address => RewardSnapshot) public rewardSnapshots;

    function initialize() external initializer {
        __Ownable_init(msg.sender);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _gasPoolAddress,
        address _interestRateManagerAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _priceFeedAddress,
        address _reversibleCallOptionManagerAddress,
        address _sortedTrovesAddress,
        address _stabilityPoolAddress
    ) external override onlyOwner {
        checkContract(_activePoolAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_interestRateManagerAddress);
        checkContract(_musdTokenAddress);
        checkContract(_pcvAddress);
        checkContract(_priceFeedAddress);
        if (_reversibleCallOptionManagerAddress != address(0)) {
            checkContract(_reversibleCallOptionManagerAddress);
        }
        checkContract(_sortedTrovesAddress);
        checkContract(_stabilityPoolAddress);

        // slither-disable-start missing-zero-check
        activePool = IActivePool(_activePoolAddress);
        borrowerOperations = IBorrowerOperations(_borrowerOperationsAddress);
        collSurplusPool = ICollSurplusPool(_collSurplusPoolAddress);
        defaultPool = IDefaultPool(_defaultPoolAddress);
        gasPoolAddress = _gasPoolAddress;
        interestRateManager = IInterestRateManager(_interestRateManagerAddress);
        musdToken = IMUSD(_musdTokenAddress);
        pcv = IPCV(_pcvAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        reversibleCallOptionManagerAddress = _reversibleCallOptionManagerAddress;
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        stabilityPool = IStabilityPool(_stabilityPoolAddress);
        // slither-disable-end missing-zero-check

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit GasPoolAddressChanged(_gasPoolAddress);
        emit InterestRateManagerAddressChanged(_interestRateManagerAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit PCVAddressChanged(_pcvAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);

        renounceOwnership();
    }

    function liquidate(address _borrower) external override {
        _requireTroveIsActive(_borrower);

        address[] memory borrowers = new address[](1);
        borrowers[0] = _borrower;
        batchLiquidateTroves(borrowers);
    }

    /* Send _amount mUSD to the system and redeem the corresponding amount of collateral from as many Troves as are needed to fill the redemption
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
     * redemption will stop after the last completely redeemed Trove and the sender will keep the remaining mUSD amount, which they can attempt
     * to redeem later.
     */
    function redeemCollateral(
        uint256 _amount,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint256 _partialRedemptionHintNICR,
        uint256 _maxIterations
    ) external override {
        updateSystemInterest();
        ContractsCache memory contractsCache = ContractsCache(
            activePool,
            defaultPool,
            musdToken,
            pcv,
            sortedTroves,
            collSurplusPool,
            gasPoolAddress
        );
        // slither-disable-start uninitialized-local
        RedemptionTotals memory totals;
        LocalVariables_redeemCollateral memory vars;
        // slither-disable-end uninitialized-local

        totals.price = priceFeed.fetchPrice();
        _requireTCRoverMCR(totals.price);
        _requireAmountGreaterThanZero(_amount);
        _requireMUSDBalanceCoversRedemption(
            contractsCache.musdToken,
            msg.sender,
            _amount
        );

        totals.totalDebtAtStart = getEntireSystemDebt();
        totals.remainingMUSD = _amount;
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

        // Loop through the Troves starting from the one with lowest collateral ratio until _amount of mUSD is exchanged for collateral
        if (_maxIterations == 0) {
            _maxIterations = type(uint256).max;
        }

        vars.minNetDebt = borrowerOperations.minNetDebt();
        vars.interestRate = interestRateManager.interestRate();

        while (
            currentBorrower != address(0) &&
            totals.remainingMUSD > 0 &&
            _maxIterations > 0
        ) {
            _maxIterations--;
            _updateTroveInterest(currentBorrower);

            // Save the address of the Trove preceding the current one, before potentially modifying the list
            // slither-disable-next-line calls-loop
            address nextUserToCheck = contractsCache.sortedTroves.getPrev(
                currentBorrower
            );

            // Skip troves with ICR < MCR
            if (getCurrentICR(currentBorrower, totals.price) < MCR) {
                currentBorrower = nextUserToCheck;
                continue;
            }

            SingleRedemptionValues
                memory singleRedemption = _redeemCollateralFromTrove(
                    contractsCache,
                    currentBorrower,
                    totals.remainingMUSD,
                    totals.price,
                    _upperPartialRedemptionHint,
                    _lowerPartialRedemptionHint,
                    _partialRedemptionHintNICR,
                    vars
                );

            if (singleRedemption.cancelledPartial) break; // Partial redemption was cancelled (out-of-date hint, or new net debt < minimum), therefore we could not redeem from the last Trove

            totals.totalPrincipalToRedeem += singleRedemption.principal;
            totals.totalInterestToRedeem += singleRedemption.interest;
            totals.totalCollateralDrawn += singleRedemption.collateralLot;

            totals.remainingMUSD -=
                singleRedemption.principal +
                singleRedemption.interest;

            // Previous write to this value would hit `continue` statement
            // slither-disable-next-line write-after-write
            currentBorrower = nextUserToCheck;
        }
        require(
            totals.totalCollateralDrawn > 0,
            "TroveManager: Unable to redeem any amount"
        );

        // Calculate the collateral fee
        totals.collateralFee = borrowerOperations.getRedemptionRate(
            totals.totalCollateralDrawn
        );

        totals.collateralToSendToRedeemer =
            totals.totalCollateralDrawn -
            totals.collateralFee;

        emit Redemption(
            _amount,
            totals.totalPrincipalToRedeem + totals.totalInterestToRedeem,
            totals.totalCollateralDrawn,
            totals.collateralFee
        );

        // Burn the total mUSD that is cancelled with debt, and send the redeemed collateral to msg.sender
        contractsCache.musdToken.burn(
            msg.sender,
            totals.totalPrincipalToRedeem + totals.totalInterestToRedeem
        );

        // Send the collateral fee to the PCV contract
        contractsCache.activePool.sendCollateral(
            address(contractsCache.pcv),
            totals.collateralFee
        );

        // Update Active Pool mUSD, and send collateral to account
        contractsCache.activePool.decreaseDebt(
            totals.totalPrincipalToRedeem,
            totals.totalInterestToRedeem
        );
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

    // Update borrower's snapshots of L_Collateral, L_Principal, and L_Interest
    // to reflect the current values
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

    function closeTrove(address _borrower) external override {
        _requireCallerIsBorrowerOperationsOrReversibleCallOptionManager();
        return _closeTrove(_borrower, Status.closedByOwner);
    }

    function removeStake(address _borrower) external override {
        _requireCallerIsBorrowerOperationsOrReversibleCallOptionManager();
        return _removeStake(_borrower);
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

    function setTroveMaxBorrowingCapacity(
        address _borrower,
        uint256 _maxBorrowingCapacity
    ) external override {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].maxBorrowingCapacity = _maxBorrowingCapacity;
    }

    function increaseTroveDebt(
        address _borrower,
        uint256 _debtIncrease
    ) external override returns (uint) {
        _requireCallerIsBorrowerOperations();
        interestRateManager.addPrincipal(
            _debtIncrease,
            Troves[_borrower].interestRate
        );
        uint256 newDebt = Troves[_borrower].principal + _debtIncrease;
        Troves[_borrower].principal = newDebt;
        return newDebt;
    }

    function decreaseTroveDebt(
        address _borrower,
        uint256 _debtDecrease
    ) external override returns (uint256, uint256) {
        _requireCallerIsBorrowerOperations();
        _updateTroveDebt(_borrower, _debtDecrease);
        return (Troves[_borrower].principal, Troves[_borrower].interestOwed);
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
        (uint256 pendingPrincipal, ) = getPendingDebt(_borrower);

        uint256 collateral = Troves[_borrower].coll +
            getPendingCollateral(_borrower);

        uint256 principal = Troves[_borrower].principal + pendingPrincipal;

        return LiquityMath._computeNominalCR(collateral, principal);
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
        return _getTotalDebt(_borrower);
    }

    function getTrovePrincipal(address _borrower) external view returns (uint) {
        return Troves[_borrower].principal;
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

    function getTroveInterestOwed(
        address _borrower
    ) external view returns (uint256) {
        return Troves[_borrower].interestOwed;
    }

    function getTroveColl(
        address _borrower
    ) external view override returns (uint) {
        return Troves[_borrower].coll;
    }

    function getTCR(uint256 _price) external view override returns (uint) {
        return _getTCR(_price);
    }

    function getTroveMaxBorrowingCapacity(
        address _borrower
    ) external view returns (uint256) {
        return Troves[_borrower].maxBorrowingCapacity;
    }

    function checkRecoveryMode(
        uint256 _price
    ) external view override returns (bool) {
        return _checkRecoveryMode(_price);
    }

    function updateSystemAndTroveInterest(address _borrower) public {
        updateSystemInterest();
        _updateTroveInterest(_borrower);
    }

    function updateSystemInterest() public {
        // slither-disable-next-line calls-loop
        interestRateManager.updateSystemInterest();
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

        updateSystemInterest();

        for (uint i = 0; i < _troveArray.length; i++) {
            address borrower = _troveArray[i];

            _updateTroveInterest(borrower);
        }

        IActivePool activePoolCached = activePool;
        IDefaultPool defaultPoolCached = defaultPool;
        IStabilityPool stabilityPoolCached = stabilityPool;

        // slither-disable-next-line uninitialized-local
        LocalVariables_OuterLiquidationFunction memory vars;
        // slither-disable-next-line uninitialized-local
        LiquidationTotals memory totals;

        vars.price = priceFeed.fetchPrice();
        vars.mUSDInStabPool = stabilityPoolCached.getTotalMUSDDeposits();

        totals = _getTotalsFromBatchLiquidate(
            activePoolCached,
            defaultPoolCached,
            vars.price,
            vars.mUSDInStabPool,
            _troveArray
        );

        require(
            totals.totalPrincipalInSequence > 0,
            "TroveManager: nothing to liquidate"
        );

        // Move liquidated collateral and debt to the appropriate pools
        stabilityPoolCached.offset(
            totals.totalPrincipalToOffset,
            totals.totalInterestToOffset,
            totals.totalCollToSendToSP
        );
        _redistributeDebtAndColl(
            activePoolCached,
            defaultPoolCached,
            totals.totalPrincipalToRedistribute,
            totals.totalInterestToRedistribute,
            totals.totalCollToRedistribute
        );

        // Update system snapshots
        _updateSystemSnapshotsExcludeCollRemainder(
            activePoolCached,
            totals.totalCollGasCompensation
        );

        vars.liquidatedColl =
            totals.totalCollInSequence -
            totals.totalCollGasCompensation;

        emit Liquidation(
            totals.totalPrincipalInSequence,
            totals.totalInterestInSequence,
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

    function getCurrentICR(
        address _borrower,
        uint256 _price
    ) public view override returns (uint) {
        (
            uint256 currentCollateral,
            uint256 currentDebt
        ) = _getCurrentTroveAmounts(_borrower);
        uint256 ICR = LiquityMath._computeCR(
            currentCollateral,
            currentDebt,
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
            uint256 coll,
            uint256 principal,
            uint256 interest,
            uint256 pendingCollateral,
            uint256 pendingPrincipal,
            uint256 pendingInterest
        )
    {
        Trove storage trove = Troves[_borrower];
        coll = trove.coll;
        principal = trove.principal;
        interest = trove.interestOwed;

        // solhint-disable not-rely-on-time
        interest += InterestRateMath.calculateInterestOwed(
            principal,
            trove.interestRate,
            trove.lastInterestUpdateTime,
            block.timestamp
        );
        // solhint-enable not-rely-on-time

        pendingCollateral = getPendingCollateral(_borrower);
        (pendingPrincipal, pendingInterest) = getPendingDebt(_borrower);

        coll += pendingCollateral;
        principal += pendingPrincipal;
        interest += pendingInterest;
    }

    function getPendingCollateral(
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

        return (stake * rewardPerUnitStaked) / DECIMAL_PRECISION;
    }

    function getPendingDebt(
        address _borrower
    )
        public
        view
        override
        returns (uint256 pendingPrincipal, uint256 pendingInterest)
    {
        uint256 principalSnapshot = rewardSnapshots[_borrower].principal;
        uint256 principalPerUnitStaked = L_Principal - principalSnapshot;

        uint256 interestSnapshot = rewardSnapshots[_borrower].interest;
        uint256 interestPerUnitStaked = L_Interest - interestSnapshot;

        if (
            principalPerUnitStaked == 0 ||
            Troves[_borrower].status != Status.active
        ) {
            return (0, 0);
        }

        uint256 stake = Troves[_borrower].stake;

        pendingPrincipal = (stake * principalPerUnitStaked) / DECIMAL_PRECISION;
        pendingInterest = (stake * interestPerUnitStaked) / DECIMAL_PRECISION;
    }

    /**
     * Updates the debt on the given trove by first paying down interest owed, then the principal.
     * Note that this does not actually calculate interest owed, it just pays down the debt by the given amount.
     * Calculation of the interest owed (for system and trove) should be performed before calling this function.
     */
    function _updateTroveDebt(address _borrower, uint256 _payment) internal {
        Trove storage trove = Troves[_borrower];

        // slither-disable-start calls-loop
        (
            uint256 principalAdjustment,
            uint256 interestAdjustment
        ) = interestRateManager.updateTroveDebt(
                trove.interestOwed,
                _payment,
                trove.interestRate
            );
        // slither-disable-end calls-loop
        trove.principal -= principalAdjustment;
        trove.interestOwed -= interestAdjustment;
    }

    function _updateTroveInterest(address _borrower) internal {
        Trove storage trove = Troves[_borrower];

        // solhint-disable not-rely-on-time
        trove.interestOwed += InterestRateMath.calculateInterestOwed(
            trove.principal,
            trove.interestRate,
            trove.lastInterestUpdateTime,
            block.timestamp
        );
        trove.lastInterestUpdateTime = block.timestamp;
        // solhint-enable not-rely-on-time

        _applyPendingRewards(activePool, defaultPool, _borrower);
    }

    // Add the borrowers's coll and debt rewards earned from redistributions, to their Trove
    function _applyPendingRewards(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        address _borrower
    ) internal {
        Trove storage trove = Troves[_borrower];
        if (hasPendingRewards(_borrower)) {
            // Compute pending rewards
            uint256 pendingCollateral = getPendingCollateral(_borrower);
            (
                uint256 pendingPrincipal,
                uint256 pendingInterest
            ) = getPendingDebt(_borrower);

            // Apply pending rewards to trove's state
            trove.coll += pendingCollateral;
            trove.principal += pendingPrincipal;
            trove.interestOwed += pendingInterest;

            // slither-disable-start calls-loop
            // Apply pending rewards to system interest rate data
            interestRateManager.addPrincipal(
                pendingPrincipal,
                trove.interestRate
            );
            // slither-disable-end calls-loop

            _updateTroveRewardSnapshots(_borrower);

            // Transfer from DefaultPool to ActivePool
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                pendingCollateral,
                pendingPrincipal,
                pendingInterest
            );

            emit TroveUpdated(
                _borrower,
                trove.principal,
                trove.interestOwed,
                trove.coll,
                trove.stake,
                trove.interestRate,
                trove.lastInterestUpdateTime,
                uint8(TroveManagerOperation.applyPendingRewards)
            );
        }
    }

    function _sendGasCompensation(
        IActivePool _activePool,
        address _liquidator,
        uint256 _amount,
        uint256 _collateral
    ) internal {
        if (_amount > 0) {
            IGasPool(gasPoolAddress).sendMUSD(_liquidator, _amount);
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
        uint256 _principal,
        uint256 _interest,
        uint256 _coll
    ) internal {
        if (_principal == 0 && _interest == 0) {
            return;
        }

        /*
         * Add distributed collateral, principal, and interest
         * rewards-per-unit-staked to the running totals. Division uses a
         * "feedback" error correction, to keep the cumulative error low in
         * the running totals L_Collateral, L_Principal, and L_Interest:
         *
         * 1) Form numerators which compensate for the floor division errors
         *    that occurred the last time this function was called.
         * 2) Calculate "per-unit-staked" ratios.
         * 3) Multiply each ratio back by its denominator, to reveal the current
         *    floor division error.
         * 4) Store these errors for use in the next correction when this
         *    function is called.
         * 5) Note: static analysis tools complain about this "division before
         *    multiplication", however, it is intended.
         */
        uint256 collateralNumerator = _coll *
            DECIMAL_PRECISION +
            lastCollateralError_Redistribution;
        uint256 principalNumerator = _principal *
            DECIMAL_PRECISION +
            lastPrincipalError_Redistribution;
        uint256 interestNumerator = _interest *
            DECIMAL_PRECISION +
            lastInterestError_Redistribution;

        // Get the per-unit-staked terms
        // slither-disable-start divide-before-multiply
        uint256 pendingCollateralPerUnitStaked = collateralNumerator /
            totalStakes;
        uint256 pendingPrincipalPerUnitStaked = principalNumerator /
            totalStakes;
        uint256 pendingInterestPerUnitStaked = interestNumerator / totalStakes;

        lastCollateralError_Redistribution =
            collateralNumerator -
            (pendingCollateralPerUnitStaked * totalStakes);
        lastPrincipalError_Redistribution =
            principalNumerator -
            (pendingPrincipalPerUnitStaked * totalStakes);
        lastInterestError_Redistribution =
            interestNumerator -
            (pendingInterestPerUnitStaked * totalStakes);
        // slither-disable-end divide-before-multiply

        // Add per-unit-staked terms to the running totals
        L_Collateral += pendingCollateralPerUnitStaked;
        L_Principal += pendingPrincipalPerUnitStaked;
        L_Interest += pendingInterestPerUnitStaked;

        emit LTermsUpdated(L_Collateral, L_Principal, L_Interest);

        // Transfer coll and debt from ActivePool to DefaultPool
        _activePool.decreaseDebt(_principal, _interest);
        _defaultPool.increaseDebt(_principal, _interest);
        _activePool.sendCollateral(address(_defaultPool), _coll);
    }

    // Liquidate one trove
    function _liquidate(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        address _borrower,
        uint256 _MUSDInStabPool
    ) internal returns (LiquidationValues memory singleLiquidation) {
        // slither-disable-next-line uninitialized-local
        LocalVariables_InnerSingleLiquidateFunction memory vars;
        if (TroveOwners.length <= 1) {
            return singleLiquidation;
        } // don't liquidate if last trove

        (
            singleLiquidation.entireTroveColl,
            singleLiquidation.entireTrovePrincipal,
            singleLiquidation.entireTroveInterest,
            vars.pendingColl,
            vars.pendingPrincipal,
            vars.pendingInterest
        ) = getEntireDebtAndColl(_borrower);

        _removeStake(_borrower);
        _movePendingTroveRewardsToActivePool(
            _activePool,
            _defaultPool,
            vars.pendingColl,
            vars.pendingPrincipal,
            vars.pendingInterest
        );

        singleLiquidation.collGasCompensation = _getCollGasCompensation(
            singleLiquidation.entireTroveColl
        );
        singleLiquidation.mUSDGasCompensation = MUSD_GAS_COMPENSATION;
        uint256 collToLiquidate = singleLiquidation.entireTroveColl -
            singleLiquidation.collGasCompensation;

        (
            singleLiquidation.principalToOffset,
            singleLiquidation.interestToOffset,
            singleLiquidation.collToSendToSP,
            singleLiquidation.principalToRedistribute,
            singleLiquidation.interestToRedistribute,
            singleLiquidation.collToRedistribute
        ) = _getOffsetAndRedistributionVals(
            singleLiquidation.entireTrovePrincipal,
            singleLiquidation.entireTroveInterest,
            collToLiquidate,
            _MUSDInStabPool
        );

        _closeTrove(_borrower, Status.closedByLiquidation);
        emit TroveLiquidated(
            _borrower,
            singleLiquidation.entireTrovePrincipal,
            singleLiquidation.entireTroveColl,
            uint8(TroveManagerOperation.liquidate)
        );
        emit TroveUpdated(
            _borrower,
            0,
            0,
            0,
            0,
            0,
            0,
            uint8(TroveManagerOperation.liquidate)
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

    function _getTotalsFromBatchLiquidate(
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

        uint troveArrayLength = _troveArray.length;
        for (vars.i = 0; vars.i < troveArrayLength; vars.i++) {
            vars.user = _troveArray[vars.i];
            vars.ICR = getCurrentICR(vars.user, _price);

            if (vars.ICR < MCR) {
                singleLiquidation = _liquidate(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.remainingMUSDInStabPool
                );
                vars.remainingMUSDInStabPool -=
                    singleLiquidation.principalToOffset +
                    singleLiquidation.interestToOffset;

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );
            }
        }
    }

    /*
     * Called when a full redemption occurs, and closes the trove.
     * The redeemer swaps (debt - liquidation reserve) mUSD for (debt - liquidation reserve) worth of collateral, so the mUSD liquidation reserve left corresponds to the remaining debt.
     * In order to close the trove, the mUSD liquidation reserve is burned, and the corresponding debt is removed from the active pool.
     * The debt recorded on the trove's struct is zero'd elswhere, in _closeTrove.
     * Any surplus collateral left in the trove, is sent to the Coll surplus pool, and can be later claimed by the borrower.
     */
    function _redeemCloseTrove(
        ContractsCache memory _contractsCache,
        address _borrower,
        uint256 _amount,
        uint256 _collateral
    ) internal {
        // slither-disable-next-line calls-loop
        interestRateManager.removePrincipal(
            _amount,
            Troves[_borrower].interestRate
        );
        Troves[_borrower].principal -= _amount;
        // slither-disable-next-line calls-loop
        _contractsCache.musdToken.burn(gasPoolAddress, _amount);
        // Update Active Pool mUSD, and send collateral to account
        // slither-disable-next-line calls-loop
        _contractsCache.activePool.decreaseDebt(_amount, 0);

        // send collateral from Active Pool to CollSurplus Pool
        // slither-disable-next-line calls-loop
        _contractsCache.collSurplusPool.accountSurplus(_borrower, _collateral);
        // slither-disable-next-line calls-loop
        _contractsCache.activePool.sendCollateral(
            address(_contractsCache.collSurplusPool),
            _collateral
        );
    }

    // Redeem as much collateral as possible from _borrower's Trove in exchange for mUSD up to _maxMUSDamount
    function _redeemCollateralFromTrove(
        ContractsCache memory _contractsCache,
        address _borrower,
        uint256 _maxMUSDamount,
        uint256 _price,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint256 _partialRedemptionHintNICR,
        LocalVariables_redeemCollateral memory redeemCollateralVars
    ) internal returns (SingleRedemptionValues memory singleRedemption) {
        // slither-disable-next-line uninitialized-local
        LocalVariables_redeemCollateralFromTrove memory vars;
        Trove storage trove = Troves[_borrower];
        // Determine the remaining amount (lot) to be redeemed, capped by the entire debt of the Trove minus the liquidation reserve
        vars.mUSDLot = LiquityMath._min(
            _maxMUSDamount,
            _getTotalDebt(_borrower) - MUSD_GAS_COMPENSATION
        );

        // Get the collateralLot of equivalent value in USD
        singleRedemption.collateralLot =
            (vars.mUSDLot * DECIMAL_PRECISION) /
            _price;

        // Decrease the debt and collateral of the current Trove according to the mUSD lot and corresponding collateral to send
        vars.newDebt = _getTotalDebt(_borrower) - vars.mUSDLot;
        vars.newColl = Troves[_borrower].coll - singleRedemption.collateralLot;
        vars.newPrincipal = Troves[_borrower].principal;

        // solhint-disable not-rely-on-time
        vars.interestPayment =
            trove.interestOwed +
            InterestRateMath.calculateInterestOwed(
                trove.principal,
                trove.interestRate,
                trove.lastInterestUpdateTime,
                block.timestamp
            );
        // solhint-enable not-rely-on-time

        if (vars.mUSDLot > vars.interestPayment) {
            vars.newPrincipal -= vars.mUSDLot - vars.interestPayment;
            singleRedemption.interest = vars.interestPayment;
            singleRedemption.principal = vars.mUSDLot - vars.interestPayment;
        } else {
            singleRedemption.interest = vars.mUSDLot;
        }

        if (vars.newDebt == MUSD_GAS_COMPENSATION) {
            // No debt left in the Trove (except for the liquidation reserve), therefore the trove gets closed
            _removeStake(_borrower);
            _redeemCloseTrove(
                _contractsCache,
                _borrower,
                MUSD_GAS_COMPENSATION,
                vars.newColl
            );
            _closeTrove(_borrower, Status.closedByRedemption);
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                0,
                0,
                0,
                uint8(TroveManagerOperation.redeemCollateral)
            );
        } else {
            // calculate 10 minutes worth of interest to account for delay between the hint call and now
            // solhint-disable not-rely-on-time

            vars.upperBoundNICR = LiquityMath._computeNominalCR(
                vars.newColl,
                vars.newPrincipal -
                    InterestRateMath.calculateInterestOwed(
                        trove.principal,
                        redeemCollateralVars.interestRate,
                        block.timestamp - 600,
                        block.timestamp
                    )
            );
            // solhint-enable not-rely-on-time
            vars.newNICR = LiquityMath._computeNominalCR(
                vars.newColl,
                vars.newPrincipal
            );

            /*
             * If the provided hint is out of date, we bail since trying to reinsert without a good hint will almost
             * certainly result in running out of gas.
             *
             * If the resultant net debt of the partial is less than the minimum, net debt we bail.
             */
            // slither-disable-start calls-loop
            if (
                _partialRedemptionHintNICR < vars.newNICR ||
                _partialRedemptionHintNICR > vars.upperBoundNICR ||
                _getNetDebt(vars.newDebt) < redeemCollateralVars.minNetDebt
            ) {
                singleRedemption.cancelledPartial = true;
                return singleRedemption;
            }
            // slither-disable-end calls-loop

            // slither-disable-next-line calls-loop
            _contractsCache.sortedTroves.reInsert(
                _borrower,
                vars.newNICR,
                _upperPartialRedemptionHint,
                _lowerPartialRedemptionHint
            );

            _updateTroveDebt(_borrower, vars.mUSDLot);
            trove.coll = vars.newColl;
            _updateStakeAndTotalStakes(_borrower);

            emit TroveUpdated(
                _borrower,
                trove.principal,
                trove.interestOwed,
                vars.newColl,
                trove.stake,
                trove.interestRate,
                trove.lastInterestUpdateTime,
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
        rewardSnapshots[_borrower].principal = L_Principal;
        rewardSnapshots[_borrower].interest = L_Interest;
        emit TroveSnapshotsUpdated(L_Collateral, L_Principal, L_Interest);
    }

    function _addTroveOwnerToArray(
        address _borrower
    ) internal returns (uint128 index) {
        /* Max array size is 2**128 - 1, i.e. ~3e30 troves. No risk of overflow, since troves have minimum mUSD
        debt of liquidation reserve plus minNetDebt. 3e30 mUSD dwarfs the value of all wealth in the world ( which is < 1e15 USD). */

        // Push the Troveowner to the array
        TroveOwners.push(_borrower);

        // Record the index of the new Troveowner on their Trove struct
        index = uint128(TroveOwners.length - 1);
        Troves[_borrower].arrayIndex = index;

        return index;
    }

    // Move a Trove's pending debt and collateral rewards from distributions, from the Default Pool to the Active Pool
    function _movePendingTroveRewardsToActivePool(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint256 _collateral,
        uint256 _principal,
        uint256 _interest
    ) internal {
        // slither-disable-next-line calls-loop
        _defaultPool.decreaseDebt(_principal, _interest);
        // slither-disable-next-line calls-loop
        _activePool.increaseDebt(_principal, _interest);
        // slither-disable-next-line calls-loop
        _defaultPool.sendCollateralToActivePool(_collateral);
    }

    function _closeTrove(address _borrower, Status closedStatus) internal {
        assert(
            closedStatus != Status.nonExistent && closedStatus != Status.active
        );

        uint256 TroveOwnersArrayLength = TroveOwners.length;
        // slither-disable-next-line calls-loop
        if (musdToken.mintList(address(borrowerOperations))) {
            _requireMoreThanOneTroveInSystem(TroveOwnersArrayLength);
        }

        // slither-disable-start calls-loop
        interestRateManager.removePrincipal(
            Troves[_borrower].principal,
            Troves[_borrower].interestRate
        );
        // slither-disable-end calls-loop

        Troves[_borrower].status = closedStatus;
        Troves[_borrower].coll = 0;
        Troves[_borrower].principal = 0;
        Troves[_borrower].interestOwed = 0;

        rewardSnapshots[_borrower].collateral = 0;
        rewardSnapshots[_borrower].principal = 0;
        rewardSnapshots[_borrower].interest = 0;

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
            "TroveManager: Requested redemption amount must be <= user's mUSD token balance"
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
    ) internal view returns (uint currentCollateral, uint currentDebt) {
        uint256 pendingCollateral = getPendingCollateral(_borrower);
        (uint256 pendingPrincipal, uint256 pendingInterest) = getPendingDebt(
            _borrower
        );

        currentCollateral = Troves[_borrower].coll + pendingCollateral;
        currentDebt =
            _getTotalDebt(_borrower) +
            pendingPrincipal +
            pendingInterest;
    }

    function _getTotalDebt(address _borrower) internal view returns (uint256) {
        // slither-disable-start calls-loop
        // solhint-disable not-rely-on-time
        return
            Troves[_borrower].principal +
            Troves[_borrower].interestOwed +
            InterestRateMath.calculateInterestOwed(
                Troves[_borrower].principal,
                Troves[_borrower].interestRate,
                Troves[_borrower].lastInterestUpdateTime,
                block.timestamp
            );
        // solhint-enable not-rely-on-time
        // slither-disable-end calls-loop
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

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == address(borrowerOperations),
            "TroveManager: Caller is not the BorrowerOperations contract"
        );
    }

    function _requireCallerIsBorrowerOperationsOrReversibleCallOptionManager() internal view {
        require(
            msg.sender == address(borrowerOperations) ||
                msg.sender == reversibleCallOptionManagerAddress,
            "TroveManager: Caller is not the BorrowerOperations contract or ReversibleCallOptionManager"
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
        uint256 _principal,
        uint256 _interest,
        uint256 _coll,
        uint256 _MUSDInStabPool
    )
        internal
        pure
        returns (
            uint256 principalToOffset,
            uint256 interestToOffset,
            uint256 collToSendToSP,
            uint256 principalToRedistribute,
            uint256 interestToRedistribute,
            uint256 collToRedistribute
        )
    {
        if (_MUSDInStabPool > 0) {
            /*
             * Offset as much debt & collateral as possible against the Stability Pool, and redistribute the remainder
             * between all active troves.
             *
             *  If the trove's debt is larger than the deposited mUSD in the Stability Pool:
             *
             *  - Offset an amount of the trove's debt equal to the mUSD in the Stability Pool
             *  - Send a fraction of the trove's collateral to the Stability Pool, equal to the fraction of its offset debt
             *
             */
            interestToOffset = LiquityMath._min(_interest, _MUSDInStabPool);
            principalToOffset = LiquityMath._min(
                _principal,
                _MUSDInStabPool - interestToOffset
            );
            uint256 debtToOffset = principalToOffset + interestToOffset;
            collToSendToSP = (_coll * debtToOffset) / (_principal + _interest);
            interestToRedistribute = _interest - interestToOffset;
            principalToRedistribute = _principal - principalToOffset;
            collToRedistribute = _coll - collToSendToSP;
        } else {
            principalToOffset = 0;
            interestToOffset = 0;
            collToSendToSP = 0;
            principalToRedistribute = _principal;
            interestToRedistribute = _interest;
            collToRedistribute = _coll;
        }
    }

    function _requireAmountGreaterThanZero(uint256 _amount) internal pure {
        require(_amount > 0, "TroveManager: Amount must be greater than zero");
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
            singleLiquidation.mUSDGasCompensation;

        newTotals.totalPrincipalInSequence =
            oldTotals.totalPrincipalInSequence +
            singleLiquidation.entireTrovePrincipal;

        newTotals.totalInterestInSequence =
            oldTotals.totalInterestInSequence +
            singleLiquidation.entireTroveInterest;

        newTotals.totalCollInSequence =
            oldTotals.totalCollInSequence +
            singleLiquidation.entireTroveColl;

        newTotals.totalPrincipalToOffset =
            oldTotals.totalPrincipalToOffset +
            singleLiquidation.principalToOffset;

        newTotals.totalInterestToOffset =
            oldTotals.totalInterestToOffset +
            singleLiquidation.interestToOffset;

        newTotals.totalCollToSendToSP =
            oldTotals.totalCollToSendToSP +
            singleLiquidation.collToSendToSP;

        newTotals.totalPrincipalToRedistribute =
            oldTotals.totalPrincipalToRedistribute +
            singleLiquidation.principalToRedistribute;

        newTotals.totalInterestToRedistribute =
            oldTotals.totalInterestToRedistribute +
            singleLiquidation.interestToRedistribute;

        newTotals.totalCollToRedistribute =
            oldTotals.totalCollToRedistribute +
            singleLiquidation.collToRedistribute;

        return newTotals;
    }
}
// slither-disable-end reentrancy-benign
// slither-disable-end reentrancy-events
// slither-disable-end reentrancy-no-eth
