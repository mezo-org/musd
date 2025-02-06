// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./interfaces/ITroveManager.sol";
import "./token/IMUSD.sol";
import "./interfaces/IPCV.sol";
import "./interfaces/IInterestRateManager.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/ICollSurplusPool.sol";

library BorrowerOperationsState {
    struct Storage {
        mapping(address => uint256) nonces;
        // Connected contract declarations
        ITroveManager troveManager;
        address gasPoolAddress;
        address pcvAddress;
        address stabilityPoolAddress;
        ICollSurplusPool collSurplusPool;
        IMUSD musd;
        IPCV pcv;
        IInterestRateManager interestRateManager;
        // A doubly linked list of Troves, sorted by their collateral ratios
        ISortedTroves sortedTroves;
        // refinancing fee is always a percentage of the borrowing (issuance) fee
        uint8 refinancingFeePercentage;
        // Minimum amount of net mUSD debt a trove must have
        uint256 minNetDebt;
        uint256 proposedMinNetDebt;
        uint256 proposedMinNetDebtTime;
        uint256[50] __gap;
    }
}
