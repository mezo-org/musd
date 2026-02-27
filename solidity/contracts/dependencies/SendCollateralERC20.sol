// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SendCollateralERC20
 * @notice Base contract for ERC20 collateral transfers
 */
abstract contract SendCollateralERC20 {
    IERC20 public immutable collateralToken;

    error CollateralTransferFailed();

    constructor(address _collateralToken) {
        require(_collateralToken != address(0), "Invalid collateral token");
        collateralToken = IERC20(_collateralToken);
    }

    function _sendCollateral(address _recipient, uint256 _amount) internal {
        if (_amount == 0) return;
        bool success = collateralToken.transfer(_recipient, _amount);
        if (!success) revert CollateralTransferFailed();
    }

    function _pullCollateral(address _from, uint256 _amount) internal {
        if (_amount == 0) return;
        bool success = collateralToken.transferFrom(
            _from,
            address(this),
            _amount
        );
        if (!success) revert CollateralTransferFailed();
    }
}
