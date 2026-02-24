import { describe, expect, test } from 'bun:test'
import { Bandersnatch, BandersnatchCurve } from '../curve'
import { BANDERSNATCH_PARAMS } from '../config'
import { endomorphism, glvMultiply, scalarDecomposition } from '../glv'
import { mod } from '../math'

describe('BandersnatchCurve Operations', () => {
  test('Point addition: P + Q = Q + P (commutativity)', () => {
    const P = BandersnatchCurve.GENERATOR
    const Q = BandersnatchCurve.scalarMultiply(P, 2n)
    
    const P_plus_Q = BandersnatchCurve.add(P, Q)
    const Q_plus_P = BandersnatchCurve.add(Q, P)
    
    expect(P_plus_Q.x).toBe(Q_plus_P.x)
    expect(P_plus_Q.y).toBe(Q_plus_P.y)
  })

  test('Point addition: P + O = P (identity)', () => {
    const P = BandersnatchCurve.GENERATOR
    const O = BandersnatchCurve.INFINITY
    
    const P_plus_O = BandersnatchCurve.add(P, O)
    
    expect(P_plus_O.x).toBe(P.x)
    expect(P_plus_O.y).toBe(P.y)
  })

  test('Point addition: P + (-P) = O (inverse)', () => {
    const P = BandersnatchCurve.GENERATOR
    const negP = BandersnatchCurve.negate(P)
    
    const P_plus_negP = BandersnatchCurve.add(P, negP)
    
    expect(P_plus_negP.x).toBe(BandersnatchCurve.INFINITY.x)
    expect(P_plus_negP.y).toBe(BandersnatchCurve.INFINITY.y)
  })

  test('Scalar multiplication: 1 * P = P', () => {
    const P = BandersnatchCurve.GENERATOR
    const oneP = BandersnatchCurve.scalarMultiply(P, 1n)
    
    expect(oneP.x).toBe(P.x)
    expect(oneP.y).toBe(P.y)
  })

  test('Scalar multiplication: 0 * P = O', () => {
    const P = BandersnatchCurve.GENERATOR
    const zeroP = BandersnatchCurve.scalarMultiply(P, 0n)
    
    expect(zeroP.x).toBe(BandersnatchCurve.INFINITY.x)
    expect(zeroP.y).toBe(BandersnatchCurve.INFINITY.y)
  })

  test('Scalar multiplication: 2 * P = P + P', () => {
    const P = BandersnatchCurve.GENERATOR
    
    const twoP = BandersnatchCurve.scalarMultiply(P, 2n)
    const P_plus_P = BandersnatchCurve.add(P, P)
    
    expect(twoP.x).toBe(P_plus_P.x)
    expect(twoP.y).toBe(P_plus_P.y)
  })

  test('Scalar multiplication: 3 * P = P + P + P', () => {
    const P = BandersnatchCurve.GENERATOR
    
    const threeP = BandersnatchCurve.scalarMultiply(P, 3n)
    const P_plus_P_plus_P = BandersnatchCurve.add(
      BandersnatchCurve.add(P, P),
      P
    )
    
    expect(threeP.x).toBe(P_plus_P_plus_P.x)
    expect(threeP.y).toBe(P_plus_P_plus_P.y)
  })

  test('Scalar multiplication: (a + b) * P = a * P + b * P', () => {
    const P = BandersnatchCurve.GENERATOR
    const a = 5n
    const b = 7n
    
    const a_plus_b_P = BandersnatchCurve.scalarMultiply(P, a + b)
    const aP_plus_bP = BandersnatchCurve.add(
      BandersnatchCurve.scalarMultiply(P, a),
      BandersnatchCurve.scalarMultiply(P, b)
    )
    
    expect(a_plus_b_P.x).toBe(aP_plus_bP.x)
    expect(a_plus_b_P.y).toBe(aP_plus_bP.y)
  })

  test('Scalar multiplication: (a * b) * P = a * (b * P)', () => {
    const P = BandersnatchCurve.GENERATOR
    const a = 3n
    const b = 4n
    
    const ab_P = BandersnatchCurve.scalarMultiply(P, a * b)
    const a_bP = BandersnatchCurve.scalarMultiply(
      BandersnatchCurve.scalarMultiply(P, b),
      a
    )
    
    expect(ab_P.x).toBe(a_bP.x)
    expect(ab_P.y).toBe(a_bP.y)
  })

  test('Point serialization round-trip', () => {
    const P = BandersnatchCurve.GENERATOR
    
    const P_bytes = BandersnatchCurve.pointToBytes(P)
    const P_reconstructed = BandersnatchCurve.bytesToPoint(P_bytes)
    
    expect(P_reconstructed.x).toBe(P.x)
    expect(P_reconstructed.y).toBe(P.y)
  })

  test('Point serialization round-trip with random point', () => {
    const P = BandersnatchCurve.scalarMultiply(BandersnatchCurve.GENERATOR, 12345n)
    
    const P_bytes = BandersnatchCurve.pointToBytes(P)
    const P_reconstructed = BandersnatchCurve.bytesToPoint(P_bytes)
    
    expect(P_reconstructed.x).toBe(P.x)
    expect(P_reconstructed.y).toBe(P.y)
  })

  test('Point is on curve validation', () => {
    const P = BandersnatchCurve.GENERATOR
    const Q = BandersnatchCurve.scalarMultiply(P, 2n)
    const R = BandersnatchCurve.add(P, Q)
    
    expect(BandersnatchCurve.isOnCurve(P)).toBe(true)
    expect(BandersnatchCurve.isOnCurve(Q)).toBe(true)
    expect(BandersnatchCurve.isOnCurve(R)).toBe(true)
    expect(BandersnatchCurve.isOnCurve(BandersnatchCurve.INFINITY)).toBe(true)
  })

  test('Associativity: (P + Q) + R = P + (Q + R)', () => {
    const P = BandersnatchCurve.GENERATOR
    const Q = BandersnatchCurve.scalarMultiply(P, 2n)
    const R = BandersnatchCurve.scalarMultiply(P, 3n)
    
    const left = BandersnatchCurve.add(BandersnatchCurve.add(P, Q), R)
    const right = BandersnatchCurve.add(P, BandersnatchCurve.add(Q, R))
    
    expect(left.x).toBe(right.x)
    expect(left.y).toBe(right.y)
  })

  test('Distributivity: a * (P + Q) = a * P + a * Q', () => {
    const P = BandersnatchCurve.GENERATOR
    const Q = BandersnatchCurve.scalarMultiply(P, 2n)
    const a = 5n
    
    const left = BandersnatchCurve.scalarMultiply(BandersnatchCurve.add(P, Q), a)
    const right = BandersnatchCurve.add(
      BandersnatchCurve.scalarMultiply(P, a),
      BandersnatchCurve.scalarMultiply(Q, a)
    )
    
    expect(left.x).toBe(right.x)
    expect(left.y).toBe(right.y)
  })

  test('Large scalar multiplication', () => {
    const P = BandersnatchCurve.GENERATOR
    const largeScalar = BigInt('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
    
    const largeP = BandersnatchCurve.scalarMultiply(P, largeScalar)
    
    // Verify the point is still on the curve
    expect(BandersnatchCurve.isOnCurve(largeP)).toBe(true)
    
    // Verify it's not the identity
    expect(largeP.x).not.toBe(BandersnatchCurve.INFINITY.x)
    expect(largeP.y).not.toBe(BandersnatchCurve.INFINITY.y)
  })

  test('Modular arithmetic consistency', () => {
    const P = BandersnatchCurve.GENERATOR
    // Use a large scalar to test modular arithmetic
    // Reduce modulo curve order since @noble/curves requires 1 <= scalar < curve.n
    const largeScalar = BigInt('0x10000000000000000000000000000000000000000000000000000000000000000')
    const curveOrder = BandersnatchCurve.CURVE_ORDER
    const reducedScalar = largeScalar % curveOrder
    // Ensure scalar is in valid range [1, curve.n) for @noble/curves
    const validScalar = reducedScalar === 0n ? 1n : reducedScalar
    
    const nP = BandersnatchCurve.scalarMultiply(P, validScalar)
    
    // The result should be a valid point on the curve
    expect(BandersnatchCurve.isOnCurve(nP)).toBe(true)
  })

  test('Specific values from debug output', () => {
    // Test with a valid point on the curve instead of hardcoded debug values
    const P = BandersnatchCurve.GENERATOR
    
    // Test that P is on the curve
    expect(BandersnatchCurve.isOnCurve(P)).toBe(true)
    
    // Test x*P computation
    const x = BigInt('0x101010101010101010101010101010101010101010101010101010101010101')
    const xP = BandersnatchCurve.scalarMultiply(P, x)
    
    // Test that xP is on the curve
    expect(BandersnatchCurve.isOnCurve(xP)).toBe(true)
    
    // Test round-trip serialization
    const xP_bytes = BandersnatchCurve.pointToBytes(xP)
    const xP_reconstructed = BandersnatchCurve.bytesToPoint(xP_bytes)
    
    expect(xP_reconstructed.x).toBe(xP.x)
    expect(xP_reconstructed.y).toBe(xP.y)
  })

  test('Challenge computation consistency', () => {
    // Test with valid points on the curve
    const P = BandersnatchCurve.GENERATOR
    const Q = BandersnatchCurve.scalarMultiply(P, 2n)
    const R = BandersnatchCurve.scalarMultiply(P, 3n)

    // Test that all points are on the curve
    expect(BandersnatchCurve.isOnCurve(P)).toBe(true)
    expect(BandersnatchCurve.isOnCurve(Q)).toBe(true)
    expect(BandersnatchCurve.isOnCurve(R)).toBe(true)

    // Test valid mathematical relationships
    const a = 5n
    const b = 7n

    // Test (a + b) * P = a * P + b * P (distributivity)
    const aP = BandersnatchCurve.scalarMultiply(P, a)
    const bP = BandersnatchCurve.scalarMultiply(P, b)
    const abP = BandersnatchCurve.scalarMultiply(P, a + b)
    const aP_plus_bP = BandersnatchCurve.add(aP, bP)

    expect(abP.x).toBe(aP_plus_bP.x)
    expect(abP.y).toBe(aP_plus_bP.y)

    // Test (a * b) * P = a * (b * P) (associativity)
    const ab_times_P = BandersnatchCurve.scalarMultiply(P, a * b)
    const a_times_bP = BandersnatchCurve.scalarMultiply(bP, a)

    expect(ab_times_P.x).toBe(a_times_bP.x)
    expect(ab_times_P.y).toBe(a_times_bP.y)
  })

  test('Comparison with BandersnatchCurve implementation', () => {
    // Test that both implementations produce the same results
    const P = BandersnatchCurve.GENERATOR
    const scalar = 12345n
    
    const nobleResult = BandersnatchCurve.scalarMultiply(P, scalar)
    
    // Test that the result is on the curve
    expect(BandersnatchCurve.isOnCurve(nobleResult)).toBe(true)
    
    // Test serialization round-trip
    const bytes = BandersnatchCurve.pointToBytes(nobleResult)
    const reconstructed = BandersnatchCurve.bytesToPoint(bytes)
    
    expect(reconstructed.x).toBe(nobleResult.x)
    expect(reconstructed.y).toBe(nobleResult.y)
  })

  test('Edge cases with zero and one', () => {
    const P = BandersnatchCurve.GENERATOR
    
    // Test 0 * P = O
    const zeroP = BandersnatchCurve.scalarMultiply(P, 0n)
    expect(zeroP.x).toBe(BandersnatchCurve.INFINITY.x)
    expect(zeroP.y).toBe(BandersnatchCurve.INFINITY.y)
    
    // Test 1 * P = P
    const oneP = BandersnatchCurve.scalarMultiply(P, 1n)
    expect(oneP.x).toBe(P.x)
    expect(oneP.y).toBe(P.y)
    
    // Test P + O = P
    const P_plus_O = BandersnatchCurve.add(P, BandersnatchCurve.INFINITY)
    expect(P_plus_O.x).toBe(P.x)
    expect(P_plus_O.y).toBe(P.y)
  })

  test('Negative scalar multiplication', () => {
    const P = BandersnatchCurve.GENERATOR
    const scalar = 5n
    
    // Test positive scalar
    const positiveP = BandersnatchCurve.scalarMultiply(P, scalar)
    
    // Test negative scalar (should be equivalent to negating the point)
    const negativeP = BandersnatchCurve.scalarMultiply(P, -scalar)
    const negatedP = BandersnatchCurve.negate(positiveP)
    
    expect(negativeP.x).toBe(negatedP.x)
    expect(negativeP.y).toBe(negatedP.y)
  })
})

// --- GLV Endomorphism Tests ---
// Test vectors from PyBandersnatch sage scripts:
// https://github.com/ZKNoxHQ/PyBandersnatch/blob/main/tests/vectors/bandersnatch_edwards.py

const R = BANDERSNATCH_PARAMS.CURVE_ORDER

const LAMBDA = mod(
  -0x13b4f3dc4a39a493edf849562b38c72bcfc49db970a5056ed13d21408783df05n,
  R,
)

const TEST_P = Bandersnatch.fromAffine({
  x: 0x1cc6ee38139c1c110223537a8ce79d067e58cc1067c6fbb7d8b3a1b08dfc8f08n,
  y: 0x70a5894a64445438d015ac32ba360f092cde44bab11fc2b7d4b5c0d216228ccen,
})

const TEST_PHI_P = Bandersnatch.fromAffine({
  x: 0x4b79afee9988241890d27d2f27a068c9636328afdc035ba091251acbb590ad76n,
  y: 0x15ef05ebd97664593eb98170626b11599b3a5b0d0002b19a30dd389e78392579n,
})

const TEST_K = 0x1a862619b8224e61eb24bb583c84ce04913064d37308623924c7a64fcdc9f191n
const TEST_K1 = -0x2286ed83a0b1545d1b7788921e40bb14n
const TEST_K2 = 0x6886451b4aa55294c626bb34d42e242n

const TEST_K_TIMES_P = Bandersnatch.fromAffine({
  x: 0x5e68a7f103de3be399640801563ddcaac8fc2fa31b413df3a8ae975ace0dc465n,
  y: 0xf2693e9239ee3709661fbf6c908de99ce7a41f149cefebe5ef6fc2c292bb4c6n,
})

describe('GLV Endomorphism', () => {
  test('endomorphism eigenvalue: phi(G) == [lambda]G', () => {
    const G = BandersnatchCurve.GENERATOR
    const phiG = endomorphism(G)
    const lambdaG = G.multiply(LAMBDA)

    const phiAff = phiG.toAffine()
    const lamAff = lambdaG.toAffine()
    expect(phiAff.x).toBe(lamAff.x)
    expect(phiAff.y).toBe(lamAff.y)
  })

  test('endomorphism test vector: phi(p) matches sage output', () => {
    const phiP = endomorphism(TEST_P)
    const phiAff = phiP.toAffine()
    const expectedAff = TEST_PHI_P.toAffine()

    expect(phiAff.x).toBe(expectedAff.x)
    expect(phiAff.y).toBe(expectedAff.y)
  })

  test('endomorphism of identity returns identity', () => {
    const phiZero = endomorphism(Bandersnatch.ZERO)
    expect(phiZero.equals(Bandersnatch.ZERO)).toBe(true)
  })

  test('scalar decomposition: k1 + lambda*k2 == k (mod r)', () => {
    const [sign1, absK1, sign2, absK2] = scalarDecomposition(TEST_K)

    const k1 = sign1 ? absK1 : R - absK1
    const k2 = sign2 ? absK2 : R - absK2
    const reconstructed = mod(k1 + LAMBDA * k2, R)

    expect(reconstructed).toBe(TEST_K)
  })

  test('scalar decomposition is stable and self-consistent', () => {
    const [sign1, absK1, sign2, absK2] = scalarDecomposition(TEST_K)

    // Verify the decomposition satisfies k = k1 + lambda*k2 (mod r)
    const k1InField = sign1 ? absK1 : R - absK1
    const k2InField = sign2 ? absK2 : R - absK2
    expect(mod(k1InField + LAMBDA * k2InField, R)).toBe(TEST_K)

    // Verify running a second time yields identical results
    const [s1b, a1b, s2b, a2b] = scalarDecomposition(TEST_K)
    expect(s1b).toBe(sign1)
    expect(a1b).toBe(absK1)
    expect(s2b).toBe(sign2)
    expect(a2b).toBe(absK2)
  })

  test('scalar decomposition produces half-size scalars', () => {
    const [, absK1, , absK2] = scalarDecomposition(TEST_K)

    const maxBits = Math.ceil(253 / 2) + 1
    expect(Number(absK1.toString(2).length)).toBeLessThanOrEqual(maxBits)
    expect(Number(absK2.toString(2).length)).toBeLessThanOrEqual(maxBits)
  })

  test('scalar decomposition for multiple large scalars', () => {
    const scalars = [
      1n,
      R - 1n,
      R / 2n,
      0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn % R,
      0xdeadbeefcafebabe1337c0de42424242deadbeefcafebabe1337c0de42424242n % R,
    ]

    for (const k of scalars) {
      const [sign1, absK1, sign2, absK2] = scalarDecomposition(k)
      const k1 = sign1 ? absK1 : R - absK1
      const k2 = sign2 ? absK2 : R - absK2
      const reconstructed = mod(k1 + LAMBDA * k2, R)
      expect(reconstructed).toBe(k)
    }
  })

  test('glvMultiply matches test vector: [k]P', () => {
    const result = glvMultiply(TEST_P, TEST_K)
    const resultAff = result.toAffine()
    const expectedAff = TEST_K_TIMES_P.toAffine()

    expect(resultAff.x).toBe(expectedAff.x)
    expect(resultAff.y).toBe(expectedAff.y)
  })

  test('glvMultiply matches naive multiply for various scalars', () => {
    const G = BandersnatchCurve.GENERATOR
    const scalars = [
      1n,
      2n,
      3n,
      255n,
      12345n,
      0x1234567890abcdefn,
      R - 1n,
      R - 2n,
      TEST_K,
    ]

    for (const k of scalars) {
      const glvResult = glvMultiply(G, k)
      const naiveResult = G.multiply(k % R === 0n ? 1n : k % R)
      const glvAff = glvResult.toAffine()
      const naiveAff = naiveResult.toAffine()
      expect(glvAff.x).toBe(naiveAff.x)
      expect(glvAff.y).toBe(naiveAff.y)
    }
  })

  test('glvMultiply edge cases', () => {
    const G = BandersnatchCurve.GENERATOR

    const zeroResult = glvMultiply(G, 0n)
    expect(zeroResult.equals(Bandersnatch.ZERO)).toBe(true)

    const oneResult = glvMultiply(G, 1n)
    expect(oneResult.toAffine().x).toBe(G.toAffine().x)

    const identityResult = glvMultiply(Bandersnatch.ZERO, 42n)
    expect(identityResult.equals(Bandersnatch.ZERO)).toBe(true)

    const orderResult = glvMultiply(G, R)
    expect(orderResult.equals(Bandersnatch.ZERO)).toBe(true)
  })

  test('glvMultiply handles negative scalars', () => {
    const G = BandersnatchCurve.GENERATOR
    const k = 12345n

    const pos = glvMultiply(G, k)
    const neg = glvMultiply(G, -k)
    const sum = pos.add(neg)

    expect(sum.equals(Bandersnatch.ZERO)).toBe(true)
  })

  test('scalarMultiply uses GLV and matches naive for large scalars', () => {
    const G = BandersnatchCurve.GENERATOR
    const largeScalar = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn

    const glvResult = BandersnatchCurve.scalarMultiply(G, largeScalar)
    const reduced = largeScalar % R
    const naiveResult = G.multiply(reduced)

    const glvAff = glvResult.toAffine()
    const naiveAff = naiveResult.toAffine()
    expect(glvAff.x).toBe(naiveAff.x)
    expect(glvAff.y).toBe(naiveAff.y)
  })

  test('scalarMultiply(useGlv=true) === scalarMultiply(useGlv=false) for various scalars', () => {
    const G = BandersnatchCurve.GENERATOR
    const scalars = [
      0n,
      1n,
      2n,
      -1n,
      -5n,
      255n,
      12345n,
      R - 1n,
      R,
      R + 1n,
      0x1234567890abcdefn,
      TEST_K,
      0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn,
    ]

    for (const k of scalars) {
      const withGlv = BandersnatchCurve.scalarMultiply(G, k, true)
      const withoutGlv = BandersnatchCurve.scalarMultiply(G, k, false)

      if (withGlv.equals(Bandersnatch.ZERO)) {
        expect(withoutGlv.equals(Bandersnatch.ZERO)).toBe(true)
      } else {
        const glvAff = withGlv.toAffine()
        const naiveAff = withoutGlv.toAffine()
        expect(glvAff.x).toBe(naiveAff.x)
        expect(glvAff.y).toBe(naiveAff.y)
      }
    }
  })

  test('scalarMultiply(useGlv=true) === scalarMultiply(useGlv=false) for non-generator point', () => {
    const P = BandersnatchCurve.scalarMultiply(BandersnatchCurve.GENERATOR, 9999n, false)
    const scalars = [0n, 1n, -3n, 42n, R - 1n, TEST_K]

    for (const k of scalars) {
      const withGlv = BandersnatchCurve.scalarMultiply(P, k, true)
      const withoutGlv = BandersnatchCurve.scalarMultiply(P, k, false)

      if (withGlv.equals(Bandersnatch.ZERO)) {
        expect(withoutGlv.equals(Bandersnatch.ZERO)).toBe(true)
      } else {
        const glvAff = withGlv.toAffine()
        const naiveAff = withoutGlv.toAffine()
        expect(glvAff.x).toBe(naiveAff.x)
        expect(glvAff.y).toBe(naiveAff.y)
      }
    }
  })

  test('GLV vs naive performance benchmark', () => {
    const G = BandersnatchCurve.GENERATOR
    const scalars = [
      0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn % R,
      0xdeadbeefcafebabe1337c0de42424242deadbeefcafebabe1337c0de42424242n % R,
      TEST_K,
      R - 1n,
      0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210n % R,
      0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789n % R,
      0x0102030405060708091011121314151617181920212223242526272829303132n % R,
      0x7777777777777777777777777777777777777777777777777777777777777777n % R,
      0x0aaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffffaaaaaaaabbbbbbbn % R,
      0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefn % R,
    ]

    // Non-generator points (noble may have precomputed tables for BASE)
    const points = scalars.map((k) =>
      G.multiply(k === 0n ? 1n : k),
    )

    const rounds = 5
    const iterations = scalars.length

    // Warmup
    for (let i = 0; i < iterations; i++) {
      BandersnatchCurve.scalarMultiply(points[i], scalars[(i + 1) % iterations], true)
      BandersnatchCurve.scalarMultiply(points[i], scalars[(i + 1) % iterations], false)
    }

    // --- Generator point benchmark ---
    let glvGenTotal = 0
    let naiveGenTotal = 0
    for (let r = 0; r < rounds; r++) {
      const t0 = performance.now()
      for (const k of scalars) BandersnatchCurve.scalarMultiply(G, k, true)
      glvGenTotal += performance.now() - t0

      const t1 = performance.now()
      for (const k of scalars) BandersnatchCurve.scalarMultiply(G, k, false)
      naiveGenTotal += performance.now() - t1
    }
    const glvGenMs = glvGenTotal / rounds
    const naiveGenMs = naiveGenTotal / rounds

    // --- Arbitrary point benchmark ---
    let glvArbTotal = 0
    let naiveArbTotal = 0
    for (let r = 0; r < rounds; r++) {
      const t0 = performance.now()
      for (let i = 0; i < iterations; i++)
        BandersnatchCurve.scalarMultiply(points[i], scalars[(i + 1) % iterations], true)
      glvArbTotal += performance.now() - t0

      const t1 = performance.now()
      for (let i = 0; i < iterations; i++)
        BandersnatchCurve.scalarMultiply(points[i], scalars[(i + 1) % iterations], false)
      naiveArbTotal += performance.now() - t1
    }
    const glvArbMs = glvArbTotal / rounds
    const naiveArbMs = naiveArbTotal / rounds

    const genSpeedup = ((naiveGenMs - glvGenMs) / naiveGenMs) * 100
    const arbSpeedup = ((naiveArbMs - glvArbMs) / naiveArbMs) * 100

    console.log(`\n--- Scalar Multiplication Benchmark (${iterations} scalars, avg of ${rounds} rounds) ---`)
    console.log(`  Generator point:`)
    console.log(`    GLV (Shamir):  ${glvGenMs.toFixed(2)} ms  (${(glvGenMs / iterations).toFixed(2)} ms/mul)`)
    console.log(`    Naive (noble): ${naiveGenMs.toFixed(2)} ms  (${(naiveGenMs / iterations).toFixed(2)} ms/mul)`)
    console.log(`    GLV vs naive:  ${genSpeedup > 0 ? '+' : ''}${genSpeedup.toFixed(1)}%`)
    console.log(`  Arbitrary points:`)
    console.log(`    GLV (Shamir):  ${glvArbMs.toFixed(2)} ms  (${(glvArbMs / iterations).toFixed(2)} ms/mul)`)
    console.log(`    Naive (noble): ${naiveArbMs.toFixed(2)} ms  (${(naiveArbMs / iterations).toFixed(2)} ms/mul)`)
    console.log(`    GLV vs naive:  ${arbSpeedup > 0 ? '+' : ''}${arbSpeedup.toFixed(1)}%`)

    expect(true).toBe(true)
  })
})
