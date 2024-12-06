// IInterestRateManager.sol
pragma solidity ^0.8.24;

import "../TroveManager.sol";

interface IInterestRateManager {
    struct InterestRateInfo {
        uint256 principal;
        uint256 interest;
        uint256 lastUpdatedTime;
    }
    function interestRate() external view returns (uint16);
    function proposeInterestRate(uint16 _newProposedInterestRate) external;
    function approveInterestRate() external;
    function setMaxInterestRate(uint16 _newMaxInterestRate) external;
    function addPrincipalToRate(uint16 _rate, uint256 _principal) external;
    function addInterestToRate(uint16 _rate, uint256 _interest) external;
    function removePrincipalFromRate(uint16 _rate, uint256 _principal) external;
    function removeInterestFromRate(uint16 _rate, uint256 _interest) external;
    function setLastUpdatedTime(uint16 _rate, uint256 _time) external;
    function getInterestRateData(uint16 _rate) external view returns (InterestRateInfo memory);
    function calculateInterestOwed(uint256 _principal, uint16 _interestRate, uint256 startTime, uint256 endTime) external pure returns (uint256);
    function updateDebtWithInterest(uint256 _principal, uint256 _interestOwed, uint16 _interestRate, uint256 _lastInterestUpdateTime)
    external
    returns (uint256 interestOwed, uint256 lastInterestUpdateTime);
    function updateSystemInterest(uint16 _rate) external returns (uint256 interest);
}