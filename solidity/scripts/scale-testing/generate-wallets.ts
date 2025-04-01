// scripts/scale-testing/generate-wallets.ts
import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"

// Configuration
const WALLET_COUNT = 100 // Number of wallets to generate
const OUTPUT_DIR = path.join(__dirname, "..", "..", "scale-testing")
const WALLETS_FILE = path.join(OUTPUT_DIR, "wallets.json")
const ENCRYPTED_KEYS_FILE = path.join(OUTPUT_DIR, "encrypted-keys.json")

// Generate a secure password for encryption (or provide your own)
function generateSecurePassword(): string {
  return crypto.randomBytes(32).toString("hex")
}

async function main() {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  console.log(`Generating ${WALLET_COUNT} wallets...`)

  // Generate wallets
  const wallets = []
  const encryptedKeys = []
  const password = generateSecurePassword()

  // Save password to a separate file with restricted permissions
  const passwordFile = path.join(OUTPUT_DIR, "password.txt")
  fs.writeFileSync(passwordFile, password)
  fs.chmodSync(passwordFile, 0o600) // Only owner can read/write

  console.log(`Password saved to ${passwordFile}`)
  console.log(
    "IMPORTANT: Keep this password secure and don't commit it to version control!",
  )

  for (let i = 0; i < WALLET_COUNT; i++) {
    // Create a new random wallet
    const wallet = ethers.Wallet.createRandom()

    // Encrypt the private key
    const encryptedKey = await wallet.encrypt(password)

    // Store wallet info and encrypted key
    wallets.push({
      address: wallet.address,
      index: i,
    })

    encryptedKeys.push({
      address: wallet.address,
      encryptedKey,
    })

    if ((i + 1) % 10 === 0 || i === WALLET_COUNT - 1) {
      console.log(`Generated ${i + 1}/${WALLET_COUNT} wallets`)
    }
  }

  // Save wallet addresses (public info)
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2))
  console.log(`Wallet addresses saved to ${WALLETS_FILE}`)

  // Save encrypted private keys
  fs.writeFileSync(ENCRYPTED_KEYS_FILE, JSON.stringify(encryptedKeys, null, 2))
  fs.chmodSync(ENCRYPTED_KEYS_FILE, 0o600) // Only owner can read/write
  console.log(`Encrypted private keys saved to ${ENCRYPTED_KEYS_FILE}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error generating wallets:", error)
    process.exit(1)
  })
