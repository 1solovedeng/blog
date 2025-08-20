/*
 * Main game loop and logic.
 *
 * This module defines the Game class responsible for spawning players,
 * updating physics, handling collisions, managing death effects and
 * rendering everything to the canvas. It also wires up the restart
 * button to reset the game state.
 */

// Grab UI elements and canvas context up front so they are available
// across the entire game lifecycle. These globals are also used by
// Player.update (for width and height boundaries).
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreboard = document.getElementById('scoreboard');
const restartButton = document.getElementById('restartButton');
// Use mutable width and height variables so they can reflect changes to
// the canvas dimensions at runtime (e.g. from menu settings). These
// variables are updated in Game.init().
let width = canvas.width;
let height = canvas.height;

/*
 * -----------------------------------------------------------------------------
 * Sound loading and playback helpers
 *
 * To bring the arena to life we preload a handful of short sound effects and
 * provide a helper to play them without interrupting one another. Each entry
 * in the SOUNDS object stores a base Audio element. When a sound needs to be
 * played we clone the element so multiple effects can overlap. Volume is
 * modestly reduced to avoid overwhelming the player. If additional sounds are
 * added to the assets/sounds folder, simply add another key here and refer
 * to it via playSound('key').
 */
const SOUNDS = {};
(() => {
  try {
    SOUNDS.hit = new Audio('assets/sounds/hit.mp3');
    SOUNDS.ballbounce = new Audio('assets/sounds/ballbounce.mp3');
    SOUNDS.swordsclash = new Audio('assets/sounds/swordsclash.mp3');
    SOUNDS.arrow = new Audio('assets/sounds/arrow.mp3');
  } catch (e) {
    console.warn('Failed to load audio assets:', e);
  }
})();

/**
 * Play a named sound effect. This helper clones the underlying Audio object
 * so that rapid consecutive calls don't cut off earlier instances. A
 * reasonable default volume is applied to all sounds.
 * @param {string} name Key into the SOUNDS map
 * @param {number} [volume] Optional volume between 0 and 1
 */
function playSound(name, volume = 0.4) {
  const base = SOUNDS[name];
  if (!base) return;
  const inst = base.cloneNode();
  inst.volume = volume;
  inst.play().catch(() => { /* suppress promise rejection if play fails */ });
}

class Game {
  /**
   * Create a new Game instance.
   *
   * @param {Object} settings Optional configuration object. When provided,
   *                          settings.spawnConfigs can override the default
   *                          player spawn definitions used in init(). This
   *                          allows the menu to customize weapon types,
   *                          colors and health. Additional settings can be
   *                          added in the future.
   */
  constructor(settings = {}) {
    this.settings = settings;
    this.players = [];
    this.lastTimestamp = 0;
    this.running = true;
    // Array of death effects currently playing
    this.deathEffects = [];
    // Collection of active arrows in the arena. Each arrow is an object
    // containing x, y, velocity components, owner and damage. Arrows are
    // spawned by bow players and updated each frame.
    this.arrows = [];
    // Collection of active fireballs for staff weapons. Each fireball
    // contains position, velocity, radius, damage and owner. Fireballs
    // explode on impact with walls or players.
    this.fireballs = [];
    // Explosion effects created by staff fireballs. Each entry stores
    // position, start time, maxRadius and color. These are rendered
    // similarly to death effects but can differ in size and color.
    this.explosionEffects = [];
    this.init();
  }

  /**
   * Draw the map background and obstacles based on the selected map type.
   * This method paints a base color across the entire canvas, then
   * overlays any corridor or obstacle shapes appropriate for the
   * current MAP_TYPE. For plus‑shaped maps, a lighter cross is drawn
   * to indicate the playable corridors. For box and battlefield maps,
   * rectangular obstacles are drawn in a mid‑tone. The Game.loop
   * routine calls this method at the beginning of each frame instead
   * of clearing the canvas to ensure the environment is always
   * rendered before players and effects.
   */
  drawMapBackground() {
    // Base background color for all maps. Use a bright white to keep the
    // arena looking clean. Obstacles and corridors will be drawn in
    // shades of gray on top of this.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    // Draw plus map corridor if selected. The plus map consists of a
    // vertical and horizontal corridor centered on the canvas. The
    // corridor width is controlled via the WALKWAY_WIDTH global. Use a
    // slightly lighter color than the base so the corridors are
    // visually distinct.
    if (typeof MAP_TYPE !== 'undefined' && MAP_TYPE === 'plus') {
      const walkway = typeof WALKWAY_WIDTH !== 'undefined' ? WALKWAY_WIDTH : Math.min(width, height) * 0.4;
      const half = walkway / 2;
      const cx = width / 2;
      const cy = height / 2;
      // Horizontal corridor. Use a very light gray so it contrasts subtly
      // against the white background.
      ctx.fillStyle = '#f3f3f3';
      ctx.fillRect(0, cy - half, width, walkway);
      // Vertical corridor
      ctx.fillRect(cx - half, 0, walkway, height);
    }
    // Draw obstacles for box and battlefield maps. Obstacles are
    // rectangles defined in this.obstacles; if undefined, there are
    // none. Use a mid‑tone color so they contrast with both the
    // corridors and the base background.
    if (Array.isArray(this.obstacles)) {
      // Draw obstacles in a medium gray on the white background. Boxes
      // and walls should be easily visible without overwhelming the
      // arena.
      ctx.fillStyle = '#d0d0d0';
      for (const ob of this.obstacles) {
        ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
      }
    }
  }

  init() {
    // Update width and height variables to match the current canvas size.
    width = canvas.width;
    height = canvas.height;
    // If custom spawn configurations were supplied via settings, use them.
    // Otherwise, define a default set of spawn locations relative to canvas
    // dimensions. Each object can specify the weapon type, color and health.
    let spawnConfigs;
    if (this.settings && Array.isArray(this.settings.spawnConfigs)) {
      spawnConfigs = this.settings.spawnConfigs;
    } else {
      spawnConfigs = [
        { x: 0, y: 0.5, weaponType: 'bow', color: '#F5A623', health: 250 },
        { x: 0.25, y: 0.5, weaponType: 'spear', color: '#1944d1ff', health: 250 },
        { x: 0.5, y: 0.5, weaponType: 'dagger', color: '#37D86B', health: 250 },
        { x: 0.75, y: 0.5, weaponType: 'sword', color: '#d46b15ff', health: 250 },
      ];
    }
    this.players = [];
    spawnConfigs.forEach((cfg, index) => {
      // Determine direction of initial motion: alternate between players
      const direction = index % 2 === 0 ? 1 : -1;
      // Determine base movement speed from weapon definition. For weapon
      // types that specify a moveSpeed property (e.g. dummy), use it.
      // Otherwise fall back to a sensible default of 0.1 px/ms.
      let moveSpeed = 0.1;
      const def = WEAPON_TYPES[cfg.weaponType];
      if (def && typeof def.moveSpeed === 'number') {
        moveSpeed = def.moveSpeed;
      }
      this.players.push(new Player({
        id: index,
        x: width * cfg.x,
        y: height * cfg.y,
        radius: 20,
        color: cfg.color,
        vx: moveSpeed * direction,
        vy: moveSpeed * direction,
        // Use provided health or fall back to 250
        health: cfg.health !== undefined ? cfg.health : 250,
        weaponType: cfg.weaponType,
        weaponAngle: Math.random() * Math.PI * 2
      }));
    });
    this.running = true;
    restartButton.hidden = true;
    this.lastTimestamp = performance.now();
    this.pauseUntil = 0;
    this.deathEffects = [];
    // Clear any lingering arrows when restarting the game
    this.arrows = [];
    // Clear any lingering fireballs and explosion effects
    this.fireballs = [];
    this.explosionEffects = [];
    // Determine obstacle layout based on the selected map type. Store
    // obstacles in a global array so that Player.update can access
    // them for collision handling. Each obstacle is defined by x, y,
    // width and height (pixels). Obstacles only apply to certain map
    // types.
    const obs = [];
    if (typeof MAP_TYPE !== 'undefined') {
      if (MAP_TYPE === 'box') {
        // Central box blocking movement: leave a border around the
        // edges. The box fills 60% of the canvas area centered.
        const boxW = width * 0.6;
        const boxH = height * 0.6;
        const boxX = (width - boxW) / 2;
        const boxY = (height - boxH) / 2;
        obs.push({ x: boxX, y: boxY, w: boxW, h: boxH });
      } else if (MAP_TYPE === 'battlefield') {
        // Two vertical walls and one horizontal wall to create a simple
        // battlefield layout. Adjust the width and positions relative
        // to canvas size.
        const wallThickness = Math.max(20, Math.min(width, height) * 0.03);
        // Left vertical wall
        obs.push({ x: width * 0.3 - wallThickness / 2, y: height * 0.1, w: wallThickness, h: height * 0.8 });
        // Right vertical wall
        obs.push({ x: width * 0.7 - wallThickness / 2, y: height * 0.1, w: wallThickness, h: height * 0.8 });
        // Central horizontal wall
        obs.push({ x: width * 0.2, y: height * 0.5 - wallThickness / 2, w: width * 0.6, h: wallThickness });
      } else if (MAP_TYPE === 'plus') {
        // Create four corner obstacles to carve out a plus‑shaped playable area.
        const walkway = typeof WALKWAY_WIDTH !== 'undefined' ? WALKWAY_WIDTH : Math.min(width, height) * 0.4;
        const half = walkway / 2;
        const cx = width / 2;
        const cy = height / 2;
        // Top‑left corner
        obs.push({ x: 0, y: 0, w: cx - half, h: cy - half });
        // Top‑right corner
        obs.push({ x: cx + half, y: 0, w: width - (cx + half), h: cy - half });
        // Bottom‑left corner
        obs.push({ x: 0, y: cy + half, w: cx - half, h: height - (cy + half) });
        // Bottom‑right corner
        obs.push({ x: cx + half, y: cy + half, w: width - (cx + half), h: height - (cy + half) });
      }
    }
    // Assign obstacles both to the game instance and to a global variable
    // so Player.update can access them for collision handling.
    this.obstacles = obs;
    window.OBSTACLES = obs;
    requestAnimationFrame(this.loop.bind(this));
  }

  // Game loop uses delta time for frame rate independence
  loop(timestamp) {
    if (!this.running) return;
    const delta = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    // Draw map background and obstacles instead of simply clearing the canvas.
    this.drawMapBackground();
    // Update deaths: remove players with zero health and spawn poof effects
    this.updateDeaths(timestamp);
    // Determine whether to update physics based on pause
    const paused = timestamp < this.pauseUntil;
    if (!paused) {
      // Update player positions
      for (const p of this.players) {
        p.update(delta);
      }
      // Handle body collisions only when not paused
      for (let i = 0; i < this.players.length; i++) {
        for (let j = i + 1; j < this.players.length; j++) {
          const p1 = this.players[i];
          const p2 = this.players[j];
          if (circleCollision(p1, p2)) {
            resolveBodyCollision(p1, p2);
          }
        }
      }
      // Weapon interactions update only when not paused
      this.handleWeaponInteractions(timestamp);
      // Arrow spawning and movement
      this.updateArrows(delta, timestamp);
      // Staff fireball spawning, movement and explosion
      if (typeof this.updateFireballs === 'function') {
        this.updateFireballs(delta, timestamp);
      }
      // Apply poison effects on players
      if (typeof this.updatePoisonEffects === 'function') {
        this.updatePoisonEffects(delta, timestamp);
      }
    }
    // Draw players after updating or in pause
    for (const p of this.players) {
      p.draw(ctx);
    }
    // Draw death effects (poof animation)
    this.drawDeathEffects(timestamp);
    // Draw arrows on top of players/death effects
    this.drawArrows();
    // Draw fireballs after arrows
    if (typeof this.drawFireballs === 'function') {
      this.drawFireballs();
    }
    // Update scoreboard
    this.updateScoreboard();
    // Check game over
    const survivors = this.players.filter(p => p.health > 0);
    if (survivors.length <= 1) {
      this.running = false;
      this.showGameOver(survivors[0]);
    } else {
      requestAnimationFrame(this.loop.bind(this));
    }
  }

  /**
   * Remove players whose health has dropped to zero and create a death effect
   * at their position. This method should be called each frame before
   * performing other updates.
   */
  updateDeaths(time) {
    for (const p of this.players) {
      if (p.health <= 0 && !p.dead) {
        p.health = 0;
        p.dead = true;
        p.vx = 0;
        p.vy = 0;
        p.rotationSpeed = 0;

        // Poof effect
        this.deathEffects.push({ x: p.x, y: p.y, color: p.color, start: time });
      }
    }
  }

  /**
   * Draw and update all active death effects. Each effect expands and fades
   * out over a short duration, then is removed from the list.
   */
  drawDeathEffects(time) {
    const duration = 500; // milliseconds
    const stillActive = [];
    for (const effect of this.deathEffects) {
      const progress = (time - effect.start) / duration;
      if (progress >= 1) {
        continue; // effect finished
      }
      // Determine maximum radius and color from the effect, falling back to
      // defaults for regular poof effects. For fireball explosions, maxRadius
      // will be set when the effect is created.
      const maxR = effect.maxRadius || 40;
      const color = effect.color || '#ffffff';
      // Radius grows linearly with progress from 0 to maxR
      const radius = progress * maxR;
      // Fade out alpha over the effect duration
      const alpha = 1 - progress;
      ctx.beginPath();
      // Apply alpha to the fill color. Parse hex color to RGB components.
      let r = 255, g = 255, b = 255;
      if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        if (hex.length === 6) {
          r = parseInt(hex.substring(0, 2), 16);
          g = parseInt(hex.substring(2, 4), 16);
          b = parseInt(hex.substring(4, 6), 16);
        }
      }
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();
      stillActive.push(effect);
    }
    this.deathEffects = stillActive;
  }

  // Resolve collision between two players by exchanging velocities (elastic)
  // This helper lives here because it's only used by the Game loop.
  // It is defined as a static method outside the class for clarity.

  // Weapon interactions: damage to bodies and reversing rotation on weapon clash
  handleWeaponInteractions(time) {
    const hitCooldown = 300; // milliseconds for melee and unarmed hits

    // Handle unarmed body collisions
    for (let i = 0; i < this.players.length; i++) {
      const attacker = this.players[i];
      if (attacker.weaponType !== 'unarmed') continue;

      for (let j = 0; j < this.players.length; j++) {
        if (i === j) continue;
        const target = this.players[j];
        // Unarmed players damage on body collision
        if (target.health > 0 && circleCollision(attacker, target)) {


          const extraDamage = attacker.accelSpeed * 8; // tweak multiplier as needed
          attacker.damage += extraDamage;
          attacker.accelSpeed /= 5; // reduce speed gain

          const last = attacker.lastHit[target.id] || 0;
          if (time - last > hitCooldown) {
            // Apply gentle knockback away from each other to prevent stacking.
            const dx = attacker.x - target.x;
            const dy = attacker.y - target.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
              const nx = dx / dist;
              const ny = dy / dist;
              const knockbackStrength = 1; // Gentle push strength
              attacker.vx += nx * knockbackStrength;
              attacker.vy += ny * knockbackStrength;
              target.vx -= nx * knockbackStrength;
              target.vy -= ny * knockbackStrength;
            }
            this.applyDamage(attacker, target, attacker.damage, time);
          }
        }
      }
    }

    for (let i = 0; i < this.players.length; i++) {
      const attacker = this.players[i];
      const tipA = attacker.getWeaponTip();
      // Start the weapon segment at the edge of the player's body rather than
      // the center. This prevents the interior of the weapon from being
      // counted as part of its range.
      const lineStartA = attacker.getWeaponBase();
      for (let j = 0; j < this.players.length; j++) {
        if (i === j) continue;
        const target = this.players[j];
        // Body hit detection only for melee weapons (bows and shields do not damage via shaft)
        if (attacker.weaponType !== 'bow' && attacker.weaponType !== 'shield' && attacker.weaponType !== 'staff') {
          // Check if the entire weapon line intersects the target's body
          // Increase collision radius by half the attacker weapon's thickness so the whole shaft counts
          const effectiveRadius = target.radius + attacker.weaponThickness / 2;
          if (lineCircleCollision(lineStartA, tipA, { x: target.x, y: target.y }, effectiveRadius) && target.health > 0) {
            // Check cooldown
            const last = attacker.lastHit[target.id] || 0;
            if (time - last > hitCooldown) {
              this.applyDamage(attacker, target, attacker.damage, time);
            }
          }
        }
      }
    }
    // Weapon‑to‑weapon collisions: reverse rotation
    for (let i = 0; i < this.players.length; i++) {
      const p1 = this.players[i];
      // Unarmed players do not have weapon-to-weapon collisions
      if (p1.weaponType === 'unarmed') continue;

      const tip1 = p1.getWeaponTip();
      const start1 = p1.getWeaponBase();
      for (let j = i + 1; j < this.players.length; j++) {
        const p2 = this.players[j];
        const tip2 = p2.getWeaponTip();
        const start2 = p2.getWeaponBase();
        // Determine if weapon segments intersect or come within thickness distance
        let collides = segmentsIntersect(start1, tip1, start2, tip2);
        if (!collides) {
          const distSq = segmentDistanceSquared(start1, tip1, start2, tip2);
          const threshold = (p1.weaponThickness / 2 + p2.weaponThickness / 2);
          if (distSq < threshold * threshold / 10) {
            collides = true;
          }

        }
        if (collides) {
          // Play sword clash sound whenever two weapon segments collide
          if (typeof playSound === 'function') playSound('swordsclash');
          // Trigger weapon flash on both players when weapons collide. A
          // short flash indicates a parry or weapon clash. Extend the
          // weaponFlashUntil timestamp; if multiple clashes happen in
          // quick succession, the latest expiry will take effect.
          const parryFlashDuration = 50;
          p1.weaponFlashUntil = Math.max(p1.weaponFlashUntil || 0, time + parryFlashDuration);
          p2.weaponFlashUntil = Math.max(p2.weaponFlashUntil || 0, time + parryFlashDuration);

          // If one of the colliding weapons is a shield, reflect damage back to
          // the other player. Shields do not damage others directly, but a
          // successful block harms the attacker. After dealing damage, the
          // shield's buff widens it. Attacker identified as the non-shield.
          const isP1Shield = p1.weaponType === 'shield';
          const isP2Shield = p2.weaponType === 'shield';
          if (isP1Shield !== isP2Shield) {
            // Determine attacker (non-shield) and defender (shield)
            const attacker = isP1Shield ? p2 : p1;
            const defender = isP1Shield ? p1 : p2;
            // Only apply reflection if attacker is alive
            if (attacker.health > 0) {
              // Deal damage equal to the attacker's current damage value
              attacker.health -= attacker.damage;
              // Play hit sound for shield reflection
              if (typeof playSound === 'function') playSound('hit');
              if (attacker.health < 0) attacker.health = 0;
              // Tally damage statistics: shield owner inflicts damage back to attacker
              defender.damageDealt += attacker.damage;
              attacker.damageReceived += attacker.damage;
              // Invoke shield buff to widen the defender's shield
              const def = WEAPON_TYPES[defender.weaponType];
              if (def && typeof def.buff === 'function') {
                def.buff(defender);
              }
              // Apply a knockback to the attacker away from the defender. This
              // prevents an attacker from sitting on a shield and repeatedly
              // taking damage without being displaced. The push magnitude can
              // be tuned to balance responsiveness and controllability.
              const dxDef = attacker.x - defender.x;
              const dyDef = attacker.y - defender.y;
              const normDef = Math.hypot(dxDef, dyDef);
              if (normDef > 0) {
                const push = 1;
                attacker.vx += (dxDef / normDef) * push;
                attacker.vy += (dyDef / normDef) * push;
                // Clamp attacker velocity if exceeding global cap
                if (typeof MAX_PLAYER_SPEED !== 'undefined') {
                  const spd = Math.hypot(attacker.vx, attacker.vy);
                  if (spd > MAX_PLAYER_SPEED) {
                    const scl = MAX_PLAYER_SPEED / spd;
                    attacker.vx *= scl;
                    attacker.vy *= scl;
                  }
                }
              }
              // Briefly flash the attacker red and pause
              const flashDuration = 50;
              attacker.flashColor = '#ff5555';
              attacker.flashUntil = time + flashDuration;
              // Pause game momentarily to show hit effect
              this.pauseUntil = time + flashDuration;
              // Record last hit time to avoid repeated hits in a row
              if (!defender.lastHit) defender.lastHit = {};
              defender.lastHit[attacker.id] = time;
            }
          }
          // Reverse rotation directions for all weapon clashes
          p1.weaponAngularVelocity *= -1;
          p2.weaponAngularVelocity *= -1;
          // Apply a gentle knockback based on segment direction
          const dx = tip2.x - tip1.x;
          const dy = tip2.y - tip1.y;
          const normal = Math.hypot(dx, dy);
          if (normal > 0) {
            const nx = dx / normal;
            const ny = dy / normal;
            const knock = 0.05;
            p1.vx -= nx * knock;
            p1.vy -= ny * knock;
            p2.vx += nx * knock;
            p2.vy += ny * knock;
          }
        }
      }
    }
  }

  /**
   * Helper function to apply damage, update stats, apply buff, and handle effects.
   * Used for both melee and unarmed hits.
   * @param {Player} attacker The player dealing the damage.
   * @param {Player} target The player receiving the damage.
   * @param {number} damage The amount of damage to apply.
   * @param {number} time Current timestamp in milliseconds.
   */
  applyDamage(attacker, target, damage, time) {
    // Apply damage to target
    target.health -= damage;
    // Clamp to zero
    if (target.health < 0) target.health = 0;
    // Tally damage statistics: attacker deals damage; target receives it
    attacker.damageDealt += damage;
    target.damageReceived += damage;
    // Apply weapon‑specific buff to the attacker
    const def = WEAPON_TYPES[attacker.weaponType];
    if (def && typeof def.buff === 'function') {
      def.buff(attacker);
    }
    // Flash the target red briefly and pause the game slightly
    const flashDuration = 50; // ms
    target.flashColor = '#ff5555';
    target.flashUntil = time + flashDuration;
    this.pauseUntil = time + flashDuration;
    // Record last hit time
    if (!attacker.lastHit) attacker.lastHit = {};
    attacker.lastHit[target.id] = time;
    // If the attacker is a scythe, apply a poison stack to the target
    if (attacker.weaponType === 'scythe') {
      this.applyPoisonStack(attacker, target);
    }
    // Play hit sound
    if (typeof playSound === 'function') playSound('hit');
  }

  /**
   * Spawn new arrows, update existing arrows and handle arrow collisions.
   *
   * This method should be called every frame when the game is not paused.
   * It spawns a volley of arrows for each bow whose cooldown has elapsed,
   * moves all active arrows based on their velocity, removes arrows that
   * leave the arena and applies damage/buffs when arrows strike players.
   * @param {number} delta Time elapsed since last frame in milliseconds
   * @param {number} time Current timestamp in milliseconds
   */
  updateArrows(delta, time) {
    // Handle sequential volleys for bow players
    for (const p of this.players) {
      if (p.weaponType !== 'bow') continue;
      // initialize bow-specific fields if missing
      if (p.arrowCooldown === undefined) p.arrowCooldown = 1000;
      if (p.lastArrowShotTime === undefined) p.lastArrowShotTime = 0;
      if (p.arrowCount === undefined) p.arrowCount = 1;
      if (p.arrowsRemaining === undefined) p.arrowsRemaining = 0;
      if (p.nextArrowTime === undefined) p.nextArrowTime = 0;
      // If currently in a volley, spawn next arrow when interval has passed
      if (p.arrowsRemaining > 0) {
        if (time >= p.nextArrowTime) {
          // Determine direction and speed
          const angle = p.weaponAngle;
          const speed = 0.5;
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          const start = p.getWeaponTip();
          // Spawn the arrow and play its firing sound
          this.arrows.push({ x: start.x, y: start.y, vx: vx, vy: vy, owner: p, damage: 1 });
          if (typeof playSound === 'function') playSound('arrow');
          p.arrowsRemaining -= 1;
          if (p.arrowsRemaining > 0) {
            const baseInterval = 200;
            const interval = baseInterval / p.arrowCount;
            p.nextArrowTime = time + interval;
          }
        }
      } else {
        // No volley in progress; start new volley if cooldown elapsed
        if (time - p.lastArrowShotTime >= p.arrowCooldown) {
          p.arrowsRemaining = p.arrowCount;
          p.lastArrowShotTime = time;
          p.nextArrowTime = time;
        }
      }
    }
    // Update arrow positions and handle collisions
    const remaining = [];
    arrowLoop:
    for (const arrow of this.arrows) {
      // Move arrow
      arrow.x += arrow.vx * delta;
      arrow.y += arrow.vy * delta;
      // Remove if out of bounds
      if (arrow.x < 0 || arrow.x > width || arrow.y < 0 || arrow.y > height) {
        continue;
      }
      // Check collision with weapons (parry). If arrow touches any weapon (excluding owner's), remove it. If
      // the weapon is a shield, deflect damage back to the bow owner and widen the shield.
      const arrowThickness = 6;
      const arrowRadius = arrowThickness / 2;
      for (const target of this.players) {
        if (target === arrow.owner) continue;
        // Start of the target's weapon at the edge of its body
        const segStart = target.getWeaponBase();
        const segEnd = target.getWeaponTip();
        const distSq = distancePointToSegmentSquared({ x: arrow.x, y: arrow.y }, segStart, segEnd);
        const threshold = (target.weaponThickness / 2 + arrowRadius);
        if (distSq <= threshold * threshold) {
          // If the target's weapon is a shield, reflect the arrow's damage back to the bow owner
          if (target.weaponType === 'shield') {
            const owner = arrow.owner;
            if (owner && owner.health > 0) {
              // Deduct arrow damage from the bow owner's health
              owner.health -= arrow.damage;
              if (owner.health < 0) owner.health = 0;
              // Update damage stats: shield deals damage to arrow owner
              target.damageDealt += arrow.damage;
              owner.damageReceived += arrow.damage;
              // Buff the shield (widen it) on each deflection
              const def = WEAPON_TYPES[target.weaponType];
              if (def && typeof def.buff === 'function') {
                def.buff(target);
              }
              // Knock the bow owner away from the shield to avoid stacking hits
              const dx = owner.x - target.x;
              const dy = owner.y - target.y;
              const nrm = Math.hypot(dx, dy);
              if (nrm > 0) {
                const push = 0.1;
                owner.vx += (dx / nrm) * push;
                owner.vy += (dy / nrm) * push;
                // Clamp velocity if exceeding cap
                if (typeof MAX_PLAYER_SPEED !== 'undefined') {
                  const spd2 = Math.hypot(owner.vx, owner.vy);
                  if (spd2 > MAX_PLAYER_SPEED) {
                    const scl2 = MAX_PLAYER_SPEED / spd2;
                    owner.vx *= scl2;
                    owner.vy *= scl2;
                  }
                }
              }
              // Flash and pause
              const flashDuration = 50;
              owner.flashColor = '#ff5555';
              owner.flashUntil = time + flashDuration;
              this.pauseUntil = time + flashDuration;
              if (!target.lastHit) target.lastHit = {};
              target.lastHit[owner.id] = time;

              // Play hit sound for shield deflection
              if (typeof playSound === 'function') playSound('hit');
            }
          }
          // Arrow is removed after touching any weapon
          continue arrowLoop;
        }
      }
      // Check collision with player bodies
      for (const target of this.players) {
        if (target === arrow.owner) continue;
        if (target.health <= 0) continue;
        const dx = arrow.x - target.x;
        const dy = arrow.y - target.y;
        if (dx * dx + dy * dy <= target.radius * target.radius) {
          // Hit body: apply damage and buff owner
          target.health -= arrow.damage;
          if (target.health < 0) target.health = 0;
          // Update damage stats: arrow owner deals damage to target
          arrow.owner.damageDealt += arrow.damage;
          target.damageReceived += arrow.damage;
          const def = WEAPON_TYPES[arrow.owner.weaponType];
          if (def && typeof def.buff === 'function') {
            def.buff(arrow.owner);
          }
          const flashDuration = 80;
          target.flashColor = '#ff5555';
          target.flashUntil = time + flashDuration;

          // Play hit sound when arrow strikes a player
          if (typeof playSound === 'function') playSound('hit');
          continue arrowLoop;
        }
      }
      // Keep arrow
      remaining.push(arrow);
    }
    this.arrows = remaining;
  }

  /**
   * Spawn, move and resolve staff fireballs. Staff players fire a single
   * fireball each time their cooldown elapses. Fireballs travel in the
   * direction of the staff's blade and explode on impact with walls,
   * obstacles or players. The explosion damages all players within
   * the fireball's radius except the owner.
   * @param {number} delta Time elapsed since last frame in ms
   * @param {number} time Current timestamp in ms
   */
  updateFireballs(delta, time) {
    // Spawn new fireballs for staff players whose cooldown has elapsed
    for (const p of this.players) {
      if (p.weaponType !== 'staff') continue;
      // Initialize staff-specific timing properties if needed
      if (p.lastFireballTime === undefined) p.lastFireballTime = 0;
      if (p.fireballCooldown === undefined) p.fireballCooldown = 1000;
      if (p.fireballDamage === undefined) p.fireballDamage = 2;
      if (p.fireballRadius === undefined) p.fireballRadius = 40;
      if (time - p.lastFireballTime >= p.fireballCooldown) {
        // Spawn a new fireball at the weapon tip travelling along the blade
        const angle = p.weaponAngle;
        const speed = 0.4; // slightly slower than arrows
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const start = p.getWeaponTip();
        this.fireballs.push({ x: start.x, y: start.y, vx, vy, owner: p, damage: p.fireballDamage, radius: p.fireballRadius });
        p.lastFireballTime = time;
        // Play projectile sound using the arrow effect
        if (typeof playSound === 'function') playSound('arrow');
      }
    }
    // Move fireballs and check for collisions or out-of-bounds
    const stillActive = [];
    fireLoop: for (const fb of this.fireballs) {
      fb.x += fb.vx * delta;
      fb.y += fb.vy * delta;
      // Check bounds; explode if leaving the arena
      if (fb.x < 0 || fb.x > width || fb.y < 0 || fb.y > height) {
        this.explodeFireball(fb, time);
        continue;
      }
      // Check collision with obstacles if any
      if (Array.isArray(this.obstacles)) {
        for (const ob of this.obstacles) {
          if (fb.x >= ob.x && fb.x <= ob.x + ob.w && fb.y >= ob.y && fb.y <= ob.y + ob.h) {
            this.explodeFireball(fb, time);
            continue fireLoop;
          }
        }
      }
      // Check collision with weapon shafts (parry). If fireball touches a weapon
      // segment (excluding its owner) it explodes. Shields reflect damage to
      // the fireball owner via the shield logic in weapon collisions.
      for (const target of this.players) {
        if (target === fb.owner) continue;
        const segStart = target.getWeaponBase();
        const segEnd = target.getWeaponTip();
        // Compute distance squared from fireball center to segment
        const distSq = distancePointToSegmentSquared({ x: fb.x, y: fb.y }, segStart, segEnd);
        const threshold = (target.weaponThickness / 2 + 4); // 4px radius of fireball projectile
        if (distSq <= threshold * threshold) {
          this.explodeFireball(fb, time);
          continue fireLoop;
        }
      }
      // Check collision with player bodies. We explode on the first contact.
      for (const target of this.players) {
        if (target === fb.owner || target.health <= 0) continue;
        const dx = fb.x - target.x;
        const dy = fb.y - target.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= target.radius) {
          this.explodeFireball(fb, time);
          continue fireLoop;
        }
      }
      // No collision: keep fireball
      stillActive.push(fb);
    }
    this.fireballs = stillActive;
  }

  /**
   * Handle explosion of a staff fireball. Applies area damage to all
   * players within the fireball's radius and spawns an explosion effect.
   * Buffs the owner if at least one player was damaged.
   * @param {Object} fb The fireball object to explode
   * @param {number} time Current timestamp
   */
  explodeFireball(fb, time) {
    let hitSomeone = false;
    const owner = fb.owner;
    const radiusSq = fb.radius * fb.radius;
    for (const target of this.players) {
      if (target === owner || target.health <= 0) continue;
      const dx = target.x - fb.x;
      const dy = target.y - fb.y;
      if (dx * dx + dy * dy <= radiusSq) {
        hitSomeone = true;
        // Apply fireball damage
        target.health -= fb.damage;
        if (target.health < 0) target.health = 0;
        // Update damage stats
        owner.damageDealt += fb.damage;
        target.damageReceived += fb.damage;
        // Flash orange on hit
        target.flashColor = '#ff8800';
        const flashDuration = 80;
        target.flashUntil = time + flashDuration;
        // Play hit sound
        if (typeof playSound === 'function') playSound('hit');
      }
    }
    // If at least one target was hit, apply staff buff to owner
    if (hitSomeone) {
      const def = WEAPON_TYPES[owner.weaponType];
      if (def && typeof def.buff === 'function') {
        def.buff(owner);
      }
    }
    // Create explosion visual effect. Use the fireball's radius and an
    // orange color. Effects are rendered in drawDeathEffects.
    this.deathEffects.push({ x: fb.x, y: fb.y, color: '#ff8800', maxRadius: fb.radius, start: time });
  }

  /**
   * Apply a poison stack to a target player.
   * @param {Player} owner The player applying the poison (usually scythe).
   * @param {Player} target The player receiving the poison.
   */
  applyPoisonStack(owner, target) {
    // Determine poison damage and duration from owner properties.
    const dmg = owner.poisonDamage || 0;
    const dur = owner.poisonDuration || 0;
    if (dmg > 0 && dur > 0) {
      if (!Array.isArray(target.poisonStacks)) {
        target.poisonStacks = [];
      }
      target.poisonStacks.push({ owner: owner, damage: dmg, remainingDamage: dmg, duration: dur, remainingTime: dur });
    }
  }
  /**
   * Apply poison damage over time to all players. Each poison stack on a
   * player inflicts damage proportional to its remaining damage and
   * duration. The damage is credited to the stack's owner and removed
   * when its duration expires.
   * @param {number} delta Time elapsed since last frame in ms
   * @param {number} time Current timestamp
   */
  updatePoisonEffects(delta, time) {
    for (const target of this.players) {
      if (!Array.isArray(target.poisonStacks) || target.poisonStacks.length === 0) continue;
      const remainingStacks = [];
      for (const stack of target.poisonStacks) {
        // Compute damage to apply this frame
        const rate = stack.damage / stack.duration;
        const dmg = rate * delta;
        // Apply damage but clamp if exceeding remainingDamage
        const actual = Math.min(dmg, stack.remainingDamage);
        if (actual > 0 && target.health > 0) {
          target.health -= actual;
          if (target.health < 0) target.health = 0;
          // Credit damage to the owner of the poison
          stack.owner.damageDealt += actual;
          target.damageReceived += actual;
          // Flash purple for poison tick
          target.flashColor = '#800080';
          // Extend flash if multiple ticks overlap
          const flashDuration = 50;
          target.flashUntil = Math.max(target.flashUntil, time + flashDuration);
        }
        // Decrease remaining damage and time
        stack.remainingDamage -= actual;
        stack.remainingTime -= delta;
        // Keep the stack if there is still damage and time left
        if (stack.remainingDamage > 0 && stack.remainingTime > 0) {
          remainingStacks.push(stack);
        }
      }
      target.poisonStacks = remainingStacks;
    }
  }

  /**
   * Draw all active arrows onto the canvas. Arrows are rendered as small
   * filled circles colored the same as their owner. This method should
   * be called after drawing players and death effects.
   */
  drawArrows() {
    for (const arrow of this.arrows) {
      // Draw each arrow as a rotated rectangle to resemble a flying bolt.
      ctx.save();
      ctx.translate(arrow.x, arrow.y);
      const angle = Math.atan2(arrow.vy, arrow.vx);
      ctx.rotate(angle);
      ctx.fillStyle = arrow.owner.color;
      // Arrow dimensions: larger and more visible
      const length = 20;
      const thickness = 6;
      // Draw rectangle centered on the arrow's position
      ctx.fillRect(-length / 2, -thickness / 2, length, thickness);
      ctx.restore();
    }
  }

  /**
   * Draw active staff fireballs. Fireballs are rendered as small orange
   * circles representing the projectile before it explodes.
   */
  drawFireballs() {
    for (const fb of this.fireballs) {
      ctx.beginPath();
      ctx.fillStyle = '#ff8800';
      const r = 4;
      ctx.arc(fb.x, fb.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();
    }
  }

  // Render scoreboard information
  updateScoreboard() {
    let html = '';
    for (const p of this.players) {
      // Build a status line for this player. Show weapon name, health and
      // stats relevant to the weapon type. Dummies do not spin a weapon
      // so display their movement speed instead of angular speed.
      const def = WEAPON_TYPES[p.weaponType];
      let line = `${def.name} | Health: ${Math.max(0, Math.round(p.health))}`;
      // Show damage for all types except dummy (dummy has no damage)
      if (p.weaponType !== 'dummy') {
        line += ` | Damage: ${p.damage.toFixed(1)}`;
      }
      // Show range if weapon has length
      if (p.weaponType !== 'dummy' && p.weaponType !== 'unarmed')  {
        line += ` | Range: ${p.weaponLength.toFixed(0)}`;
      }
      // Show angular speed or movement speed
      if (p.weaponType === 'dummy' && p.weaponType !== 'unarmed') {
        // Use moveSpeed from definition
        const mspd = def.moveSpeed !== undefined ? def.moveSpeed : 0;
        line += ` | Move: ${mspd.toFixed(2)}`;
      } else {
        line += ` | Speed: ${(p.weaponAngularVelocity * 1000).toFixed(2)}`;
      }
      if (p.weaponType === 'unarmed') {
        const accel = p.accelSpeed !== undefined ? p.accelSpeed : 0;
        const bonusDmg = (accel * 2).toFixed(1);
        line += ` | Accel: ${accel.toFixed(2)} | A.Dmg: ${bonusDmg}`;
      }

      // Include arrow count for bows to show how many arrows will be fired per volley
      if (p.weaponType === 'bow') {
        const count = p.arrowCount !== undefined ? p.arrowCount : 1;
        line += ` | Arrows: ${count}`;
      }
      // Include shield width (thickness) for shield players to reflect buff state
      if (p.weaponType === 'shield') {
        line += ` | Width: ${Math.round(p.weaponThickness)}`;
      }
      // Include staff stats: fireball damage and radius
      if (p.weaponType === 'staff') {
        const fd = p.fireballDamage !== undefined ? p.fireballDamage.toFixed(1) : '0';
        const fr = p.fireballRadius !== undefined ? p.fireballRadius.toFixed(0) : '0';
        line += ` | Fire: ${fd}/${fr}`;
      }
      // Include scythe stats: poison damage and duration in seconds
      if (p.weaponType === 'scythe') {
        const pd = p.poisonDamage !== undefined ? p.poisonDamage.toFixed(1) : '0';
        const durSec = p.poisonDuration !== undefined ? (p.poisonDuration / 1000).toFixed(1) : '0';
        line += ` | Poison: ${pd}/${durSec}s`;
      }
      // Append damage statistics. All players (including dummy) track
      // damage they have dealt and damage they have taken. Use integers
      // for readability. Dummies will simply display zero for these.
      line += ` | Dealt: ${Math.round(p.damageDealt)} | Taken: ${Math.round(p.damageReceived)}`;
      html += `<div style="display:inline-block;margin:0 20px;color:${p.color};font-weight:bold">${line}</div>`;
    }
    scoreboard.innerHTML = html;
  }

  showGameOver(winner) {
    // Display a comprehensive results overlay when the match ends. Instead of
    // simply declaring a winner, we build an on‑screen summary of each
    // player's final statistics and highlight standout performances.
    const players = this.players;
    // Compute the maximum damage dealt and taken across all players for
    // highlighting in the results table.
    let maxDealt = 0;
    let maxTaken = 0;
    for (const p of players) {
      if (p.damageDealt > maxDealt) maxDealt = p.damageDealt;
      if (p.damageReceived > maxTaken) maxTaken = p.damageReceived;
    }
    // Create or reuse an overlay element for results. We store it by id so
    // subsequent games don't accumulate multiple overlays.
    let overlay = document.getElementById('dynamicResultsOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'dynamicResultsOverlay';
      Object.assign(overlay.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '2000'
      });
      document.body.appendChild(overlay);
    }
    // Build inner panel that holds the results summary
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: '#ffffff',
      color: '#000000',
      padding: '20px 30px',
      borderRadius: '8px',
      maxWidth: '90%',
      maxHeight: '90%',
      overflowY: 'auto',
      textAlign: 'center'
    });
    // Header text
    const header = document.createElement('h2');
    header.textContent = 'Game Over';
    panel.appendChild(header);
    // Winner message
    const winnerMsg = document.createElement('p');
    if (winner) {
      winnerMsg.innerHTML = `<strong style="color:${winner.color}">Player ${winner.id + 1} (${winner.weaponType}) wins!</strong>`;
    } else {
      winnerMsg.innerHTML = '<strong>Tie!</strong>';
    }
    panel.appendChild(winnerMsg);
    // Build results table
    const table = document.createElement('table');
    table.style.margin = '0 auto';
    table.style.borderCollapse = 'collapse';
    table.style.minWidth = '300px';
    // Table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const columns = ['Player', 'Weapon', 'Health', 'Damage Dealt', 'Damage Taken'];
    columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col;
      th.style.padding = '4px 8px';
      th.style.borderBottom = '2px solid #000';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    // Sort players by damage dealt descending for display
    const sorted = players.slice().sort((a, b) => b.damageDealt - a.damageDealt);
    sorted.forEach(p => {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      tdName.style.color = p.color;
      tdName.style.padding = '4px 8px';
      tdName.textContent = `Player ${p.id + 1}`;
      tr.appendChild(tdName);
      const tdWeapon = document.createElement('td');
      tdWeapon.style.padding = '4px 8px';
      tdWeapon.textContent = p.weaponType;
      tr.appendChild(tdWeapon);
      const tdHealth = document.createElement('td');
      tdHealth.style.padding = '4px 8px';
      tdHealth.textContent = Math.max(0, Math.round(p.health));
      tr.appendChild(tdHealth);
      const tdDealt = document.createElement('td');
      tdDealt.style.padding = '4px 8px';
      tdDealt.textContent = Math.round(p.damageDealt);
      if (p.damageDealt === maxDealt && maxDealt > 0) {
        tdDealt.style.fontWeight = 'bold';
        tdDealt.style.backgroundColor = '#d0ffd0';
      }
      tr.appendChild(tdDealt);
      const tdTaken = document.createElement('td');
      tdTaken.style.padding = '4px 8px';
      tdTaken.textContent = Math.round(p.damageReceived);
      if (p.damageReceived === maxTaken && maxTaken > 0) {
        tdTaken.style.fontWeight = 'bold';
        tdTaken.style.backgroundColor = '#ffd0d0';
      }
      tr.appendChild(tdTaken);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    panel.appendChild(table);
    // Legend for highlight colors
    const note = document.createElement('p');
    note.style.marginTop = '10px';
    note.style.fontSize = '0.9em';
    note.innerHTML = '<span style="background:#d0ffd0;padding:2px 4px;">Most Dealt</span> <span style="background:#ffd0d0;padding:2px 4px;">Most Taken</span>';
    panel.appendChild(note);
    // Move restart button into panel and update its click handler to hide overlay
    const btn = restartButton;
    btn.hidden = false;
    // Remove from original parent if necessary
    if (btn.parentElement !== panel) {
      panel.appendChild(btn);
    }
    btn.onclick = () => {
      // Hide overlay
      overlay.style.display = 'none';
      // Restart game with the same spawn configuration
      if (window.currentSpawnConfigs) {
        // eslint-disable-next-line no-undef
        game = new Game({ spawnConfigs: window.currentSpawnConfigs });
      } else {
        // eslint-disable-next-line no-undef
        game = new Game();
      }
      btn.hidden = true;
    };
    // Replace overlay content and show it
    overlay.innerHTML = '';
    overlay.appendChild(panel);
    overlay.style.display = 'flex';
  }
}

/**
 * Resolve collision between two players by exchanging velocities (elastic).
 * This standalone function mirrors the logic in the original monolithic script.
 * The damping factor reduces bounce energy to avoid excessive speed gain.
 */
function resolveBodyCollision(p1, p2) {
  // Only handle if overlapping
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;
  const overlap = p1.radius + p2.radius - dist;
  if (overlap <= 0) return;
  // Push them apart equally
  const nx = dx / dist;
  const ny = dy / dist;
  const separation = overlap / 2;
  p1.x -= nx * separation;
  p1.y -= ny * separation;
  p2.x += nx * separation;
  p2.y += ny * separation;
  // Exchange velocity components along collision normal (1D elastic)
  // Compute relative velocity along the normal
  const kx = p1.vx - p2.vx;
  const ky = p1.vy - p2.vy;
  const dot = kx * nx + ky * ny;
  // If moving apart, no need to apply impulse
  if (dot > 0) return;
  // Damping factor reduces bounce energy to avoid excessive speed gain. Lower
  // values result in gentler pushes when players collide. Tune to prevent
  // players from ricocheting wildly.
  const damping = 0.2;
  const impulse = dot * damping;
  p1.vx -= impulse * nx;
  p1.vy -= impulse * ny;
  p2.vx += impulse * nx;
  p2.vy += impulse * ny;

  // Clamp velocities for both players to prevent runaway speed. Without
  // limiting the velocity here, the impulse from collisions could
  // accelerate players beyond the global cap until the next update()
  // invocation, causing an unnatural burst of movement. If the
  // MAX_PLAYER_SPEED constant is defined (in gameConfig.js), scale
  // velocities down proportionally when they exceed this value.
  if (typeof MAX_PLAYER_SPEED !== 'undefined') {
    const s1 = Math.hypot(p1.vx, p1.vy);
    if (s1 > MAX_PLAYER_SPEED) {
      const scale1 = MAX_PLAYER_SPEED / s1;
      p1.vx *= scale1;
      p1.vy *= scale1;
    }
    const s2 = Math.hypot(p2.vx, p2.vy);
    if (s2 > MAX_PLAYER_SPEED) {
      const scale2 = MAX_PLAYER_SPEED / s2;
      p2.vx *= scale2;
      p2.vy *= scale2;
    }
  }
}

// A global game variable will be created from the menu script when the
// user clicks Start. The restart button's handler is also set in the
// menu script to preserve custom configurations.