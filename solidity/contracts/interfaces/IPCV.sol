// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../token/IMUSD.sol";

interface IPCV {
    // --- Events --
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event CollateralWithdraw(address _recipient, uint256 _collateralAmount);
    event MUSDTokenAddressSet(address _musdTokenAddress);
    event MUSDWithdraw(address _recipient, uint256 _amount);
    event PCVDebtPaid(uint256 _paidDebt);
    event PCVDepositSP(address indexed user, uint256 musdAmount);
    event PCVFeePaid(address _recipient, uint256 _amount);
    event PCVWithdrawSP(
        address indexed user,
        uint256 musdAmount,
        uint256 collateralAmount
    );
    event RecipientAdded(address _recipient);
    event RecipientRemoved(address _recipient);
    event RolesSet(address _council, address _treasury);

    // --- Functions ---

    function debtToPay() external returns (uint256);

    function payDebt(uint256 _musdToBurn) external;

    function setAddresses(
        address _borrowerOperations,
        address _musdTokenAddress
    ) external;

    function initializeDebt() external;

    function setFeeRecipient(address _feeRecipient) external;

    function setFeeSplit(uint8 _feeSplitPercentage) external;

    function withdrawMUSD(address _recipient, uint256 _musdAmount) external;

    function withdrawCollateral(
        address _recipient,
        uint256 _collateralAmount
    ) external;

    function addRecipientToWhitelist(address _recipient) external;

    function addRecipientsToWhitelist(address[] calldata _recipients) external;

    function removeRecipientFromWhitelist(address _recipient) external;

    function removeRecipientsFromWhitelist(
        address[] calldata _recipients
    ) external;

    function startChangingRoles(address _council, address _treasury) external;

    function cancelChangingRoles() external;

    function finalizeChangingRoles() external;

    function musd() external view returns (IMUSD);

    function council() external view returns (address);

    function treasury() external view returns (address);
}
