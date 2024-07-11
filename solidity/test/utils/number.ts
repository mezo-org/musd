export function to1ePrecision(
  n: string | number | bigint,
  precision: number,
): bigint {
  const [integerPart, fractionalPart = ""] = n
    .toString()
    .replace(/,/g, "")
    .split(".")

  // Pad the fractional part with zeros to ensure it has at least `precision` digits
  const paddedFractionalPart = fractionalPart.padEnd(precision, "0")

  // Combine the integer part and the padded fractional part
  const combined = integerPart + paddedFractionalPart

  // Create the BigInt and adjust for precision if the fractional part was shorter than precision
  return (
    BigInt(combined) * 10n ** BigInt(precision - paddedFractionalPart.length)
  )
}

export function to1e18(n: string | number | bigint): bigint {
  return to1ePrecision(n, 18)
}

export const GOVERNANCE_TIME_DELAY = 90 * 24 * 60 * 60 // 90 days in seconds
export const ZERO_ADDRESS = `0x${"0".repeat(40)}`
