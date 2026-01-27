export const MAX_BYTES_32 = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
)

export const ZERO_ADDRESS = `0x${"0".repeat(40)}`

// Networks that should deploy NoOp instead of their respective contracts as a
// dependency for MUSD token.
// Ethereum and Sepolia was already deployed, hence they are not included.
// Other EVM networks may be added in the future.
export const NOOP_NETWORKS = ["base", "base_sepolia"]
