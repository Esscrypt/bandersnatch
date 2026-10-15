import { type EdwardsPoint, edwards } from '@noble/curves/abstract/edwards.js'
import { Field } from '@noble/curves/abstract/modular.js'
import { BANDERSNATCH_PARAMS } from './config.ts'
import { glvMultiply } from './glv.ts'
import { mod, modInverse, modSqrt } from './math.ts'

const BANDERSNATCH_CURVE = {
  p: BANDERSNATCH_PARAMS.FIELD_MODULUS,

  n: BANDERSNATCH_PARAMS.CURVE_ORDER,

  h: BANDERSNATCH_PARAMS.COFACTOR,

  a:
    BANDERSNATCH_PARAMS.CURVE_COEFFICIENTS.a +
    BANDERSNATCH_PARAMS.FIELD_MODULUS,
  d: BANDERSNATCH_PARAMS.CURVE_COEFFICIENTS.d,

  Gx: BANDERSNATCH_PARAMS.GENERATOR.x,
  Gy: BANDERSNATCH_PARAMS.GENERATOR.y,
}

export const Bandersnatch = edwards(BANDERSNATCH_CURVE)

export class BandersnatchCurve {
  static Fp = Field(BANDERSNATCH_PARAMS.FIELD_MODULUS)

  static pointToBytes(noblePoint: EdwardsPoint): Uint8Array {
    const { x, y } = noblePoint.toAffine()
    const bytes = Bandersnatch.Fp.toBytes(y)
    const negX = mod(
      BANDERSNATCH_PARAMS.FIELD_MODULUS - x,
      BANDERSNATCH_PARAMS.FIELD_MODULUS,
    )
    const xIsNegative = x > negX
    bytes[bytes.length - 1] |= xIsNegative ? 0x80 : 0
    return bytes
  }

  static bytesToPoint(
    bytes: Uint8Array,
    validatePointOnCurve = true,
  ): EdwardsPoint {
    if (bytes.length !== 32) {
      throw new Error(
        `Invalid compressed point length: ${bytes.length}, expected 32`,
      )
    }

    const lastByte = bytes[31]
    const signBit = (lastByte & 0x80) !== 0

    const yBytes = new Uint8Array(bytes)
    yBytes[31] = lastByte & 0x7f

    let y = 0n
    for (let i = 0; i < 32; i++) {
      y += BigInt(yBytes[i]) << (8n * BigInt(i))
    }

    if (y >= BANDERSNATCH_PARAMS.FIELD_MODULUS) {
      throw new Error('Invalid y-coordinate: exceeds field modulus')
    }

    const { a, d } = BANDERSNATCH_PARAMS.CURVE_COEFFICIENTS
    const p = BANDERSNATCH_PARAMS.FIELD_MODULUS

    const y2 = mod(y * y, p)
    const numerator = mod(y2 - 1n, p)
    const denominator = mod(d * y2 - a, p)

    const denominatorInv = modInverse(denominator, p)
    const x2 = mod(numerator * denominatorInv, p)

    const x = modSqrt(x2, p, Bandersnatch.Fp)
    if (x === null) {
      throw new Error('Point is not on curve: no square root exists')
    }

    const negX = mod(p - x, p)
    const xIsNegative = x > negX

    const finalX = signBit === xIsNegative ? x : negX

    const point = Bandersnatch.fromAffine({ x: finalX, y })

    if (validatePointOnCurve) {
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
    }

    return point
  }

  static scalarMultiply(
    point: EdwardsPoint,
    scalar: bigint,
    useGlv = true,
  ): EdwardsPoint {
    if (useGlv) {
      return glvMultiply(point, scalar)
    }

    if (scalar === 0n) {
      return Bandersnatch.ZERO
    }

    if (scalar < 0n) {
      const positiveScalar = -scalar % BANDERSNATCH_PARAMS.CURVE_ORDER
      if (positiveScalar === 0n) return Bandersnatch.ZERO
      return point.negate().multiply(positiveScalar)
    }

    const reduced = scalar % BANDERSNATCH_PARAMS.CURVE_ORDER
    if (reduced === 0n) return Bandersnatch.ZERO
    return point.multiply(reduced)
  }

  static add(p1: EdwardsPoint, p2: EdwardsPoint): EdwardsPoint {
    return p1.add(p2)
  }

  static double(point: EdwardsPoint): EdwardsPoint {
    return point.double()
  }

  static negate(point: EdwardsPoint): EdwardsPoint {
    return point.negate()
  }

  static isOnCurve(point: EdwardsPoint): boolean {
    return point.isTorsionFree()
  }

  static get GENERATOR() {
    return Bandersnatch.BASE
  }

  static get INFINITY() {
    return Bandersnatch.ZERO
  }

  static hashPoint(point: EdwardsPoint): Uint8Array {
    return point.toBytes()
  }

  static get CURVE_ORDER() {
    return BANDERSNATCH_PARAMS.CURVE_ORDER
  }
}
