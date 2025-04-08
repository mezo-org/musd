// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../dependencies/TransparentUpgradeableProxy.sol";
import "../dependencies/ProxyAdmin.sol";
import "../dependencies/OwnableUpgradeable.sol";
import "../BorrowerOperations.sol";
import "../interfaces/IBorrowerOperations.sol";
import "../BorrowerOperationsSignatures.sol";
import "../interfaces/IBorrowerOperationsSignatures.sol";
import "../InterestRateManager.sol";
import "../interfaces/IInterestRateManager.sol";
import "../TroveManager.sol";
import "../interfaces/ITroveManager.sol";
import "../StabilityPool.sol";
import "../interfaces/IStabilityPool.sol";
import "../token/MUSD.sol";
import "../token/IMUSD.sol";
import "../tests/MockAggregator.sol";
import "../CollSurplusPool.sol";
import "../interfaces/ICollSurplusPool.sol";
import "../ActivePool.sol";
import "../interfaces/IActivePool.sol";
import "../DefaultPool.sol";
import "../interfaces/IDefaultPool.sol";
import "../PCV.sol";
import "../interfaces/IPCV.sol";
import "../SortedTroves.sol";
import "../interfaces/ISortedTroves.sol";
import "../GasPool.sol";
import "../interfaces/IGasPool.sol";
import "../PriceFeed.sol";
import "../interfaces/IPriceFeed.sol";
import "./EchidnaProxy.sol";

contract Test {
    IInterestRateManager interestRateManager;
    IBorrowerOperations borrowerOperations;
    IBorrowerOperationsSignatures borrowerOperationsSignatures;
    ITroveManager troveManager;
    IStabilityPool stabilityPool;
    IMUSD musd;
    MockAggregator mockAggregator;
    ICollSurplusPool collSurplusPool;
    IDefaultPool defaultPool;
    IActivePool activePool;
    IPCV pcv;
    ISortedTroves sortedTroves;
    IGasPool gasPool;
    IPriceFeed priceFeed;

    uint private constant NUMBER_OF_ACTORS = 100;
    uint private constant INITIAL_BALANCE = 1e24;

    EchidnaProxy[NUMBER_OF_ACTORS] public echidnaProxies;

    uint private MCR;
    uint private CCR;
    uint private MUSD_GAS_COMPENSATION;

    uint private numberOfTroves;

    constructor() {
        address admin = address(new ProxyAdmin(msg.sender));

        borrowerOperations = IBorrowerOperations(
            address(
                new TransparentUpgradeableProxy(
                    address(new BorrowerOperations()),
                    admin,
                    abi.encodeWithSelector(
                        BorrowerOperations.initialize.selector
                    )
                )
            )
        );
        borrowerOperationsSignatures = IBorrowerOperationsSignatures(
            address(
                new TransparentUpgradeableProxy(
                    address(new BorrowerOperationsSignatures()),
                    admin,
                    abi.encodeWithSelector(
                        BorrowerOperationsSignatures.initialize.selector
                    )
                )
            )
        );
        interestRateManager = IInterestRateManager(
            address(
                new TransparentUpgradeableProxy(
                    address(new InterestRateManager()),
                    admin,
                    abi.encodeWithSelector(
                        InterestRateManager.initialize.selector
                    )
                )
            )
        );
        troveManager = ITroveManager(
            address(
                new TransparentUpgradeableProxy(
                    address(new TroveManager()),
                    admin,
                    abi.encodeWithSelector(TroveManager.initialize.selector)
                )
            )
        );
        stabilityPool = IStabilityPool(
            address(
                new TransparentUpgradeableProxy(
                    address(new StabilityPool()),
                    admin,
                    abi.encodeWithSelector(StabilityPool.initialize.selector)
                )
            )
        );
        musd = IMUSD(
            new MUSD(
                "Mezo USD",
                "MUSD",
                address(troveManager),
                address(stabilityPool),
                address(borrowerOperations),
                address(interestRateManager),
                90 * 24 * 60 * 60
            )
        );
        mockAggregator = new MockAggregator(18);
        collSurplusPool = ICollSurplusPool(
            address(
                new TransparentUpgradeableProxy(
                    address(new CollSurplusPool()),
                    admin,
                    abi.encodeWithSelector(CollSurplusPool.initialize.selector)
                )
            )
        );
        activePool = IActivePool(
            address(
                new TransparentUpgradeableProxy(
                    address(new ActivePool()),
                    admin,
                    abi.encodeWithSelector(ActivePool.initialize.selector)
                )
            )
        );
        defaultPool = IDefaultPool(
            address(
                new TransparentUpgradeableProxy(
                    address(new DefaultPool()),
                    admin,
                    abi.encodeWithSelector(DefaultPool.initialize.selector)
                )
            )
        );
        pcv = IPCV(
            address(
                new TransparentUpgradeableProxy(
                    address(new PCV()),
                    admin,
                    abi.encodeWithSelector(PCV.initialize.selector, 7200)
                )
            )
        );
        sortedTroves = ISortedTroves(
            address(
                new TransparentUpgradeableProxy(
                    address(new SortedTroves()),
                    admin,
                    abi.encodeWithSelector(SortedTroves.initialize.selector)
                )
            )
        );
        gasPool = IGasPool(
            address(
                new TransparentUpgradeableProxy(
                    address(new GasPool()),
                    admin,
                    abi.encodeWithSelector(GasPool.initialize.selector)
                )
            )
        );
        priceFeed = IPriceFeed(
            address(
                new TransparentUpgradeableProxy(
                    address(new PriceFeed()),
                    admin,
                    abi.encodeWithSelector(PriceFeed.initialize.selector)
                )
            )
        );

        priceFeed.setOracle(address(mockAggregator));
        interestRateManager.setAddresses(
            address(activePool),
            address(borrowerOperations),
            address(musd),
            address(pcv),
            address(troveManager)
        );
        stabilityPool.setAddresses(
            address(activePool),
            address(borrowerOperations),
            address(musd),
            address(priceFeed),
            address(sortedTroves),
            address(troveManager)
        );
        pcv.setAddresses(address(borrowerOperations), address(musd));
        defaultPool.setAddresses(address(activePool), address(troveManager));
        activePool.setAddresses(
            address(borrowerOperations),
            address(collSurplusPool),
            address(defaultPool),
            address(interestRateManager),
            address(stabilityPool),
            address(troveManager)
        );
        borrowerOperations.setAddresses(
            address(activePool),
            address(borrowerOperationsSignatures),
            address(collSurplusPool),
            address(defaultPool),
            address(gasPool),
            address(interestRateManager),
            address(musd),
            address(pcv),
            address(priceFeed),
            address(sortedTroves),
            address(stabilityPool),
            address(troveManager)
        );
        collSurplusPool.setAddresses(
            address(activePool),
            address(borrowerOperations),
            address(troveManager)
        );
        troveManager.setAddresses(
            address(activePool),
            address(borrowerOperations),
            address(collSurplusPool),
            address(defaultPool),
            address(gasPool),
            address(interestRateManager),
            address(musd),
            address(pcv),
            address(priceFeed),
            address(sortedTroves),
            address(stabilityPool)
        );
        gasPool.setAddresses(address(musd), address(troveManager));
        sortedTroves.setParams(
            0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff,
            address(borrowerOperations),
            address(troveManager)
        );

        for (uint i = 0; i < NUMBER_OF_ACTORS; i++) {
            echidnaProxies[i] = new EchidnaProxy(
                troveManager,
                borrowerOperations,
                stabilityPool,
                musd
            );
        }

        MCR = borrowerOperations.getMCR();
        CCR = borrowerOperations.getCCR();
        MUSD_GAS_COMPENSATION = borrowerOperations.getGasComp();
    }

    function fund_proxies() public payable {
        require(msg.value == INITIAL_BALANCE * NUMBER_OF_ACTORS);
        for (uint i = 0; i < NUMBER_OF_ACTORS; i++) {
            (bool success, ) = address(echidnaProxies[i]).call{
                value: INITIAL_BALANCE
            }("");
            require(success);
        }
    }

    // TroveManager

    function liquidateExt(uint _i, address _user) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].liquidatePrx(_user);
    }

    function batchLiquidateTrovesExt(
        uint _i,
        address[] calldata _troveArray
    ) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].batchLiquidateTrovesPrx(_troveArray);
    }

    function redeemCollateralExt(
        uint _i,
        uint _MUSDAmount,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint _partialRedemptionHintNICR
    ) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].redeemCollateralPrx(
            _MUSDAmount,
            _firstRedemptionHint,
            _upperPartialRedemptionHint,
            _lowerPartialRedemptionHint,
            _partialRedemptionHintNICR,
            0
        );
    }

    // Borrower Operations

    function getAdjustedBTC(
        uint actorBalance,
        uint _BTC,
        uint ratio
    ) internal view returns (uint) {
        uint price = priceFeed.fetchPrice();
        require(price > 0);
        uint minBTC = (ratio * MUSD_GAS_COMPENSATION) / price;
        require(actorBalance > minBTC);
        uint BTC = minBTC + (_BTC % (actorBalance - minBTC));
        return BTC;
    }

    function getAdjustedMUSD(
        uint BTC,
        uint _MUSDAmount,
        uint ratio
    ) internal view returns (uint) {
        uint price = priceFeed.fetchPrice();
        uint MUSDAmount = _MUSDAmount;
        uint compositeDebt = MUSDAmount + MUSD_GAS_COMPENSATION;
        uint ICR = LiquityMath._computeCR(BTC, compositeDebt, price);
        if (ICR < ratio) {
            compositeDebt = (BTC * price) / ratio;
            MUSDAmount = compositeDebt - MUSD_GAS_COMPENSATION;
        }
        return MUSDAmount;
    }

    function openTroveExt(uint _i, uint _BTC, uint _MUSDAmount) public payable {
        uint actor = _i % NUMBER_OF_ACTORS;
        EchidnaProxy echidnaProxy = echidnaProxies[actor];
        uint actorBalance = address(echidnaProxy).balance;

        // we pass in CCR instead of MCR in case it’s the first one
        uint BTC = getAdjustedBTC(actorBalance, _BTC, CCR);
        uint MUSDAmount = getAdjustedMUSD(BTC, _MUSDAmount, CCR);

        echidnaProxy.openTrovePrx(BTC, MUSDAmount, address(0), address(0));

        numberOfTroves = troveManager.getTroveOwnersCount();
        assert(numberOfTroves > 0);
        // canary
        //assert(numberOfTroves == 0);
    }

    function openTroveRawExt(
        uint _i,
        uint _BTC,
        uint _MUSDAmount,
        address _upperHint,
        address _lowerHint
    ) public payable {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].openTrovePrx(
            _BTC,
            _MUSDAmount,
            _upperHint,
            _lowerHint
        );
    }

    function addCollExt(uint _i, uint _BTC) external payable {
        uint actor = _i % NUMBER_OF_ACTORS;
        EchidnaProxy echidnaProxy = echidnaProxies[actor];
        uint actorBalance = address(echidnaProxy).balance;

        uint BTC = getAdjustedBTC(actorBalance, _BTC, MCR);

        echidnaProxy.addCollPrx(BTC, address(0), address(0));
    }

    function addCollRawExt(
        uint _i,
        uint _BTC,
        address _upperHint,
        address _lowerHint
    ) external payable {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].addCollPrx(_BTC, _upperHint, _lowerHint);
    }

    function withdrawCollExt(
        uint _i,
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].withdrawCollPrx(_amount, _upperHint, _lowerHint);
    }

    function withdrawMUSDExt(
        uint _i,
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].withdrawMUSDPrx(_amount, _upperHint, _lowerHint);
    }

    function repayMUSDExt(
        uint _i,
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].repayMUSDPrx(_amount, _upperHint, _lowerHint);
    }

    function closeTroveExt(uint _i) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].closeTrovePrx();
    }

    function adjustTroveExt(
        uint _i,
        uint _BTC,
        uint _collWithdrawal,
        uint _debtChange,
        bool _isDebtIncrease
    ) external payable {
        uint actor = _i % NUMBER_OF_ACTORS;
        EchidnaProxy echidnaProxy = echidnaProxies[actor];
        uint actorBalance = address(echidnaProxy).balance;

        uint BTC = getAdjustedBTC(actorBalance, _BTC, MCR);
        uint debtChange = _debtChange;
        if (_isDebtIncrease) {
            // TODO: add current amount already withdrawn:
            debtChange = getAdjustedMUSD(BTC, uint(_debtChange), MCR);
        }
        // TODO: collWithdrawal, debtChange
        echidnaProxy.adjustTrovePrx(
            BTC,
            _collWithdrawal,
            debtChange,
            _isDebtIncrease,
            address(0),
            address(0)
        );
    }

    function adjustTroveRawExt(
        uint _i,
        uint _BTC,
        uint _collWithdrawal,
        uint _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external payable {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].adjustTrovePrx(
            _BTC,
            _collWithdrawal,
            _debtChange,
            _isDebtIncrease,
            _upperHint,
            _lowerHint
        );
    }

    // Pool Manager

    function provideToSPExt(uint _i, uint _amount) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].provideToSPPrx(_amount);
    }

    function withdrawFromSPExt(uint _i, uint _amount) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].withdrawFromSPPrx(_amount);
    }

    // MUSD Token

    function transferExt(
        uint _i,
        address recipient,
        uint256 amount
    ) external returns (bool) {
        uint actor = _i % NUMBER_OF_ACTORS;
        return echidnaProxies[actor].transferPrx(recipient, amount);
    }

    function approveExt(
        uint _i,
        address spender,
        uint256 amount
    ) external returns (bool) {
        uint actor = _i % NUMBER_OF_ACTORS;
        return echidnaProxies[actor].approvePrx(spender, amount);
    }

    function transferFromExt(
        uint _i,
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool) {
        uint actor = _i % NUMBER_OF_ACTORS;
        return echidnaProxies[actor].transferFromPrx(sender, recipient, amount);
    }

    // PriceFeed

    function setPriceExt(uint256 _price) external {
        bool result = mockAggregator.setPrice(_price);
        assert(result);
    }

    // invariants

    function echidna_troves_order() external view returns (bool) {
        address currentTrove = sortedTroves.getFirst();
        address nextTrove = sortedTroves.getNext(currentTrove);

        while (currentTrove != address(0) && nextTrove != address(0)) {
            if (
                troveManager.getNominalICR(nextTrove) <
                troveManager.getNominalICR(currentTrove)
            ) {
                return false;
            }

            currentTrove = nextTrove;
            nextTrove = sortedTroves.getNext(currentTrove);
        }

        return true;
    }

    function echidna_trove_properties() public view returns (bool) {
        address currentTrove = sortedTroves.getFirst();
        while (currentTrove != address(0)) {
            // Status
            if (
                ITroveManager.Status(
                    troveManager.getTroveStatus(currentTrove)
                ) != ITroveManager.Status.active
            ) {
                return false;
            }
            // Uncomment to check that the condition is meaningful
            //else return false;

            // Minimum debt (gas compensation)
            if (
                troveManager.getTroveDebt(currentTrove) < MUSD_GAS_COMPENSATION
            ) {
                return false;
            }
            // Uncomment to check that the condition is meaningful
            //else return false;

            // Stake > 0
            if (troveManager.getTroveStake(currentTrove) == 0) {
                return false;
            }
            // Uncomment to check that the condition is meaningful
            //else return false;

            currentTrove = sortedTroves.getNext(currentTrove);
        }
        return true;
    }

    function echidna_BTC_balances() public view returns (bool) {
        if (address(troveManager).balance > 0) {
            return false;
        }

        if (address(borrowerOperations).balance > 0) {
            return false;
        }

        if (address(activePool).balance != activePool.getCollateralBalance()) {
            return false;
        }

        if (
            address(defaultPool).balance != defaultPool.getCollateralBalance()
        ) {
            return false;
        }

        if (
            address(stabilityPool).balance !=
            stabilityPool.getCollateralBalance()
        ) {
            return false;
        }

        if (address(musd).balance > 0) {
            return false;
        }

        if (address(priceFeed).balance > 0) {
            return false;
        }

        if (address(sortedTroves).balance > 0) {
            return false;
        }

        return true;
    }
}
