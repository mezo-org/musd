// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../debugging/console.sol";

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
            console.log("got it");
            // slither-disable-next-line low-level-calls
            console.log("Sending BTC to:", _recipient);
            console.log("Amount:", _amount);
            console.log("Contract balance:", address(this).balance);
            require(address(this).balance >= _amount, "Insufficient balance for transfer");

        (bool success, bytes memory data) = _recipient.call{value: _amount}("");
            if (!success) {
                if (data.length > 0) {
                    // Extract the revert reason from the returned data
                    assembly {
                        let returndata_size := mload(data)
                        revert(add(32, data), returndata_size)
                    }
                } else {
                    revert("Low-level call failed");
                }
            }

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
