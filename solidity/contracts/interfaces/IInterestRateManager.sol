// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

interface IInterestRateManager {
    struct InterestRateInfo {
        uint256 principal;
        uint256 interest;
        uint256 lastUpdatedTime;
    }

    event ActivePoolAddressChanged(address _activePoolAddress);
    event BorrowerOperationsAddressChanged(address _borrowerOperationsAddress);
    event MUSDTokenAddressChanged(address _musdTokenAddress);
    event PCVAddressChanged(address _pcvAddress);
    event TroveManagerAddressChanged(address _troveManagerAddress);

    event InterestRateProposed(uint16 proposedRate, uint256 proposalTime);
    event InterestRateUpdated(uint16 newInterestRate);
    event InterestNumeratorChanged(uint256 _newNumerator);

    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _troveManagerAddress
    ) external;

    function proposeInterestRate(uint16 _newProposedInterestRate) external;

    function approveInterestRate() external;

    function addPrincipal(uint256 _principal, uint16 _rate) external;

    function removePrincipal(uint256 _principal, uint16 _rate) external;

    function updateSystemInterest() external;

    function updateTroveDebt(
        uint256 _interestOwed,
        uint256 _payment,
        uint16 _rate
    )
        external
        returns (uint256 principalAdjustment, uint256 interestAdjustment);

    function getAccruedInterest() external view returns (uint256);

    function interestRate() external view returns (uint16);
}
