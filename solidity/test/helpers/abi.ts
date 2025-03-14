export const TROVE_UPDATED_ABI = [
  "event TroveUpdated(address indexed borrower, uint256 principal, uint256 interest, uint256 coll, uint256 stake, uint8 operation)",
]

export const LIQUIDATION_ABI = [
  "event Liquidation(uint256 _liquidatedPrincipal, uint256 _liquidatedInterest, uint256 _liquidatedColl, uint256 _collGasCompensation, uint256 _MUSDGasCompensation)",
]

export const BORROWING_FEE_PAID = [
  "event BorrowingFeePaid(address indexed _borrower, uint256 _MUSDFee)",
]

export const REFINANCING_FEE_PAID = [
  "event RefinancingFeePaid(address indexed _borrower, uint256 _fee)",
]

export const PCV_ABI = [
  "event PCVDepositSP(address indexed user, uint256 musdAmount)",
  "event PCVWithdrawSP(address indexed user, uint256 musdAmount, uint256 collateralAmount)",
  "event MUSDTokenAddressSet(address _musdTokenAddress)",
  "event BorrowerOperationsAddressSet(address _borrowerOperationsAddress)",
  "event RolesSet(address _council, address _treasury)",
  "event MUSDWithdraw(address _recipient, uint256 _amount)",
  "event CollateralWithdraw(address _recipient, uint256 _collateralAmount)",
  "event PCVDebtPaid(uint256 _paidDebt)",
  "event RecipientAdded(address _recipient)",
  "event RecipientRemoved(address _recipient)",
  "event PCVFeePaid(address _recipient, uint256 _amount)",
]
