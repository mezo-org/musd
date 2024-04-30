import { HardhatUserConfig } from "hardhat/config"
import "@keep-network/hardhat-helpers"
import "@nomicfoundation/hardhat-toolbox"
import "@nomicfoundation/hardhat-chai-matchers"
import "@openzeppelin/hardhat-upgrades"
import "hardhat-deploy"
import "hardhat-contract-sizer"
import "hardhat-gas-reporter"
import dotenv from "dotenv-safer"

dotenv.config({
  allowEmptyValues: true,
  example: process.env.CI ? ".env.ci.example" : ".env.example",
})

const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL
  ? process.env.MAINNET_RPC_URL
  : ""

const MAINNET_PRIVATE_KEY = process.env.MAINNET_PRIVATE_KEY
  ? [process.env.MAINNET_PRIVATE_KEY]
  : []

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL
  ? process.env.SEPOLIA_RPC_URL
  : ""

const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY
  ? [process.env.SEPOLIA_PRIVATE_KEY]
  : []

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
  ? process.env.ETHERSCAN_API_KEY
  : ""

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 10000,
      },
    },
  },
  typechain: {
    outDir: "typechain",
  },
  networks: {
    mainnet: {
      url: MAINNET_RPC_URL,
      accounts: MAINNET_PRIVATE_KEY,
      chainId: 1,
      tags: ["etherscan"],
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: SEPOLIA_PRIVATE_KEY,
      chainId: 11155111,
      tags: ["allowStubs", "etherscan"],
    },
    hardhat: {
      tags: ["allowStubs"],
    },
  },
  external: {
    deployments: {
      sepolia: ["./external/sepolia"],
      mainnet: ["./external/mainnet"],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  namedAccounts: {
    deployer: 0,
    governance: {
      default: 0,
      mainnet: "0x98d8899c3030741925be630c710a98b57f397c7a",
    },
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    strict: true,
  },
  gasReporter: {
    enabled: true,
  },
}

export default config
