// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

/// @title ICollateralFeeRecipient
/// @notice Interface for contracts that receive protocol yield in ERC20 collateral
/// @dev This is the ERC20 equivalent of IBTCFeeRecipient
interface ICollateralFeeRecipient {
    /// @notice Receives protocol yield in ERC20 collateral
    /// @param collateralAmount The amount of collateral yield being distributed
    /// @dev This function is called by the PCVERC20 contract after transferring
    ///      collateral to the receiver. The receiver should handle the collateral
    ///      yield according to its implementation (e.g., converting to another asset)
    function receiveProtocolYieldInCollateral(uint256 collateralAmount) external;
}
