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

// Utility to get current time in ms
function now() {
  return performance && performance.now ? performance.now() : Date.now();
}

// Helper to draw rounded rectangles (used for UI)
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Small helper for clamping values
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// Random helper
function randInRange(a, b) {
  return a + Math.random() * (b - a);
}

// Degree <-> radian
function degToRad(d) {
  return d * Math.PI / 180;
}

// Vector distance squared
function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Player class
 *
 * Each player has position, velocity, health, weapon attachment and
 * visual properties. The player updates movement, handles input
 * (here driven by AI or simple behavior), and interacts with weapons.
 */
class Player {
  constructor(opts = {}) {
    this.x = (opts.x !== undefined) ? opts.x : canvas.width / 2;
    this.y = (opts.y !== undefined) ? opts.y : canvas.height / 2;
    this.vx = 0;
    this.vy = 0;
    this.radius = opts.radius || 12;
    this.color = opts.color || '#ffffff';
    this.health = opts.health || (opts.hp || 250);
    this.weaponType = opts.weaponType || 'sword';
    this.weaponAngle = 0;
    this.weaponAngularVelocity = 0;
    this.weaponLength = (opts.weaponLength !== undefined) ? opts.weaponLength : 50;
    this.weaponThickness = (opts.weaponThickness !== undefined) ? opts.weaponThickness : 4;
    this.weaponSpin = 0;
    this.damage = 0;
    this.isAlive = true;
    this.spawnAt = now();
    this.lastHitAt = 0;
    this.invulnerableUntil = 0;
    this.id = opts.id || Math.floor(Math.random() * 1e9);
    // Arrow count for bows
    this.arrowCount = opts.arrowCount || 1;
  }

  // Basic physics integration (simple Euler)
  integrate(dt) {
    if (!this.isAlive) return;
    // Apply gravity
    if (typeof GRAVITY !== 'undefined') {
      this.vy += GRAVITY * dt;
    }
    // Cap speed
    if (typeof MAX_PLAYER_SPEED !== 'undefined') {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > MAX_PLAYER_SPEED) {
        const s = MAX_PLAYER_SPEED / sp;
        this.vx *= s;
        this.vy *= s;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Keep within bounds (collide with walls)
    if (MAP_TYPE === 'rectangle' || typeof MAP_TYPE === 'undefined') {
      if (this.x < this.radius) {
        this.x = this.radius;
        this.vx = -this.vx * 0.6;
      }
      if (this.x > canvas.width - this.radius) {
        this.x = canvas.width - this.radius;
        this.vx = -this.vx * 0.6;
      }
      if (this.y < this.radius) {
        this.y = this.radius;
        this.vy = -this.vy * 0.6;
      }
      if (this.y > canvas.height - this.radius) {
        this.y = canvas.height - this.radius;
        this.vy = -this.vy * 0.6;
      }
    } else if (MAP_TYPE === 'plus') {
      // Keep player in cross walkway: horizontal or vertical corridors
      const halfW = canvas.width / 2;
      const halfH = canvas.height / 2;
      const halfWalk = WALKWAY_WIDTH / 2;
      // If outside plus area, push back
      if (Math.abs(this.x - halfW) > halfWalk && Math.abs(this.y - halfH) > halfWalk) {
        // Outside the plus shaped corridor; clamp to nearest corridor
        const dx = Math.abs(this.x - halfW) - halfWalk;
        const dy = Math.abs(this.y - halfH) - halfWalk;
        if (dx > dy) {
          // clamp x
          if (this.x < halfW) this.x = halfW - halfWalk;
          else this.x = halfW + halfWalk;
          this.vx = -this.vx * 0.6;
        } else {
          if (this.y < halfH) this.y = halfH - halfWalk;
          else this.y = halfH + halfWalk;
          this.vy = -this.vy * 0.6;
        }
      }
    }
    // Weapon angle update (simple spin)
    this.weaponAngle += this.weaponAngularVelocity * dt;
  }

  // Render player and attached weapon
  render(ctx) {
    // Draw player circle
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw weapon shaft
    const wt = WEAPON_TYPES && WEAPON_TYPES[this.weaponType] ? WEAPON_TYPES[this.weaponType] : null;
    const len = this.weaponLength;
    const ang = this.weaponAngle;
    const sx = this.x + Math.cos(ang) * this.radius;
    const sy = this.y + Math.sin(ang) * this.radius;
    if (wt) {
      ctx.lineWidth = this.weaponThickness || (wt.thickness || 4);
    } else {
      ctx.lineWidth = this.weaponThickness || 4;
    }

    ctx.strokeStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(this.x + Math.cos(ang) * (this.radius + len), this.y + Math.sin(ang) * (this.radius + len));
    ctx.stroke();

    // Optionally draw a tip
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x + Math.cos(ang) * (this.radius + len), this.y + Math.sin(ang) * (this.radius + len), 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

/**
 * Projectile classes
 * Arrow (from bow) and Fireball (from staff)
 */
class Arrow {
  constructor(x, y, vx, vy, damage, ownerId) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage || 6;
    this.ownerId = ownerId;
    this.radius = 3;
    this.spawnedAt = now();
    this.isAlive = true;
  }

  integrate(dt) {
    this.vy += (GRAVITY || 0) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Kill if outside bounds
    if (this.x < -50 || this.x > canvas.width + 50 || this.y < -50 || this.y > canvas.height + 50) {
      this.isAlive = false;
    }
  }

  render(ctx) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Fireball {
  constructor(x, y, vx, vy, damage, radius, ownerId) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.damage = damage || 8;
    this.radius = radius || 8;
    this.spawnedAt = now();
    this.ownerId = ownerId;
    this.isAlive = true;
  }

  integrate(dt) {
    this.vy += (GRAVITY || 0) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Kill if outside bounds
    if (this.x < -100 || this.x > canvas.width + 100 || this.y < -100 || this.y > canvas.height + 100) {
      this.isAlive = false;
    }
  }

  render(ctx) {
    ctx.save();
    ctx.fillStyle = '#ff7b00';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * ExplosionEffect (visual only)
 */
class ExplosionEffect {
  constructor(x, y, start, maxRadius, color) {
    this.x = x; this.y = y; this.start = start || now();
    this.maxRadius = maxRadius || 30; this.color = color || '#ff7b00';
  }

  render(ctx, t) {
    const dt = (t - this.start) / 400;
    if (dt >= 1) return;
    const r = this.maxRadius * dt;
    ctx.save();
    ctx.globalAlpha = 1 - dt;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Game class
 *
 * Responsible for creating players, running the main loop, handling collisions,
 * projectile updates, effects, and orchestrating rendering.
 */
class Game {
  constructor(opts = {}) {
    this.players = [];
    this.spawnConfigs = opts.spawnConfigs || []; // array of {x: 0..1, y: 0..1, weaponType:, color:, health:}
    this.lastTime = now();
    this.running = true;
    this.deathEffects = [];
    this.arrows = [];
    this.fireballs = [];
    this.explosionEffects = [];
    this.init();
  }

  init() {
    // spawn players based on spawnConfigs
    this.players.length = 0;
    const count = this.spawnConfigs.length || 2;
    for (let i = 0; i < (this.spawnConfigs.length || 2); i++) {
      const sc = this.spawnConfigs[i] || { x: (i + 1) / (count + 1), y: 0.5, weaponType: 'sword', color: '#fff', health: 250 };
      const px = Math.floor((sc.x || 0.5) * canvas.width);
      const py = Math.floor((sc.y || 0.5) * canvas.height);
      const p = new Player({ x: px, y: py, color: sc.color || '#fff', health: sc.health || 250, weaponType: sc.weaponType || 'sword', id: i + 1 });
      // Setup default weapon values from WEAPON_TYPES if exists
      const def = (typeof WEAPON_TYPES !== 'undefined' ? WEAPON_TYPES[p.weaponType] : null);
      if (def) {
        p.weaponLength = def.baseRange || p.weaponLength;
        p.weaponThickness = def.thickness || p.weaponThickness;
        p.damage = def.baseDamage || p.damage;
      }
      this.players.push(p);
    }

    // Clear effects
    this.deathEffects.length = 0;
    this.arrows.length = 0;
    this.fireballs.length = 0;
    this.explosionEffects.length = 0;

    // Wire restart button
    const restartBtn = document.getElementById('restartButton');
    if (restartBtn) {
      restartBtn.hidden = true;
      restartBtn.onclick = () => {
        this.init();
        restartBtn.hidden = true;
      };
    }

    this.lastTime = now();
    this.running = true;
    this.loop();
  }

  spawnArrow(x, y, vx, vy, damage, ownerId) {
    const a = new Arrow(x, y, vx, vy, damage, ownerId);
    this.arrows.push(a);
  }

  spawnFireball(x, y, vx, vy, damage, radius, ownerId) {
    const f = new Fireball(x, y, vx, vy, damage, radius, ownerId);
    this.fireballs.push(f);
  }

  addExplosion(x, y, maxRadius, color) {
    this.explosionEffects.push(new ExplosionEffect(x, y, now(), maxRadius, color));
  }

  handleWeaponInteractions() {
    // Weapon-weapon collisions and weapon-player collisions
    // Iterate players and check their weapon tips against others
    for (let i = 0; i < this.players.length; i++) {
      const a = this.players[i];
      if (!a.isAlive) continue;
      const lenA = a.weaponLength;
      const tipAx = a.x + Math.cos(a.weaponAngle) * (a.radius + lenA);
      const tipAy = a.y + Math.sin(a.weaponAngle) * (a.radius + lenA);
      for (let j = 0; j < this.players.length; j++) {
        if (i === j) continue;
        const b = this.players[j];
        if (!b.isAlive) continue;
        // player-body collision check
        const d2 = dist2(tipAx, tipAy, b.x, b.y);
        const hitRadius = (b.radius + (a.weaponThickness || 4)) * (b.radius + (a.weaponThickness || 4));
        if (d2 <= hitRadius) {
          // Hit occurred
          const defA = (typeof WEAPON_TYPES !== 'undefined' ? WEAPON_TYPES[a.weaponType] : null);
          const baseDamage = (defA && defA.baseDamage) ? defA.baseDamage : a.damage || 1;
          b.health -= baseDamage;
          a.lastHitAt = now();
          // Apply buff if weapon type implements buff
          if (defA && typeof defA.buff === 'function') {
            try {
              defA.buff(a);
            } catch (e) {
              console.warn('Weapon buff error', e);
            }
          }
          // Add small knockback
          const nx = (b.x - a.x) || 0.0001;
          const ny = (b.y - a.y) || 0.0001;
          const nl = Math.hypot(nx, ny);
          const k = 0.06;
          b.vx += (nx / nl) * k;
          b.vy += (ny / nl) * k;
          // death check
          if (b.health <= 0) {
            b.isAlive = false;
            this.deathEffects.push({ x: b.x, y: b.y, start: now(), color: b.color });
            // reward attacker slightly
            a.health += 5;
          }
        }
      }
    }
  }

  updateProjectiles(dt) {
    // Update arrows and check collisions with players
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (!a.isAlive) {
        this.arrows.splice(i, 1);
        continue;
      }
      a.integrate(dt);
      // check collisions with players excluding owner
      for (let j = 0; j < this.players.length; j++) {
        const p = this.players[j];
        if (!p.isAlive) continue;
        if (p.id === a.ownerId) continue;
        const d2 = dist2(a.x, a.y, p.x, p.y);
        if (d2 <= (p.radius + a.radius) * (p.radius + a.radius)) {
          p.health -= a.damage;
          a.isAlive = false;
          this.deathEffects.push({ x: a.x, y: a.y, start: now(), color: '#fff' });
          if (p.health <= 0) {
            p.isAlive = false;
            this.deathEffects.push({ x: p.x, y: p.y, start: now(), color: p.color });
          }
        }
      }
    }

    // Update fireballs
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      if (!f.isAlive) {
        this.fireballs.splice(i, 1);
        continue;
      }
      f.integrate(dt);
      // Check collision with players
      for (let j = 0; j < this.players.length; j++) {
        const p = this.players[j];
        if (!p.isAlive) continue;
        if (p.id === f.ownerId) continue;
        const d2 = dist2(f.x, f.y, p.x, p.y);
        if (d2 <= (p.radius + f.radius) * (p.radius + f.radius)) {
          p.health -= f.damage;
          f.isAlive = false;
          this.addExplosion(f.x, f.y, 30, '#ff8b3a');
          if (p.health <= 0) {
            p.isAlive = false;
            this.deathEffects.push({ x: p.x, y: p.y, start: now(), color: p.color });
          }
        }
      }
    }
  }

  updatePlayers(dt) {
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.isAlive) continue;
      // Simple AI: slowly rotate weapon, maybe move randomly
      p.weaponAngularVelocity += randInRange(-0.0004, 0.0004);
      p.weaponAngularVelocity = clamp(p.weaponAngularVelocity, -0.02, 0.02);
      // Random walking
      p.vx += randInRange(-0.0006, 0.0006);
      p.vy += randInRange(-0.0006, 0.0006);
      // Integrate physics
      p.integrate(dt);

      // Weapon specific behaviors (bow fires arrows, staff spawns fireballs occasionally)
      const def = (typeof WEAPON_TYPES !== 'undefined' ? WEAPON_TYPES[p.weaponType] : null);
      if (def && p.weaponType === 'bow') {
        // fire arrow occasionally
        if (!p._lastArrowAt || now() - p._lastArrowAt > 800) {
          p._lastArrowAt = now();
          const ang = p.weaponAngle;
          const speed = def.baseSpeed * 1000;
          const vx = Math.cos(ang) * speed;
          const vy = Math.sin(ang) * speed;
          // spawn arrow at tip
          const tipx = p.x + Math.cos(ang) * (p.radius + p.weaponLength);
          const tipy = p.y + Math.sin(ang) * (p.radius + p.weaponLength);
          // arrow damage scales with baseArrowDamage
          const ad = def.baseArrowDamage || 6;
          this.spawnArrow(tipx, tipy, vx, vy, ad, p.id);
        }
      }
      if (def && p.weaponType === 'staff') {
        if (!p._lastFireballAt || now() - p._lastFireballAt > (def.fireballCooldown || 1200)) {
          p._lastFireballAt = now();
          // spawn fireball in direction of weapon
          const ang = p.weaponAngle;
          const speed = (def.baseSpeed || 0.01) * 800;
          const vx = Math.cos(ang) * speed;
          const vy = Math.sin(ang) * speed;
          const tipx = p.x + Math.cos(ang) * (p.radius + 8);
          const tipy = p.y + Math.sin(ang) * (p.radius + 8);
          this.spawnFireball(tipx, tipy, vx, vy, def.fireballDamage || 8, def.fireballRadius || 10, p.id);
        }
      }
    }
  }

  renderBackground() {
    ctx.save();
    // base background
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // map decorations based on map type
    if (MAP_TYPE === 'rectangle' || typeof MAP_TYPE === 'undefined') {
      // subtle grid
      ctx.strokeStyle = 'rgba(255,255,255,0.02)';
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    } else if (MAP_TYPE === 'plus') {
      const halfW = canvas.width / 2;
      const halfH = canvas.height / 2;
      ctx.fillStyle = '#081520';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#061218';
      // draw horizontal corridor
      const hw = WALKWAY_WIDTH || 200;
      ctx.fillRect(0, halfH - hw / 2, canvas.width, hw);
      // draw vertical corridor
      ctx.fillRect(halfW - hw / 2, 0, hw, canvas.height);
    } else if (MAP_TYPE === 'box') {
      // central block
      ctx.fillStyle = '#061218';
      const w = Math.min(canvas.width, canvas.height) * 0.4;
      ctx.fillRect((canvas.width - w) / 2, (canvas.height - w) / 2, w, w);
    } else if (MAP_TYPE === 'battlefield') {
      // walls scattered
      ctx.fillStyle = '#061218';
      for (let i = 0; i < 6; i++) {
        const rx = randInRange(40, canvas.width - 100);
        const ry = randInRange(40, canvas.height - 100);
        const rw = randInRange(30, 90);
        const rh = randInRange(30, 90);
        ctx.fillRect(rx, ry, rw, rh);
      }
    }
    ctx.restore();
  }

  renderScene(t) {
    // render background
    this.renderBackground();

    // render players
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.isAlive) continue;
      p.render(ctx);
    }

    // render arrows
    for (let i = 0; i < this.arrows.length; i++) {
      this.arrows[i].render(ctx);
    }

    // render fireballs
    for (let i = 0; i < this.fireballs.length; i++) {
      this.fireballs[i].render(ctx);
    }

    // render explosion effects
    for (let i = 0; i < this.explosionEffects.length; i++) {
      this.explosionEffects[i].render(ctx, t);
    }

    // render death effects
    for (let i = 0; i < this.deathEffects.length; i++) {
      const d = this.deathEffects[i];
      const dt = (t - d.start) / 1000;
      if (dt > 1.2) continue;
      ctx.save();
      ctx.globalAlpha = 1 - dt;
      ctx.fillStyle = d.color || '#fff';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 30 * dt, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // HUD / scoreboard
    this.renderHUD();
  }

  renderHUD() {
    // Simple scoreboard at top-left
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, 8, 8, 160, 28, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, 10, 10, 156, 24, 6);
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.fillText('Players: ' + this.players.filter(p => p.isAlive).length + ' / ' + this.players.length, 18, 26);
    ctx.restore();
  }

  loop() {
    if (!this.running) return;
    const t = now();
    const dt = Math.min(40, t - this.lastTime); // cap dt to avoid huge steps
    // Update
    try {
      this.update(dt);
    } catch (e) {
      console.warn('Game update error', e);
    }
    // Render
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.renderScene(t);
    } catch (e) {
      console.warn('Render error', e);
    }
    this.lastTime = t;
    // remove old effects
    this.deathEffects = this.deathEffects.filter(d => (t - d.start) < 2000);
    window.requestAnimationFrame(() => this.loop());
  }

  update(dt) {
    // Update players physics and behavior
    this.updatePlayers(dt);
    // Update projectiles
    this.updateProjectiles(dt);
    // Handle weapon interactions (weapon tips vs players)
    this.handleWeaponInteractions();
    // Tidy up players that died and create death effects
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.isAlive && p._removed !== true) {
        p._removed = true;
        this.deathEffects.push({ x: p.x, y: p.y, start: now(), color: p.color });
      }
    }
    // remove dead arrows/fireballs
    this.arrows = this.arrows.filter(a => a.isAlive);
    this.fireballs = this.fireballs.filter(f => f.isAlive);
    // process explosion effects lifecycle
    this.explosionEffects = this.explosionEffects.filter(e => (now() - e.start) < 1000);
  }
}

// Expose the Game class to global scope when possible (so inline scripts can call new Game)
try {
  if (typeof window !== 'undefined') {
    window.Game = window.Game || Game;
  }
} catch (e) {
  console.warn('Failed to attach Game to window:', e);
}
