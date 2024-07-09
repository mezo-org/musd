export function to1ePrecision(
  n: string | number | bigint,
  precision: number,
): bigint {
  return BigInt(n) * 10n ** BigInt(precision)
}

export function to1e18(n: string | number | bigint): bigint {
  return to1ePrecision(n, 18)
}
