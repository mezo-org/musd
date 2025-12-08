// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "./dependencies/CheckContract.sol";
import "./dependencies/LiquityBase.sol";
import "./dependencies/LiquityMath.sol";
import "./interfaces/ITroveManager.sol";
import "./interfaces/IPriceFeed.sol";
import "./interfaces/IActivePool.sol";
import "./token/IMUSD.sol";

/**
 * @title ReversibleCallOptionManager
 * @notice BTCShield backstop protection system using reversible call options.
 * 
 * Implements a three-phase lifecycle for backstop protection:
 * 1. Initialization: Triggered when health factor < 1
 * 2. Pre-Maturity: Borrower can terminate early by paying C_re
 * 3. Maturity: Supporter exercises or defaults
 *
 * Reference: Qin et al. (2023) - "Mitigating DeFi Liquidations with Reversible Call Options"
 * https://arxiv.org/pdf/2303.15162
 */
contract ReversibleCallOptionManager is 
    CheckContract, 
    LiquityBase, 
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable 
{
    // ============ State Variables ============

    ITroveManager public troveManager;
    IMUSD public musdToken;
    address public gasPoolAddress;

    // Backstop parameters
    // Note: DECIMAL_PRECISION, MUSD_GAS_COMPENSATION, priceFeed, and activePool 
    // are inherited from LiquityBase
    uint256 public constant MIN_LAMBDA = 5e16; // 5% minimum
    uint256 public constant MAX_LAMBDA = 5e17; // 50% maximum
    uint256 public constant MIN_MATURITY = 30 minutes;
    uint256 public constant MAX_MATURITY = 7 days;
    
    // Early termination factor (0 < k_re < 1)
    // Borrower pays: C_re = λ × C_t0 × (1 + I_L) × k_re
    uint256 public k_re;

    // Safety margin for lambda calculation
    uint256 public safetyMargin;

    // ============ Enums ============

    enum OptionPhase {
        None,           // No active option
        Initialization, // Support being gathered
        PreMaturity,    // Active, can be terminated early
        Maturity,       // Ready for exercise or default
        Exercised,      // Supporter took over position
        Terminated,     // Borrower terminated early
        Defaulted       // Supporter defaulted
    }

    // ============ Structs ============

    struct BackstopOption {
        address borrower;           // Trove owner
        address supporter;          // Backstop supporter
        uint256 collateralAtStart;  // C_t0: Initial collateral value
        uint256 debtAtStart;        // D_t0: Initial debt
        uint256 lambda;             // λ: Premium factor
        uint256 premiumPaid;        // φ = λ × C_t0: Actual premium paid
        uint256 strikeCR;           // K: Strike collateral ratio (ICR threshold)
        uint256 startTime;          // t0: Option creation time
        uint256 maturityTime;       // T: Expiry timestamp
        uint256 interestRate;       // I_L: Borrowing interest rate
        OptionPhase phase;          // Current phase
        bool exists;                // Option exists flag
    }

    // struct LambdaCalculation {
    //     uint256 spotPrice;          // p_t0: Current BTC price
    //     uint256 strikePrice;        // K: Liquidation price
    //     uint256 timeToMaturity;     // T in seconds
    //     uint256 riskFreeRate;       // r_f: Risk-free rate (annualized)
    //     uint256 volatility;         // σ: Implied volatility
    //     uint256 lambdaStar;         // λ*: Optimal lambda
    // }

    // ============ Mappings ============

    mapping(address => BackstopOption) public options; // borrower => Option
    mapping(address => uint256) public supporterBalances; // supporter => locked collateral
    
    // Analytics tracking
    mapping(address => uint256) public totalPremiumsCollected;
    mapping(address => uint256) public successfulExercises;
    mapping(address => uint256) public earlyTerminations;

    // ============ Events ============

    event OptionInitialized(
        address indexed borrower,
        address indexed supporter,
        uint256 lambda,
        uint256 premiumPaid,
        uint256 strikeCR,
        uint256 maturityTime
    );

    event OptionExercised(
        address indexed borrower,
        address indexed supporter,
        uint256 collateralValue,
        uint256 debtValue,
        uint256 profit
    );

    event OptionTerminated(
        address indexed borrower,
        uint256 terminationFee,
        uint256 supporterRefund
    );

    event OptionDefaulted(
        address indexed borrower,
        address indexed supporter,
        uint256 premiumLost
    );

    event ParametersUpdated(
        uint256 k_re,
        uint256 safetyMargin
    );

    event LambdaCalculated(
        address indexed borrower,
        // uint256 lambdaStar,
        uint256 actualLambda
    );

    // ============ Modifiers ============

    modifier optionExists(address _borrower) {
        require(options[_borrower].exists, "RCO: Option does not exist");
        _;
    }

    modifier inPhase(address _borrower, OptionPhase _phase) {
        require(options[_borrower].phase == _phase, "RCO: Invalid phase");
        _;
    }

    modifier onlyBorrower(address _borrower) {
        require(msg.sender == _borrower, "RCO: Only borrower");
        _;
    }

    modifier onlySupporter(address _borrower) {
        require(msg.sender == options[_borrower].supporter, "RCO: Only supporter");
        _;
    }

    // ============ Initialization ============

    function initialize() external initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        
        // Set default parameters
        k_re = 8e17; // 0.8 (80%)
        safetyMargin = 1e17; // 10%
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function setAddresses(
        address _troveManager,
        address _priceFeed,
        address _activePool,
        address _musdToken,
        address _gasPool
    ) external onlyOwner {
        checkContract(_troveManager);
        checkContract(_priceFeed);
        checkContract(_activePool);
        checkContract(_musdToken);
        checkContract(_gasPool);
        
        troveManager = ITroveManager(_troveManager);
        priceFeed = IPriceFeed(_priceFeed);
        activePool = IActivePool(_activePool);
        musdToken = IMUSD(_musdToken);
        gasPoolAddress = _gasPool;

        renounceOwnership();
    }

    // ============ Core Functions ============

    /**
     * @notice Initialize a backstop option for an undercollateralized trove
     * @param _borrower Trove owner address
     * @param _maturityDuration Time until maturity (seconds)
     */
    function initializeOption(
        address _borrower,
        uint256 _maturityDuration
        
    ) external payable nonReentrant {
        require(_borrower != address(0), "RCO: Invalid borrower");
        require(_maturityDuration >= MIN_MATURITY && _maturityDuration <= MAX_MATURITY, 
            "RCO: Invalid maturity");
        require(!options[_borrower].exists || 
                options[_borrower].phase == OptionPhase.Exercised ||
                options[_borrower].phase == OptionPhase.Terminated ||
                options[_borrower].phase == OptionPhase.Defaulted,
            "RCO: Active option does not exist");

        // Get current trove state
        uint256 price = priceFeed.fetchPrice();
        require(troveManager.getCurrentICR(_borrower, price) <= MCR, "RCO: Trove is healthy");

        // Get trove collateral and debt
        (
            uint256 coll,
            uint256 principal,
            uint256 interest,
            ,
            ,
        ) = troveManager.getEntireDebtAndColl(_borrower);
        
        uint256 collateralValue = (coll * price) / DECIMAL_PRECISION;

        // Calculate lambda using risk-adjusted formula
        uint256 lambda = _calculateLambda(collateralValue);

        // Calculate required premium: φ = λ × C_t0
        uint256 requiredPremium = (lambda * collateralValue) / DECIMAL_PRECISION;
        require(msg.value >= requiredPremium, "RCO: Insufficient premium");

        // Calculate maturity time once
        uint256 maturityTime = block.timestamp + _maturityDuration;

        // Create option
        options[_borrower] = BackstopOption({
            borrower: _borrower,
            supporter: msg.sender,
            collateralAtStart: collateralValue,
            debtAtStart: principal + interest,
            lambda: lambda,
            premiumPaid: msg.value,
            strikeCR: MCR,
            startTime: block.timestamp,
            maturityTime: maturityTime,
            interestRate: uint256(troveManager.getTroveInterestRate(_borrower)),
            phase: OptionPhase.PreMaturity,
            exists: true
        });

        supporterBalances[msg.sender] += msg.value;
        totalPremiumsCollected[msg.sender] += msg.value;

        emit OptionInitialized(
            _borrower,
            msg.sender,
            lambda,
            msg.value,
            MCR,
            maturityTime
        );

        emit LambdaCalculated(_borrower, lambda);
    }

    /**
     * @notice Borrower terminates option early by paying C_re
     * C_re = λ × C_t0 × (1 + I_L) × k_re
     */
    function terminateEarly(address _borrower)
        external
        payable
        nonReentrant
        optionExists(_borrower)
        inPhase(_borrower, OptionPhase.PreMaturity)
        onlyBorrower(_borrower)
    {
        BackstopOption storage option = options[_borrower];
        require(block.timestamp < option.maturityTime, "RCO: Option matured");

        // Calculate termination fee: C_re = λ × C_t0 × (1 + I_L) × k_re
        uint256 timeElapsed = block.timestamp - option.startTime;
        uint256 accruedInterest = (option.interestRate * timeElapsed) / (365 days);
        uint256 interestFactor = DECIMAL_PRECISION + accruedInterest;
        
        uint256 terminationFee = (option.lambda * option.collateralAtStart * interestFactor * k_re) 
            / (DECIMAL_PRECISION * DECIMAL_PRECISION * DECIMAL_PRECISION);

        require(msg.value >= terminationFee, "RCO: Insufficient termination fee");

        // Refund to supporter: premium + termination fee
        uint256 supporterRefund = option.premiumPaid + msg.value;
        
        supporterBalances[option.supporter] -= option.premiumPaid;
        option.phase = OptionPhase.Terminated;
        earlyTerminations[option.supporter]++;

        // Transfer refund to supporter
        (bool sent, ) = option.supporter.call{value: supporterRefund}("");
        require(sent, "RCO: Refund transfer failed");

        emit OptionTerminated(_borrower, terminationFee, supporterRefund);
    }



    /**
     * @notice Supporter exercises option at maturity
     * 
     * Implements Definition 1 from the paper:
     * At time T, the buyer CB can acquire N units of asset A at strike price K.
     * 
     * Payoff for CB (Supporter):
     *   P_CB = A(T) - K - φ  if A(T) ≥ K (exercise is profitable)
     *   P_CB = -φ            if A(T) < K (option expires worthless)
     * 
     * Where:
     *   A(T) = Current collateral value at maturity
     *   K = Strike price (total debt to be paid)
     *   φ = Premium paid at t0
     * 
     * The supporter acts rationally and only exercises if A(T) ≥ K.
     * Exercise mechanics:
     * 1. Supporter pays K (total debt) in mUSD
     * 2. Receives N units of collateral (full trove collateral)
     * 3. Net payoff = Collateral Value - Strike Price - Premium
     */
    function exercise(address _borrower)
        external
        nonReentrant
        optionExists(_borrower)
        onlySupporter(_borrower)
    {
        BackstopOption storage option = options[_borrower];
        require(block.timestamp >= option.maturityTime, "RCO: Not matured");
        require(option.phase == OptionPhase.PreMaturity, "RCO: Invalid phase");
        require(option.phase != OptionPhase.Terminated, "RCO: Option terminated");

        uint256 price = priceFeed.fetchPrice();

        // Get current trove state at maturity T
        (
            uint256 coll,              // N units of asset A
            uint256 principal,
            uint256 interest,
            ,
            ,
        ) = troveManager.getEntireDebtAndColl(_borrower);
        
        // A(T) = Current collateral value at maturity
        uint256 collateralValue = (coll * price) / DECIMAL_PRECISION;
        
        // K = Strike price (total debt that must be paid to acquire the collateral)
        uint256 strikePrice = principal + interest;

        // Rational behavior: Only exercise if A(T) ≥ K (profitable)
        // If A(T) < K, supporter should not exercise (loses more by exercising)
        require(collateralValue >= strikePrice, "RCO: Exercise not profitable, A(T) < K");

        // Supporter must have K amount of mUSD to pay the strike price
        // Note: strikePrice includes gas compensation, but supporter only needs to pay (strikePrice - MUSD_GAS_COMPENSATION)
        // because gas compensation is in the gas pool
        uint256 debtToPayBySupporter = strikePrice - MUSD_GAS_COMPENSATION;
        require(musdToken.balanceOf(msg.sender) >= debtToPayBySupporter, "RCO: Insufficient mUSD for strike");

        // Calculate payoff: P_CB = A(T) - K - φ
        // Note: Premium φ was already paid at t0, so actual payoff at T is A(T) - K
        uint256 payoffBeforePremium = collateralValue - strikePrice;
        
        // Total profit/loss including premium paid at t0
        int256 netPayoff = int256(payoffBeforePremium) - int256(option.premiumPaid);

        // Update option state
        option.phase = OptionPhase.Exercised;
        supporterBalances[option.supporter] -= option.premiumPaid;
        successfulExercises[option.supporter]++;

        // Execute the option (following BorrowerOperations._closeTrove pattern):
        
        // Step 1: Burn the supporter's mUSD to pay off debt (excluding gas compensation)
        musdToken.burn(msg.sender, debtToPayBySupporter);
        
        // Step 2: Decrease the active pool debt accounting
        uint256 interestOwed = troveManager.getTroveInterestOwed(_borrower);
        activePool.decreaseDebt(
            strikePrice - MUSD_GAS_COMPENSATION - interestOwed,  // principal portion
            interestOwed                                          // interest portion
        );

        // Step 3: Close the trove in TroveManager
        troveManager.removeStake(_borrower);
        troveManager.closeTrove(_borrower);

        // Step 4: Burn the gas compensation from the gas pool
        // (The gas compensation was minted to gas pool when trove opened)
        activePool.decreaseDebt(MUSD_GAS_COMPENSATION, 0);
        musdToken.burn(gasPoolAddress, MUSD_GAS_COMPENSATION);

        // Step 5: Transfer N units of asset A (collateral) to supporter
        activePool.sendCollateral(msg.sender, coll);

        emit OptionExercised(
            _borrower,
            option.supporter,
            collateralValue,
            strikePrice,
            uint256(netPayoff > 0 ? netPayoff : int256(0))
        );
    }






    /**
     * @notice Supporter defaults on option (doesn't exercise)
     * Premium is forfeited, liquidation proceeds normally
     */
    function defaultOption(address _borrower)
        external
        nonReentrant
        optionExists(_borrower)
    {
        BackstopOption storage option = options[_borrower];
        require(block.timestamp >= option.maturityTime, "RCO: Not matured");
        require(option.phase == OptionPhase.PreMaturity, "RCO: Invalid phase");
        require(msg.sender == option.supporter || msg.sender == _borrower, 
            "RCO: Only supporter or borrower");

        // Supporter loses premium, trove proceeds to liquidation
        option.phase = OptionPhase.Defaulted;
        supporterBalances[option.supporter] -= option.premiumPaid;

        // Premium goes to protocol/borrower as compensation
        (bool sent, ) = _borrower.call{value: option.premiumPaid}("");
        require(sent, "RCO: Premium transfer failed");

        emit OptionDefaulted(_borrower, option.supporter, option.premiumPaid);
    }

    // ============ Lambda Calculation ============

    /**
     * @notice Calculate lambda using Risk-Adjusted Collateral Formula
     * λ = (Expected Loss + Safety Margin) / C_t0
     * 
     * @param _collateralValue Current collateral value in USD
     * @return lambda Risk-adjusted premium factor (scaled by DECIMAL_PRECISION)
     */
    function _calculateLambda(uint256 _collateralValue) internal pure returns (uint256) {
        // Risk-Adjusted Collateral Formula
        // Assumes 85% liquidation threshold with 90% recovery
        uint256 liquidationThreshold = 85e16; // 85%
        uint256 recoveryFraction = 90e16; // 90%
        
        // Expected value at liquidation
        uint256 liquidationValue = (liquidationThreshold * _collateralValue) / DECIMAL_PRECISION;
        
        // Expected recovery from liquidation
        uint256 recoveryValue = (liquidationValue * recoveryFraction) / DECIMAL_PRECISION;
        
        // Expected loss = Initial Value - Recovery Value
        uint256 expectedLoss = _collateralValue > recoveryValue ? _collateralValue - recoveryValue : 0;
        
        // Add safety margin to account for market volatility
        // Using fixed 10% safety margin
        uint256 safetyMarginAmount = (10e16 * _collateralValue) / DECIMAL_PRECISION;
        
        // Total risk = Expected Loss + Safety Margin
        uint256 totalRisk = expectedLoss + safetyMarginAmount;
        
        // λ = Total Risk / Initial Collateral Value
        uint256 lambda = (totalRisk * DECIMAL_PRECISION) / _collateralValue;
        
        // Clamp to valid range [MIN_LAMBDA, MAX_LAMBDA]
        if (lambda < MIN_LAMBDA) lambda = MIN_LAMBDA;
        if (lambda > MAX_LAMBDA) lambda = MAX_LAMBDA;
        
        return lambda;
    }

    /**
     * @notice Calculate optimal lambda (λ*) using adapted Black-Scholes
     * λ* = (p_t0 e^(-r_f T) N(d1) - K e^(-I_l T) N(d2)) / (C_t0 · p_t0)
     * 
     * Simplified implementation - production would use full options pricing
     */
    // function _calculateOptimalLambda(
    //     address _borrower,
    //     uint256 _price,
    //     uint256 _maturityDuration
    // ) internal view returns (uint256) {
    //     (
    //         uint256 coll,
    //         uint256 principal,
    //         uint256 interest,
    //         ,
    //         ,
    //     ) = troveManager.getEntireDebtAndColl(_borrower);
        
    //     uint256 totalDebt = principal + interest;
    //     uint256 collateralValue = (coll * _price) / DECIMAL_PRECISION;

    //     // Calculate expected liquidation loss
    //     // Loss = Liquidation Penalty + Gas Costs
    //     uint256 liquidationPenalty = (collateralValue * 5) / 100; // 5% penalty
    //     uint256 estimatedGasCost = 5e17; // 0.5 ETH equivalent
    //     uint256 expectedLoss = liquidationPenalty + estimatedGasCost;

    //     // Add safety margin
    //     uint256 totalRisk = expectedLoss + ((expectedLoss * safetyMargin) / DECIMAL_PRECISION);

    //     // λ = (Expected Loss + Safety Margin) / C_t0
    //     uint256 lambda = (totalRisk * DECIMAL_PRECISION) / collateralValue;

    //     // Clamp to valid range
    //     if (lambda < MIN_LAMBDA) lambda = MIN_LAMBDA;
    //     if (lambda > MAX_LAMBDA) lambda = MAX_LAMBDA;

    //     return lambda;
    // }

    /**
     * @notice Calculate lambda star using full Black-Scholes adaptation
     * For advanced pricing - requires volatility oracle
     */
    // function calculateLambdaStar(
    //     uint256 _spotPrice,
    //     uint256 _strikePrice,
    //     uint256 _timeToMaturity,
    //     uint256 _riskFreeRate,
    //     uint256 _volatility,
    //     uint256 _collateralValue
    // ) public pure returns (uint256) {
    //     // Simplified Black-Scholes for lambda calculation
    //     // Full implementation would calculate N(d1) and N(d2)
        
    //     // For now, use approximation based on moneyness
    //     uint256 moneyness = (_spotPrice * DECIMAL_PRECISION) / _strikePrice;
        
    //     uint256 timeValue = (_timeToMaturity * _volatility) / (365 days);
    //     uint256 optionValue = (moneyness * timeValue) / DECIMAL_PRECISION;
        
    //     uint256 lambdaStar = (optionValue * DECIMAL_PRECISION) / _collateralValue;
        
    //     return lambdaStar;
    // }

    // ============ View Functions ============

    function getOption(address _borrower) external view returns (BackstopOption memory) {
        return options[_borrower];
    }

    function getOptionPhase(address _borrower) external view returns (OptionPhase) {
        return options[_borrower].phase;
    }

    function isOptionActive(address _borrower) external view returns (bool) {
        BackstopOption memory option = options[_borrower];
        return option.exists && 
               (option.phase == OptionPhase.PreMaturity) &&
               block.timestamp < option.maturityTime;
    }

    function getTerminationFee(address _borrower) external view returns (uint256) {
        BackstopOption memory option = options[_borrower];
        if (!option.exists || option.phase != OptionPhase.PreMaturity) {
            return 0;
        }

        uint256 timeElapsed = block.timestamp - option.startTime;
        uint256 accruedInterest = (option.interestRate * timeElapsed) / (365 days);
        uint256 interestFactor = DECIMAL_PRECISION + accruedInterest;
        
        return (option.lambda * option.collateralAtStart * interestFactor * k_re) 
            / (DECIMAL_PRECISION * DECIMAL_PRECISION * DECIMAL_PRECISION);
    }

    function getSupporterStats(address _supporter) external view returns (
        uint256 balance,
        uint256 totalPremiums,
        uint256 exercises,
        uint256 terminations
    ) {
        return (
            supporterBalances[_supporter],
            totalPremiumsCollected[_supporter],
            successfulExercises[_supporter],
            earlyTerminations[_supporter]
        );
    }

    // ============ Admin Functions ============

    function setParameters(
        uint256 _k_re,
        uint256 _safetyMargin
    ) external onlyOwner {
        require(_k_re > 0 && _k_re < DECIMAL_PRECISION, "RCO: Invalid k_re");
        require(_safetyMargin <= 5e17, "RCO: Safety margin too high"); // Max 50%
        
        k_re = _k_re;
        safetyMargin = _safetyMargin;

        emit ParametersUpdated(_k_re, _safetyMargin);
    }

    // Allow contract to receive ETH
    receive() external payable {}
}