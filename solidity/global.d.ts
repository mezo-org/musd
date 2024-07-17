declare module "dotenv-safer"

declare module "hardhat" {
  import { HardhatEthersHelpers } from "@nomicfoundation/hardhat-ethers/types"

  export * from "hardhat/types/runtime"
  export const ethers: HardhatEthersHelpers
}
