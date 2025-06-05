# RFC-1: Bridging MUSD to Ethereum

## Backround

This RFC aims at providing the infrastructure required to bridge MUSD minted on
Mezo to Ethereum, enabling third-party integrations to implement various yield
strategies.

The MUSD token is deployed on Mezo and Ethereum under the same address
`0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186`. We are going to use Wormhole for
bridging, but instead of ending the bridging flow with a Wormhole-wrapped token
as MUSD on Ethereum, we are going to mint the canonical MUSD. This mechanism is
implemented and battle-proven for tBTC bridging from Ethereum to various L2s.

## Proposal

### Bridging to Ethereum

We are going to implement a `WormholeMUSDGateway` smart contract on Ethereum
similar to tBTC [`L2WormholeGateway`](https://github.com/threshold-network/tbtc-v2/blob/main/solidity/contracts/cross-chain/wormhole/L2WormholeGateway.sol)
deployed on various L2s. The MUSD minted on Mezo is bridged to Ethereum using
Wormhole Token Bridge contract deployed on Mezo with the `WormholeMUSDGateway`
contract set as an Ethereum token recipient. The `WormholeMUSDGateway` receives
Wormhole-wrapped MUSD token representation and mints the canonical MUSD on
Ethereum to the recipient address provided in the bridging payload. The
reference code is the [`L2WormholeGateway.receiveTbtc`](https://github.com/threshold-network/tbtc-v2/blob/f702144f76b3fc8648ed4eb9d7d9c7113b0f343b/solidity/contracts/cross-chain/wormhole/L2WormholeGateway.sol#L253-L292) function.
The `WormholeMUSDGateway` needs to be added to the MUSD token's mint list on
Ethereum.

```
+-------------------------------------+          +----------------------------------------------------------------+
|                Mezo                 |          |                              Ethereum                          |
|                                     |          |                                                                |
| +------+  +----------------------+  |          |  +----------------------+  +---------------------+  +------+   |
| | MUSD |--| Wormhole TokenBridge |--|---->>>---|--| Wormhole TokenBridge |--| WormholeMUSDGateway |--| MUSD |   |
| +------+  +----------------------+  |          |  +----------------------+  +---------------------+  +------+   |
|                                     |          |                                                                |
+-------------------------------------+          +----------------------------------------------------------------+
```

The order of operations is as follows:
1. The user approves MUSD to the Wormhole Token Bridge contract on Mezo and calls
   `TokenBridge.transferTokensWithPayload`.
2. Once the bridging operation completes, the user (or the relayer) calls
   `WormholeMUSDGateway.receive` function on Ethereum providing signed Wormhole
   VAA.
3. That function calls `TokenBridge.completeTransferWithPayload` on Ethereum
   and mints the canonical MUSD on Ethereum to the recipient address obtained
   from the bridging payload.

### Bridging back to Mezo

To send back MUSD to Mezo, the `WormholeMUSDGateway.bridgeOut` function is used
on Ethereum. If `recipientChain` is not Mezo, the function reverts. The received
MUSD on Ethereum is burned and bridged back to Mezo using the `transferTokens`
function of the Wormhole's gateway. Once the token is bridged by Wormhole, MUSD
is unlocked on Mezo from the Wormhole Token Bridge contract to the recipient's
address. The reference code to be implemented on Ethereum is
[`L2WormholeGateway.sendTbtc`](https://github.com/threshold-network/tbtc-v2/blob/f702144f76b3fc8648ed4eb9d7d9c7113b0f343b/solidity/contracts/cross-chain/wormhole/L2WormholeGateway.sol#L166-L229). We are not interested in bridging to other chains
for the time being. This RFC aims to implement the simplest solution, allowing
to bridge from Mezo to Ethereum and the other way round. If necessary, the
`WormholeMUSDGateway` contract can be upgraded in the future to add canonical
tokens and gateways on other chains.


```
+-------------------------------------+          +----------------------------------------------------------------+
|                Mezo                 |          |                              Ethereum                          |
|                                     |          |                                                                |
| +------+  +----------------------+  |          |  +----------------------+  +---------------------+  +------+   |
| | MUSD |--| Wormhole TokenBridge |--|----<<<---|--| Wormhole TokenBridge |--| WormholeMUSDGateway |--| MUSD |   |
| +------+  +----------------------+  |          |  +----------------------+  +---------------------+  +------+   |
|                                     |          |                                                                |
+-------------------------------------+          +----------------------------------------------------------------+
```

The order of operations is as follows:
1. The user approves MUSD to the `WormholeMUSDGateway` and calls the
   `WormholeMUSDGateway.bridgeOut` function on Ethereum.
2. That function burns the canonical MUSD and calls `TokenBridge.transferTokens`
   to transfer the Wormhole wrapped token back to Mezo.
3. Once the bridging operation completes, the user (or the relayer) redeems MUSD
   on Mezo, providing signed Wormhole VAA to the Wormhole `TokenBridge` contract.

### Relaying VAAs

For the token bridged by Wormhole to be unlocked on the target chain, a Wormhole
VAA message signed by Wormhole guardians needs to be delivered to the Wormhol
Bridge contract on that target chain. When MUSD is bridged to Ethereum, that VAA
is delivered via `WormholeMUSDGateway.receive` function. (see
`L2WormholeGateway.receiveTbtc` for a reference). When MUSD is bridged back to
Mezo, that VAA is delivered directly to the Wormhole Token Bridge contract.

One way to deliver this message is to have the user bridging tokens obtain it
from Wormhole guardians and execute a redemption transaction on the Wormhole
Bridge contract.

Another way is to make use of the Wormhole relayer, if available on both chains,
and schedule a VAA delivery by calling an appropriate function in the contract
when bridging. The function is `sendVaasToEvm` and an example use of it is in
the [`_transferTbtc` function](https://github.com/threshold-network/tbtc-v2/blob/f702144f76b3fc8648ed4eb9d7d9c7113b0f343b/solidity/contracts/cross-chain/wormhole/L1BTCDepositorWormhole.sol#L214-L241) of the tBTC depositor.

If the Wormhole relayer will be available on Mezo, we should use it. If not, and
the time to deliver it is far in the future, we should first provide the
implementation with manual redemption on the target chain, and upgrade it later,
once the Wormhole relayer is available. Adding relayer support may require
implementing an additional contract on Mezo, allowing for initiating bridging and
scheduling VAA delivery in one transaction - this has to be confirmed against the
recent Wormhole docs during the implementation.

### All in one go

Not strictly necessary, but a really nice-to-have feature is to implement a
contract allowing to mint MUSD on Mezo and initiate to-Ethereum bridging in one
transaction. This contract is another layer on top of the bridging solution, and
we should approach the implementation of this contract closer to the end of the
work on this project.

### Additional notes

The `WormholeGatewaycontract` should be deployed behind an upgradeable
transparent proxy with a proxy admin contract controlled by the Mezo Governance.

Let's be very careful with reentrancy and not add any more functionality to the
gateway contracts outside of what is strictly necessary, given the past security
vulnerabilities for tBTC - see
[the blog post](https://blog.threshold.network/retro-l2-wormholegateway-crit/)
and [the security advisory](https://github.com/threshold-network/tbtc-v2/security/advisories/GHSA-54q9-r92x-944r).
