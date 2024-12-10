import "./LiquityMath.sol";

library TroveMath {
    uint256 public constant DECIMAL_PRECISION = 1e18;
    uint256 public constant MINUTE_DECAY_FACTOR = 999037758833783000;
    uint256 public constant MCR = 1.1e18; // 110%
    uint256 public constant CCR = 1.5e18; // 150%
    uint256 public constant MUSD_GAS_COMPENSATION = 200e18;
    uint256 public constant BORROWING_FEE_FLOOR = ((DECIMAL_PRECISION * 5) /
        1000);
    uint256 public constant MAX_BORROWING_FEE = (DECIMAL_PRECISION * 5) / 100; // 5%
    uint256 public constant REDEMPTION_FEE_FLOOR =
    (DECIMAL_PRECISION * 5) / 1000; // 0.5%
    /*
     * BETA: 18 digit decimal. Parameter by which to divide the redeemed fraction, in order to calc the new base rate from a redemption.
     * Corresponds to (1 / ALPHA) in the white paper.
     */
    uint256 public constant BETA = 2;

    function calculateDebtAdjustment(
        uint256 _interestOwed,
        uint256 _payment
    )
    external
    returns (uint256 principalAdjustment, uint256 interestAdjustment)
    {
        if (_payment >= _interestOwed) {
            principalAdjustment = _payment - _interestOwed;
            interestAdjustment = _interestOwed;
        } else {
            principalAdjustment = 0;
            interestAdjustment = _payment;
        }
    }

    /* In a full liquidation, returns the values for a trove's coll and debt to be offset, and coll and debt to be
     * redistributed to active troves.
     */
    function getOffsetAndRedistributionVals(
        uint256 _principal,
        uint256 _interest,
        uint256 _coll,
        uint256 _MUSDInStabPool
    )
    external
    view
    returns (
        uint256 debtToOffset,
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
            uint256 interestToOffset = LiquityMath._min(
                _interest,
                _MUSDInStabPool
            );
            uint256 principalToOffset = LiquityMath._min(
                _principal,
                _MUSDInStabPool - interestToOffset
            );
            debtToOffset = principalToOffset + interestToOffset;
            collToSendToSP = (_coll * debtToOffset) / (_principal + _interest);
            interestToRedistribute = _interest - interestToOffset;
            principalToRedistribute = _principal - principalToOffset;
            collToRedistribute = _coll - collToSendToSP;
        } else {
            debtToOffset = 0;
            collToSendToSP = 0;
            principalToRedistribute = _principal;
            interestToRedistribute = _interest;
            collToRedistribute = _coll;
        }
    }

    function calcDecayedBaseRate(uint256 baseRate, uint256 lastFeeOperationTime) external view returns (uint) {
        uint256 minutesPassed = minutesPassedSinceLastFeeOp(lastFeeOperationTime);
        uint256 decayFactor = LiquityMath._decPow(MINUTE_DECAY_FACTOR, minutesPassed);
        return (baseRate * decayFactor) / DECIMAL_PRECISION;
    }

    function calcBorrowingRate(
        uint256 _baseRate
    ) external view returns (uint) {
        return
            LiquityMath._min(
            BORROWING_FEE_FLOOR + _baseRate,
            MAX_BORROWING_FEE
        );
    }

//    function calcBorrowingFee(
//        uint256 _borrowingRate,
//        uint256 _debt
//    ) external view returns (uint) {
//        return (_borrowingRate * _debt) / DECIMAL_PRECISION;
//    }

    function calcRedemptionFee(
        uint256 _redemptionRate,
        uint256 _collateralDrawn
    ) external view returns (uint) {
        uint256 redemptionFee = (_redemptionRate * _collateralDrawn) /
                    DECIMAL_PRECISION;
        require(
            redemptionFee < _collateralDrawn,
            "TroveManager: Fee would eat up all returned collateral"
        );
        return redemptionFee;
    }

    function calcRedemptionRate(
        uint256 _baseRate
    ) external view returns (uint) {
        return
            LiquityMath._min(
            REDEMPTION_FEE_FLOOR + _baseRate,
            DECIMAL_PRECISION // cap at a maximum of 100%
        );
    }

    function minutesPassedSinceLastFeeOp(uint256 lastFeeOperationTime) internal view returns (uint) {
        return (block.timestamp - lastFeeOperationTime) / 1 minutes;
    }
}