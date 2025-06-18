// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

contract Foo {
    uint256 public x;

    function bar(uint256 prmX) public {
        x = prmX;
    }
}