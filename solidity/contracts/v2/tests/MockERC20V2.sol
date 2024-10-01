// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/IReceiveApprovalV2.sol";
import "../interfaces/IApproveAndCallV2.sol";

contract MockERC20V2 is ERC20, IApproveAndCallV2, Ownable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 supply
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _mint(msg.sender, supply);
    }

    function mint(address account, uint256 value) external onlyOwner {
        _mint(account, value);
    }

    function approveAndCall(
        address spender,
        uint256 amount,
        bytes memory extraData
    ) external returns (bool) {
        if (approve(spender, amount)) {
            IReceiveApprovalV2(spender).receiveApproval(
                msg.sender,
                amount,
                address(this),
                extraData
            );
            return true;
        }
        return false;
    }
}
