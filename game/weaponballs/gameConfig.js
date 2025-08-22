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
// number of points added to the weapon speed when the dagger strikes.
const POINT_SPEED = 0.001;

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
// 0.5 restores a bit more bounce when players collide without allowing
// infinite acceleration.
const MAX_PLAYER_SPEED = 0.5;

// Map settings. MAP_TYPE controls the shape of the playable area. The
// default value 'rectangle' confines players to the canvas bounds. When
// set to 'plus', players move within a cross‑shaped corridor defined by
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
  dummy: '#888888'   // grey for dummy targets
  ,
  // Dark blue for staff users
  staff: '#007bff',
  // Purple for scythe users
  scythe: '#d600d6',
  unarmed:'#b5b5b5'
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
    // Extend spear range from 35 to 45 as per latest tuning
    baseRange: 45,
    baseDamage: 3,
    baseSpeed: 0.004,
    // Slim down spear thickness from 20 to 10; spears are now more precise
    thickness: 10,
    // Maximum reach the spear can grow to when gaining range buffs. If
    // unspecified, the global MAX_RANGE is used. This value can be
    // configured via the weapon settings menu.
    maxRange: MAX_RANGE,
    // Damage added on hit
    buffDamage: 3,
    // Additional range added on hit
    buffRange: 10,
    // On hit, add buffDamage and buffRange to the spear
    buff(player) {
      player.damage += (this.buffDamage || 0);
      // Increase weapon length but clamp to MAX_RANGE
      if (this.buffRange) {
        // Use this.maxRange if defined, otherwise fall back to global MAX_RANGE
        const maxR = (typeof this.maxRange === 'number' ? this.maxRange : MAX_RANGE);
        player.weaponLength = Math.min(player.weaponLength + this.buffRange, maxR);
      }
    }
  },
  dagger: {
    name: 'Dagger',
    // Boost dagger reach from 20 to 30 to keep it competitive
    baseRange: 30,
    baseDamage: 2,
    baseSpeed: 0.02,
    thickness: 10,
    // Maximum reach for the dagger. Although daggers typically do not
    // gain range via their buff, this property exists to allow
    // configuration through the weapon settings menu.
    maxRange: MAX_RANGE,
    // Additional spin points added on hit. Each point is multiplied by
    // POINT_SPEED to calculate the angular velocity increase. Defaults to 5.
    buffSpin: 5,
    buffDamage: 0.5 ,
    // On hit, increase spin speed by buffSpin * POINT_SPEED regardless of direction
    buff(player) {
      const inc = (this.buffSpin || 0) * POINT_SPEED;
      player.damage += (this.buffDamage || 0);
      // Always increase the magnitude of angular velocity regardless of current direction
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
    // Bow shaft length. It still participates in weapon‑weapon collisions
    // but does not directly harm players.
    baseRange: 30,
    // The bow itself inflicts no direct damage.
    baseDamage: 0,
    // Moderate spin speed in radians/ms for visual variety.
    baseSpeed: 0.005,
    // Thickness similar to dagger for accurate collision detection.
    thickness: 10,
    // Maximum reach for the bow's shaft. The bow does not gain range
    // through its buff, but this property is included for consistency
    // and to allow configuration.
    maxRange: MAX_RANGE,
    // Additional arrows awarded per successful hit. Defaults to 1.
    buffArrows: 1,
    // Buff applied when an arrow successfully hits an opponent. Each hit
    // increases the number of arrows fired on the next shot by buffArrows.
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
    // Very short reach so the shield stays close to the player. With buffs
    // applied the shield expands outward but starts as a small plate.
    baseRange: 5,
    // The shield itself deals no direct damage on body hits
    baseDamage: 0,
    // Rotate at a moderate pace for visual effect
    baseSpeed: 0.004,
    // Start with a relatively wide shield
    thickness: 30,
    // Additional width added to the shield on each deflection. Defaults to 5.
    buffThickness: 5,
    // Maximum width the shield can reach. Defaults to 80.
    maxThickness: 80,
    // Buff: widen the shield by buffThickness pixels on each successful
    // deflection, clamped by maxThickness. Without a cap, shields could
    // grow too large and dominate the arena.
    buff(player) {
      if (player.weaponThickness === undefined) {
        player.weaponThickness = this.thickness;
      }
      const inc = this.buffThickness || 0;
      const maxT = this.maxThickness || 80;
      player.weaponThickness = Math.min(player.weaponThickness + inc, maxT);
    }
  }
  ,
  /**
   * Dummy weapon definition.
   *
   * Dummies are non‑combatant players used for testing. They do not
   * possess a weapon, deal damage or spin. A movement speed can be
   * configured via moveSpeed. The buff function is a no‑op.
   */
  dummy: {
    name: 'Dummy',
    // No reach because there is no weapon
    baseRange: 0,
    // Dummies cannot harm other players
    baseDamage: 0,
    // No rotation
    baseSpeed: 0,
    // No visible weapon thickness
    thickness: 0,
    // Movement speed (pixels/ms) used to set the dummy's initial velocity.
    // This can be configured via the weapon settings menu. Defaults to 0.1
    moveSpeed: 0.1,
    buff(player) {
      // Dummies gain no buff
    }
  },
  /**
   * Staff weapon definition.
   *
   * The staff is a ranged weapon that fires explosive fireballs. Its shaft
   * cannot harm players directly, but each fireball deals area damage upon
   * impact. Buffs increase both the fireball's damage and explosion radius.
   */
  staff: {
    name: 'Staff',
    // Visible shaft length of the staff. It still participates in weapon
    // collisions but does not deal body damage.
    baseRange: 30,
    baseDamage: 0,
    baseSpeed: 0.005,
    thickness: 12,
    // Movement speed for staff users (pixels/ms)
    moveSpeed: 0.09,
    // Fireball stats: base damage and explosion radius (px)
    fireballDamage: 2,
    fireballRadius: 50,
    // Cooldown between fireball shots (ms)
    fireballCooldown: 1000,
    // Buff increments for fireball damage and radius on each successful hit
    buffDamage: 1,
    buffRadius: 10,
    buff(player) {
      // When a fireball deals damage to a player, increase the owner's
      // fireball damage and radius.
      if (typeof player.fireballDamage === 'number') {
        player.fireballDamage += (this.buffDamage || 0);
      }
      if (typeof player.fireballRadius === 'number') {
        player.fireballRadius += (this.buffRadius || 0);
      }
    }
  },
  /**
   * Scythe weapon definition.
   *
   * The scythe is a melee weapon with a curved blade. It deals low direct
   * damage but applies a poison effect that damages targets over time.
   * Buffs increase both the per‑second poison damage and its duration.
   */
  scythe: {
    name: 'Scythe',
    baseRange: 35,
    baseDamage: 2,
    baseSpeed: 0.006,
    thickness: 15,
    maxRange: MAX_RANGE,
    // Poison effect parameters (damage inflicted over entire duration in HP)
    poisonDamage: 4,
    poisonDuration: 3000,
    // Buff amounts when the scythe lands a non‑poison hit
    buffDamage: 2,
    buffDuration: 1000,
    buff(player) {
      // Increase poison damage and duration on the owning player
      if (typeof player.poisonDamage === 'number') {
        player.poisonDamage += (this.buffDamage || 0);
      }
      if (typeof player.poisonDuration === 'number') {
        player.poisonDuration += (this.buffDuration || 0);
      }
    }
  }
  ,
  /**
   * Unarmed weapon definition.
   *
   * An unarmed player has no visible weapon but can deal damage via body
   * contact. They have increased base movement speed, and each hit increases
   * their damage and speed further, up to a cap.
   */
  unarmed: {
    name: 'Unarmed',
    baseRange: 0, // No weapon to draw
    baseDamage: 5, // Higher base damage for direct contact
    baseSpeed: 0, // No weapon spin
    moveSpeed: 1,
    thickness: 20, // Give the unarmed "weapon" a hitbox for collisions,
    buffDamage: 0.3,

    buff(player) {
      player.damage += (this.buffDamage || 0);
    }
  }
};
