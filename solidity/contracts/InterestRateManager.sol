// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./dependencies/InterestRateMath.sol";
import "./token/IMUSD.sol";
import {CheckContract} from "./dependencies/CheckContract.sol";
import {IActivePool} from "./interfaces/IActivePool.sol";
import {IInterestRateManager} from "./interfaces/IInterestRateManager.sol";
import {IPCV} from "./interfaces/IPCV.sol";
import {ITroveManager} from "./interfaces/ITroveManager.sol";

contract InterestRateManager is
    CheckContract,
    IInterestRateManager,
    OwnableUpgradeable
{
    // Current interest rate per year in basis points
    uint16 public interestRate;

    // Maximum interest rate that can be set, defaults to 100% (10000 bps)
    uint16 public maxInterestRate;

    // Proposed interest rate -- must be approved by governance after a minimum delay
    uint16 public proposedInterestRate;
    uint256 public proposalTime;

    // Minimum time delay between interest rate proposal and approval
    uint256 public constant MIN_DELAY = 7 days;

    // In order to calculate interest on a trove, we calculate:
    //
    // (now - lastUpdatedTime) * principal * interestRate / (10000 * secondsInAYear)
    //
    // To calculate the interest on two troves (A and B)) with two different
    // interest rates is then:
    //
    // (now - lastUpdatedTimeA) * principalA * interestRateA / (10000 * secondsInAYear) +
    // (now - lastUpdatedTimeB) * principalB * interestRateB / (10000 * secondsInAYear)
    //
    // To simplify this and make it so that we do not need to loop over a list
    // of troves, we track the sum of principal * interestRate as the variable
    // `interestNumerator`.
    //
    // This lets us calculate interest as:
    //
    // (now - lastUpdatedTime) * interestNumerator / (10000 * secondsInAYear)
    //
    // Each time the principal change or we accrue interest, we update the
    // `lastUpdatedTime` and the `interestNumerator` accordingly.
    uint256 public interestNumerator;
    uint256 public lastUpdatedTime;

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

    function initialize() external initializer {
        __Ownable_init(msg.sender);

        maxInterestRate = 10000;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

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
        // slither-disable-next-line missing-zero-check
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

    function addPrincipal(
        uint256 _principal,
        uint16 _rate
    ) external onlyBorrowerOperationsOrTroveManager {
        interestNumerator += _principal * _rate;
        emit InterestNumeratorChanged(interestNumerator);
    }

    function updateSystemInterest() external {
        if (interestNumerator > 0) {
            // solhint-disable not-rely-on-time
            uint256 interest = InterestRateMath.calculateAggregatedInterestOwed(
                interestNumerator,
                lastUpdatedTime,
                block.timestamp
            );
            // solhint-enable not-rely-on-time

            // slither-disable-next-line calls-loop
            musdToken.mint(address(pcv), interest);

            // slither-disable-next-line calls-loop
            activePool.increaseDebt(0, interest);
        }

        //slither-disable-next-line reentrancy-no-eth
        lastUpdatedTime = block.timestamp;
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
        (principalAdjustment, interestAdjustment) = InterestRateMath
            .calculateDebtAdjustment(_interestOwed, _payment);

        removePrincipal(principalAdjustment, _rate);
    }

    function removePrincipal(
        uint256 _principal,
        uint16 _rate
    ) public onlyBorrowerOperationsOrTroveManager {
        interestNumerator -= _principal * _rate;
        emit InterestNumeratorChanged(interestNumerator);
    }

    function getAccruedInterest() public view returns (uint256) {
        return
            InterestRateMath.calculateAggregatedInterestOwed(
                interestNumerator,
                lastUpdatedTime,
                block.timestamp
            );
    }

    // slither-disable-start reentrancy-benign
    // slither-disable-start reentrancy-events
    function _setInterestRate(uint16 _newInterestRate) internal {
        require(
            _newInterestRate <= maxInterestRate,
            "Interest rate exceeds the maximum interest rate"
        );
        troveManager.updateSystemInterest();
        interestRate = _newInterestRate;
        emit InterestRateUpdated(_newInterestRate);
    }
    // slither-disable-end reentrancy-benign
    // slither-disable-end reentrancy-events
}
