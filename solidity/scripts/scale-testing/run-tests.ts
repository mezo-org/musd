// scripts/scale-testing/run-tests.ts
import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"

// Configuration interface
interface TestConfig {
  network: string
  setupScripts: ScriptConfig[]
  scenarios: ScriptConfig[]
  scenarioLoops: ScenarioLoop[]
}

interface ScriptConfig {
  name: string
  path: string
  enabled: boolean
}

interface ScenarioLoop {
  name: string
  enabled: boolean
  scenarios: string[]
  iterations: number
}

// Default configuration
const defaultConfig: TestConfig = {
  network: "matsnet_fuzz",
  setupScripts: [
    { name: "Generate Wallets", path: "generate-wallets.ts", enabled: true },
    { name: "Fund Wallets", path: "fund-wallets.ts", enabled: true },
    { name: "Initialize State", path: "init-state-tracking.ts", enabled: true },
    { name: "Open Troves", path: "scenarios/open-troves.ts", enabled: true },
  ],
  scenarios: [
    {
      name: "Add Collateral",
      path: "scenarios/add-collateral.ts",
      enabled: true,
    },
    {
      name: "Increase Debt",
      path: "scenarios/increase-debt.ts",
      enabled: true,
    },
    { name: "Repay MUSD", path: "scenarios/repay-musd.ts", enabled: true },
    {
      name: "Withdraw Collateral",
      path: "scenarios/withdraw-collateral.ts",
      enabled: true,
    },
    { name: "Send MUSD", path: "scenarios/send-musd.ts", enabled: true },
    { name: "Redeem MUSD", path: "scenarios/redeem-musd.ts", enabled: true },
    {
      name: "Liquidate Troves",
      path: "scenarios/liquidate-troves.ts",
      enabled: true,
    },
    { name: "Close Trove", path: "scenarios/close-trove.ts", enabled: true },
  ],
  scenarioLoops: [
    {
      name: "Basic Trove Operations Loop",
      enabled: true,
      scenarios: [
        "scenarios/add-collateral.ts",
        "scenarios/increase-debt.ts",
        "scenarios/repay-musd.ts",
        "scenarios/withdraw-collateral.ts",
      ],
      iterations: 3,
    },
    {
      name: "MUSD Usage Loop",
      enabled: false,
      scenarios: ["scenarios/send-musd.ts", "scenarios/redeem-musd.ts"],
      iterations: 2,
    },
  ],
}

// Create config file if it doesn't exist
const configPath = path.join(__dirname, "test-config.json")
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2))
  console.log(`Created default config at ${configPath}`)
}

// Load config
const config: TestConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))

// Create backup directory if it doesn't exist
const backupDir = path.join(__dirname, "..", "..", "scale-testing", "backups")
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
}

// Create a backup of the state files
function backupStateFiles() {
  const timestamp = new Date().toISOString().replace(/:/g, "-")
  const backupPath = path.join(backupDir, timestamp)

  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true })
  }

  // Get all state files from the scale-testing directory
  const stateDir = path.join(__dirname, "..", "..", "scale-testing")
  if (!fs.existsSync(stateDir)) {
    return
  }

  const stateFiles = ["wallets.json", "encrypted-keys.json"]

  // Add any account-state files
  const allFiles = fs.readdirSync(stateDir)
  for (const file of allFiles) {
    if (file.startsWith("account-state-")) {
      stateFiles.push(file)
    }
  }

  // Copy each file to the backup directory
  for (const file of stateFiles) {
    const srcPath = path.join(stateDir, file)
    if (fs.existsSync(srcPath)) {
      const destPath = path.join(backupPath, file)
      fs.copyFileSync(srcPath, destPath)
    }
  }

  console.log(`Created backup at ${backupPath}`)
}

// Run a script with specified arguments
function runScript(scriptPath: string) {
  const fullPath = path.join(__dirname, scriptPath)

  if (!fs.existsSync(fullPath)) {
    console.error(`Script not found: ${fullPath}`)
    return false
  }

  console.log(
    `\n=== Running: npx hardhat run ${fullPath} --network ${config.network} ===\n`,
  )

  try {
    execSync(`npx hardhat run ${fullPath} --network ${config.network}`, {
      stdio: "inherit",
    })
    return true
  } catch (error) {
    console.error(`Error running ${scriptPath}:`, error)
    return false
  }
}

function runScriptForLoop(scriptPath: string) {
  try {
    // Pass LOOP_MODE=true as an environment variable
    const command = `npx hardhat run ${path.join(__dirname, scriptPath)} --network ${config.network}`
    console.log(`Executing: ${command} (in loop mode)`)
    execSync(command, {
      stdio: "inherit",
      env: { ...process.env, LOOP_MODE: "true" },
    })
    return true
  } catch (error) {
    console.error(`Error running ${scriptPath}:`, error)
    return false
  }
}

// Run setup scripts
async function runSetup() {
  console.log("\n=== Running Setup Scripts ===\n")

  for (const script of config.setupScripts) {
    if (!script.enabled) {
      console.log(`Skipping ${script.name} (disabled in config)`)
      continue
    }

    console.log(`\nRunning ${script.name}...`)
    if (!runScript(script.path)) {
      console.error(`Failed to run ${script.name}. Exiting.`)
      return false
    }
  }

  // After setup, create a backup
  backupStateFiles()
  return true
}

// Run individual scenario scripts
async function runScenarios() {
  console.log("\n=== Running Scenario Scripts ===\n")

  for (const script of config.scenarios) {
    if (!script.enabled) {
      console.log(`Skipping ${script.name} (disabled in config)`)
      continue
    }

    console.log(`\nRunning ${script.name}...`)
    if (!runScript(script.path)) {
      console.warn(
        `Warning: ${script.name} encountered issues. Continuing with next scenario.`,
      )
    }
  }

  // After scenarios, create a backup
  backupStateFiles()
  return true
}

// Run scenario loops
async function runScenarioLoops() {
  console.log("\n=== Running Scenario Loops ===\n")

  for (const loop of config.scenarioLoops) {
    if (!loop.enabled) {
      console.log(`Skipping loop: ${loop.name} (disabled in config)`)
      continue
    }

    console.log(
      `\n=== Running Scenario Loop: ${loop.name} (${loop.iterations} iterations) ===\n`,
    )

    for (let i = 0; i < loop.iterations; i++) {
      console.log(
        `\n--- Starting loop iteration ${i + 1}/${loop.iterations} ---\n`,
      )

      for (const scenarioPath of loop.scenarios) {
        const scenarioName =
          config.scenarios.find((s) => s.path === scenarioPath)?.name ||
          scenarioPath
        console.log(`\nRunning ${scenarioName}...`)

        // Use the loop-aware run function for scenarios in a loop
        if (!runScriptForLoop(scenarioPath)) {
          console.warn(
            `Warning: ${scenarioName} encountered issues. Continuing with next scenario.`,
          )
        }
      }

      // Backup state after each loop iteration
      backupStateFiles()
    }
  }

  return true
}

// Main function
async function main() {
  console.log(`Starting scale testing sequence for network: ${config.network}`)

  // Run setup
  if (!(await runSetup())) {
    return
  }

  // Run scenarios
  if (!(await runScenarios())) {
    return
  }

  // Run loops (if enabled)
  if (!(await runScenarioLoops())) {
    return
  }

  console.log("\n=== Scale Testing Complete ===\n")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
