// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.24;

import "./InterestRateManager.sol";

/**
 * @title TestInterestRateManager
 * @notice Adds testing functionality to InterestRateManager
 */
contract TestInterestRateManager is InterestRateManager {
    // Need to keep this variable to maintain storage layout compatibility
    bool public isTestMode;

    /**
     * @notice Test function to set interest rate immediately without delay
     * @param _newInterestRate The new interest rate to set
     */
    function setInterestRateForTesting(uint16 _newInterestRate) external onlyGovernance {
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