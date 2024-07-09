import {
  SnapshotRestorer,
  takeSnapshot,
} from "@nomicfoundation/hardhat-toolbox/network-helpers"

/**
 * Adds a before/after hook pair to snapshot the EVM state before and after tests
 * in a test suite.
 */
export function beforeAfterSnapshotWrapper(): void {
  let snapshot: SnapshotRestorer

  before(async () => {
    snapshot = await takeSnapshot()
  })

  after(async () => {
    await snapshot.restore()
  })
}

/**
 * Adds a beforeEach/afterEach hook pair to snapshot the EVM state before and
 * after each of tests in a test suite.
 */
export function beforeAfterEachSnapshotWrapper(): void {
  let snapshot: SnapshotRestorer

  beforeEach(async () => {
    snapshot = await takeSnapshot()
  })

  afterEach(async () => {
    await snapshot.restore()
  })
}
