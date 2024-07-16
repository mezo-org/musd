import { ethers } from "hardhat"
import { Contracts, Users } from "./interfaces"

interface AddressBalances {
  musd: bigint
  btc: bigint
}

interface Data {
  [address: string]: bigint
}

function formatBigIntWithCommas(value: bigint): string {
  const temp = value / 10000000000000000n
  // Convert bigint to string
  const str = temp.toString()
  // Ensure the string has at least 3 characters
  if (str.length < 3) {
    return str
  }

  // Extract the last two digits as the fractional part
  const integralPart = str.slice(0, -2)
  const fractionalPart = str.slice(-2)

  // Use regex to add commas to the integral part
  const formattedIntegralPart = integralPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  )

  // Combine the formatted integral part with the fractional part
  return `${formattedIntegralPart}.${fractionalPart}`
}

async function getAddressBalances(contracts: Contracts, address: string) {
  if (address === undefined) {
    return {
      musd: 0,
      btc: 0,
    }
  }

  const balances = {
    musd: await contracts.musd.balanceOf(address),
    btc: await ethers.provider.getBalance(address),
  }

  return balances
}

async function printAddressBalances(
  balances: AddressBalances,
  address: string,
  name: string,
) {
  const maxLength = 20
  if (balances.musd > 0n || balances.btc > 0n) {
    if (name.length > 0) {
      console.log(`${name.padEnd(maxLength)} ${address}`)
    } else {
      console.log(address)
    }
    console.log("\tMUSD : \t\t", formatBigIntWithCommas(balances.musd))
    console.log("\tBTC : \t\t", formatBigIntWithCommas(balances.btc))
    console.log("")
  }
}

export async function debugBalances(
  contracts: Contracts,
  users: Users,
  displayUsers: string[],
) {
  // , users: Users, print: boolean

  // if (print) {
  console.log(
    "==================================================================",
  )
  console.log("CONTRACT BALANCES")
  console.log(
    "------------------------------------------------------------------",
  )
  // }
  const data: Data = {}
  const contractNames = [
    "activePool",
    "borrowerOperations",
    "troveManager",
    "collSurplusPool",
    "defaultPool",
    "hintHelpers",
    "pcv",
    "priceFeed",
    "sortedTroves",
    "stabilityPool",
    "gasPool",
  ]

  for (const contractName of contractNames) {
    if (contractName in contracts) {
      const address = await contracts[contractName].getAddress()
      if (address !== undefined) {
        data[address] = await getAddressBalances(contracts, address)
        await printAddressBalances(data[address], address, contractName)
      }
    }
  }

  if (displayUsers.length > 0) {
    console.log(
      "==================================================================",
    )
    console.log("USER BALANCES")
    console.log(
      "------------------------------------------------------------------",
    )
    // }
    for (const [key, user] of Object.entries(users)) {
      const address = await user.getAddress()
      // console.log(`${key}: ${address}`);
      const temp = await getAddressBalances(contracts, address)
      if (key !== "deployer" && displayUsers.includes(key)) {
        printAddressBalances(temp, address, key)
      }
    }
  }
  //   for (let address of users) {
  //     users[address] = await getAddressBalances(contracts, address);
  //     // if (print) {
  //       printAddressBalances(data[address], address, "");
  //     // }
  //   }
  //   return data;
}
