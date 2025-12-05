// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "../interfaces/IBTCYieldReceiver.sol";

// slither-disable-start locked-ether
contract BTCYieldReceiverMock is IBTCYieldReceiver {
    uint256 public totalBTCReceived;
    uint256 public callCount;
    bool public shouldRevert;

    receive() external payable {}

    function reset() external {
        totalBTCReceived = 0;
        callCount = 0;
        shouldRevert = false;
    }

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function receiveProtocolYieldInBTC(uint256 btcAmount) external override {
        require(!shouldRevert, "BTCYieldReceiverMock: forced revert");
        totalBTCReceived += btcAmount;
        callCount += 1;
    }

    // Helper functions for testing
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
// slither-disable-end locked-ether
