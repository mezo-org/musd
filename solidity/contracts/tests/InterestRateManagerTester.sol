// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.24;

import "../InterestRateManager.sol";

/**
 * @title InterestRateManagerTester
 * @notice Test version that allows interest rate setting without governance
 */
contract InterestRateManagerTester is InterestRateManager {
    /**
     * @notice Test function to set interest rate immediately without delay
     * @param _newInterestRate The new interest rate to set
     */
    function setInterestRateForTesting(uint16 _newInterestRate) external {
        require(
            _newInterestRate <= MAX_INTEREST_RATE,
            "InterestRateManager: rate exceeds MAX_INTEREST_RATE"
        );

        // Calculate interest with current rate before changing
        troveManager.updateSystemInterest();

        // Set new rate directly
        interestRate = _newInterestRate;

        emit InterestRateUpdated(_newInterestRate);
    }
}