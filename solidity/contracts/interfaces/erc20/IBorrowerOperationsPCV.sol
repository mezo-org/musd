// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

/**
 * @title IBorrowerOperationsPCV
 * @notice Interface for BorrowerOperations functions used by PCV
 *
 * This interface defines the specific functions that PCV needs to call
 * on BorrowerOperations for bootstrap loan management.
 */
interface IBorrowerOperationsPCV {
    /**
     * @notice Mints the bootstrap loan from PCV
     * @param _musdToMint Amount of MUSD to mint
     * @dev Only callable by PCV address
     */
    function mintBootstrapLoanFromPCV(uint256 _musdToMint) external;

    /**
     * @notice Burns debt repayment from PCV
     * @param _musdToBurn Amount of MUSD to burn
     * @dev Only callable by PCV address
     */
    function burnDebtFromPCV(uint256 _musdToBurn) external;

    /**
     * @notice Returns the stability pool address
     */
    function stabilityPoolAddress() external view returns (address);
}
