// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "../interfaces/IMUSDSavingsRate.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MUSDSavingsRateMock is IMUSDSavingsRate {
    IERC20 public immutable musd;
    uint256 public totalYieldReceived;
    uint256 public callCount;

    constructor(address _musd) {
        musd = IERC20(_musd);
    }

    function reset() external {
        totalYieldReceived = 0;
        callCount = 0;
    }

    function receiveProtocolYield(uint256 amount) external override {
        totalYieldReceived += amount;
        callCount += 1;
        require(
            musd.transferFrom(msg.sender, address(this), amount),
            "MUSDSavingsRateMock: transfer failed"
        );
    }

    // Helper functions for testing
    function getBalance() external view returns (uint256) {
        return musd.balanceOf(address(this));
    }
}
