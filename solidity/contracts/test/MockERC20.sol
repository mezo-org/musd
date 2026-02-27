// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Collateral", "MCOLL") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title MockContract
 * @notice A minimal contract for testing address validation (checkContract)
 */
contract MockContract {
    // Empty contract with code size > 0
    // Receive function to accept ETH for gas funding during impersonation
    receive() external payable {}
}

/**
 * @title MockInterestRateManager
 * @notice Mock implementation of IInterestRateManager for testing
 */
contract MockInterestRateManager {
    uint256 private _accruedInterest;

    // Receive function to accept ETH for gas funding during impersonation
    receive() external payable {}

    function setAccruedInterest(uint256 amount) external {
        _accruedInterest = amount;
    }

    function getAccruedInterest() external view returns (uint256) {
        return _accruedInterest;
    }
}
