// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

/// @notice Empty contract with no functionality. Used as a temporary
///         system contract for MUSD on Ethereum before the bridge from
///         Mezo to Ethereum is implemented.
/// @dev The noOp function is to ensure the extcodesize is non-zero as
///      this is a requirement for MUSD system contract.
contract NoOp {
    function noOp() external {
        revert("does nothing");
    }
} 