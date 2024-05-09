// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "../MUSD.sol";

contract MUSDTester is MUSD {
    constructor(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress,
        uint256 _governanceTimeDelay
    )
        MUSD(
            "Mezo USD",
            "MUSD",
            _troveManagerAddress,
            _stabilityPoolAddress,
            _borrowerOperationsAddress,
            address(0),
            address(0),
            address(0),
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
