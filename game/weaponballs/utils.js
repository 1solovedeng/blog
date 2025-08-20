/*
 * Utility functions for collision detection and color manipulation.
 *
 * Keeping these helpers separate from the game logic simplifies unit
 * testing and makes it clear which routines are reusable across different
 * parts of the application.
 */

/**
 * Shade a hex color by a percentage (negative to darken, positive to lighten).
 * @param {string} color 6‑digit hex string starting with '#'
 * @param {number} percent Value between -100 and 100
 */
function shadeColor(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  let r = (num >> 16) & 0xFF;
  let g = (num >> 8) & 0xFF;
  let b = num & 0xFF;
  r = Math.min(255, Math.max(0, r + Math.round((percent / 100) * 255)));
  g = Math.min(255, Math.max(0, g + Math.round((percent / 100) * 255)));
  b = Math.min(255, Math.max(0, b + Math.round((percent / 100) * 255)));
  return `#${(1 << 24 | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Helper to detect collision between two circles
function circleCollision(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const distSq = dx * dx + dy * dy;
  const minDist = p1.radius + p2.radius;
  return distSq < minDist * minDist;
}

/**
 * Determine whether a line segment intersects a circle. Useful for
 * detecting weapon lines slicing through a circular player body. Computes
 * the closest point on the segment to the circle center and checks if
 * that distance is less than the radius.
 *
 * @param {Object} a - Start point {x,y}
 * @param {Object} b - End point {x,y}
 * @param {Object} center - Circle center {x,y}
 * @param {number} radius - Circle radius
 * @returns {boolean}
 */
function lineCircleCollision(a, b, center, radius) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  // Handle degenerate segment
  if (lengthSq === 0) {
    const distSq = (center.x - a.x) * (center.x - a.x) + (center.y - a.y) * (center.y - a.y);
    return distSq <= radius * radius;
  }
  // Project center onto the segment, clamping parameter t between 0 and 1
  let t = ((center.x - a.x) * dx + (center.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const distX = projX - center.x;
  const distY = projY - center.y;
  const distSq = distX * distX + distY * distY;
  return distSq <= radius * radius;
}

/**
 * Determine if two line segments intersect. Used for detecting weapon
 * collisions along their entire length rather than just tip proximity.
 * Taken from standard computational geometry algorithms.
 *
 * @param {Object} p1 - Segment 1 start {x,y}
 * @param {Object} q1 - Segment 1 end {x,y}
 * @param {Object} p2 - Segment 2 start {x,y}
 * @param {Object} q2 - Segment 2 end {x,y}
 * @returns {boolean}
 */
function segmentsIntersect(p1, q1, p2, q2) {
  // Helper: orientation of ordered triplet (a,b,c)
  function orientation(a, b, c) {
    const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
    if (Math.abs(val) < 1e-6) return 0;
    return val > 0 ? 1 : 2; // 1: clockwise, 2: counterclockwise
  }
  function onSegment(a, b, c) {
    return Math.min(a.x, c.x) - 1e-6 <= b.x && b.x <= Math.max(a.x, c.x) + 1e-6 &&
           Math.min(a.y, c.y) - 1e-6 <= b.y && b.y <= Math.max(a.y, c.y) + 1e-6;
  }
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) return true;
  // Special cases for colinear points
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

/**
 * Compute squared distance from a point p to the line segment ab.
 * Returns the minimal squared distance.
 */
function distancePointToSegmentSquared(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    const dxp = p.x - a.x;
    const dyp = p.y - a.y;
    return dxp * dxp + dyp * dyp;
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const distX = projX - p.x;
  const distY = projY - p.y;
  return distX * distX + distY * distY;
}

/**
 * Compute squared minimal distance between two line segments ab and cd.
 * Uses distance from endpoints of one segment to the other segment.
 */
function segmentDistanceSquared(a, b, c, d) {
  // If they intersect, distance is zero
  if (segmentsIntersect(a, b, c, d)) return 0;
  const d1 = distancePointToSegmentSquared(a, c, d);
  const d2 = distancePointToSegmentSquared(b, c, d);
  const d3 = distancePointToSegmentSquared(c, a, b);
  const d4 = distancePointToSegmentSquared(d, a, b);
  return Math.min(Math.min(d1, d2), Math.min(d3, d4));
}