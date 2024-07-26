// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

/// @notice An interface that should be implemented by tokens supporting
///         `approveAndCall`/`receiveApproval` pattern.
interface IApproveAndCall {
    /// @notice Executes `receiveApproval` function on spender as specified in
    ///         `IReceiveApproval` interface previously approving tokens.
    function approveAndCall(
        address spender,
        uint256 amount,
        bytes memory extraData
    ) external returns (bool);
}
