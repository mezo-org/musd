// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

/// @title ICollateralFeeRecipient
/// @notice Interface for contracts that receive protocol yield in ERC20 collateral
interface ICollateralFeeRecipient {
    /// @notice Receives protocol yield in ERC20 collateral
    /// @param collateralAmount The amount of collateral yield being distributed
    /// @dev This function is called by the PCVERC20 contract after sending collateral
    ///      to the receiver. The receiver should handle the collateral yield according
    ///      to its implementation (e.g., converting to another asset)
    function receiveProtocolYieldInCollateral(
        uint256 collateralAmount
    ) external;
}
