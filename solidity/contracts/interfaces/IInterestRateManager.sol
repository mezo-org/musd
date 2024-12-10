interface IInterestRateManager {
    struct InterestRateInfo {
        uint256 principal;
        uint256 interest;
        uint256 lastUpdatedTime;
    }
    event PCVAddressChanged(address _pcvAddress);
    event TroveManagerAddressChanged(address _troveManagerAddress);

    function interestRate() external view returns (uint16);

    function setAddresses(
        address _pcvAddress,
        address _troveManagerAddress
    ) external;

    function proposeInterestRate(uint16 _newProposedInterestRate) external;

    function approveInterestRate() external;

    function setMaxInterestRate(uint16 _newMaxInterestRate) external;

    function addPrincipalToRate(uint16 _rate, uint256 _principal) external;

    function addInterestToRate(uint16 _rate, uint256 _interest) external;

    function removePrincipalFromRate(uint16 _rate, uint256 _principal) external;

    function removeInterestFromRate(uint16 _rate, uint256 _interest) external;

    function setLastUpdatedTime(uint16 _rate, uint256 _time) external;

    function getInterestRateData(
        uint16 _rate
    ) external view returns (InterestRateInfo memory);

    function calculateInterestOwed(
        uint256 _principal,
        uint16 _interestRate,
        uint256 startTime,
        uint256 endTime
    ) external pure returns (uint256);

    function calculateDebtAdjustment(
        uint256 _interestOwed,
        uint256 _payment
    )
        external
        pure
        returns (uint256 principalAdjustment, uint256 interestAdjustment);

    function updateSystemInterest(
        uint16 _rate
    ) external returns (uint256 interest);

    function updateTroveDebt(
        uint256 _interestOwed,
        uint256 _payment,
        uint16 _rate
    )
        external
        returns (uint256 principalAdjustment, uint256 interestAdjustment);
}
