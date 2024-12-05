// InterestRateManager.sol
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import {IInterestRateManager} from "./interfaces/IInterestRateManager.sol";



contract InterestRateManager is Ownable, IInterestRateManager {
    // Current interest rate per year in basis points
    uint16 public interestRate;

    // Maximum interest rate that can be set, defaults to 100% (10000 bps)
    uint16 public maxInterestRate = 10000;

    // Proposed interest rate -- must be approved by governance after a minimum delay
    uint16 public proposedInterestRate;
    uint256 public proposalTime;

    // Minimum time delay between interest rate proposal and approval
    uint256 public constant MIN_DELAY = 7 days;
    uint256 public constant SECONDS_IN_A_YEAR = 365 * 24 * 60 * 60;

    // Mapping from interest rate to total principal and interest owed at that rate
    mapping(uint16 => InterestRateInfo) public interestRateData;

    event InterestRateProposed(uint16 proposedRate, uint256 proposalTime);
    event InterestRateUpdated(uint16 newInterestRate);
    event MaxInterestRateUpdated(uint16 newMaxInterestRate);

    constructor() Ownable(msg.sender) {}

    function proposeInterestRate(
        uint16 _newProposedInterestRate
    ) external onlyOwner {
        require(
            _newProposedInterestRate <= maxInterestRate,
            "Interest rate exceeds the maximum interest rate"
        );
        proposedInterestRate = _newProposedInterestRate;
        // solhint-disable-next-line not-rely-on-time
        proposalTime = block.timestamp;
        emit InterestRateProposed(proposedInterestRate, proposalTime);
    }

    function approveInterestRate() external onlyOwner {
        require(
            block.timestamp >= proposalTime + MIN_DELAY,
            "Proposal delay not met"
        );
        _setInterestRate(proposedInterestRate);
    }

    function setMaxInterestRate(uint16 _newMaxInterestRate) external onlyOwner {
        maxInterestRate = _newMaxInterestRate;
        emit MaxInterestRateUpdated(_newMaxInterestRate);
    }

    function addPrincipalToRate(uint16 _rate, uint256 _principal) external {
        interestRateData[_rate].principal += _principal;
    }

    function addInterestToRate(uint16 _rate, uint256 _interest) external {
        interestRateData[_rate].interest += _interest;
    }

    function removePrincipalFromRate(
        uint16 _rate,
        uint256 _principal
    ) external {
        interestRateData[_rate].principal -= _principal;
    }

    function removeInterestFromRate(uint16 _rate, uint256 _interest) external {
        interestRateData[_rate].interest -= _interest;
    }

    function setLastUpdatedTime(uint16 _rate, uint256 _time) external {
        interestRateData[_rate].lastUpdatedTime = _time;
    }

    function getInterestRateData(uint16 _rate)
        external
        view
        returns (InterestRateInfo memory)
    {
        return interestRateData[_rate];
    }

    function calculateInterestOwed(
        uint256 _principal,
        uint16 _interestRate,
        uint256 startTime,
        uint256 endTime
    ) public pure returns (uint256) {
        uint256 timeElapsed = endTime - startTime;
        return
            (_principal * _interestRate * timeElapsed) /
            (10000 * SECONDS_IN_A_YEAR);
    }

    function _setInterestRate(uint16 _newInterestRate) internal {
        require(
            _newInterestRate <= maxInterestRate,
            "Interest rate exceeds the maximum interest rate"
        );
        interestRate = _newInterestRate;
        emit InterestRateUpdated(_newInterestRate);
    }
}
