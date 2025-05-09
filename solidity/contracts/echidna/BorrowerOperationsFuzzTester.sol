// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../BorrowerOperations.sol";
import "./IBorrowerOperationsFuzzTester.sol";

contract BorrowerOperationsFuzzTester is
    BorrowerOperations,
    IBorrowerOperationsFuzzTester
{
    function getMCR() external pure returns (uint256) {
        return MCR;
    }

    function getCCR() external pure returns (uint256) {
        return CCR;
    }

    function getGasComp() external pure returns (uint256) {
        return MUSD_GAS_COMPENSATION;
    }
}
