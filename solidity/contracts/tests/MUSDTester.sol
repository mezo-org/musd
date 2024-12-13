// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../token/MUSD.sol";

contract MUSDTester is MUSD {
    constructor(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress,
        address _interestRateManagerAddress,
        uint256 _governanceTimeDelay
    )
        MUSD(
            "Mezo USD",
            "MUSD",
            _troveManagerAddress,
            _stabilityPoolAddress,
            _borrowerOperationsAddress,
            _interestRateManagerAddress,
            _governanceTimeDelay
        )
    {}

    function unprotectedMint(address _account, uint256 _amount) external {
        // No check on caller here

        _mint(_account, _amount);
    }

    function unprotectedBurn(address _account, uint256 _amount) external {
        // No check on caller here

        _burn(_account, _amount);
    }

    function callInternalApprove(
        address owner,
        address spender,
        uint256 amount
    ) external {
        _approve(owner, spender, amount);
    }
}
