// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

contract SendCollateral {
    /**
     * Sends collateral to recipient
     */
    function _sendCollateral(address _recipient, uint256 _amount) internal {
        // slither-disable-next-line low-level-calls
        (bool success, ) = _recipient.call{value: _amount}(""); // re-entry is fine here
        require(success, "Sending BTC failed");
    }
}
