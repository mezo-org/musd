// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

/// @title IBTCYieldReceiver
/// @notice Interface for contracts that receive protocol yield in BTC
interface IBTCYieldReceiver {
    /// @notice Receives protocol yield in BTC
    /// @param btcAmount The amount of BTC yield being distributed
    /// @dev This function is called by the PCV contract after sending BTC
    ///      to the receiver. The receiver should handle the BTC yield according
    ///      to its implementation (e.g., converting to another asset)
    function receiveProtocolYieldInBTC(uint256 btcAmount) external;
}
