// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import {MockTBTCVault as _MockTBTCVault, MockBridge as _MockBridge} from "@keep-network/tbtc-v2/contracts/test/TestTBTCDepositor.sol";
import {IBridge} from "@keep-network/tbtc-v2/contracts/integrator/IBridge.sol";
import {IBridgeTypes} from "@keep-network/tbtc-v2/contracts/integrator/IBridge.sol";
import {MockERC20} from "./MockERC20.sol";

contract MockBridge is _MockBridge {}

contract MockTBTCVault is _MockTBTCVault {
    MockERC20 public immutable tbtc;
    IBridge public immutable bridge;

    /// @notice Multiplier to convert satoshi to TBTC token units.
    uint256 public constant SATOSHI_MULTIPLIER = 10 ** 10;

    constructor(MockERC20 _tbtc, IBridge _bridge) {
        tbtc = _tbtc;
        bridge = _bridge;
    }

    function finalizeOptimisticMintingRequest(
        uint256 depositKey
    ) public override {
        super.finalizeOptimisticMintingRequest(depositKey);

        IBridgeTypes.DepositRequest memory deposit = bridge.deposits(
            depositKey
        );

        // The same logic as in TBTCOptimisticMinting.finalizeOptimisticMint
        uint256 amountToMint = (deposit.amount - deposit.treasuryFee) *
            SATOSHI_MULTIPLIER;

        uint256 optimisticMintFee = optimisticMintingFeeDivisor > 0
            ? (amountToMint / optimisticMintingFeeDivisor)
            : 0;

        tbtc.mint(deposit.depositor, amountToMint - optimisticMintFee);
    }
}
