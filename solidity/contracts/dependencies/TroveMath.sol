library TroveMath {
    function calculateDebtAdjustment(
        uint256 _interestOwed,
        uint256 _payment
    )
    public
    pure
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

}