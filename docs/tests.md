# Accessing Contracts

In the `beforeEach` of each test file the contracts should be loaded from a cached snapshot.

```
cachedTestSetup = await loadFixture(fixture)
testSetup = { ...cachedTestSetup }
contracts = testSetup.contracts
```

The fixtures can be varied between tests and specify which contracts to overwrite with helper versions of the contract.

The fixture that is loaded includes the user accounts for testing and contracts. The contracts loaded by the fixture will conform to the `Contracts` interface

```
export interface Contracts {
  activePool: ActivePool
  borrowerOperations: BorrowerOperations
  collSurplusPool: CollSurplusPool
  defaultPool: DefaultPool
  gasPool: GasPool
  musd: MUSD | MUSDTester
  pcv: PCV
  priceFeed: PriceFeed
  sortedTroves: SortedTroves
  stabilityPool: StabilityPool
  troveManager: TroveManager | TroveManagerTester
}
```

## Smart Contract Helpers

Tester versions of smart contracts allow extra functions to change the state of the network. E.g. to alter the value returned by the pricefeed. PriceFeed.sol has a mock aggregator loaded with an external price setter function

```
// Manual external price setter.
function setPrice(uint256 price) external onlyOwner returns (bool) {
    // slither-disable-next-line events-maths
    _price = price;
    return true;
}
```

Which can be called in the tests by connecting as the contract owner.

```
await contracts.mockAggregator.connect(deployer).setPrice(price)
```

# Unit Tests

Unit tests should only test one piece of functionality per test. When an operation changes the state in a trove and another contract the test for that should be split across

- Individual Troves
- State change in other contracts

This is to reduce duplication of testing.

## Test Groups

To make it easy to reason about what things are being tested the unit tests should be grouped into

- Expected Reverts
- Emitted Events
- System State Changes
- Individual Troves
- Balance changes
- Fees
- State change in other contracts

Eventually we should have the same functionality tested across the following states

- no troves
- single trove
- normal operation
- recovery mode

## Unit Test Helpers

When testing smart contracts requires passing a variety of input parameter combinations to a function then helpers should be used with default values that can be overwritten to reduce the code. e.g.

```
export interface OpenTroveParams {
  musdAmount: string | bigint
  ICR?: string
  lowerHint?: string
  sender: HardhatEthersSigner
  upperHint?: string
}
```

Calls to BorrowerOperations functions have wrappers with default values to reduce the overall size of tests.

Tests should be optimised for readability so helper functions should accept both amounts with bigint and string inputs. Strings should be able to include commas for readability and be converted into bigints in the helper function.

```
await openTrove(contracts, {
    musdAmount: MIN_NET_DEBT,
    sender: alice.wallet,
})
```

When checking reverts

```
await expect(
    openTrove(
        contracts, {
        musdAmount: "100,000",
        sender: deployer.wallet,
    })
).to.be.revertedWith("MUSD: Caller not allowed to mint")
```

## Unit Test User State

State related to users is grouped together for improve readability.

The user in tests conform to the following interface:

```
export interface User {
  address: string
  btc: {
    before: bigint
    after: bigint
  }
  musd: {
    before: bigint
    after: bigint
  }
  trove: {
    collateral: {
      before: bigint
      after: bigint
    }
    debt: {
      before: bigint
      after: bigint
    }
    stake: {
      before: bigint
      after: bigint
    }
    status: {
      before: bigint
      after: bigint
    }
  }
  rewardSnapshot: {
    collateral: {
      before: bigint
      after: bigint
    }
    debt: {
      before: bigint
      after: bigint
    }
  }
  pending: {
    collateral: {
      before: bigint
      after: bigint
    }
    debt: {
      before: bigint
      after: bigint
    }
  }
  wallet: HardhatEthersSigner
}
```

This enables more human-readable unit tests like

```
expect(alice.collateral.after).to.equal(alice.collateral.before + collateralTopUp)
expect(alice.btc.after).to.equal(alice.btc.before - collateralTopUp)
```

## Pretest Trove Setup

Each test file should have a unique before each function to set the state of the users and contracts before the test occurs. This is to reduce the amount of code required for each test.

For example in the BorrowerOperations tests for recovery mode we want there to be at least two troves in the system, since different behaviour occurs when there is only one trove in the system.

```
async function recoveryModeSetup() {
  // data setup
  const transactions = [
    {
      musdAmount: "10,000",
      sender: alice.wallet,
    },
    {
      musdAmount: "20,000",
      sender: bob.wallet,
    },
  ]

  for (let i = 0; i < transactions.length; i++) {
    await openTrove(contracts, transactions[i])
  }

  // collateral value drops from 50,000 to 10,000
  const price = to1e18("10,000")
  await contracts.mockAggregator.connect(deployer.wallet).setPrice(price)
  expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(true)
}

beforeEach(async () => {
  // fixtureBorrowerOperations has a mock trove manager so we can change rates
  cachedTestSetup = await loadFixture(fixtureBorrowerOperations)
  testSetup = { ...cachedTestSetup }
  contracts = testSetup.contracts

  // users
  alice = testSetup.users.alice
  bob = testSetup.users.bob
  carol = testSetup.users.carol
  deployer = testSetup.users.deployer

  await recoveryModeSetup()
})
```

After the initial troves are opened the price of BTC is dropped from $50,000 to $10,000 to put the network into recovery mode, which then gets checked.

## Temporary Variables

When the state being read from a contract is only being tested once storing it in a temporary variable doesn't improve the readability for the first example below

```
const baseRate2 = await contracts.troveManager.baseRate()
expect(baseRate2).to.equal(0)

vs

expect(await contracts.troveManager.baseRate()).to.equal(0)
```

In this second example the temporary variable makes the test more readable by having a meaningful name:

```
const expectedCollateral = (await getTroveEntireColl(contracts, carol.wallet)) + activePoolCollateralBefore
expect(await contracts.activePool.getCollateralBalance()).to.equal(expectedCollateral)

vs

expect(await contracts.activePool.getCollateralBalance()).to.equal(await getTroveEntireColl(contracts, carol.wallet) + activePoolCollateralBefore)
```

If the state of a contract is used in multiple comparisons then it should be stored in a temporary variable.

## Test Organization

We split up each external function call into:

- Expected Reverts
- Emitted Events
- System State Changes
- Individual Troves
- Balance changes
- Fees
- State change in other contracts

Here's a template:

```
/**
 *
 * Expected Reverts
 *
 */
context("Expected Reverts", () => {})

/**
 *
 * Emitted Events
 *
 */
context("Emitted Events", () => {})

/**
 *
 * System State Changes
 *
 */
context("System State Changes", () => {})


/**
 *
 * Individual Troves
 *
 */
 context("Individual Troves", () => {})

 /**
  *
  * Balance changes
  *
  */
 context("Balance changes", () => {})

 /**
  *
  * Fees
  *
  */
 context("Fees", () => {})


 /**
  *
  * State change in other contracts
  *
  */
 context("State change in other contracts", () => {})
```
