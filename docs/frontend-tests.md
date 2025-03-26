Forking the blockchain:
From the solidity directory run npx hardhat node --fork https://rpc.test.mezo.org --fork-block-number BLOCK_NUMBER
where BLOCK_NUMBER is the block before the transaction you want to test

From another console run npx node scripts/validate-hints.js replacing the hints and NICR with the parameters from the transaction 
you want to test.  Note you may need to calculate the NICR by hand or modify BorrowerOperations to log it out during the
call to openTrove.

For modified contracts, you can use the deployments/localhost artifacts, although keep in mind they will not have the
same state as the "real" contracts if you are doing any testing that relies on state.  This is mostly useful for pure functions
like NICR calculations mentioned above.

To estimate gas for opening a trove, run npx node scripts/estimate-gas.js from another console.