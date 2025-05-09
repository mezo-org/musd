// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../interfaces/IBorrowerOperations.sol";

interface IBorrowerOperationsFuzzTester is IBorrowerOperations {
    function getMCR() external view returns (uint256);

    function getCCR() external view returns (uint256);

    function getGasComp() external view returns (uint256);
}
