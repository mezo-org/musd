// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SendCollateralERC20
 * @notice Helper contract for sending ERC20 collateral tokens
 * @dev Replaces native token transfers with ERC20 transfers using SafeERC20
 */
contract SendCollateralERC20 {
    using SafeERC20 for IERC20;

    /**
     * @notice Sends ERC20 collateral to recipient
     * @param _token The ERC20 token to send
     * @param _recipient The address to receive the collateral
     * @param _amount The amount of collateral to send
     */
    function _sendCollateralERC20(
        IERC20 _token,
        address _recipient,
        uint256 _amount
    ) internal {
        _token.safeTransfer(_recipient, _amount);
    }

    /**
     * @notice Receives ERC20 collateral from sender
     * @param _token The ERC20 token to receive
     * @param _sender The address sending the collateral
     * @param _amount The amount of collateral to receive
     */
    function _receiveCollateralERC20(
        IERC20 _token,
        address _sender,
        uint256 _amount
    ) internal {
        _token.safeTransferFrom(_sender, address(this), _amount);
    }
}
