// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract BatchFunder {
    function batchSendETH(address[] calldata recipients, uint256 amount) external payable {
        require(msg.value == amount * recipients.length, "Incorrect ETH sent");
        for (uint256 i = 0; i < recipients.length; i++) {
            (bool sent, ) = recipients[i].call{value: amount}("");
            require(sent, "Failed to send ETH");
        }
    }
}