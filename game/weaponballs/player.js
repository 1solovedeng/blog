/*
 * Player class encapsulates position, movement, health and weapon.
 *
 * Each player is a circular entity that carries a rotating weapon. The
 * constructor accepts a configuration object to initialize position,
 * velocity, health and weapon properties. Updating and drawing are
 * handled through methods defined on this class.
 */

class Player {
  constructor(options) {
    this.id = options.id;
    this.x = options.x;
    this.y = options.y;
    this.radius = options.radius;
    this.color = options.color;
    this.vx = options.vx;
    this.vy = options.vy;
    this.health = options.health;
    this.maxHealth = options.health;
    this.weaponType = options.weaponType || 'sword';
    this.accelSpeed = 0; // starts at 0
    this.maxAccel = 5;   // cap acceleration if needed
    this.dead = false;

    // Base stats come from weapon definition; allow override via options
    const weaponDef = WEAPON_TYPES[this.weaponType];
    this.damage = options.damage !== undefined ? options.damage : weaponDef.baseDamage;
    this.weaponLength = options.weaponLength !== undefined ? options.weaponLength : weaponDef.baseRange;
    this.weaponAngle = options.weaponAngle || 0;
    this.weaponAngularVelocity = options.weaponAngularVelocity !== undefined ? options.weaponAngularVelocity : weaponDef.baseSpeed;
    this.weaponThickness = options.weaponThickness !== undefined ? options.weaponThickness : (weaponDef.thickness || 10);
    // Track last hit times keyed by opponent id to add a small cooldown
    this.lastHit = {};
    // Track flash until time for damage indication
    this.flashUntil = 0;

    

    // Color used when flashing. Hits and poison can override this hue.
    this.flashColor = '#ff5555';

    // Track cumulative damage statistics. damageDealt records the total
    // amount of damage this player has inflicted on others, while
    // damageReceived records damage taken from opponents or reflected
    // by shields. These values are displayed on the scoreboard to
    // give insight into each player's performance over the course of
    // a match.
    this.damageDealt = 0;

    this.damageReceived = 0;

    // Track weapon flash until time for parry indication. When two
    // weapons collide, their blades flash white for a brief moment.
    // This flag indicates when the flashing should end. See
    // handleWeaponInteractions in game.js for how this is set.
    this.weaponFlashUntil = 0;

    // Initialize bow-specific properties. Bows fire arrows rather than
    // dealing damage with their spinning shaft. Each bow starts with a
    // single arrow and fires once per second. Successful arrow hits add
    // one additional arrow to the volley on future shots. These values
    // are only relevant for players whose weaponType is 'bow'.
    if (this.weaponType === 'bow') {
      // Number of arrows to fire in each volley. If options specify an
      // initial count, use it; otherwise start with one arrow.
      // Start bows with five arrows by default for a more competitive beginning
      this.arrowCount = options.arrowCount !== undefined ? options.arrowCount : 5;
      // Minimum time between shots in milliseconds
      this.arrowCooldown = 1000;
      // Timestamp of when the last volley was fired. Initialized to zero so
      // the bow can shoot immediately when the game starts.
      this.lastArrowShotTime = 0;
      // Number of arrows remaining to fire in the current volley. When zero,
      // the bow waits for the cooldown before starting a new volley.
      this.arrowsRemaining = 0;
      // Timestamp for the next individual arrow in the current volley.
      this.nextArrowTime = 0;
    }
    // Dummies do not rotate their weapon and should not deal damage.
    // Ensure dummy weapons are effectively invisible. The dummy's base
    // movement speed is stored in moveSpeed; this is used when spawning
    // players in Game.init().
    if (this.weaponType === 'dummy') {
      this.damage = 0;
      this.weaponLength = 0;
      this.weaponAngularVelocity = 0;
      this.weaponThickness = 0;
    }

    // Initialize staff-specific properties. Staffs fire explosive fireballs once
    // per second. Each staff player tracks the damage and radius of its
    // fireball along with a cooldown timer. These values come from the
    // weapon definition and can be buffed when the fireball deals damage.
    if (this.weaponType === 'staff') {
      const def = WEAPON_TYPES[this.weaponType];
      this.fireballDamage = def.fireballDamage || 2;
      this.fireballRadius = def.fireballRadius || 40;
      this.fireballCooldown = def.fireballCooldown || 1000;
      this.lastFireballTime = 0;
    }
    // Initialize scythe-specific properties. The scythe applies a poison
    // damage over time effect. Each scythe player stores poisonDamage and
    // poisonDuration which are modified via buffs. Poison stacks will be
    // applied to opponents when hit.
    if (this.weaponType === 'scythe') {
      const def = WEAPON_TYPES[this.weaponType];
      this.poisonDamage = def.poisonDamage || 4;
      this.poisonDuration = def.poisonDuration || 3000;
    }
    // Each player has a list of poison stacks currently affecting them.
    // Each stack tracks the source (owner), remaining damage and remaining
    // duration. These stacks are processed by the game to apply damage
    // over time effects.
    this.poisonStacks = [];
  }

  // Update position and rotation based on velocity and time delta
  update(delta) {
    // Move
    if (this.weaponType === 'unarmed') {
      // Increase acceleration gradually
      this.accelSpeed = Math.min(this.accelSpeed + 0.001, this.maxAccel);

      
      // Apply to base velocity
      const speedMultiplier = 1 + this.accelSpeed;
      this.vx *= speedMultiplier;
      this.vy *= speedMultiplier;
    }
    
    this.x += this.vx * delta;
    this.y += this.vy * delta;
    // Apply gravity to vertical velocity
    this.vy += GRAVITY * delta;
    if (this.dead) return; // Skip updates if dead


 

    // Bounce off vertical walls
    if (this.x - this.radius < 0) {
      this.x = this.radius;
      this.vx *= -1;
      // Play wall bounce sound
      if (typeof playSound === 'function') playSound('ballbounce');
    } else if (this.x + this.radius > width) {
      this.x = width - this.radius;
      this.vx *= -1;
      if (typeof playSound === 'function') playSound('ballbounce');
    }
    // Bounce off horizontal walls
    if (this.y - this.radius < 0) {
      this.y = this.radius;
      this.vy *= -1;
      if (typeof playSound === 'function') playSound('ballbounce');
    } else if (this.y + this.radius > height) {
      this.y = height - this.radius;
      this.vy *= -1;
      if (typeof playSound === 'function') playSound('ballbounce');
    }
    
    // Removed custom plus‑map bounce handling. The plus map is now
    // represented using corner obstacles created in Game.init(). The
    // OBSTACLES array defines the off‑limits corner regions. Players
    // will bounce off these rectangles in the collision logic below.

    // Clamp the player's velocity magnitude to prevent runaway speeds. Without
    // a cap, repeated collisions can build up excessive velocity, causing
    // players to zip around uncontrollably. Limit the combined velocity
    // vector to a fixed maximum. The constant MAX_PLAYER_SPEED is defined
    // in gameConfig.js and exposed globally. When the current speed exceeds
    // this cap, scale both vx and vy down proportionally to bring the
    // magnitude back within the limit. This preserves movement direction
    // while ensuring gameplay remains manageable.
    if (typeof MAX_PLAYER_SPEED !== 'undefined') {
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > MAX_PLAYER_SPEED) {
        const scale = MAX_PLAYER_SPEED / speed;
        this.vx *= scale;
        this.vy *= scale;
      }
    }

    // If custom obstacles are defined (e.g., for map types like
    // 'box' or 'battlefield'), handle collisions with each rectangular
    // obstacle. When the player's circular body intersects a rectangle,
    // compute the smallest overlap along x or y and push the player
    // outside the obstacle, inverting the appropriate velocity component.
    if (typeof OBSTACLES !== 'undefined' && Array.isArray(OBSTACLES)) {
      for (const ob of OBSTACLES) {
        // Find the nearest point on the obstacle to the player's center
        const nearestX = Math.max(ob.x, Math.min(this.x, ob.x + ob.w));
        const nearestY = Math.max(ob.y, Math.min(this.y, ob.y + ob.h));
        const dx = this.x - nearestX;
        const dy = this.y - nearestY;
        const distSq = dx * dx + dy * dy;
        if (distSq < this.radius * this.radius) {
          // Overlap detected: compute penetration depths along x and y
          const overlapX = this.radius - Math.abs(dx);
          const overlapY = this.radius - Math.abs(dy);
          if (overlapX < overlapY) {
            // Resolve horizontal collision
            if (dx > 0) {
              this.x = nearestX + this.radius;
            } else {
              this.x = nearestX - this.radius;
            }
            this.vx *= -1;
            // Play bounce sound when colliding with an obstacle
            if (typeof playSound === 'function') playSound('ballbounce');
          } else {
            // Resolve vertical collision
            if (dy > 0) {
              this.y = nearestY + this.radius;
            } else {
              this.y = nearestY - this.radius;
            }
            this.vy *= -1;
            if (typeof playSound === 'function') playSound('ballbounce');
          }
        }
      }
    }
    // Update weapon angle
    this.weaponAngle += this.weaponAngularVelocity * delta;
  }

  // Compute the tip (end) of the weapon as coordinates
  getWeaponTip() {
    const angle = this.weaponAngle;
    return {
      x: this.x + Math.cos(angle) * (this.radius + this.weaponLength),
      y: this.y + Math.sin(angle) * (this.radius + this.weaponLength)
    };
  }

  // Compute the base of the weapon at the edge of the player's body.
  // Rather than anchoring the weapon at the center of the player, we
  // consider the shaft to begin at the surface of the circle. This
  // method returns the coordinates where the weapon should start.
  getWeaponBase() {
    const angle = this.weaponAngle;
    return {
      x: this.x + Math.cos(angle) * this.radius,
      y: this.y + Math.sin(angle) * this.radius
    };
  }

  // Draw the player (body) and weapon
  draw(ctx) {
    // Determine fill color: flash red if recently hit
    const now = performance.now();
    const flashing = now < this.flashUntil;
    const bodyColor = flashing ? this.flashColor : this.color;
    // Draw body with a bold outline

    if (this.dead) return; // Don't render dead players
    ctx.beginPath();
    ctx.fillStyle = bodyColor;
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    // Add bold outline using a slightly darker stroke
    ctx.lineWidth = 3;
    // Darken the color for the stroke
    const darker = shadeColor(this.color, -20);
    ctx.strokeStyle = darker;
    ctx.stroke();
    ctx.closePath();
    
    
    // Draw weapon (as a line with arrowhead) only if the player has a
    // weapon length greater than zero. Dummies and other weaponless
    // types skip drawing any weapon graphics. When two weapons collide,
    // they flash white momentarily to indicate a parry. The boolean
    // flashWeapon selects white when the current time is less than
    // weaponFlashUntil.
    if (this.weaponLength > 0 && this.weaponThickness > 0) {
      const tip = this.getWeaponTip();
      const flashWeapon = now < this.weaponFlashUntil;
      // Choose color: flash white when parry is active, otherwise use
      // the player's color.
      const weaponColor = flashWeapon ? '#ffffff' : this.color;
      ctx.strokeStyle = weaponColor;
 ctx.lineWidth = this.weaponThickness;
 // Draw shaft starting at the edge of the player's body instead of
      // the center. This positions the weapon entirely outside of the
      // player's circle, preventing any portion of the blade from being
      // hidden inside the body. Using getWeaponBase() ensures the
      // weapon originates at the outer radius.
      const base = this.getWeaponBase();
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.closePath();
      // Draw tip decoration. Use a curved blade for scythe, arrowhead for others.
      if (this.weaponType === 'scythe') {
        // Draw a curved blade at the tip perpendicular to the shaft
        const bladeRadius = 12;
        const angle = this.weaponAngle;
        // Arc spanning 180 degrees perpendicular to weapon
        const start = angle - Math.PI / 2;
        const end = angle + Math.PI / 2;
        ctx.beginPath();
        ctx.strokeStyle = weaponColor;
        ctx.lineWidth = this.weaponThickness;
        ctx.arc(tip.x, tip.y, bladeRadius, start, end);
        ctx.stroke();
        ctx.closePath();
      } else {
        // Draw small arrowhead at the tip for other weapons
        const headLength = 8;
        const angle = this.weaponAngle;
        const leftAngle = angle + Math.PI * 3 / 4;
        const rightAngle = angle - Math.PI * 3 / 4;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x + Math.cos(leftAngle) * headLength, tip.y + Math.sin(leftAngle) * headLength);
        ctx.lineTo(tip.x + Math.cos(rightAngle) * headLength, tip.y + Math.sin(rightAngle) * headLength);
        ctx.lineTo(tip.x, tip.y);
        ctx.fillStyle = weaponColor;
        ctx.fill();
        ctx.closePath();
      }
    }
    // Draw health text at the player's center. Choose black or white
    // depending on the brightness of the player's color so the text
    // remains legible against both light and dark bodies. Compute a
    // simple perceived brightness using the luminance formula and
    // fallback to white if parsing fails. Only the base color is
    // considered (ignoring flash red overlays) so the text color
    // remains consistent.
    // Always draw health text in black so it stands out against the
    // white background and lighter body colors.
    ctx.fillStyle = '#000000';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.max(0, Math.round(this.health)), this.x, this.y);
  }
}