import {
  FpIsSquare,
  FpSqrt,
  type IField,
} from '@noble/curves/abstract/modular.js'

export function mod(a: bigint, m: bigint): bigint {
  const result = a % m
  return result < 0n ? result + m : result
}

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

export function modSqrt(
  value: bigint,
  p: bigint,
  field: IField<bigint>,
): bigint | null {
  if (value === 0n) return 0n
  if (value === 1n) return 1n

  if (!FpIsSquare(field, value)) {
    return null
  }

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
