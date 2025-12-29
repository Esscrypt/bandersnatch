/**
 * Bandersnatch Curve Implementation using @noble/curves
 *
 * This uses the @noble/curves Twisted Edwards implementation as a base
 * and customizes it for Bandersnatch parameters
 */

import { type EdwardsPoint, edwards } from '@noble/curves/abstract/edwards.js'
import { Field } from '@noble/curves/abstract/modular.js'
import { BANDERSNATCH_PARAMS } from './config'
import { mod, modInverse, modSqrt } from './math'

// Elligator2 hash-to-curve moved to bandersnatch-vrf package

/**
 * Bandersnatch curve parameters for @noble/curves
 */
const BANDERSNATCH_CURVE = {
  // Field modulus (BLS12-381 scalar field)
  p: BANDERSNATCH_PARAMS.FIELD_MODULUS,

  // Curve order
  n: BANDERSNATCH_PARAMS.CURVE_ORDER,

  // Cofactor
  h: BANDERSNATCH_PARAMS.COFACTOR,

  // Twisted Edwards coefficients
  a:
    BANDERSNATCH_PARAMS.CURVE_COEFFICIENTS.a +
    BANDERSNATCH_PARAMS.FIELD_MODULUS, // Convert -5 to positive
  d: BANDERSNATCH_PARAMS.CURVE_COEFFICIENTS.d,

  // Generator point
  Gx: BANDERSNATCH_PARAMS.GENERATOR.x,
  Gy: BANDERSNATCH_PARAMS.GENERATOR.y,
}

/**
 * Create Bandersnatch curve using @noble/curves
 */
export const Bandersnatch = edwards(BANDERSNATCH_CURVE)

/**
 * Bandersnatch curve operations using @noble/curves.
 *
 * This class provides a high-level interface for working with points on the
 * Bandersnatch elliptic curve. It implements all standard elliptic curve operations
 * including point addition, scalar multiplication, and point compression/decompression
 * compatible with arkworks serialization format.
 *
 * The Bandersnatch curve is a Twisted Edwards curve defined over the BLS12-381 scalar field,
 * designed for efficient cryptographic operations in the JAM protocol.
 */
export class BandersnatchCurve {
  static Fp = Field(BANDERSNATCH_PARAMS.FIELD_MODULUS)

  /**
   * Convert Noble EdwardsPoint to arkworks-compatible compressed bytes
   *
   * This implements the exact arkworks Twisted Edwards point compression algorithm
   * (Compress::Yes mode):
   * 1. Extract affine coordinates (x, y) from the point
   * 2. Determine x-coordinate sign using TEFlags::from_x_coordinate logic
   * 3. Serialize y-coordinate in little-endian format (32 bytes)
   * 4. Encode x-coordinate sign in the MSB (bit 7) of the last byte
   *
   * This always uses compressed form (32 bytes) as required by the Bandersnatch VRF spec
   * section 2.1 for `point_to_string` function. This matches arkworks' `Compress::Yes` mode.
   *
   * Reference: arkworks-algebra/ec/src/models/twisted_edwards/serialization_flags.rs
   * Reference: arkworks-algebra/ec/src/models/twisted_edwards/mod.rs (serialize_with_mode)
   *
   * @param noblePoint - Noble EdwardsPoint to compress
   * @returns Compressed point bytes (32 bytes, arkworks-compatible, compressed format)
   */
  static pointToBytes(noblePoint: EdwardsPoint): Uint8Array {
    const { x, y } = noblePoint.toAffine()
    // Fp.toBytes() allows non-canonical encoding of y (>= p).
    const bytes = Bandersnatch.Fp.toBytes(y)
    // Each y has 2 valid points: (x, y), (x,-y).
    // When compressing, it's enough to store y and use the last byte to encode sign of x
    // Use arkworks TEFlags logic: x > -x determines sign bit
    const negX = mod(
      BANDERSNATCH_PARAMS.FIELD_MODULUS - x,
      BANDERSNATCH_PARAMS.FIELD_MODULUS,
    )
    const xIsNegative = x > negX // TEFlags::XIsNegative if x > -x
    bytes[bytes.length - 1] |= xIsNegative ? 0x80 : 0
    return bytes
  }

  /**
   * Decompresses arkworks-compatible point bytes to a Noble EdwardsPoint.
   *
   * This is the inverse operation of `pointToBytes`. It handles arkworks sign bit logic
   * to reconstruct the full point from compressed bytes. The method:
   * 1. Extracts the y-coordinate from the first 31 bytes (little-endian)
   * 2. Extracts the x-coordinate sign from bit 7 of the last byte
   * 3. Computes the x-coordinate from y using the curve equation
   * 4. Validates the point is in the prime subgroup G
   *
   * @param bytes - Compressed point bytes in arkworks format (32 bytes)
   * @returns Decompressed Noble EdwardsPoint
   * @throws {Error} If the byte array length is not 32
   * @throws {Error} If the y-coordinate exceeds the field modulus
   * @throws {Error} If the point is not on the curve (no square root exists)
   * @throws {Error} If the point is not in the prime subgroup G
   */
  static bytesToPoint(bytes: Uint8Array): EdwardsPoint {
    if (bytes.length !== 32) {
      throw new Error(
        `Invalid compressed point length: ${bytes.length}, expected 32`,
      )
    }

    // Extract sign bit (bit 7 of last byte) - arkworks TEFlags format
    const lastByte = bytes[31]
    const signBit = (lastByte & 0x80) !== 0

    // Clear sign bit to get pure y-coordinate
    const yBytes = new Uint8Array(bytes)
    yBytes[31] = lastByte & 0x7f

    // Convert little-endian y-coordinate to bigint
    let y = 0n
    for (let i = 0; i < 32; i++) {
      y += BigInt(yBytes[i]) << (8n * BigInt(i))
    }

    // Validate y is in field
    if (y >= BANDERSNATCH_PARAMS.FIELD_MODULUS) {
      throw new Error('Invalid y-coordinate: exceeds field modulus')
    }

    // Calculate x from y using curve equation: a*x^2 + y^2 = 1 + d*x^2*y^2
    // Rearranged: x^2 = (y^2 - 1) / (d*y^2 - a)
    const { a, d } = BANDERSNATCH_PARAMS.CURVE_COEFFICIENTS
    const p = BANDERSNATCH_PARAMS.FIELD_MODULUS

    const y2 = mod(y * y, p)
    const numerator = mod(y2 - 1n, p)
    const denominator = mod(d * y2 - a, p)

    // Calculate modular inverse of denominator
    const denominatorInv = modInverse(denominator, p)
    const x2 = mod(numerator * denominatorInv, p)

    // Calculate square root
    const x = modSqrt(x2, p, Bandersnatch.Fp)
    if (x === null) {
      throw new Error('Point is not on curve: no square root exists')
    }

    // Apply arkworks sign bit logic
    // Rust: if flags.is_negative() { (neg_x, y) } else { (x, y) }
    // The flag is set (signBit = true) when the original x satisfied x > -x (XIsNegative)
    // We computed x from y, but we need to determine which of the two possible x values
    // matches the flag. The flag tells us which x was originally used.
    const negX = mod(p - x, p)
    const xIsNegative = x > negX // Check if computed x satisfies x > -x

    // Choose correct x based on sign bit
    // If signBit matches xIsNegative, use x; otherwise use negX
    const finalX = signBit === xIsNegative ? x : negX

    // Create Noble point from affine coordinates
    const point = Bandersnatch.fromAffine({ x: finalX, y })

    // Validate point is in prime subgroup as required by bandersnatch-vrf-spec section 2.1:
    // "This function MUST outputs 'INVALID' if the octet-string does not decode
    // to a point on the prime subgroup G"
    // A point is in the prime subgroup if and only if multiplying by the curve order
    // gives the identity point (infinity)
    // Since @noble/curves requires 1 <= scalar < curve.n, we use CURVE_ORDER - 1
    // and then add the point once more: point * CURVE_ORDER = point * (CURVE_ORDER - 1) + point
    const curveOrderMinusOne = BANDERSNATCH_PARAMS.CURVE_ORDER - 1n
    const pointTimesOrderMinusOne = this.scalarMultiply(
      point,
      curveOrderMinusOne,
    )
    const pointTimesOrder = this.add(pointTimesOrderMinusOne, point)
    const isInPrimeSubgroup = pointTimesOrder.equals(Bandersnatch.ZERO)

    if (!isInPrimeSubgroup) {
      throw new Error(
        'Point is not in prime subgroup: decoded point is not in G',
      )
    }

    return point
  }

  /**
   * Performs scalar multiplication on a curve point.
   *
   * Computes `scalar * point` on the Bandersnatch curve. Handles edge cases including:
   * - Scalar 0: returns the identity point (infinity)
   * - Negative scalars: negates the point and uses positive scalar
   * - Scalars >= curve order: reduces modulo curve order
   *
   * @param point - The curve point to multiply
   * @param scalar - The scalar multiplier (can be negative or >= curve order)
   * @returns The result of scalar multiplication: `scalar * point`
   * @throws {Error} If the point is invalid or not on the curve
   */
  static scalarMultiply(point: EdwardsPoint, scalar: bigint): EdwardsPoint {
    // Handle scalar 0: return identity point
    if (scalar === 0n) {
      return Bandersnatch.ZERO
    }

    // Handle negative scalars: negate point and use positive scalar
    if (scalar < 0n) {
      const negPoint = point.negate()
      const positiveScalar = -scalar
      // Reduce modulo curve order
      const reducedScalar = positiveScalar % BANDERSNATCH_PARAMS.CURVE_ORDER
      if (reducedScalar === 0n) {
        return Bandersnatch.ZERO
      }
      return negPoint.multiply(reducedScalar)
    }

    // Reduce scalar modulo curve order if it's >= curve order
    // @noble/curves requires 1 <= scalar < curve.n
    const reducedScalar = scalar % BANDERSNATCH_PARAMS.CURVE_ORDER
    if (reducedScalar === 0n) {
      return Bandersnatch.ZERO
    }

    return point.multiply(reducedScalar)
  }

  /**
   * Adds two curve points together.
   *
   * Performs point addition on the Bandersnatch curve: `P + Q`.
   * This operation is commutative: `add(P, Q) === add(Q, P)`.
   *
   * @param p1 - First curve point
   * @param p2 - Second curve point
   * @returns The sum of the two points: `p1 + p2`
   * @throws {Error} If either point is invalid or not on the curve
   */
  static add(p1: EdwardsPoint, p2: EdwardsPoint): EdwardsPoint {
    return p1.add(p2)
  }

  /**
   * Doubles a curve point.
   *
   * Computes `2 * point` on the Bandersnatch curve. This is equivalent to
   * `add(point, point)` but is typically more efficient.
   *
   * @param point - The curve point to double
   * @returns The doubled point: `2 * point`
   * @throws {Error} If the point is invalid or not on the curve
   */
  static double(point: EdwardsPoint): EdwardsPoint {
    return point.double()
  }

  /**
   * Negates a curve point.
   *
   * Computes the additive inverse of a point on the Bandersnatch curve.
   * The result satisfies: `add(point, negate(point)) === INFINITY`.
   *
   * @param point - The curve point to negate
   * @returns The negated point: `-point`
   * @throws {Error} If the point is invalid or not on the curve
   */
  static negate(point: EdwardsPoint): EdwardsPoint {
    return point.negate()
  }

  /**
   * Checks if a point lies on the Bandersnatch curve.
   *
   * Validates that the point satisfies the Twisted Edwards curve equation:
   * `a*x^2 + y^2 = 1 + d*x^2*y^2` where `a = -5` and `d` is the curve parameter.
   *
   * @param point - The curve point to validate
   * @returns `true` if the point is on the curve, `false` otherwise
   */
  static isOnCurve(point: EdwardsPoint): boolean {
    return point.isTorsionFree()
  }

  /**
   * Gets the generator point (base point) of the Bandersnatch curve.
   *
   * The generator is a point on the curve that generates the prime subgroup G.
   * All points in the prime subgroup can be expressed as scalar multiples of the generator.
   *
   * @returns The generator point G
   */
  static get GENERATOR() {
    return Bandersnatch.BASE
  }

  /**
   * Gets the identity point (point at infinity) of the Bandersnatch curve.
   *
   * The identity point is the neutral element for point addition:
   * `add(point, INFINITY) === point` for any point on the curve.
   *
   * @returns The identity point (point at infinity)
   */
  static get INFINITY() {
    return Bandersnatch.ZERO
  }

  /**
   * Converts a curve point to its byte representation.
   *
   * Serializes the point to bytes, typically used for challenge generation
   * in cryptographic protocols. The output format matches the point compression
   * format used by the curve implementation.
   *
   * @param point - The curve point to hash
   * @returns Byte representation of the point
   * @throws {Error} If the point is invalid
   */
  static hashPoint(point: EdwardsPoint): Uint8Array {
    return point.toBytes()
  }

  /**
   * Gets the order (cardinality) of the prime subgroup of the Bandersnatch curve.
   *
   * The curve order is the number of points in the prime subgroup G.
   * For any point P in G, `scalarMultiply(P, CURVE_ORDER) === INFINITY`.
   *
   * @returns The curve order as a bigint
   */
  static get CURVE_ORDER() {
    return BANDERSNATCH_PARAMS.CURVE_ORDER
  }
}
