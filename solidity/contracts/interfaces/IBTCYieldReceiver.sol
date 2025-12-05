// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

interface IBTCYieldReceiver {
    function receiveProtocolYieldInBTC(uint256 btcAmount) external;
}
