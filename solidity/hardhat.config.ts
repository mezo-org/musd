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
        runs: 100,
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
      initialBaseFeePerGas: 0,
      allowUnlimitedContractSize: true, // Allow larger contracts for testing
      gas: 12000000,
      blockGasLimit: 0x1fffffffffffff,
      accounts: [
        {
          privateKey:
            "0x60ddFE7f579aB6867cbE7A2Dc03853dC141d7A4aB6DBEFc0Dae2d2B1Bd4e487F",
          balance: "1000000000000000000000000000",
        },
        {
          privateKey:
            "0xeaa445c85f7b438dEd6e831d06a4eD0CEBDc2f8527f84Fcda6EBB5fCfAd4C0e9",
          balance: "10000000000000000000000001",
        },
        {
          privateKey:
            "0x8b693607Bd68C4dEB7bcF976a473Cf998BDE9fBeDF08e1D8ADadAcDff4e5D1b6",
          balance: "1000000000000000000002",
        },
        {
          privateKey:
            "0x519B6e4f493e532a1BEbfeB2a06eA25AAD691A17875cCB38607D4A4C28DFADC2",
          balance: "1000000000000000000003",
        },
        {
          privateKey:
            "0x09CFF53c181C96B42255ccbCEB2CeE7012A532EcbcEaaBab4d55a47E1874FbFC",
          balance: "1000000000000000000004",
        },
        {
          privateKey:
            "0x054ce61b1eA12d9Edb667ceFB001FADB07FE0C37b5A74542BB0DaBF5DDeEe5f0",
          balance: "10000000000000000000000005",
        },
        {
          privateKey:
            "0x42F55f0dFFE4e9e2C2BdfdE2FF98f3d1ea6d3F21A8bB0dA644f1c0e0Acd84FA0",
          balance: "1000000000000000000006",
        },
        {
          privateKey:
            "0x8F3aFFEC01e78ea6925De62d68A5F3f2cFda7D0C1E7ED9b20d31eb88b9Ed6A58",
          balance: "1000000000000000000007",
        },
        {
          privateKey:
            "0xBeBeF90A7E9A8e018F0F0baBb868Bc432C5e7F1EfaAe7e5B465d74afDD87c7cf",
          balance: "1000000000000000000008",
        },
        {
          privateKey:
            "0xaD55BABd2FdceD7aa85eB1FEf47C455DBB7a57a46a16aC9ACFFBE66d7Caf83Ee",
          balance: "1000000000000000000009",
        },
      ],
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
    strict: false,
  },
  gasReporter: {
    enabled: true,
  },
}

export default config
