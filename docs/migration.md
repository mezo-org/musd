# Contract Migration Guide

## Summary

This guide describes the process for migrating to an entirely new set of contracts while keeping the old contract set in place.
The end result will be two sets of contracts both connected to the same MUSD token contract.  Trove operations can be performed
on both new and old contract sets simultaneously.

## 1. Contract Code Preparation
- Prepare new contract code
- Same contract names in Solidity code are fine

## 2. Deployment Strategy
- Create new deployment scripts starting at `100_` to avoid conflicts with existing deployments
- Skip MUSD and TokenDeployer as we will be reusing those contracts.
- Either skip PriceFeed or update the old contracts to use a new PriceFeed.  There is no need for multiple PriceFeed contracts.
- If you have the same .sol filename, you can give the contract a different name for deployment like this:
```typescript
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeployProxy } = await setupDeploymentBoilerplate(hre)
  await getOrDeployProxy("NewBorrowerOperations", {
    contractName: "BorrowerOperations",
  })
}
```

## 3. Setting Contract Addresses
- Modify or add a new `fetchAllDeployedContracts` helper to get new contract addresses.  For example:
```typescript
export async function newFetchAllDeployedContracts(
  isHardhatNetwork: boolean,
  isFuzzTestingNetwork: boolean,
) {
  const activePool: ActivePool = await getDeployedContract("NewActivePool")
  // Rest of the function follows the same pattern of replacing the contract names...
```
- Example address setting script with a `newFetchAllDeployedContracts` that gets our new versions of each contract:
```typescript
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { borrowerOperations, sortedTroves, troveManager } =
    await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "NewHintHelpers",
    "setAddresses",
    await borrowerOperations.getAddress(),
    await sortedTroves.getAddress(),
    await troveManager.getAddress(),
  )
}
```

## 4. MUSD System Contract Update
- Create script `200_set_new_contracts_in_musd.ts`
- Use `setSystemContracts` to add new contracts to MUSD:
```typescript
await execute(
  "MUSD",
  "setSystemContracts",
  await troveManager.getAddress(),
  await stabilityPool.getAddress(),
  await borrowerOperations.getAddress(),
  await interestRateManager.getAddress(),
)
```

## 5. PCV Initialization
- Call `initializeDebt` on new PCV contract if creating new bootstrap loan

## 6. Testing Steps
- Verify system contracts are added by checking MUSD's `mintList` and `burnList`
    - Both old and new contract addresses should return `true`
- Test `openTrove` and other Trove operations against new BorrowerOperations and TroveManager

## 7. Network Considerations
- This process is for testnet deployment
- Mainnet deployments may have different deployer accounts and configurations