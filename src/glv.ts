/**
 * GLV (Gallant-Lambert-Vanstone) endomorphism for Bandersnatch scalar multiplication.
 *
 * Decomposes a ~253-bit scalar multiplication [k]P into two ~127-bit multiplications
 * using an efficiently computable endomorphism phi:
 *   [k]P = [k1]P + [k2]phi(P)   where k = k1 + lambda*k2,  |k1|,|k2| ~ sqrt(r)
 *
 * Combined with Shamir's trick (simultaneous double-and-add), this halves the
 * number of doublings from ~253 to ~127, yielding ~40% speedup.
 *
 * Reference: Bandersnatch paper (https://eprint.iacr.org/2021/1152)
 * Constants derived from: ZKNoxHQ/PyBandersnatch sage scripts
 * Algorithm from: arkworks-algebra/ec/src/scalar_mul/glv.rs
 */

import type { EdwardsPoint } from '@noble/curves/abstract/edwards.js'
import { Bandersnatch } from './curve'
import { BANDERSNATCH_PARAMS } from './config'
import { mod, modInverse } from './math'

const P = BANDERSNATCH_PARAMS.FIELD_MODULUS
const R = BANDERSNATCH_PARAMS.CURVE_ORDER

/**
 * Endomorphism rational map coefficients for the Twisted Edwards form.
 *
 * phi(x, y) in projective TE coords (z=1 for affine input):
 *   x_phi = x * (AY4*y^4 + AY2Z2*y^2 + AZ4) / (y * (CY2*y^2 + CZ2))
 *   y_phi = (BY2*y^2 + BZ2) / (CY2*y^2 + CZ2)
 *
 * Derived via sage from the degree-2 isogeny on the Weierstrass form,
 * transferred to TE coordinates.
 */
const AY4 = 0x1d46e71b2d28e06c42bc1f5a41f4a0156d070863689e8862eb12927f72f308c3n
const AY2Z2 = 0x20b21e58881722d68c92fa09709ea65d716e869843e94c821df033483694a51an
const AZ4 = 0x1373fe65dcb354e5209f902de5b37008d6c2721d8d6d5fb556e8b7e969c053c9n
const BY2 = 0x33937d60e9a0dd55ed1f9030e7c8b6fa9c42e1e41d2f1361a0fed9630f711caen
const BZ2 = 0x39a33e54438fe0155ae18e93205d4395acfe4be1127ca6458fc0270450b1b50dn
const CY2 = 0x2cdc91c2ed341d7901e6d6ece64cd98591c66ba64cdc7109d1bdd9cb6f93ee68n
const CZ2 = 0x405a29f23ffc9ff2461a47d721d9210ab77ac21ee2cf489d5f01269bf08ee353n

/**
 * Scalar decomposition lattice basis (LLL-reduced).
 * Used to decompose k into k1 + lambda*k2 with |k1|, |k2| ~ sqrt(r).
 */
const M1 = -113482231691339203864511368254957623327n
const M2 = 10741319382058138887739339959866629956n
const M3 = 21482638764116277775478679919733259912n

/**
 * Floor division for BigInt (towards negative infinity).
 * JS BigInt `/` truncates towards zero; this corrects for negative dividends.
 */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b
  const r = a % b
  if (r !== 0n && (r < 0n) !== (b < 0n)) {
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

/**
 * Compute the Bandersnatch endomorphism phi(P) on a Twisted Edwards point.
 *
 * phi is the sqrt(-2) endomorphism satisfying phi(P) = [lambda]P for all P in
 * the prime-order subgroup, where lambda is the endomorphism eigenvalue.
 *
 * The rational map operates on affine TE coordinates:
 *   x_phi = x * (AY4*y^4 + AY2Z2*y^2 + AZ4) / (y * (CY2*y^2 + CZ2))
 *   y_phi = (BY2*y^2 + BZ2) / (CY2*y^2 + CZ2)
 *
 * Cost: ~12 field multiplications + 1 field inversion (constant, independent of scalar size).
 */
export function endomorphism(point: EdwardsPoint): EdwardsPoint {
  if (point.equals(Bandersnatch.ZERO)) {
    return Bandersnatch.ZERO
  }

  const { x, y } = point.toAffine()

  const y2 = mod(y * y, P)
  const y4 = mod(y2 * y2, P)

  const xNumerator = mod(
    x * mod(AY4 * y4 + AY2Z2 * y2 + AZ4, P),
    P,
  )

  const denominator = mod(CY2 * y2 + CZ2, P)
  const denominatorInv = modInverse(denominator, P)

  const yDenominator = mod(y * denominator, P)
  const yDenominatorInv = modInverse(yDenominator, P)

  const xPhi = mod(xNumerator * yDenominatorInv, P)
  const yPhi = mod(mod(BY2 * y2 + BZ2, P) * denominatorInv, P)

  return Bandersnatch.fromAffine({ x: xPhi, y: yPhi })
}

/**
 * Decompose scalar k into (k1, k2) such that k === k1 + lambda * k2 (mod r),
 * with |k1|, |k2| approximately sqrt(r) (~127 bits).
 *
 * Uses Babai's nearest-plane algorithm with the LLL-reduced lattice basis.
 *
 * @returns [sign1, abs_k1, sign2, abs_k2] where sign is true for positive
 */
export function scalarDecomposition(
  k: bigint,
): [boolean, bigint, boolean, bigint] {
  const b0 = floorDiv(k * M1, R)
  const b1 = floorDiv(k * M2, R)

  const s0 = k - b0 * M1 - b1 * M3
  const s1 = -(b0 * M2 + b1 * (-M1))

  return [s0 >= 0n, abs(s0), s1 >= 0n, abs(s1)]
}

/**
 * GLV-accelerated scalar multiplication using Shamir's trick.
 *
 * Computes [scalar]P by:
 * 1. Decomposing scalar into two half-size scalars (k1, k2)
 * 2. Computing phi(P) via the endomorphism
 * 3. Running a single simultaneous double-and-add loop over both scalars
 *
 * The loop iterates ~127 bits instead of ~253, roughly halving the doublings.
 *
 * @param point - The curve point P (must be in the prime-order subgroup)
 * @param scalar - The scalar k (must be in range [1, r-1] after reduction)
 */
export function glvMultiply(
  point: EdwardsPoint,
  scalar: bigint,
): EdwardsPoint {
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

  let b1 = sign1 ? point : point.negate()
  let b2 = sign2 ? endomorphism(point) : endomorphism(point).negate()

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
