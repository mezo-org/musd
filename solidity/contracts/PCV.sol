// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IPCV.sol";

contract PCV is IPCV, Ownable, CheckContract, SendCollateral {
    constructor() Ownable(msg.sender) {}

    function debtToPay() external override returns (uint256) {}

    function payDebt(uint256 _musdToBurn) external override {}

    function setAddresses(
        address _musdTokenAddress,
        address _borrowerOperations,
        address payable _bammAddress,
        address _collateralERC20
    ) external override {}

    function initialize() external override {}

    function withdrawMUSD(
        address _recipient,
        uint256 _musdAmount
    ) external override {}

    function withdrawCollateral(
        address _recipient,
        uint256 _collateralAmount
    ) external override {}

    function addRecipientToWhitelist(address _recipient) external override {}

    function addRecipientsToWhitelist(
        address[] calldata _recipients
    ) external override {}

    function removeRecipientFromWhitelist(
        address _recipient
    ) external override {}

    function removeRecipientsFromWhitelist(
        address[] calldata _recipients
    ) external override {}

    function startChangingRoles(
        address _council,
        address _treasury
    ) external override {}

    function cancelChangingRoles() external override {}

    function finalizeChangingRoles() external override {}

    function collateralERC20() external view override returns (IERC20) {}

    function musd() external view override returns (IMUSD) {}
}
