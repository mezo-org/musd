// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SendCollateral {
    using SafeERC20 for IERC20;

    /**
     * Sends collateral to recipient
     */
    function sendCollateral(
        IERC20 _collateralERC20,
        address _recipient,
        uint256 _amount
    ) internal {
        if (address(_collateralERC20) == address(0)) {
            // ETH
            // slither-disable-next-line low-level-calls
            (bool success, ) = _recipient.call{value: _amount}(""); // re-entry is fine here
            require(success, "Sending BTC failed");
        } else {
            // ERC20
            _collateralERC20.safeTransfer(_recipient, _amount);
        }
    }

    /**
     * Sends collateral to recipient
     */
    function sendCollateralFrom(
        IERC20 _collateralERC20,
        address _from,
        address _recipient,
        uint256 _amount
    ) internal {
        if (address(_collateralERC20) == address(0)) {
            // BTC
            // slither-disable-next-line low-level-calls
            (bool success, ) = _recipient.call{value: _amount}(""); // re-entry is fine here
            require(success, "Sending BTC failed");
        } else {
            // ERC20
            // slither-disable-next-line arbitrary-send-erc20
            _collateralERC20.safeTransferFrom(_from, _recipient, _amount);
        }
    }
}
