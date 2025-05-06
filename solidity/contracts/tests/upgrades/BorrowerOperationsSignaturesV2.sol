// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../../BorrowerOperationsSignatures.sol";

contract BorrowerOperationsSignaturesV2 is BorrowerOperationsSignatures {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        __EIP712_init_unchained("BorrowerOperationsSignatures", "2");
        newField = 722;
    }

    function newFunction() external {
        newField++;
    }
}
