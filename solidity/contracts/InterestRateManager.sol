// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./token/IMUSD.sol";
import {CheckContract} from "./dependencies/CheckContract.sol";
import {IActivePool} from "./interfaces/IActivePool.sol";
import {IInterestRateManager} from "./interfaces/IInterestRateManager.sol";
import {IPCV} from "./interfaces/IPCV.sol";
import {ITroveManager} from "./interfaces/ITroveManager.sol";

contract InterestRateManager is Ownable, CheckContract, IInterestRateManager {
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

    IActivePool public activePool;
    address public borrowerOperationsAddress;
    IMUSD public musdToken;
    IPCV internal pcv;
    ITroveManager internal troveManager;

    modifier onlyGovernance() {
        require(
            msg.sender == pcv.council(),
            "InterestRateManager: Only governance can call this function"
        );
        _;
    }

    modifier onlyTroveManager() {
        require(
            msg.sender == address(troveManager),
            "InterestRateManager: Only TroveManager may call this function."
        );
        _;
    }

    modifier onlyBorrowerOperationsOrTroveManager() {
        require(
            msg.sender == borrowerOperationsAddress ||
                msg.sender == address(troveManager),
            "InterestRateManager: Only BorrowerOperations or TroveManager may call this function."
        );
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        checkContract(_activePoolAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_musdTokenAddress);
        checkContract(_pcvAddress);
        checkContract(_troveManagerAddress);

        activePool = IActivePool(_activePoolAddress);
        borrowerOperationsAddress = _borrowerOperationsAddress;
        musdToken = IMUSD(_musdTokenAddress);
        pcv = IPCV(_pcvAddress);
        troveManager = ITroveManager(_troveManagerAddress);

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit PCVAddressChanged(_pcvAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    function proposeInterestRate(
        uint16 _newProposedInterestRate
    ) external onlyGovernance {
        require(
            _newProposedInterestRate <= maxInterestRate,
            "Interest rate exceeds the maximum interest rate"
        );
        proposedInterestRate = _newProposedInterestRate;
        // solhint-disable-next-line not-rely-on-time
        proposalTime = block.timestamp;
        emit InterestRateProposed(proposedInterestRate, proposalTime);
    }

    function approveInterestRate() external onlyGovernance {
        // solhint-disable not-rely-on-time
        require(
            block.timestamp >= proposalTime + MIN_DELAY,
            "Proposal delay not met"
        );
        // solhint-enable not-rely-on-time
        _setInterestRate(proposedInterestRate);
    }

    function setMaxInterestRate(
        uint16 _newMaxInterestRate
    ) external onlyGovernance {
        maxInterestRate = _newMaxInterestRate;
        emit MaxInterestRateUpdated(_newMaxInterestRate);
    }

    function addPrincipalToRate(
        uint16 _rate,
        uint256 _principal
    ) external onlyBorrowerOperationsOrTroveManager {
        interestRateData[_rate].principal += _principal;
    }

    function updateSystemInterest(uint16 _rate) external {
        InterestRateInfo memory _interestRateData = interestRateData[_rate];
        // solhint-disable not-rely-on-time
        uint256 interest = calculateInterestOwed(
            _interestRateData.principal,
            _rate,
            _interestRateData.lastUpdatedTime,
            block.timestamp
        );
        // solhint-enable not-rely-on-time

        addInterestToRate(_rate, interest);

        // solhint-disable-next-line not-rely-on-time
        interestRateData[_rate].lastUpdatedTime = block.timestamp;

        // slither-disable-next-line calls-loop
        musdToken.mint(address(pcv), interest);

        // slither-disable-next-line calls-loop
        activePool.increaseDebt(0, interest);
    }

    function updateTroveDebt(
        uint256 _interestOwed,
        uint256 _payment,
        uint16 _rate
    )
        external
        onlyTroveManager
        returns (uint256 principalAdjustment, uint256 interestAdjustment)
    {
        if (_payment >= _interestOwed) {
            principalAdjustment = _payment - _interestOwed;
            interestAdjustment = _interestOwed;
        } else {
            principalAdjustment = 0;
            interestAdjustment = _payment;
        }

        removeInterestFromRate(_rate, interestAdjustment);
        removePrincipalFromRate(_rate, principalAdjustment);
    }

    function getInterestRateData(
        uint16 _rate
    ) external view returns (InterestRateInfo memory) {
        return interestRateData[_rate];
    }

    function addInterestToRate(
        uint16 _rate,
        uint256 _interest
    ) public onlyBorrowerOperationsOrTroveManager {
        interestRateData[_rate].interest += _interest;
    }

    function removePrincipalFromRate(
        uint16 _rate,
        uint256 _principal
    ) public onlyBorrowerOperationsOrTroveManager {
        interestRateData[_rate].principal -= _principal;
    }

    function removeInterestFromRate(
        uint16 _rate,
        uint256 _interest
    ) public onlyBorrowerOperationsOrTroveManager {
        interestRateData[_rate].interest -= _interest;
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

    // slither-disable-start reentrancy-benign
    // slither-disable-start reentrancy-events
    function _setInterestRate(uint16 _newInterestRate) internal {
        require(
            _newInterestRate <= maxInterestRate,
            "Interest rate exceeds the maximum interest rate"
        );
        troveManager.updateDefaultPoolInterest();
        interestRate = _newInterestRate;
        emit InterestRateUpdated(_newInterestRate);
    }
    // slither-disable-end reentrancy-benign
    // slither-disable-end reentrancy-events
}
