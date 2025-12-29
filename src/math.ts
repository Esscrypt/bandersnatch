/**
 * Modular arithmetic utilities for Bandersnatch curve operations
 */

import {
  FpIsSquare,
  FpSqrt,
  type IField,
} from '@noble/curves/abstract/modular.js'

/**
 * Computes the non-negative modular reduction.
 *
 * Returns `a mod m` where the result is always non-negative (0 <= result < m).
 * This handles negative inputs correctly by adding the modulus to negative results.
 *
 * @param a - The value to reduce
 * @param m - The modulus
 * @returns Non-negative result of `a mod m`
 */
export function mod(a: bigint, m: bigint): bigint {
  const result = a % m
  return result < 0n ? result + m : result
}

/**
 * Computes the modular inverse using the extended Euclidean algorithm.
 *
 * Finds the value `x` such that `(a * x) mod m = 1`. The modular inverse exists
 * if and only if `gcd(a, m) = 1`.
 *
 * @param a - The value to find the inverse of
 * @param m - The modulus
 * @returns The modular inverse of `a` modulo `m`
 * @throws {Error} If the modular inverse does not exist (gcd(a, m) !== 1)
 */
export function modInverse(a: bigint, m: bigint): bigint {
  let [oldR, r] = [a, m]
  let [oldS, s] = [1n, 0n]

  while (r !== 0n) {
    const quotient = oldR / r
    ;[oldR, r] = [r, oldR - quotient * r]
    ;[oldS, s] = [s, oldS - quotient * s]
  }

  if (oldR > 1n) {
    throw new Error('Modular inverse does not exist')
  }

  return oldS < 0n ? oldS + m : oldS
}

/**
 * Computes the modular square root using the noble package FpSqrt.
 *
 * Finds a value `x` such that `x^2 mod p = value`. The square root exists
 * if and only if `value` is a quadratic residue modulo `p`.
 *
 * @param value - The value to find the square root of
 * @param p - The prime modulus
 * @param field - The field implementation from @noble/curves
 * @returns The modular square root if it exists, or `null` if the value is not a quadratic residue
 */
export function modSqrt(
  value: bigint,
  p: bigint,
  field: IField<bigint>,
): bigint | null {
  if (value === 0n) return 0n
  if (value === 1n) return 1n

  // Check if value is a quadratic residue using noble package
  if (!FpIsSquare(field, value)) {
    return null
  }

  // Use noble package FpSqrt for modular square root
  const sqrtFn = FpSqrt(p)
  return sqrtFn(field, value)
}

export function numberToBytesLittleEndian(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32)
  const hex = value.toString(16).padStart(64, '0')
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(hex.slice(62 - i * 2, 64 - i * 2), 16)
  }
  return bytes
}
