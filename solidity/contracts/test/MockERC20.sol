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

/**
 * @title MockPriceFeed
 * @notice Mock implementation of IPriceFeed for testing
 */
contract MockPriceFeed {
    uint256 private _price = 2000e18; // Default price of $2000

    // Receive function to accept ETH for gas funding during impersonation
    receive() external payable {}

    function setPrice(uint256 price) external {
        _price = price;
    }

    function fetchPrice() external view returns (uint256) {
        return _price;
    }
}

/**
 * @title MockSortedTroves
 * @notice Mock implementation of ISortedTroves for testing
 */
contract MockSortedTroves {
    address private _lastTrove;

    // Receive function to accept ETH for gas funding during impersonation
    receive() external payable {}

    function setLast(address trove) external {
        _lastTrove = trove;
    }

    function getLast() external view returns (address) {
        return _lastTrove;
    }
}

/**
 * @title MockTroveManager
 * @notice Mock implementation of ITroveManager for testing
 */
contract MockTroveManager {
    mapping(address => uint256) private _icr;
    mapping(address => uint8) private _status;

    // Receive function to accept ETH for gas funding during impersonation
    receive() external payable {}

    function setICR(address borrower, uint256 icr) external {
        _icr[borrower] = icr;
    }

    function setTroveStatus(address borrower, uint8 status) external {
        _status[borrower] = status;
    }

    function getCurrentICR(
        address borrower,
        uint256 /* price */
    ) external view returns (uint256) {
        return _icr[borrower];
    }

    function getTroveStatus(address borrower) external view returns (uint8) {
        return _status[borrower];
    }
}
