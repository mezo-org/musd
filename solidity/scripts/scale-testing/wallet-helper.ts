// scripts/scale-testing/wallet-helper.ts
import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"

export default class WalletHelper {
  private walletsByAddress: Map<string, ethers.Wallet> = new Map()

  private password: string

  constructor(password?: string) {
    // If password is provided, use it; otherwise try to read from file
    if (password) {
      this.password = password
    } else {
      const passwordFile = path.join(__dirname, "password.txt")
      console.log(`Reading password from ${passwordFile}`)
      if (fs.existsSync(passwordFile)) {
        this.password = fs.readFileSync(passwordFile, "utf8").trim()
      } else {
        throw new Error("Password file not found. Please provide the password.")
      }
    }
  }

  /**
   * Load encrypted wallets from the encrypted-keys.json file
   */
  public async loadEncryptedWallets(addresses?: string[]): Promise<number> {
    const encryptedKeysFile = path.join(
      __dirname,
      "..",
      "..",
      "scale-testing",
      "encrypted-keys.json",
    )

    if (!fs.existsSync(encryptedKeysFile)) {
      throw new Error(`Encrypted keys file not found at ${encryptedKeysFile}`)
    }

    const encryptedKeys = JSON.parse(fs.readFileSync(encryptedKeysFile, "utf8"))
    let loadedCount = 0

    // Only process the requested addresses
    const keysToProcess = addresses
      ? encryptedKeys.filter((entry) => addresses.includes(entry.address))
      : encryptedKeys

    for (const entry of keysToProcess) {
      try {
        // Decrypt the wallet
        const wallet = await ethers.Wallet.fromEncryptedJson(
          entry.encryptedKey,
          this.password,
        )

        // Connect it to the provider
        const connectedWallet = wallet.connect(ethers.provider)

        // Store it in our map
        this.walletsByAddress.set(entry.address, connectedWallet)
        loadedCount++
      } catch (error) {
        console.error(
          `Error decrypting wallet ${entry.address}: ${error.message}`,
        )
      }
    }

    return loadedCount
  }

  /**
   * Get a wallet by address
   */
  public getWallet(address: string): ethers.Wallet | undefined {
    return this.walletsByAddress.get(address)
  }

  /**
   * Get all loaded wallets
   */
  public getAllWallets(): Map<string, ethers.Wallet> {
    return this.walletsByAddress
  }

  /**
   * Clear all loaded wallets
   */
  public clearWallets(): void {
    this.walletsByAddress.clear()
  }
}
