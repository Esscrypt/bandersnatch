/**
 * Type definitions for Bandersnatch curve operations
 */

/**
 * Represents a point on an elliptic curve.
 * 
 * This interface defines the structure for curve points used in Bandersnatch
 * curve operations. Points can be either finite points with (x, y) coordinates
 * or the point at infinity.
 * 
 * @interface CurvePoint
 */
export interface CurvePoint {
  /** X-coordinate of the point (undefined for point at infinity) */
  x: bigint
  /** Y-coordinate of the point (undefined for point at infinity) */
  y: bigint
  /** Whether this point is the point at infinity (identity element) */
  isInfinity: boolean
}

