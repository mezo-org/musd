// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./BorrowerOperationsFuzzTester.sol";
import "./IBorrowerOperationsFuzzTester.sol";
import "../BorrowerOperationsSignatures.sol";
import "../interfaces/IBorrowerOperationsSignatures.sol";
import "../InterestRateManager.sol";
import "../interfaces/IInterestRateManager.sol";
import "./TroveManagerFuzzTester.sol";
import "./ITroveManagerFuzzTester.sol";
import "../StabilityPool.sol";
import "../interfaces/IStabilityPool.sol";
import "../token/MUSD.sol";
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
import "../GovernableVariables.sol";
import "../interfaces/IGovernableVariables.sol";
import "../PriceFeed.sol";
import "../interfaces/IPriceFeed.sol";
import "../HintHelpers.sol";
import "../interfaces/IHintHelpers.sol";
import "./EchidnaProxy.sol";
import "../tests/MUSDTester.sol";

// Run with
// `rm -rf echidna-corpus && echidna . --config echidna.yaml --contract EchidnaTest`
// from the /solidity directory
contract EchidnaTest {
    IInterestRateManager private immutable interestRateManager;
    IBorrowerOperationsFuzzTester private immutable borrowerOperations;
    IBorrowerOperationsSignatures
        private immutable borrowerOperationsSignatures;
    ITroveManagerFuzzTester private immutable troveManager;
    IStabilityPool private immutable stabilityPool;
    MUSD private immutable musd;
    MockAggregator private immutable mockAggregator;
    ICollSurplusPool private immutable collSurplusPool;
    IDefaultPool private immutable defaultPool;
    IActivePool private immutable activePool;
    IPCV private immutable pcv;
    ISortedTroves private immutable sortedTroves;
    IGasPool private immutable gasPool;
    IGovernableVariables private immutable governableVariables;
    IPriceFeed private immutable priceFeed;
    IHintHelpers private immutable hintHelpers;

    uint public constant NUMBER_OF_ACTORS = 10;
    uint public constant INITIAL_BALANCE = 1e24;

    EchidnaProxy[NUMBER_OF_ACTORS] public echidnaProxies;

    uint private immutable MCR;
    uint private immutable CCR;
    uint private immutable MUSD_GAS_COMPENSATION;

    uint private numberOfTroves;

    // Mimic the hardhat deploy process
    constructor() payable {
        address admin = address(new ProxyAdmin(msg.sender));

        borrowerOperations = IBorrowerOperationsFuzzTester(
            address(
                new TransparentUpgradeableProxy(
                    address(new BorrowerOperationsFuzzTester()),
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
        troveManager = ITroveManagerFuzzTester(
            address(
                new TransparentUpgradeableProxy(
                    address(new TroveManagerFuzzTester()),
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
        musd = MUSD(new MUSDTester());
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
        governableVariables = IGovernableVariables(
            address(
                new TransparentUpgradeableProxy(
                    address(new GovernableVariables()),
                    admin,
                    abi.encodeWithSelector(
                        GovernableVariables.initialize.selector,
                        7200
                    )
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
        hintHelpers = IHintHelpers(
            address(
                new TransparentUpgradeableProxy(
                    address(new HintHelpers()),
                    admin,
                    abi.encodeWithSelector(HintHelpers.initialize.selector)
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
        hintHelpers.setAddresses(
            address(borrowerOperations),
            address(sortedTroves),
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
            [
                address(activePool),
                address(borrowerOperationsSignatures),
                address(collSurplusPool),
                address(defaultPool),
                address(gasPool),
                address(governableVariables),
                address(interestRateManager),
                address(musd),
                address(pcv),
                address(priceFeed),
                address(sortedTroves),
                address(stabilityPool),
                address(troveManager)
            ]
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
            address(governableVariables),
            address(interestRateManager),
            address(musd),
            address(pcv),
            address(priceFeed),
            address(sortedTroves),
            address(stabilityPool)
        );
        gasPool.setAddresses(address(musd), address(troveManager));
        musd.initialize(
            address(troveManager),
            address(stabilityPool),
            address(borrowerOperations),
            address(interestRateManager)
        );
        sortedTroves.setParams(
            0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff,
            address(borrowerOperations),
            address(troveManager)
        );

        // slither-disable-start arbitrary-send-eth
        // slither-disable-start low-level-calls
        // slither-disable-start calls-loop
        for (uint i = 0; i < NUMBER_OF_ACTORS; i++) {
            echidnaProxies[i] = new EchidnaProxy(
                troveManager,
                borrowerOperations,
                stabilityPool,
                musd
            );

            (bool success, ) = address(echidnaProxies[i]).call{
                value: INITIAL_BALANCE
            }("");
            require(success, "proxy funding must work");
        }
        // slither-disable-end calls-loop
        // slither-disable-end low-level-calls
        // slither-disable-end arbitrary-send-eth

        MCR = borrowerOperations.getMCR();
        CCR = borrowerOperations.getCCR();
        MUSD_GAS_COMPENSATION = borrowerOperations.getGasComp();

        // Set all of the admin permissions to the test contract
        pcv.initializeDebt();
        pcv.setFeeRecipient(msg.sender);
        pcv.setFeeSplit(50);
        pcv.startChangingRoles(address(this), address(this));
        pcv.finalizeChangingRoles();
        pcv.addRecipientToWhitelist(address(this));
    }

    // TroveManager

    function liquidateExt(uint _i, uint _j) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        uint debtor = _j % NUMBER_OF_ACTORS;
        echidnaProxies[actor].liquidatePrx(address(echidnaProxies[debtor]));
    }

    // Raw method for fuzz testing
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

    // Reliable method, otherwise hitting the correct NICR doesn't happen in a
    // normal amount of runs and the normal redemption flow is not tested.
    function redeemCollateralSafeExt(uint _i, uint _MUSDAmount) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        EchidnaProxy echidnaProxy = echidnaProxies[actor];
        uint256 amount = _MUSDAmount % musd.balanceOf(address(echidnaProxy));
        uint price = priceFeed.fetchPrice();
        (
            address firstRedemptionHint,
            uint256 partialRedemptionHintNICR,
            uint256 truncatedAmount
        ) = hintHelpers.getRedemptionHints(
                amount,
                price,
                sortedTroves.getSize() * 15
            );
        echidnaProxy.redeemCollateralPrx(
            truncatedAmount,
            firstRedemptionHint,
            address(0),
            address(0),
            partialRedemptionHintNICR,
            0
        );
    }

    // Reliable method to use an actor's whole balance for redemption. Makes
    // testing mutli-redemptions much more probable.
    function redeemCollateralSafeEverythingExt(uint _i) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        EchidnaProxy echidnaProxy = echidnaProxies[actor];
        uint256 amount = musd.balanceOf(address(echidnaProxy));
        uint price = priceFeed.fetchPrice();
        (
            address firstRedemptionHint,
            uint256 partialRedemptionHintNICR,
            uint256 truncatedAmount
        ) = hintHelpers.getRedemptionHints(
                amount,
                price,
                sortedTroves.getSize() * 15
            );
        echidnaProxy.redeemCollateralPrx(
            truncatedAmount,
            firstRedemptionHint,
            address(0),
            address(0),
            partialRedemptionHintNICR,
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
        require(price > 0, "price must be at least 0");
        uint minBTC = (ratio * MUSD_GAS_COMPENSATION) / price;
        require(actorBalance > minBTC, "balance must be at least minimum");
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

    // solhint-disable-next-line ordering
    function openTroveExt(uint _i, uint _BTC, uint _MUSDAmount) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        EchidnaProxy echidnaProxy = echidnaProxies[actor];
        uint actorBalance = address(echidnaProxy).balance;

        // we pass in CCR instead of MCR in case it’s the first one
        uint BTC = getAdjustedBTC(actorBalance, _BTC, CCR);
        uint MUSDAmount = getAdjustedMUSD(BTC, _MUSDAmount, CCR);

        echidnaProxy.openTrovePrx(BTC, MUSDAmount, address(0), address(0));

        // slither-disable-next-line reentrancy-benign
        numberOfTroves = troveManager.getTroveOwnersCount();
        assert(numberOfTroves > 0);
    }

    // Reliable method to open a trove. Takes out a loan of [1800, 101800] MUSD
    // with a [110, 1100] collateral ratio.
    function openTroveSafeExt(
        uint _i,
        uint _extraMUSD,
        uint _collatRatio
    ) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        EchidnaProxy echidnaProxy = echidnaProxies[actor];
        uint addedMUSD = (_extraMUSD % 100_000) * 1e18;
        uint musdAmount = 1800e18 + addedMUSD;
        uint collatRatio = 110 + (_collatRatio % 1000);
        uint price = priceFeed.fetchPrice();
        uint amountWithFees = musdAmount + musdAmount / 200 + 200e18;

        uint BTC = (amountWithFees * collatRatio * 1e18) / (100 * price);

        echidnaProxy.openTrovePrx(BTC, musdAmount, address(0), address(0));
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

    function refinanceExt(uint _i) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].refinancePrx();
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

    // Reliable method to close a trove. Loops through actors until one of them
    // can send the payer enough money to close their trove.
    function closeTroveSafeExt(uint _i) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        EchidnaProxy closer = echidnaProxies[actor];
        uint256 debt = troveManager.getTroveDebt(address(closer));
        if (debt == 0) {
            return;
        }
        if (musd.balanceOf(address(closer)) < debt + 10) {
            uint256 need = debt + 10 - musd.balanceOf(address(closer));
            uint count = 0;
            uint payerIndex = (_i + 1) % NUMBER_OF_ACTORS;
            address payer = address(echidnaProxies[payerIndex]);
            // slither-disable-start calls-loop
            while (musd.balanceOf(payer) < need && count < NUMBER_OF_ACTORS) {
                payerIndex++;
                payer = address(echidnaProxies[payerIndex]);
                count++;
            }
            // slither-disable-end calls-loop

            // slither-disable-next-line unused-return
            echidnaProxies[payerIndex].transferPrx(
                address(echidnaProxies[actor]),
                need
            );
        }

        closer.closeTrovePrx();
    }

    // Reliable method to successfully adjust troves.
    function adjustTroveExt(
        uint _i,
        uint _BTC,
        uint _collWithdrawal,
        uint _debtChange,
        bool _isDebtIncrease
    ) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        EchidnaProxy echidnaProxy = echidnaProxies[actor];
        uint actorBalance = address(echidnaProxy).balance;

        uint BTC = getAdjustedBTC(actorBalance, _BTC, MCR);
        uint debtChange = _debtChange;
        if (_isDebtIncrease) {
            debtChange = getAdjustedMUSD(BTC, uint(_debtChange), MCR);
        }
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
    ) external {
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

    function claimCollateralExt(uint _i) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].claimCollateralPrx();
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

    function withdrawCollateralGainToTroveExt(uint _i) external {
        uint actor = _i % NUMBER_OF_ACTORS;
        echidnaProxies[actor].withdrawCollateralGainToTrovePrx();
    }

    function setRefinancingFeePercentageExt(
        uint256 _refinanceFeePercentage
    ) external {
        borrowerOperations.setRefinancingFeePercentage(
            uint8(_refinanceFeePercentage % 101)
        );
    }

    function approveMinNetDebtExt() external {
        borrowerOperations.approveMinNetDebt();
    }

    function proposeMinNetDebtExt(uint256 _minNetDebt) external {
        borrowerOperations.proposeMinNetDebt(_minNetDebt);
    }

    // Interest Rate Manager

    function proposeInterestRateExt(uint256 _rate) external {
        interestRateManager.proposeInterestRate(uint16(_rate % 11_000));
    }

    function approveInterestRateExt() external {
        interestRateManager.approveInterestRate();
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

    function transferToOtherUser(
        uint _senderIndex,
        uint _receiverIndex,
        uint256 _amount
    ) external returns (bool) {
        uint actor = _senderIndex % NUMBER_OF_ACTORS;
        uint recipient = _receiverIndex % NUMBER_OF_ACTORS;
        return
            echidnaProxies[actor].transferPrx(
                address(echidnaProxies[recipient]),
                _amount
            );
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

    // PCV

    function depositToStabilityPoolExt(uint _amount) external {
        pcv.depositToStabilityPool(_amount);
    }

    function withdrawFromStabilityPoolExt(uint _amount) external {
        pcv.withdrawFromStabilityPool(_amount);
    }

    function withdrawCollateralExt(uint _amount) external {
        pcv.withdrawCollateral(msg.sender, _amount);
    }

    function withdrawMUSDExt(uint _amount) external {
        pcv.withdrawMUSD(msg.sender, _amount);
    }

    function withdrawMUSDSafeExt(uint _amount) external {
        uint256 bal = musd.balanceOf(address(pcv));
        uint256 amount = _amount % bal;
        pcv.withdrawMUSD(address(this), amount);
    }

    function distributeMUSDExt(uint _amount) external {
        pcv.distributeMUSD(_amount);
    }

    function distributeMUSDSafeExt(uint _amount) external {
        uint256 amount = _amount % musd.balanceOf(address(pcv));
        pcv.distributeMUSD(amount);
    }

    function distributeMUSDFullExt() external {
        pcv.distributeMUSD(musd.balanceOf(address(pcv)));
    }

    function payDebtExt() external {
        uint musdAmount = pcv.debtToPay() * 2;

        uint i = 0;
        EchidnaProxy actor = echidnaProxies[i];
        // slither-disable-start calls-loop
        while (
            i < NUMBER_OF_ACTORS &&
            troveManager.getTroveDebt(address(actor)) > 0
        ) {
            i++;
            actor = echidnaProxies[i];
        }
        // slither-disable-end calls-loop

        uint price = priceFeed.fetchPrice();

        uint BTC = (musdAmount * 2e18) / price;

        actor.openTrovePrx(BTC, musdAmount, address(0), address(0));

        // slither-disable-next-line unused-return
        actor.transferPrx(address(pcv), musdAmount);
    }

    // debugging

    function musdBalance(uint _i) external view returns (uint256) {
        uint actor = _i % NUMBER_OF_ACTORS;
        return musd.balanceOf(address(echidnaProxies[actor]));
    }

    function getEntireDebtAndColl(
        uint _i
    )
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        uint actor = _i % NUMBER_OF_ACTORS;
        // slither-disable-start unused-return
        return
            troveManager.getEntireDebtAndColl(address(echidnaProxies[actor]));
        // slither-disable-end unused-return
    }

    function getEntireSystemColl() external view returns (uint256) {
        return troveManager.viewGetEntireSystemColl();
    }

    function getEntireSystemDebt() external view returns (uint256) {
        return troveManager.viewGetEntireSystemDebt();
    }

    // invariants

    // solhint-disable-next-line func-name-mixedcase
    function echidna_troves_order() external view returns (bool) {
        address currentTrove = sortedTroves.getFirst();
        address nextTrove = sortedTroves.getNext(currentTrove);

        // slither-disable-start calls-loop
        while (currentTrove != address(0) && nextTrove != address(0)) {
            if (
                troveManager.getNominalICR(nextTrove) >
                troveManager.getNominalICR(currentTrove)
            ) {
                return false;
            }

            currentTrove = nextTrove;
            nextTrove = sortedTroves.getNext(currentTrove);
        }
        // slither-disable-end calls-loop

        return true;
    }

    // solhint-disable-next-line func-name-mixedcase
    function echidna_trove_properties() public view returns (bool) {
        address currentTrove = sortedTroves.getFirst();
        // slither-disable-start calls-loop
        while (currentTrove != address(0)) {
            // Status
            if (
                ITroveManager.Status(
                    troveManager.getTroveStatus(currentTrove)
                ) != ITroveManager.Status.active
            ) {
                return false;
            }

            // slither-disable-start unused-return
            (, uint256 principal, uint256 interest, , , ) = troveManager
                .getEntireDebtAndColl(currentTrove);
            // slither-disable-end unused-return

            // You can not have a trove with 0 principal and some interest
            if (principal == 0) {
                if (interest > 0) {
                    return false;
                }
            }

            // Minimum debt (gas compensation)
            if (
                troveManager.getTroveDebt(currentTrove) < MUSD_GAS_COMPENSATION
            ) {
                return false;
            }

            // Stake > 0
            if (troveManager.getTroveStake(currentTrove) == 0) {
                return false;
            }

            currentTrove = sortedTroves.getNext(currentTrove);
        }
        // slither-disable-end calls-loop
        return true;
    }

    // solhint-disable-next-line func-name-mixedcase
    function echidna_sum_of_debt() public view returns (bool) {
        uint256 troveDebt = 0;
        uint256 troveColl = 0;
        address currentTrove = sortedTroves.getFirst();
        // slither-disable-start calls-loop
        while (currentTrove != address(0)) {
            // slither-disable-start unused-return
            (
                uint256 coll,
                uint256 principal,
                uint256 interest,
                ,
                ,

            ) = troveManager.getEntireDebtAndColl(currentTrove);
            // slither-disable-end unused-return
            troveDebt += principal + interest;
            troveColl += coll;

            currentTrove = sortedTroves.getNext(currentTrove);
        }
        // slither-disable-end calls-loop

        uint256 systemDebt = troveManager.viewGetEntireSystemDebt();
        systemDebt -=
            (troveManager.getLastPrincipalError_Redistribution() +
                troveManager.getLastInterestError_Redistribution()) /
            1e18;

        bool debtMatches = true;
        if (systemDebt > troveDebt) {
            debtMatches = systemDebt - troveDebt <= 100;
        } else {
            debtMatches = troveDebt - systemDebt <= 100;
        }

        uint256 systemColl = troveManager.viewGetEntireSystemColl();
        systemColl -=
            troveManager.getLastCollateralError_Redistribution() /
            1e18;

        bool collMatches = true;
        if (systemColl > troveColl) {
            collMatches = systemColl - troveColl <= 100;
        } else {
            collMatches = troveColl - systemColl <= 100;
        }

        return collMatches && debtMatches;
    }

    // solhint-disable-next-line func-name-mixedcase
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
