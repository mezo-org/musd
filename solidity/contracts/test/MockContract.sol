// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

/**
 * @title MockContract
 * @notice A simple empty contract for testing purposes
 */
contract MockContract {
    // Empty contract used as a placeholder in tests

    // Add a simple fallback function to accept calls
    fallback() external payable {}

    receive() external payable {}

    // Mock function that returns 0 for interest
    function getAccruedInterest() external pure returns (uint256) {
        return 0;
    }
}
