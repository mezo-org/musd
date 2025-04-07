// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../token/MUSD.sol";

contract MUSDTester is MUSD {
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

    function getPendingRevokedBurnAddressesLength()
        external
        view
        returns (uint)
    {
        return pendingRevokedBurnAddresses.length;
    }

    function getPendingAddedMintAddressesLength() external view returns (uint) {
        return pendingAddedMintAddresses.length;
    }

    function getPendingRevokedMintAddressesLength()
        external
        view
        returns (uint)
    {
        return pendingRevokedMintAddresses.length;
    }
}
