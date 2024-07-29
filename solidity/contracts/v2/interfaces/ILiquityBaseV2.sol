// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./IPriceFeedV2.sol";

interface ILiquityBaseV2 {
    function priceFeed() external view returns (IPriceFeedV2);
}
