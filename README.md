# `@pbnj/bandersnatch`

Bandersnatch elliptic curve primitives built on top of `@noble/curves`.

This package provides:

- A **Bandersnatch curve instance** (`Bandersnatch`) configured with the official parameters.
- A **high-level helper class** (`BandersnatchCurve`) for point operations and arkworks-compatible serialization.
- Public **curve parameters** (`BANDERSNATCH_PARAMS`).

> Note: VRF functionality and Elligator2 hash-to-curve are implemented in `@pbnj/bandersnatch-vrf`.

## Installation

This repository uses Bun workspaces. From the monorepo root, install deps once:

```bash
bun install
```

Within another workspace package, add a dependency on `@pbnj/bandersnatch` via the workspace tooling you use (Bun/npm/pnpm/yarn).

## Usage

### Import the public API

```ts
import { Bandersnatch, BandersnatchCurve, BANDERSNATCH_PARAMS } from '@pbnj/bandersnatch'
import type { CurvePoint } from '@pbnj/bandersnatch'
```

### Work with points (high-level helpers)

`BandersnatchCurve` exposes common operations over **Noble** Bandersnatch points (`EdwardsPoint` from `@noble/curves`), such as:

- `GENERATOR`: the canonical generator point
- `INFINITY`: point at infinity (identity)
- `add(P, Q)`, `negate(P)`, `scalarMultiply(P, k)`

```ts
import { BandersnatchCurve } from '@pbnj/bandersnatch'

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
import { Bandersnatch, BandersnatchCurve } from '@pbnj/bandersnatch'

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

`CurvePoint` is a simple structural representation used by some algorithms (notably `@pbnj/bandersnatch-vrf`’s Elligator2 hash-to-curve helpers):

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

## Security & correctness notes

- `BandersnatchCurve` uses BigInt arithmetic and performs modular operations over the Bandersnatch field.
- When handling serialized points, treat all external inputs as untrusted and rely on parsing/validation helpers (avoid manual decoding).


