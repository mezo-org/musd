// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IMUSD.sol";
import "./interfaces/IPCV.sol";
import "./BorrowerOperations.sol";

contract PCV is IPCV, Ownable, CheckContract, SendCollateral {
    IMUSD public musd;
    IERC20 public collateralERC20;
    BorrowerOperations public borrowerOperations;

    constructor() Ownable(msg.sender) {}

    receive() external payable {
        require(
            address(collateralERC20) == address(0),
            "PCV: ERC20 collateral needed, not ETH"
        );
    }

    function debtToPay() external override returns (uint256) {}

    function payDebt(uint256 _musdToBurn) external override {}

    function setAddresses(
        address _musdTokenAddress,
        address _borrowerOperations,
        address _collateralERC20
    ) external override onlyOwner {
        require(address(musd) == address(0), "PCV: contacts already set");
        checkContract(_musdTokenAddress);
        checkContract(_borrowerOperations);
        if (_collateralERC20 != address(0)) {
            checkContract(_collateralERC20);
        }

        musd = IMUSD(_musdTokenAddress);
        collateralERC20 = IERC20(_collateralERC20);
        borrowerOperations = BorrowerOperations(_borrowerOperations);

        require(
            (Ownable(_borrowerOperations).owner() != address(0) ||
                borrowerOperations.collateralAddress() == _collateralERC20),
            "The same collateral address must be used for the entire set of contracts"
        );

        emit MUSDTokenAddressSet(_musdTokenAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperations);
        emit CollateralAddressSet(_collateralERC20);
    }

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
}
