// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./dependencies/CheckContract.sol";
import "./dependencies/LiquityBase.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IPCV.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/ITroveManager.sol";
import "./token/IMUSD.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BorrowerOperations is
    LiquityBase,
    Ownable,
    CheckContract,
    SendCollateral,
    IBorrowerOperations
{
    /* --- Variable container structs  ---

    Used to hold, return and assign variables inside a function, in order to avoid the error:
    "CompilerError: Stack too deep". */

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
    }

    struct LocalVariables_openTrove {
        uint256 price;
        uint256 fee;
        uint256 netDebt;
        uint256 compositeDebt;
        uint256 ICR;
        uint256 NICR;
        uint256 stake;
        uint256 arrayIndex;
    }

    struct ContractsCache {
        ITroveManager troveManager;
        IActivePool activePool;
        IMUSD musd;
    }

    enum BorrowerOperation {
        openTrove,
        closeTrove,
        adjustTrove
    }

    string public constant name = "BorrowerOperations";

    // --- Connected contract declarations ---

    ITroveManager public troveManager;

    address public collateralAddress;
    address public gasPoolAddress;
    address public pcvAddress;
    address public stabilityPoolAddress;

    ICollSurplusPool public collSurplusPool;

    IMUSD public musd;

    // A doubly linked list of Troves, sorted by their collateral ratios
    ISortedTroves public sortedTroves;

    constructor() Ownable(msg.sender) {}

    // Calls on PCV behalf
    function mintBootstrapLoanFromPCV(uint256 _musdToMint) external {
        require(
            msg.sender == pcvAddress,
            "BorrowerOperations: caller must be PCV"
        );
        musd.mint(pcvAddress, _musdToMint);
    }

    function burnDebtFromPCV(uint256 _musdToBurn) external {
        require(
            msg.sender == pcvAddress,
            "BorrowerOperations: caller must be PCV"
        );
        musd.burn(pcvAddress, _musdToBurn);
    }

    // --- Borrower Trove Operations ---
    function openTrove(
        uint256 _maxFeePercentage,
        uint256 _debtAmount,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePool,
            musd
        );
        // slither-disable-next-line uninitialized-local
        LocalVariables_openTrove memory vars;

        vars.price = priceFeed.fetchPrice();
        bool isRecoveryMode = _checkRecoveryMode(vars.price);

        _requireValidMaxFeePercentage(_maxFeePercentage, isRecoveryMode);
        _requireTroveisNotActive(contractsCache.troveManager, msg.sender);

        vars.fee;
        vars.netDebt = _debtAmount;

        if (!isRecoveryMode) {
            vars.fee = _triggerBorrowingFee(
                contractsCache.troveManager,
                contractsCache.musd,
                _debtAmount,
                _maxFeePercentage
            );
            vars.netDebt += vars.fee;
        }

        _requireAtLeastMinNetDebt(vars.netDebt);

        // ICR is based on the composite debt, i.e. the requested amount + borrowing fee + gas comp.
        vars.compositeDebt = _getCompositeDebt(vars.netDebt);
        assert(vars.compositeDebt > 0);

        // if BTC overwrite the asset value
        _assetAmount = getAssetAmount(_assetAmount);
        vars.ICR = LiquityMath._computeCR(
            _assetAmount,
            vars.compositeDebt,
            vars.price
        );
        vars.NICR = LiquityMath._computeNominalCR(
            _assetAmount,
            vars.compositeDebt
        );

        if (isRecoveryMode) {
            _requireICRisAboveCCR(vars.ICR);
        } else {
            _requireICRisAboveMCR(vars.ICR);
            uint256 newTCR = _getNewTCRFromTroveChange(
                _assetAmount,
                true,
                vars.compositeDebt,
                true,
                vars.price
            ); // bools: coll increase, debt increase
            _requireNewTCRisAboveCCR(newTCR);
        }

        // Set the trove struct's properties
        contractsCache.troveManager.setTroveStatus(
            msg.sender,
            ITroveManager.Status.active
        );
        // slither-disable-next-line unused-return
        contractsCache.troveManager.increaseTroveColl(msg.sender, _assetAmount);
        // slither-disable-next-line unused-return
        contractsCache.troveManager.increaseTroveDebt(
            msg.sender,
            vars.compositeDebt
        );

        contractsCache.troveManager.setTroveInterestRate(
            msg.sender,
            contractsCache.troveManager.interestRate()
        );
        // solhint-disable not-rely-on-time
        contractsCache.troveManager.setTroveLastInterestUpdateTime(
            msg.sender,
            block.timestamp
        );
        // solhint-enable not-rely-on-time

        // Set trove's max borrowing capacity to the amount that would put it at 110% ICR
        uint256 maxBorrowingCapacity = _calculateMaxBorrowingCapacity(
            _assetAmount,
            vars.price
        );
        contractsCache.troveManager.setTroveMaxBorrowingCapacity(
            msg.sender,
            maxBorrowingCapacity
        );

        contractsCache.troveManager.updateSystemAndTroveInterest(msg.sender);

        // Add trove's principal to the total principal for it's interest rate
        contractsCache.troveManager.addPrincipalToRate(
            contractsCache.troveManager.interestRate(),
            vars.compositeDebt
        );

        contractsCache.troveManager.updateTroveRewardSnapshots(msg.sender);
        vars.stake = contractsCache.troveManager.updateStakeAndTotalStakes(
            msg.sender
        );

        sortedTroves.insert(msg.sender, vars.NICR, _upperHint, _lowerHint);
        vars.arrayIndex = contractsCache.troveManager.addTroveOwnerToArray(
            msg.sender
        );
        // slither-disable-next-line reentrancy-events
        emit TroveCreated(msg.sender, vars.arrayIndex);

        /*
         * Move the collateral to the Active Pool, and mint the amount to the borrower
         * If the user has insuffient tokens to do the transfer to the Active Pool an error will cause the transaction to revert.
         */
        _activePoolAddColl(contractsCache.activePool, _assetAmount);
        _withdrawMUSD(
            contractsCache.activePool,
            contractsCache.musd,
            msg.sender,
            _debtAmount,
            vars.netDebt
        );
        // Move the mUSD gas compensation to the Gas Pool
        _withdrawMUSD(
            contractsCache.activePool,
            contractsCache.musd,
            gasPoolAddress,
            MUSD_GAS_COMPENSATION,
            MUSD_GAS_COMPENSATION
        );

        emit TroveUpdated(
            msg.sender,
            vars.compositeDebt,
            0,
            _assetAmount,
            vars.stake,
            uint8(BorrowerOperation.openTrove)
        );
        emit BorrowingFeePaid(msg.sender, vars.fee);
    }

    // Send collateral to a trove
    function addColl(
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        _assetAmount = getAssetAmount(_assetAmount);
        _adjustTrove(
            msg.sender,
            0,
            0,
            false,
            _assetAmount,
            _upperHint,
            _lowerHint,
            0
        );
    }

    // Send collateral to a trove. Called by only the Stability Pool.
    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        _requireCallerIsStabilityPool();
        _assetAmount = getAssetAmount(_assetAmount);
        _adjustTrove(
            _borrower,
            0,
            0,
            false,
            _assetAmount,
            _upperHint,
            _lowerHint,
            0
        );
    }

    // Withdraw collateral from a trove
    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _adjustTrove(
            msg.sender,
            _amount,
            0,
            false,
            0,
            _upperHint,
            _lowerHint,
            0
        );
    }

    // Withdraw mUSD tokens from a trove: mint new mUSD tokens to the owner, and increase the trove's principal accordingly
    function withdrawMUSD(
        uint256 _maxFeePercentage,
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _adjustTrove(
            msg.sender,
            0,
            _amount,
            true,
            0,
            _upperHint,
            _lowerHint,
            _maxFeePercentage
        );
    }

    // Repay mUSD tokens to a Trove: Burn the repaid mUSD tokens, and reduce the trove's debt accordingly
    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _adjustTrove(
            msg.sender,
            0,
            _amount,
            false,
            0,
            _upperHint,
            _lowerHint,
            0
        );
    }

    function closeTrove() external override {
        ITroveManager troveManagerCached = troveManager;
        IActivePool activePoolCached = activePool;
        IMUSD musdTokenCached = musd;
        bool canMint = musdTokenCached.mintList(address(this));

        troveManagerCached.updateSystemAndTroveInterest(msg.sender);

        _requireTroveisActive(troveManagerCached, msg.sender);
        uint256 price = priceFeed.fetchPrice();
        if (canMint) {
            _requireNotInRecoveryMode(price);
        }

        troveManagerCached.applyPendingRewards(msg.sender);

        uint256 coll = troveManagerCached.getTroveColl(msg.sender);
        uint256 debt = troveManagerCached.getTroveDebt(msg.sender);
        uint256 interestOwed = troveManagerCached.getTroveInterestOwed(
            msg.sender
        );

        _requireSufficientMUSDBalance(
            musdTokenCached,
            msg.sender,
            debt - MUSD_GAS_COMPENSATION
        );
        if (canMint) {
            uint256 newTCR = _getNewTCRFromTroveChange(
                coll,
                false,
                debt,
                false,
                price
            );
            _requireNewTCRisAboveCCR(newTCR);
        }

        troveManagerCached.removeStake(msg.sender);
        troveManagerCached.closeTrove(msg.sender);

        // slither-disable-next-line reentrancy-events
        emit TroveUpdated(
            msg.sender,
            0,
            0,
            0,
            0,
            uint8(BorrowerOperation.closeTrove)
        );

        // Decrease the active pool debt by the principal (subtracting interestOwed from the total debt)
        activePoolCached.decreaseDebt(
            debt - MUSD_GAS_COMPENSATION - interestOwed,
            interestOwed
        );

        // Burn the repaid mUSD from the user's balance
        musdTokenCached.burn(msg.sender, debt - MUSD_GAS_COMPENSATION);

        // Burn the gas compensation from the gas pool
        _repayMUSD(
            activePoolCached,
            musdTokenCached,
            gasPoolAddress,
            MUSD_GAS_COMPENSATION,
            0
        );

        // Send the collateral back to the user
        activePoolCached.sendCollateral(msg.sender, coll);
    }

    function refinance(uint256 _maxFeePercentage) external override {
        ITroveManager troveManagerCached = troveManager;
        _requireTroveisActive(troveManagerCached, msg.sender);
        troveManagerCached.updateSystemAndTroveInterest(msg.sender);

        // TODO Fix hardcoded 50% fee
        uint16 oldRate = troveManagerCached.getTroveInterestRate(msg.sender);
        uint256 oldInterest = troveManagerCached.getTroveInterestOwed(
            msg.sender
        );
        uint256 oldPrincipal = troveManagerCached.getTrovePrincipal(msg.sender);
        uint256 oldDebt = troveManagerCached.getTroveDebt(msg.sender);
        uint256 amount = (50 * oldDebt) / 100;
        uint256 fee = _triggerBorrowingFee(
            troveManagerCached,
            musd,
            amount,
            _maxFeePercentage
        );
        troveManagerCached.increaseTroveDebt(msg.sender, fee);

        emit RefinancingFeePaid(msg.sender, fee);

        troveManagerCached.removeInterestFromRate(oldRate, oldInterest);
        troveManagerCached.removePrincipalFromRate(oldRate, oldPrincipal);
        uint16 newRate = troveManagerCached.interestRate();
        troveManagerCached.addInterestToRate(newRate, oldInterest);
        troveManagerCached.addPrincipalToRate(newRate, oldPrincipal + fee);

        troveManagerCached.setTroveInterestRate(
            msg.sender,
            troveManagerCached.interestRate()
        );

        uint256 maxBorrowingCapacity = _calculateMaxBorrowingCapacity(
            troveManagerCached.getTroveColl(msg.sender),
            priceFeed.fetchPrice()
        );
        troveManagerCached.setTroveMaxBorrowingCapacity(
            msg.sender,
            maxBorrowingCapacity
        );
    }

    function adjustTrove(
        uint256 _maxFeePercentage,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        _assetAmount = getAssetAmount(_assetAmount);
        _adjustTrove(
            msg.sender,
            _collWithdrawal,
            _debtChange,
            _isDebtIncrease,
            _assetAmount,
            _upperHint,
            _lowerHint,
            _maxFeePercentage
        );
    }

    // Claim remaining collateral from a redemption or from a liquidation with ICR > MCR in Recovery Mode
    function claimCollateral() external override {
        // send collateral from CollSurplus Pool to owner
        collSurplusPool.claimColl(msg.sender);
    }

    function setAddresses(
        address _activePoolAddress,
        address _collateralAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _gasPoolAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _priceFeedAddress,
        address _stabilityPoolAddress,
        address _sortedTrovesAddress,
        address _troveManagerAddress
    ) external override onlyOwner {
        // This makes impossible to open a trove with zero withdrawn mUSD
        assert(MIN_NET_DEBT > 0);

        checkContract(_activePoolAddress);
        if (_collateralAddress != address(0)) {
            checkContract(_collateralAddress);
        }
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_musdTokenAddress);
        checkContract(_pcvAddress);
        checkContract(_priceFeedAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_troveManagerAddress);

        troveManager = ITroveManager(_troveManagerAddress);
        activePool = IActivePool(_activePoolAddress);
        defaultPool = IDefaultPool(_defaultPoolAddress);
        // slither-disable-next-line missing-zero-check
        stabilityPoolAddress = _stabilityPoolAddress;
        // slither-disable-next-line missing-zero-check
        gasPoolAddress = _gasPoolAddress;
        collSurplusPool = ICollSurplusPool(_collSurplusPoolAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        musd = IMUSD(_musdTokenAddress);
        // slither-disable-next-line missing-zero-check
        pcvAddress = _pcvAddress;
        // slither-disable-next-line missing-zero-check
        collateralAddress = _collateralAddress;

        require(
            (Ownable(_defaultPoolAddress).owner() != address(0) ||
                defaultPool.collateralAddress() == _collateralAddress) &&
                (Ownable(_activePoolAddress).owner() != address(0) ||
                    activePool.collateralAddress() == _collateralAddress) &&
                (Ownable(_stabilityPoolAddress).owner() != address(0) ||
                    IStabilityPool(stabilityPoolAddress).collateralAddress() ==
                    _collateralAddress) &&
                (Ownable(_collSurplusPoolAddress).owner() != address(0) ||
                    collSurplusPool.collateralAddress() ==
                    _collateralAddress) &&
                (address(IPCV(pcvAddress).musd()) == address(0) ||
                    address(IPCV(pcvAddress).collateralERC20()) ==
                    _collateralAddress),
            "The same collateral address must be used for the entire set of contracts"
        );

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit GasPoolAddressChanged(_gasPoolAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit PCVAddressChanged(_pcvAddress);
        emit CollateralAddressChanged(_collateralAddress);

        renounceOwnership();
    }

    function getCompositeDebt(
        uint256 _debt
    ) external pure override returns (uint) {
        return _getCompositeDebt(_debt);
    }

    /*
     * _adjustTrove(): Alongside a debt change, this function can perform either a collateral top-up or a collateral withdrawal.
     *
     * It therefore expects either a positive msg.value, or a positive _collWithdrawal argument.
     *
     * If both are positive, it will revert.
     */
    function _adjustTrove(
        address _borrower,
        uint256 _collWithdrawal,
        uint256 _mUSDChange,
        bool _isDebtIncrease,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint,
        uint256 _maxFeePercentage
    ) internal {
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePool,
            musd
        );

        contractsCache.troveManager.updateSystemAndTroveInterest(_borrower);

        // slither-disable-next-line uninitialized-local
        LocalVariables_adjustTrove memory vars;

        // Snapshot interest and principal before repayment so we can correctly adjust the active pool
        vars.interestOwed = contractsCache.troveManager.getTroveInterestOwed(
            _borrower
        );

        (vars.principalAdjustment, vars.interestAdjustment) = contractsCache
            .troveManager
            .calculateDebtAdjustment(vars.interestOwed, _mUSDChange);

        vars.price = priceFeed.fetchPrice();
        vars.isRecoveryMode = _checkRecoveryMode(vars.price);

        if (_isDebtIncrease) {
            _requireValidMaxFeePercentage(
                _maxFeePercentage,
                vars.isRecoveryMode
            );
            _requireNonZeroDebtChange(_mUSDChange);
        }
        _requireSingularCollChange(_collWithdrawal, _assetAmount);
        _requireNonZeroAdjustment(_collWithdrawal, _mUSDChange, _assetAmount);
        _requireTroveisActive(contractsCache.troveManager, _borrower);

        // Confirm the operation is either a borrower adjusting their own trove, or a pure collateral transfer from the Stability Pool to a trove
        assert(
            msg.sender == _borrower ||
                (msg.sender == stabilityPoolAddress &&
                    _assetAmount > 0 &&
                    _mUSDChange == 0)
        );

        contractsCache.troveManager.applyPendingRewards(_borrower);

        // Get the collChange based on whether or not collateral was sent in the transaction
        (vars.collChange, vars.isCollIncrease) = _getCollChange(
            _assetAmount,
            _collWithdrawal
        );

        vars.netDebtChange = _mUSDChange;

        // If the adjustment incorporates a principal increase and system is in Normal Mode, then trigger a borrowing fee
        if (_isDebtIncrease && !vars.isRecoveryMode) {
            vars.fee = _triggerBorrowingFee(
                contractsCache.troveManager,
                contractsCache.musd,
                _mUSDChange,
                _maxFeePercentage
            );
            vars.netDebtChange += vars.fee; // The raw debt change includes the fee
        }

        vars.debt = contractsCache.troveManager.getTroveDebt(_borrower);
        vars.coll = contractsCache.troveManager.getTroveColl(_borrower);

        // Get the trove's old ICR before the adjustment, and what its new ICR will be after the adjustment
        vars.oldICR = LiquityMath._computeCR(vars.coll, vars.debt, vars.price);
        vars.newICR = _getNewICRFromTroveChange(
            vars.coll,
            vars.debt,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease,
            vars.price
        );
        assert(_collWithdrawal <= vars.coll);

        // Check the adjustment satisfies all conditions for the current system mode
        _requireValidAdjustmentInCurrentMode(
            vars.isRecoveryMode,
            _collWithdrawal,
            _isDebtIncrease,
            vars
        );

        // When the adjustment is a debt repayment, check it's a valid amount and that the caller has enough mUSD
        if (!_isDebtIncrease && _mUSDChange > 0) {
            _requireAtLeastMinNetDebt(
                _getNetDebt(vars.debt) - vars.netDebtChange
            );
            _requireValidMUSDRepayment(vars.debt, vars.netDebtChange);
            _requireSufficientMUSDBalance(
                contractsCache.musd,
                _borrower,
                vars.netDebtChange
            );
        }

        (
            vars.newColl,
            vars.newPrincipal,
            vars.newInterest
        ) = _updateTroveFromAdjustment(
            contractsCache.troveManager,
            _borrower,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease
        );
        vars.stake = contractsCache.troveManager.updateStakeAndTotalStakes(
            _borrower
        );

        // Re-insert trove in to the sorted list
        uint256 newNICR = _getNewNominalICRFromTroveChange(
            vars.coll,
            vars.debt,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease
        );
        sortedTroves.reInsert(_borrower, newNICR, _upperHint, _lowerHint);

        // slither-disable-next-line reentrancy-events
        emit TroveUpdated(
            _borrower,
            vars.newPrincipal,
            vars.newInterest,
            vars.newColl,
            vars.stake,
            uint8(BorrowerOperation.adjustTrove)
        );
        // slither-disable-next-line reentrancy-events
        emit BorrowingFeePaid(msg.sender, vars.fee);

        // Use the unmodified _mUSDChange here, as we don't send the fee to the user
        _moveTokensAndCollateralfromAdjustment(
            contractsCache.activePool,
            contractsCache.musd,
            msg.sender,
            vars.collChange,
            vars.isCollIncrease,
            _isDebtIncrease ? _mUSDChange : vars.principalAdjustment,
            vars.interestAdjustment,
            _isDebtIncrease,
            vars.netDebtChange
        );
    }

    // Issue the specified amount of mUSD to _account and increases the total active debt (_netDebtIncrease potentially includes a MUSDFee)
    function _withdrawMUSD(
        IActivePool _activePool,
        IMUSD _musd,
        address _account,
        uint256 _debtAmount,
        uint256 _netDebtIncrease
    ) internal {
        _activePool.increaseDebt(_netDebtIncrease, 0);
        _musd.mint(_account, _debtAmount);
    }

    // Burn the specified amount of MUSD from _account and decreases the total active debt
    function _repayMUSD(
        IActivePool _activePool,
        IMUSD _musd,
        address _account,
        uint256 _principal,
        uint256 _interest
    ) internal {
        _activePool.decreaseDebt(_principal, _interest);
        _musd.burn(_account, _principal + _interest);
    }

    function _moveTokensAndCollateralfromAdjustment(
        IActivePool _activePool,
        IMUSD _musd,
        address _borrower,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _principalChange,
        uint256 _interestChange,
        bool _isDebtIncrease,
        uint256 _netDebtChange
    ) internal {
        if (_isDebtIncrease) {
            _withdrawMUSD(
                _activePool,
                _musd,
                _borrower,
                _principalChange,
                _netDebtChange
            );
        } else {
            _repayMUSD(
                _activePool,
                _musd,
                _borrower,
                _principalChange,
                _interestChange
            );
        }

        if (_isCollIncrease) {
            _activePoolAddColl(_activePool, _collChange);
        } else {
            _activePool.sendCollateral(_borrower, _collChange);
        }
    }

    // Send collateral to Active Pool and increase its recorded collateral balance
    function _activePoolAddColl(
        IActivePool _activePool,
        uint256 _amount
    ) internal {
        sendCollateralFrom(
            IERC20(collateralAddress),
            msg.sender,
            address(_activePool),
            _amount
        );
    }

    // Update trove's coll and debt based on whether they increase or decrease
    function _updateTroveFromAdjustment(
        ITroveManager _troveManager,
        address _borrower,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease
    )
        internal
        returns (uint256 newColl, uint256 newPrincipal, uint256 newInterest)
    {
        newColl = (_isCollIncrease)
            ? _troveManager.increaseTroveColl(_borrower, _collChange)
            : _troveManager.decreaseTroveColl(_borrower, _collChange);

        if (_isDebtIncrease) {
            newPrincipal = _troveManager.increaseTroveDebt(
                _borrower,
                _debtChange
            );
        } else {
            (newPrincipal, newInterest) = _troveManager.decreaseTroveDebt(
                _borrower,
                _debtChange
            );
        }
    }

    // --- Helper functions ---

    function _triggerBorrowingFee(
        ITroveManager _troveManager,
        IMUSD _musd,
        uint256 _amount,
        uint256 _maxFeePercentage
    ) internal returns (uint) {
        _troveManager.decayBaseRateFromBorrowing(); // decay the baseRate state variable
        uint256 fee = _troveManager.getBorrowingFee(_amount);

        _requireUserAcceptsFee(fee, _amount, _maxFeePercentage);

        // Send fee to PCV contract
        _musd.mint(pcvAddress, fee);
        return fee;
    }

    function getAssetAmount(
        uint256 _assetAmount
    ) internal view returns (uint256) {
        if (collateralAddress == address(0)) {
            return msg.value;
        }

        require(
            msg.value == 0,
            "BorrowerOperations: ERC20 collateral needed, not BTC"
        );
        return _assetAmount;
    }

    function _requireNotInRecoveryMode(uint256 _price) internal view {
        require(
            !_checkRecoveryMode(_price),
            "BorrowerOps: Operation not permitted during Recovery Mode"
        );
    }

    function _requireTroveisNotActive(
        ITroveManager _troveManager,
        address _borrower
    ) internal view {
        ITroveManager.Status status = _troveManager.getTroveStatus(_borrower);
        require(
            status != ITroveManager.Status.active,
            "BorrowerOps: Trove is active"
        );
    }

    function _getNewTCRFromTroveChange(
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _price
    ) internal view returns (uint) {
        uint256 totalColl = getEntireSystemColl();
        uint256 totalDebt = getEntireSystemDebt();

        totalColl = _isCollIncrease
            ? totalColl + _collChange
            : totalColl - _collChange;
        totalDebt = _isDebtIncrease
            ? totalDebt + _debtChange
            : totalDebt - _debtChange;

        uint256 newTCR = LiquityMath._computeCR(totalColl, totalDebt, _price);
        return newTCR;
    }

    function _requireCallerIsStabilityPool() internal view {
        require(
            msg.sender == stabilityPoolAddress,
            "BorrowerOps: Caller is not Stability Pool"
        );
    }

    function _requireTroveisActive(
        ITroveManager _troveManager,
        address _borrower
    ) internal view {
        ITroveManager.Status status = _troveManager.getTroveStatus(_borrower);

        require(
            status == ITroveManager.Status.active,
            "BorrowerOps: Trove does not exist or is closed"
        );
    }

    /*
     * In Normal Mode, ensure:
     *
     * - The new ICR is above MCR
     * - The adjustment won't pull the TCR below CCR
     */
    function _requireValidAdjustmentInNormalMode(
        bool _isDebtIncrease,
        LocalVariables_adjustTrove memory _vars
    ) internal view {
        _requireICRisAboveMCR(_vars.newICR);
        _vars.newTCR = _getNewTCRFromTroveChange(
            _vars.collChange,
            _vars.isCollIncrease,
            _vars.netDebtChange,
            _isDebtIncrease,
            _vars.price
        );
        _requireNewTCRisAboveCCR(_vars.newTCR);
    }

    function _requireValidAdjustmentInCurrentMode(
        bool _isRecoveryMode,
        uint256 _collWithdrawal,
        bool _isDebtIncrease,
        LocalVariables_adjustTrove memory _vars
    ) internal view {
        if (_isRecoveryMode) {
            _requireValidAdjustmentInRecoveryMode(
                _collWithdrawal,
                _isDebtIncrease,
                _vars
            );
        } else {
            _requireValidAdjustmentInNormalMode(_isDebtIncrease, _vars);
        }
    }

    function _requireSufficientMUSDBalance(
        IMUSD _musd,
        address _borrower,
        uint256 _debtRepayment
    ) internal view {
        require(
            _musd.balanceOf(_borrower) >= _debtRepayment,
            "BorrowerOps: Caller doesnt have enough mUSD to make repayment"
        );
    }

    /*
     * In Recovery Mode, only allow:
     *
     * - Pure collateral top-up
     * - Pure debt repayment
     * - Collateral top-up with debt repayment
     * - A debt increase combined with a collateral top-up which makes the ICR
     * >= 150% and improves the ICR (and by extension improves the TCR).
     */
    function _requireValidAdjustmentInRecoveryMode(
        uint256 _collWithdrawal,
        bool _isDebtIncrease,
        LocalVariables_adjustTrove memory _vars
    ) internal pure {
        _requireNoCollWithdrawal(_collWithdrawal);
        if (_isDebtIncrease) {
            _requireICRisAboveCCR(_vars.newICR);
            _requireNewICRisAboveOldICR(_vars.newICR, _vars.oldICR);
        }
    }

    function _getCollChange(
        uint256 _collReceived,
        uint256 _requestedCollWithdrawal
    ) internal pure returns (uint256 collChange, bool isCollIncrease) {
        if (_collReceived != 0) {
            collChange = _collReceived;
            isCollIncrease = true;
        } else {
            collChange = _requestedCollWithdrawal;
        }
    }

    // Compute the new collateral ratio, considering the change in coll and debt. Assumes 0 pending rewards.
    function _getNewICRFromTroveChange(
        uint256 _coll,
        uint256 _debt,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _price
    ) internal pure returns (uint) {
        (uint256 newColl, uint256 newDebt) = _getNewTroveAmounts(
            _coll,
            _debt,
            _collChange,
            _isCollIncrease,
            _debtChange,
            _isDebtIncrease
        );
        uint256 newICR = LiquityMath._computeCR(newColl, newDebt, _price);
        return newICR;
    }

    function _getNewTroveAmounts(
        uint256 _coll,
        uint256 _debt,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease
    ) internal pure returns (uint newColl, uint newDebt) {
        newColl = _isCollIncrease ? _coll + _collChange : _coll - _collChange;
        newDebt = _isDebtIncrease ? _debt + _debtChange : _debt - _debtChange;
    }

    // Compute the new collateral ratio, considering the change in coll and debt. Assumes 0 pending rewards.
    function _getNewNominalICRFromTroveChange(
        uint256 _coll,
        uint256 _debt,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease
    ) internal pure returns (uint) {
        (uint256 newColl, uint256 newDebt) = _getNewTroveAmounts(
            _coll,
            _debt,
            _collChange,
            _isCollIncrease,
            _debtChange,
            _isDebtIncrease
        );

        return LiquityMath._computeNominalCR(newColl, newDebt);
    }

    function _calculateMaxBorrowingCapacity(
        uint256 _coll,
        uint256 _price
    ) internal pure returns (uint) {
        return (_coll * _price) / (110 * 1e16);
    }

    function _requireValidMaxFeePercentage(
        uint256 _maxFeePercentage,
        bool _isRecoveryMode
    ) internal pure {
        if (_isRecoveryMode) {
            require(
                _maxFeePercentage <= DECIMAL_PRECISION,
                "Max fee percentage must be less than or equal to 100%"
            );
        } else {
            require(
                _maxFeePercentage >= BORROWING_FEE_FLOOR &&
                    _maxFeePercentage <= DECIMAL_PRECISION,
                "Max fee percentage must be between 0.5% and 100%"
            );
        }
    }

    function _requireAtLeastMinNetDebt(uint256 _netDebt) internal pure {
        require(
            _netDebt >= MIN_NET_DEBT,
            "BorrowerOps: Trove's net debt must be greater than minimum"
        );
    }

    function _requireICRisAboveMCR(uint256 _newICR) internal pure {
        require(
            _newICR >= MCR,
            "BorrowerOps: An operation that would result in ICR < MCR is not permitted"
        );
    }

    function _requireICRisAboveCCR(uint256 _newICR) internal pure {
        require(
            _newICR >= CCR,
            "BorrowerOps: Operation must leave trove with ICR >= CCR"
        );
    }

    function _requireNewTCRisAboveCCR(uint256 _newTCR) internal pure {
        require(
            _newTCR >= CCR,
            "BorrowerOps: An operation that would result in TCR < CCR is not permitted"
        );
    }

    function _requireNonZeroDebtChange(uint256 _debtChange) internal pure {
        require(
            _debtChange > 0,
            "BorrowerOps: Debt increase requires non-zero debtChange"
        );
    }

    function _requireSingularCollChange(
        uint256 _collWithdrawal,
        uint256 _assetAmount
    ) internal pure {
        require(
            _assetAmount == 0 || _collWithdrawal == 0,
            "BorrowerOperations: Cannot withdraw and add coll"
        );
    }

    function _requireNonZeroAdjustment(
        uint256 _collWithdrawal,
        uint256 _debtChange,
        uint256 _assetAmount
    ) internal pure {
        require(
            _assetAmount != 0 || _collWithdrawal != 0 || _debtChange != 0,
            "BorrowerOps: There must be either a collateral change or a debt change"
        );
    }

    function _requireNoCollWithdrawal(uint256 _collWithdrawal) internal pure {
        require(
            _collWithdrawal == 0,
            "BorrowerOps: Collateral withdrawal not permitted Recovery Mode"
        );
    }

    function _requireNewICRisAboveOldICR(
        uint256 _newICR,
        uint256 _oldICR
    ) internal pure {
        require(
            _newICR >= _oldICR,
            "BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode"
        );
    }

    function _requireValidMUSDRepayment(
        uint256 _currentDebt,
        uint256 _debtRepayment
    ) internal pure {
        require(
            _debtRepayment <= _currentDebt - MUSD_GAS_COMPENSATION,
            "BorrowerOps: Amount repaid must not be larger than the Trove's debt"
        );
    }
}
