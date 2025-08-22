/*
 * Game configuration and weapon definitions
 *
 * This module exposes constants used throughout the rest of the
 * application. Keeping these values in one place makes it easy
 * to adjust core gameplay balance without hunting through multiple files.
 */

// Constant downward acceleration applied to all players (pixels/ms^2)
// Gravity adds realism to movement by pulling players downward over time.
// Gravitational acceleration pulling players downward (pixels/ms^2). Lowering
// gravity from 0.001 to 0.0001 significantly slows the rate at which
// vertical velocity builds up, preventing players from rocketing off
// collision interactions. This change helps maintain smooth motion
// without requiring overly aggressive velocity clamping.
// Gravity is declared with let so that the value can be updated at
// runtime via the settings menu. Using const would prevent the
// assignment in the menu script from taking effect.
let GRAVITY = 0.0001;

// Base increment for the dagger speed buff. This is multiplied by the
// number of points added to the weapon spin to compute angular velocity.
const POINT_SPEED = 0.0008;

// A small epsilon for collision / floating comparisons
const EPS = 1e-9;

// Cap the weapon length so it doesn't grow endlessly when gaining range buffs
const MAX_RANGE = 350;

// Define a maximum movement speed for players (pixels per millisecond). Without
// this cap, collisions and wall bounces can accumulate velocity over time,
// leading to players moving too fast to control. This value was chosen
// relative to the base speeds (around 0.1 px/ms) to allow responsive
// movement while preventing runaway acceleration.
// Maximum linear speed for players (pixels per millisecond). This cap lets
// characters build up some momentum while still preventing runaway
// velocities from stacked collisions and gravity. It should be tuned
// relative to the base speed (≈0.1 px/ms) so that movement feels
// responsive and bouncy but not chaotic. Increasing it from 0.3 to
// 0.5 restores a bit more bounce when players collide without allowin
// infinite acceleration.
const MAX_PLAYER_SPEED = 0.5;

// Map settings. MAP_TYPE controls the shape of the playable area. The
// default value 'rectangle' confines players to the canvas bounds. When
// set to 'plus', players move within a cross-shaped corridor defined by
// WALKWAY_WIDTH. These variables are mutable and can be changed via the
// settings menu at runtime.
let MAP_TYPE = 'rectangle';
let WALKWAY_WIDTH = 200;

// Define default colors for each weapon type. These values are used
// when a new player is configured in the menu. Assigning a color for
// each type helps quickly distinguish players by weapon without
// requiring the user to pick a color every time. These colors can be
// overridden in the settings UI but will apply when selecting a
// weapon for the first time.
const DEFAULT_COLORS = {
  sword: '#ff6466',  // light red
  spear: '#00feff',  // bright cyan
  dagger: '#02ff03', // neon green
  bow: '#fffe05',    // bright yellow
  shield: '#af7f00', // gold/brown
  dummy: '#888888',  // grey for dummy targets
  // Dark blue for staff users
  staff: '#007bff',
  // Purple for scythe users
  scythe: '#d600d6',
  unarmed: '#b5b5b5'
};

// Define weapon types, each with base stats and a buff callback to apply
// when the weapon successfully hits an opponent. New weapon types can be
// added to this object with their own buff logic.
const WEAPON_TYPES = {
  sword: {
    name: 'Sword',
    // Increase base range from 25 to 35 to give swords a bit more reach
    baseRange: 35,
    baseDamage: 5,
    baseSpeed: 0.006,
    // Reduce sword thickness from 30 to 20 to align with updated specs
    thickness: 20,
    // Maximum reach the sword can grow to when range buffs are applied. If
    // unspecified, the weapon buff will fall back to the global MAX_RANGE.
    maxRange: MAX_RANGE,
    // Damage added to the attacker when they land a hit. This value can
    // be configured via the weapon settings menu. Defaults to 5.
    buffDamage: 5,
    // On hit, add buffDamage to the sword's damage.
    buff(player) {
      player.damage += (this.buffDamage || 0);
    }
  },
  spear: {
    name: 'Spear',
    baseRange: 45,
    baseDamage: 4.5,
    baseSpeed: 0.009,
    thickness: 14,
    maxRange: MAX_RANGE,
    buffDamage: 3,
    buff(player) {
      // Spear: modest damage buff
      player.damage += (this.buffDamage || 0);
    }
  },
  dagger: {
    name: 'Dagger',
    baseRange: 30,
    baseDamage: 3,
    baseSpeed: 0.02,
    thickness: 10,
    maxRange: MAX_RANGE,
    buffSpin: 5,
    buffDamage: 0.5,
    buff(player) {
      const inc = (this.buffSpin || 0) * POINT_SPEED;
      player.damage += (this.buffDamage || 0);
      const sign = player.weaponAngularVelocity >= 0 ? 1 : -1;
      player.weaponAngularVelocity = sign * (Math.abs(player.weaponAngularVelocity) + inc);
    }
  },
  /**
   * Bow weapon definition.
   *
   * Bows spin just like other weapons but cannot directly damage opponents via
   * their shaft. Instead they periodically fire arrows. Each arrow deals
   * a fixed amount of damage when it strikes a player. Upon a successful
   * arrow hit, the bow permanently gains one additional arrow to fire on
   * subsequent shots. See game.js for arrow spawning and behavior.
   */
  bow: {
    name: 'Bow',
    baseRange: 150,
    baseDamage: 9,
    baseSpeed: 0.015,
    thickness: 2,
    baseArrowDamage: 6,
    buffArrows: 1,
    buff(player) {
      if (player.arrowCount === undefined) {
        player.arrowCount = 1;
      }
      player.arrowCount += (this.buffArrows || 0);
    }
  },
  /**
   * Shield weapon definition.
   *
   * Shields are purely defensive. They spin like other weapons but do not
   * damage opponents directly when colliding with their bodies. Instead,
   * whenever an enemy weapon collides with a shield, the shield reflects
   * damage back onto the attacker. Each successful deflection widens the
   * shield, making it easier to block subsequent attacks.
   */
  shield: {
    name: 'Shield',
    baseRange: 20,
    baseDamage: 2,
    baseSpeed: 0.004,
    thickness: 28,
    buffThickness: 2,
    buff(player) {
      // On successful deflection, increase thickness so future blocks easier
      player.weaponThickness = (player.weaponThickness || this.thickness) + (this.buffThickness || 0);
    }
  },
  staff: {
    name: 'Staff',
    baseRange: 60,
    baseDamage: 7,
    baseSpeed: 0.01,
    thickness: 4,
    // Fireball-specific values
    fireballDamage: 8,
    fireballRadius: 12,
    fireballCooldown: 1200,
    buffDamage: 2,
    buff(player) {
      player.damage += (this.buffDamage || 0);
    }
  },
  scythe: {
    name: 'Scythe',
    baseRange: 70,
    baseDamage: 11,
    baseSpeed: 0.009,
    thickness: 18,
    poisonDamage: 4,
    poisonDuration: 3000,
    buffDamage: 1.5,
    buff(player) {
      player.damage += (this.buffDamage || 0);
    }
  },
  unarmed: {
    name: 'Unarmed',
    baseRange: 10,
    baseDamage: 3,
    baseSpeed: 0.01,
    thickness: 2
  },
  dummy: {
    name: 'Dummy',
    baseRange: 10,
    baseDamage: 0,
    baseSpeed: 0,
    thickness: 1
  }
};

// Ensure globals are attached for environments that may not expose top-level vars
try {
  if (typeof window !== 'undefined') {
    window.WEAPON_TYPES = window.WEAPON_TYPES || (typeof WEAPON_TYPES !== 'undefined' ? WEAPON_TYPES : undefined);
    window.DEFAULT_COLORS = window.DEFAULT_COLORS || (typeof DEFAULT_COLORS !== 'undefined' ? DEFAULT_COLORS : undefined);
    window.MAX_RANGE = window.MAX_RANGE || (typeof MAX_RANGE !== 'undefined' ? MAX_RANGE : undefined);
    window.MAX_PLAYER_SPEED = window.MAX_PLAYER_SPEED || (typeof MAX_PLAYER_SPEED !== 'undefined' ? MAX_PLAYER_SPEED : undefined);
    window.MAP_TYPE = window.MAP_TYPE || (typeof MAP_TYPE !== 'undefined' ? MAP_TYPE : undefined);
    window.WALKWAY_WIDTH = window.WALKWAY_WIDTH || (typeof WALKWAY_WIDTH !== 'undefined' ? WALKWAY_WIDTH : undefined);
    window.GRAVITY = window.GRAVITY || (typeof GRAVITY !== 'undefined' ? GRAVITY : undefined);
    window.POINT_SPEED = window.POINT_SPEED || (typeof POINT_SPEED !== 'undefined' ? POINT_SPEED : undefined);
    window.EPS = window.EPS || (typeof EPS !== 'undefined' ? EPS : undefined);
  }
} catch (e) {
  console.warn('Failed to attach game config globals to window', e);
}
