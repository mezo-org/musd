# Stability Pool Rebalancing Procedure

## Overview

The Stability Pool rebalancing procedure is a regular maintenance task that ensures that the PCV's Stability Pool position
maintains adequate MUSD liquidity to cover future liquidations while managing BTC price risk exposure.

## Background

When the protocol is initialized:
1. PCV mints 100M MUSD as a bootstrap loan (Note: this was reduced to 15M soon after launch, but the amount isn't relevant for this procedure)
2. PCV deposits 100M MUSD into the Stability Pool

As liquidations occur:
1. Liquidated debt is covered by burning MUSD from the Stability Pool
2. Liquidated collateral (BTC) is distributed to Stability Pool depositors
3. Over time, PCV's Stability Pool position accrues BTC and loses MUSD
4. This reduces PCV's ability to cover future liquidations
5. PCV becomes exposed to BTC price risk instead of maintaining MUSD liquidity

## When to Perform

This procedure should be performed:
- **Monthly**: As part of regular protocol maintenance.  If no liquidations occurred, no rebalancing is needed.
- **After significant liquidation events**: When Stability Pool MUSD balance drops below 80% of initial deposit (12M given the reduction)
- **When BTC exposure exceeds risk tolerance**: When PCV's BTC holdings exceed 20% of the total deposit value

## Prerequisites

- Governance multisig access
- Access to a DEX for BTC/MUSD swaps
- Recipient address must be whitelisted in PCV contract

## Playbook

### Step 1: Detection

This procedure should have been triggered either as a regularly scheduled maintenance task or in response to one of the alerts 
mentioned above.  In the case of an alert, verify the state on-chain before moving forward.

### Step 2: Add Recipient to Whitelist (if needed)

If the recipient address is not already whitelisted, governance must first add it:
```solidity
pcv.addRecipientToWhitelist(recipientAddress);
```

### Step 3: Withdraw BTC from Stability Pool to Recipient

Governance calls PCV to withdraw funds directly to a whitelisted recipient. The BTC collateral gain and any excess MUSD (after debt repayment) will be sent directly to the recipient.

### Step 4: Swap BTC for MUSD

The recipient executes BTC to MUSD swap on DEX.

### Step 5: Deposit MUSD to Stability Pool

The recipient or governance calls PCV to deposit MUSD back into Stability Pool. Note that anyone can call this function with their own MUSD tokens:
```solidity
// Caller must first approve PCV to spend their MUSD
musd.approve(pcvAddress, musdAmount);
// Then deposit to Stability Pool via PCV
pcv.depositToStabilityPool(musdAmount);
```

### Step 6: Verification

Confirm Stability Pool balance restored.

## Detailed Version

### Step 1: Detection

This procedure should have been triggered either as a regularly scheduled maintenance task or in response to one of the alerts
mentioned above.  In the case of an alert, verify the state on-chain before moving forward.

To check the PCV Stability Pool position's MUSD balance:
1. Go to the [StabilityPool contract](https://explorer.mezo.org/address/0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32?tab=read_proxy)
2. Find the function `getCompoundedMUSDDeposit`
3. Enter the PCV address (`0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993` for mainnet) for `_depositor` and click "Read"

To check the Stability Pool position's BTC balance (called "collateral gain"):
1. Go to the [StabilityPool contract](https://explorer.mezo.org/address/0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32?tab=read_proxy)
2. Find the function `getDepositorCollateralGain`
3. Enter the PCV address (`0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993` for mainnet) for `_depositor` and click "Read"

Note that the results are in 18 decimal precision so you will need to divide by 1e18 to get the value in floating point format.

### Step 2: Add Recipient to Whitelist (if needed)

If the recipient address is not already whitelisted:
```solidity
pcv.addRecipientToWhitelist(recipientAddress);
```

### Step 3: Withdraw BTC from Stability Pool to Recipient

Governance calls PCV to withdraw funds directly to the whitelisted recipient:
```solidity
// Withdraw BTC collateral gain to recipient (0 means withdraw only collateral, no MUSD)
pcv.withdrawFromStabilityPool(0, recipientAddress);
```

### Step 4: Swap BTC for MUSD

The recipient executes BTC to MUSD swap on DEX. Detailed instructions to be added in a later iteration.

### Step 5: Deposit MUSD back to Stability Pool

The recipient or governance deposits MUSD to the Stability Pool via PCV:
```solidity
// Caller must first approve PCV to spend their MUSD
musd.approve(pcvAddress, musdAmount);

// Then deposit to Stability Pool via PCV (callable by anyone)
pcv.depositToStabilityPool(musdAmount);
```

### Step 6: Verification

Confirm Stability Pool balance restored by following the same steps from step 1 to get MUSD and BTC balances.

Expected MUSD balance: ~15M
Expected BTC balance: ~0

## Risk Considerations

### Market Risk
- **BTC Price Volatility**: Swapping BTC during high volatility may result in unfavorable rates
- **Slippage**: Large swaps may cause significant slippage
- **Timing**: Market conditions may affect optimal timing

### Operational Risk
- **Execution Risk**: Manual process until automated
- **Governance Delay**: Multisig approval required

## Automation Considerations

Future improvements should consider:
1. **Automated Triggers**: Based on threshold breaches
2. **Automated Execution**: Smart contracts for swaps and deposits
3. **MEV Protection**

Note that depending on the burden of manual rebalancing it may not be worth automating.

## Open Questions
- What are the thresholds for BTC exposure or MUSD position size that would trigger a rebalance?

## References
- [Mainnet Deployment Artifacts](https://github.com/mezo-org/musd/tree/main/solidity/artifacts/deployments/mainnet)
- [Stability Pool Contract](https://explorer.mezo.org/address/0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32)
- [MUSD Contract](https://explorer.mezo.org/token/0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186)
- [PCV Contract](https://explorer.mezo.org/address/0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993)