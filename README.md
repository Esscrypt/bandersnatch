# `@pbnjam/bandersnatch`

Bandersnatch elliptic curve primitives built on top of `@noble/curves`.

This package provides:

- A **Bandersnatch curve instance** (`Bandersnatch`) configured with the official parameters.
- A **high-level helper class** (`BandersnatchCurve`) for point operations and arkworks-compatible serialization.
- Public **curve parameters** (`BANDERSNATCH_PARAMS`).

> Note: VRF functionality and Elligator2 hash-to-curve are implemented in `@pbnjam/bandersnatch-vrf`.

## Installation

This repository uses Bun workspaces. From the monorepo root, install deps once:

```bash
bun install
```

Within another workspace package, add a dependency on `@pbnjam/bandersnatch` via the workspace tooling you use (Bun/npm/pnpm/yarn).

## Usage

### Import the public API

```ts
import { Bandersnatch, BandersnatchCurve, BANDERSNATCH_PARAMS } from '@pbnjam/bandersnatch'
import type { CurvePoint } from '@pbnjam/bandersnatch'
```

### Work with points (high-level helpers)

`BandersnatchCurve` exposes common operations over **Noble** Bandersnatch points (`EdwardsPoint` from `@noble/curves`), such as:

- `GENERATOR`: the canonical generator point
- `INFINITY`: point at infinity (identity)
- `add(P, Q)`, `negate(P)`, `scalarMultiply(P, k)`

```ts
import { BandersnatchCurve } from '@pbnjam/bandersnatch'

const P = BandersnatchCurve.GENERATOR
const Q = BandersnatchCurve.scalarMultiply(P, 2n)
const R = BandersnatchCurve.add(P, Q)
const negR = BandersnatchCurve.negate(R)

// Access affine coordinates (BigInt) via Noble helpers
const { x, y } = R.toAffine()
void x
void y
```

### Arkworks-compatible point serialization

The helper methods are intended to be compatible with arkworks’ Twisted Edwards compression format.

```ts
import { Bandersnatch, BandersnatchCurve } from '@pbnjam/bandersnatch'

// Noble point → compressed bytes (arkworks-compatible)
const noblePoint = Bandersnatch.BASE
const compressed = BandersnatchCurve.pointToBytes(noblePoint)

// Compressed bytes → Noble point (throws on invalid encoding)
const parsed = BandersnatchCurve.bytesToPoint(compressed)
```

## Public API

### Exports

From `src/index.ts`:

- `BandersnatchCurve`
- `Bandersnatch`
- `BANDERSNATCH_PARAMS`
- `CurvePoint` (type)

### `CurvePoint`

`CurvePoint` is a simple structural representation used by some algorithms (notably `@pbnjam/bandersnatch-vrf`’s Elligator2 hash-to-curve helpers):

- `x: bigint`
- `y: bigint`
- `isInfinity: boolean`

## Parameters

All protocol constants are defined in `src/config.ts` as `BANDERSNATCH_PARAMS` (field modulus, curve order, generator, coefficients, and related configuration used by dependent packages).

## Development

From `packages/bandersnatch`:

```bash
bun run test
```

```bash
bun run build
```

## GLV Endomorphism

`BandersnatchCurve.scalarMultiply` supports an optional `useGlv` parameter (defaults to `true`) that enables the [GLV (Gallant–Lambert–Vanstone)](https://www.iacr.org/archive/crypto2001/21390189.pdf) endomorphism optimization for scalar multiplication.

GLV decomposes a full-width scalar `k` into two half-width scalars `k1, k2` such that `[k]P = [k1]P + [k2]φ(P)`, where `φ` is the Bandersnatch curve endomorphism. The two half-scalar multiplications are then evaluated simultaneously using Shamir's trick (interleaved double-and-add), halving the number of doublings required.

```ts
// GLV enabled (default)
const R1 = BandersnatchCurve.scalarMultiply(P, k)

// GLV disabled — falls back to noble-curves wNAF
const R2 = BandersnatchCurve.scalarMultiply(P, k, false)
```

### Performance Comparison

Benchmarked on Apple M4 Max, macOS 15.5, Bun 1.3.9. Each measurement averages 5 rounds of 10 random 253-bit scalars.

| Scenario | GLV (Shamir) | noble wNAF | GLV vs naive |
| --- | --- | --- | --- |
| **Generator point** | 0.36 ms/mul | 0.08 ms/mul | **−4.5×** (slower) |
| **Arbitrary points** | 0.36 ms/mul | 0.85 ms/mul | **+58%** (faster) |

**Key findings:**

- **Generator point**: noble-curves precomputes a wNAF table for the fixed generator (`BASE`), making generator multiplications extremely fast (~0.08 ms). Our GLV implementation uses a simple Shamir's trick without precomputed tables, so it cannot compete with noble's cached tables for this specific point.
- **Arbitrary points**: For points without precomputed tables, GLV is ~2.4× faster. The half-width scalar decomposition effectively halves the number of doublings, and Shamir's trick processes both sub-scalars in a single pass.
- **Recommendation**: GLV is enabled by default because most cryptographic protocols (Ring VRF proving, multi-scalar operations) perform the majority of their multiplications on arbitrary points rather than the fixed generator. The net effect across a real workload is a meaningful speedup.

## Security & correctness notes

- `BandersnatchCurve` uses BigInt arithmetic and performs modular operations over the Bandersnatch field.
- When handling serialized points, treat all external inputs as untrusted and rely on parsing/validation helpers (avoid manual decoding).
- The GLV implementation is constant-time with respect to the scalar decomposition but inherits the timing characteristics of the underlying noble-curves point arithmetic. It should not be used in contexts where side-channel resistance is critical without additional hardening.
