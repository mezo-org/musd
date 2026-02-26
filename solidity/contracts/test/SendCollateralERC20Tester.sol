// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "../dependencies/SendCollateralERC20.sol";

contract SendCollateralERC20Tester is SendCollateralERC20 {
    constructor(address _collateralToken) SendCollateralERC20(_collateralToken) {}

    function sendCollateralPublic(address _recipient, uint256 _amount) external {
        _sendCollateral(_recipient, _amount);
    }

    function pullCollateralPublic(address _from, uint256 _amount) external {
        _pullCollateral(_from, _amount);
    }
}
