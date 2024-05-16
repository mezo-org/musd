// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IMUSD.sol";

interface IPCV {
    // --- Events --
    event MUSDTokenAddressSet(address _musdTokenAddress);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event CollateralAddressSet(address _collateralAddress);
    event RolesSet(address _council, address _treasury);
    event MUSDWithdraw(address _recipient, uint256 _musdAmount);
    event CollateralWithdraw(address _recipient, uint256 _collateralAmount);
    event PCVDebtPaid(uint256 _paidDebt);
    event RecipientAdded(address _recipient);
    event RecipientRemoved(address _recipient);

    // --- Functions ---

    function debtToPay() external returns (uint256);
    function payDebt(uint256 _musdToBurn) external;

    function setAddresses(
        address _musdTokenAddress,
        address _borrowerOperations,
        address _collateralERC20
    ) external;
    function initialize() external;

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

    function collateralERC20() external view returns (IERC20);
    function musd() external view returns (IMUSD);
}
