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
const PASSWORD_FILE = path.join(__dirname, "password.txt")

// Generate a secure password for encryption (or provide your own)
function generateSecurePassword(): string {
  return crypto.randomBytes(32).toString("hex")
}

async function main() {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Check for existing wallet files and password
  const passwordExists = fs.existsSync(PASSWORD_FILE)
  const walletsExist = fs.existsSync(WALLETS_FILE)
  const encryptedKeysExist = fs.existsSync(ENCRYPTED_KEYS_FILE)

  // Get existing password or generate a new one
  let password: string
  if (passwordExists) {
    password = fs.readFileSync(PASSWORD_FILE, "utf8").trim()
    console.log("Using existing password from password.txt")
  } else {
    password = generateSecurePassword()

    // Save new password to file
    fs.writeFileSync(PASSWORD_FILE, password)
    fs.chmodSync(PASSWORD_FILE, 0o600) // Only owner can read/write

    console.log(`Generated new password and saved to ${PASSWORD_FILE}`)
    console.log(
      "IMPORTANT: Keep this password secure and don't commit it to version control!",
    )
  }

  // Load existing wallets if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let wallets: any[] = []
  let encryptedKeys: never[] = []
  let nextIndex = 0

  if (walletsExist && encryptedKeysExist) {
    wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"))
    encryptedKeys = JSON.parse(fs.readFileSync(ENCRYPTED_KEYS_FILE, "utf8"))
    console.log(`Loaded ${wallets.length} existing wallets`)

    // Find the highest index to continue from there
    if (wallets.length > 0) {
      nextIndex = Math.max(...wallets.map((w) => w.index)) + 1
    }
  }

  // Determine how many more wallets we need
  const walletsNeeded = Math.max(0, WALLET_COUNT - wallets.length)

  if (walletsNeeded <= 0) {
    console.log(
      `Already have ${wallets.length} wallets, no need to generate more.`,
    )
  } else {
    console.log(`Generating ${walletsNeeded} additional wallets...`)

    for (let i = 0; i < walletsNeeded; i++) {
      // Create a new random wallet
      const wallet = ethers.Wallet.createRandom()

      // Encrypt the private key
      const encryptedKey = await wallet.encrypt(password)

      // Store wallet info and encrypted key
      wallets.push({
        address: wallet.address,
        index: nextIndex + i,
      })

      encryptedKeys.push({
        address: wallet.address,
        encryptedKey,
      })

      if ((i + 1) % 10 === 0 || i === walletsNeeded - 1) {
        console.log(`Generated ${i + 1}/${walletsNeeded} wallets`)
      }
    }

    // Save wallet addresses (public info)
    fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2))
    console.log(`Wallet addresses saved to ${WALLETS_FILE}`)

    // Save encrypted private keys
    fs.writeFileSync(
      ENCRYPTED_KEYS_FILE,
      JSON.stringify(encryptedKeys, null, 2),
    )
    fs.chmodSync(ENCRYPTED_KEYS_FILE, 0o600) // Only owner can read/write
    console.log(`Encrypted private keys saved to ${ENCRYPTED_KEYS_FILE}`)
  }

  console.log(`Total wallets available: ${wallets.length}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error generating wallets:", error)
    process.exit(1)
  })
