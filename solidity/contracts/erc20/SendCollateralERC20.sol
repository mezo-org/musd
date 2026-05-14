// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SendCollateralERC20
 * @notice Base contract for sending ERC20 collateral tokens
 */
contract SendCollateralERC20 {
    using SafeERC20 for IERC20;

    /**
     * @notice Sends ERC20 collateral to recipient
     * @param _collateralToken The ERC20 token address
     * @param _recipient The address to receive the collateral
     * @param _amount The amount of collateral to send
     */
    function _sendCollateral(
        address _collateralToken,
        address _recipient,
        uint256 _amount
    ) internal {
        IERC20(_collateralToken).safeTransfer(_recipient, _amount);
    }
}
