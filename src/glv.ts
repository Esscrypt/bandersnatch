import type { EdwardsPoint } from '@noble/curves/abstract/edwards.js'
import { BANDERSNATCH_PARAMS } from './config.ts'
import { Bandersnatch } from './curve.ts'
import { mod, modInverse } from './math.ts'

const P = BANDERSNATCH_PARAMS.FIELD_MODULUS
const R = BANDERSNATCH_PARAMS.CURVE_ORDER

const AY4 = 0x1d46e71b2d28e06c42bc1f5a41f4a0156d070863689e8862eb12927f72f308c3n
const AY2Z2 =
  0x20b21e58881722d68c92fa09709ea65d716e869843e94c821df033483694a51an
const AZ4 = 0x1373fe65dcb354e5209f902de5b37008d6c2721d8d6d5fb556e8b7e969c053c9n
const BY2 = 0x33937d60e9a0dd55ed1f9030e7c8b6fa9c42e1e41d2f1361a0fed9630f711caen
const BZ2 = 0x39a33e54438fe0155ae18e93205d4395acfe4be1127ca6458fc0270450b1b50dn
const CY2 = 0x2cdc91c2ed341d7901e6d6ece64cd98591c66ba64cdc7109d1bdd9cb6f93ee68n
const CZ2 = 0x405a29f23ffc9ff2461a47d721d9210ab77ac21ee2cf489d5f01269bf08ee353n

const M1 = -113482231691339203864511368254957623327n
const M2 = 10741319382058138887739339959866629956n
const M3 = 21482638764116277775478679919733259912n

function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b
  const r = a % b
  if (r !== 0n && r < 0n !== b < 0n) {
    return q - 1n
  }
  return q
}

function abs(x: bigint): bigint {
  return x < 0n ? -x : x
}

function bitLength(x: bigint): number {
  if (x === 0n) return 0
  let v = x < 0n ? -x : x
  let bits = 0
  while (v > 0n) {
    bits++
    v >>= 1n
  }
  return bits
}

export function endomorphism(point: EdwardsPoint): EdwardsPoint {
  if (point.equals(Bandersnatch.ZERO)) {
    return Bandersnatch.ZERO
  }

  const { x, y } = point.toAffine()

  const y2 = mod(y * y, P)
  const y4 = mod(y2 * y2, P)

  const xNumerator = mod(x * mod(AY4 * y4 + AY2Z2 * y2 + AZ4, P), P)

  const denominator = mod(CY2 * y2 + CZ2, P)
  const denominatorInv = modInverse(denominator, P)

  const yDenominator = mod(y * denominator, P)
  const yDenominatorInv = modInverse(yDenominator, P)

  const xPhi = mod(xNumerator * yDenominatorInv, P)
  const yPhi = mod(mod(BY2 * y2 + BZ2, P) * denominatorInv, P)

  return Bandersnatch.fromAffine({ x: xPhi, y: yPhi })
}

export function scalarDecomposition(
  k: bigint,
): [boolean, bigint, boolean, bigint] {
  const b0 = floorDiv(k * M1, R)
  const b1 = floorDiv(k * M2, R)

  const s0 = k - b0 * M1 - b1 * M3
  const s1 = -(b0 * M2 + b1 * -M1)

  return [s0 >= 0n, abs(s0), s1 >= 0n, abs(s1)]
}

export function glvMultiply(point: EdwardsPoint, scalar: bigint): EdwardsPoint {
  if (scalar === 0n) {
    return Bandersnatch.ZERO
  }
  if (point.equals(Bandersnatch.ZERO)) {
    return Bandersnatch.ZERO
  }

  const reduced = ((scalar % R) + R) % R
  if (reduced === 0n) {
    return Bandersnatch.ZERO
  }

  const [sign1, absK1, sign2, absK2] = scalarDecomposition(reduced)

  if (absK1 === 0n && absK2 === 0n) {
    return Bandersnatch.ZERO
  }

  const b1 = sign1 ? point : point.negate()
  const b2 = sign2 ? endomorphism(point) : endomorphism(point).negate()

  if (absK1 === 0n) {
    return absK2 === 1n ? b2 : b2.multiply(absK2)
  }
  if (absK2 === 0n) {
    return absK1 === 1n ? b1 : b1.multiply(absK1)
  }

  const b1b2 = b1.add(b2)

  const len1 = bitLength(absK1)
  const len2 = bitLength(absK2)
  const maxLen = len1 > len2 ? len1 : len2

  let res = Bandersnatch.ZERO
  let started = false

  for (let i = maxLen - 1; i >= 0; i--) {
    if (started) {
      res = res.double()
    }

    const bit1 = (absK1 >> BigInt(i)) & 1n
    const bit2 = (absK2 >> BigInt(i)) & 1n

    if (bit1 === 1n && bit2 === 1n) {
      res = started ? res.add(b1b2) : b1b2
      started = true
    } else if (bit1 === 1n) {
      res = started ? res.add(b1) : b1
      started = true
    } else if (bit2 === 1n) {
      res = started ? res.add(b2) : b2
      started = true
    }
  }

  return res
}
