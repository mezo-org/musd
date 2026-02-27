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
    uint16 private _interestRate;

    // Receive function to accept ETH for gas funding during impersonation
    receive() external payable {}

    function setAccruedInterest(uint256 amount) external {
        _accruedInterest = amount;
    }

    function getAccruedInterest() external view returns (uint256) {
        return _accruedInterest;
    }

    function setInterestRate(uint16 rate) external {
        _interestRate = rate;
    }

    function interestRate() external view returns (uint16) {
        return _interestRate;
    }

    function addPrincipal(
        uint256 /* _principal */,
        uint16 /* _rate */
    ) external {
        // No-op for mock
    }

    function removePrincipal(
        uint256 /* _principal */,
        uint16 /* _rate */
    ) external {
        // No-op for mock
    }

    function updateSystemInterest() external {
        // No-op for mock
    }

    function updateTroveDebt(
        uint256 _interestOwed,
        uint256 _payment,
        uint16 /* _rate */
    )
        external
        pure
        returns (uint256 principalAdjustment, uint256 interestAdjustment)
    {
        // Simple mock: first pay interest, then principal
        if (_payment >= _interestOwed) {
            interestAdjustment = _interestOwed;
            principalAdjustment = _payment - _interestOwed;
        } else {
            interestAdjustment = _payment;
            principalAdjustment = 0;
        }
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
