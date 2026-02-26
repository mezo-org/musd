// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

/// @title IBorrowerOperationsPCV
/// @notice Minimal interface for BorrowerOperationsERC20 functions used by PCVERC20
/// @dev This is a subset of the full BorrowerOperationsERC20 interface containing
///      only the functions needed for PCV operations (bootstrap loan and debt management)
interface IBorrowerOperationsPCV {
    /// @notice Mints the bootstrap loan to PCV
    /// @param _musdToMint Amount of MUSD to mint
    function mintBootstrapLoanFromPCV(uint256 _musdToMint) external;

    /// @notice Burns debt from PCV (for loan repayment)
    /// @param _musdToBurn Amount of MUSD to burn
    function burnDebtFromPCV(uint256 _musdToBurn) external;

    /// @notice Returns the stability pool address
    function stabilityPoolAddress() external view returns (address);
}
