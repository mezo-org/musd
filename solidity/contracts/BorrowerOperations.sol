// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/LiquityBase.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IMUSD.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/ITroveManager.sol";
import "./interfaces/IPCV.sol";

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

    struct LocalVariables_openTrove {
        uint256 price;
        uint256 MUSDFee;
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
        IMUSD thusdToken;
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
        LocalVariables_openTrove memory vars;

        vars.price = priceFeed.fetchPrice();
        bool isRecoveryMode = _checkRecoveryMode(vars.price);

        _requireValidMaxFeePercentage(_maxFeePercentage, isRecoveryMode);
        _requireTroveisNotActive(contractsCache.troveManager, msg.sender);

        vars.MUSDFee;
        vars.netDebt = _debtAmount;

        if (!isRecoveryMode) {
            vars.MUSDFee = _triggerBorrowingFee(
                contractsCache.troveManager,
                contractsCache.thusdToken,
                _debtAmount,
                _maxFeePercentage
            );
            vars.netDebt += vars.MUSDFee;
        }

        _requireAtLeastMinNetDebt(vars.netDebt);

        // ICR is based on the composite debt, i.e. the requested MUSD amount + MUSD borrowing fee + MUSD gas comp.
        vars.compositeDebt = _getCompositeDebt(vars.netDebt);
        assert(vars.compositeDebt > 0);

        // if ETH overwrite the asset value
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
        contractsCache.troveManager.increaseTroveColl(msg.sender, _assetAmount);
        contractsCache.troveManager.increaseTroveDebt(
            msg.sender,
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
        emit TroveCreated(msg.sender, vars.arrayIndex);

        /*
         * Move the collateral to the Active Pool, and mint the MUSDAmount to the borrower
         * If the user has insuffient tokens to do the transfer to the Active Pool an error will cause the transaction to revert.
         */
        _activePoolAddColl(contractsCache.activePool, _assetAmount);
        _withdrawMUSD(
            contractsCache.activePool,
            contractsCache.thusdToken,
            msg.sender,
            _debtAmount,
            vars.netDebt
        );
        // Move the MUSD gas compensation to the Gas Pool
        _withdrawMUSD(
            contractsCache.activePool,
            contractsCache.thusdToken,
            gasPoolAddress,
            MUSD_GAS_COMPENSATION,
            MUSD_GAS_COMPENSATION
        );

        emit TroveUpdated(
            msg.sender,
            vars.compositeDebt,
            _assetAmount,
            vars.stake,
            uint8(BorrowerOperation.openTrove)
        );
        emit MUSDBorrowingFeePaid(msg.sender, vars.MUSDFee);
    }

    // Send collateral to a trove
    function addColl(
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {}

    // Send collateral to a trove. Called by only the Stability Pool.
    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {}

    // Withdraw collateral from a trove
    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {}

    // Withdraw MUSD tokens from a trove: mint new MUSD tokens to the owner, and increase the trove's debt accordingly
    function withdrawMUSD(
        uint256 _maxFeePercentage,
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {}

    // Repay MUSD tokens to a Trove: Burn the repaid MUSD tokens, and reduce the trove's debt accordingly
    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {}

    function closeTrove() external override {}

    function adjustTrove(
        uint256 _maxFeePercentage,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {}

    // Claim remaining collateral from a redemption or from a liquidation with ICR > MCR in Recovery Mode
    function claimCollateral() external override {}

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress,
        address _defaultPoolAddress,
        address _stabilityPoolAddress,
        address _gasPoolAddress,
        address _collSurplusPoolAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _collateralAddress
    ) external override onlyOwner {
        // This makes impossible to open a trove with zero withdrawn MUSD
        assert(MIN_NET_DEBT > 0);

        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_priceFeedAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_musdTokenAddress);
        checkContract(_pcvAddress);
        if (_collateralAddress != address(0)) {
            checkContract(_collateralAddress);
        }

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

    // Issue the specified amount of THUSD to _account and increases the total active debt (_netDebtIncrease potentially includes a THUSDFee)
    function _withdrawMUSD(
        IActivePool _activePool,
        IMUSD _musd,
        address _account,
        uint256 _debtAmount,
        uint256 _netDebtIncrease
    ) internal {
        _activePool.increaseMUSDDebt(_netDebtIncrease);
        _musd.mint(_account, _debtAmount);
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

        if (collateralAddress == address(0)) {
            return;
        }
        _activePool.updateCollateralBalance(_amount);
    }

    // --- Helper functions ---

    function _triggerBorrowingFee(
        ITroveManager _troveManager,
        IMUSD _thusdToken,
        uint256 _THUSDAmount,
        uint256 _maxFeePercentage
    ) internal returns (uint) {
        _troveManager.decayBaseRateFromBorrowing(); // decay the baseRate state variable
        uint256 THUSDFee = _troveManager.getBorrowingFee(_THUSDAmount);

        _requireUserAcceptsFee(THUSDFee, _THUSDAmount, _maxFeePercentage);

        // Send fee to PCV contract
        _thusdToken.mint(pcvAddress, THUSDFee);
        return THUSDFee;
    }

    function getAssetAmount(
        uint256 _assetAmount
    ) internal view returns (uint256) {
        if (collateralAddress == address(0)) {
            return msg.value;
        }

        require(
            msg.value == 0,
            "BorrowerOperations: ERC20 collateral needed, not ETH"
        );
        return _assetAmount;
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

    function _requireValidMaxFeePercentage(
        uint256 _maxFeePercentage,
        bool _isRecoveryMode
    ) internal pure {
        if (_isRecoveryMode) {
            require(
                _maxFeePercentage <= DECIMAL_PRECISION,
                "Max fee percentage must less than or equal to 100%"
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
}
