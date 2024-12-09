import "./LiquityMath.sol";

library TroveMath {
    uint256 public constant DECIMAL_PRECISION = 1e18;
    uint256 public constant MINUTE_DECAY_FACTOR = 999037758833783000;
    uint256 public constant MCR = 1.1e18; // 110%
    uint256 public constant CCR = 1.5e18; // 150%
    uint256 public constant MUSD_GAS_COMPENSATION = 200e18;

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
    public
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

    function minutesPassedSinceLastFeeOp(uint256 lastFeeOperationTime) internal view returns (uint) {
        return (block.timestamp - lastFeeOperationTime) / 1 minutes;
    }
}