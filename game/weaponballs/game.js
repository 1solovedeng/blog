/*
 * Main game loop and logic.
 * (Modified: adds texture loading and sprite-based weapon/arrow rendering,
 *  and draws health numbers on the player circles.)
 */

// Grab UI elements and canvas context up front so they are available
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreboard = document.getElementById('scoreboard');
const restartButton = document.getElementById('restartButton');
let width = canvas.width;
let height = canvas.height;

/* ------------------------- Sounds ------------------------- */
const SOUNDS = {};
(() => {
  try {
    SOUNDS.hit = new Audio('/game/weaponballs/assets/sounds/hit.mp3');
    SOUNDS.ballbounce = new Audio('/game/weaponballs/assets/sounds/ballbounce.mp3');
    SOUNDS.swordsclash = new Audio('/game/weaponballs/assets/sounds/swordsclash.mp3');
    SOUNDS.arrow = new Audio('/game/weaponballs/assets/sounds/arrow.mp3');
  } catch (e) {
    console.warn('Failed to load audio assets:', e);
  }
})();
function playSound(name, volume = 0.4) {
  const base = SOUNDS[name];
  if (!base) return;
  const inst = base.cloneNode();
  inst.volume = volume;
  inst.play().catch(() => {});
}

/* ------------------------- Textures ------------------------- */
const TEXTURE_FILES = {
  sword: 'sword.png',
  spear: 'spear.png',
  dagger: 'dagger.png',
  bow: 'bow.png',
  shield: 'shield.png',
  arrow: 'arrow.png'
};

class Game {
  constructor(settings = {}) {
    this.settings = settings;
    this.players = [];
    this.lastTimestamp = 0;
    this.running = true;
    this.deathEffects = [];
    this.arrows = [];
    this.fireballs = [];
    this.explosionEffects = [];
    this.textures = {};
    this.init();
  }

  drawMapBackground() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (typeof MAP_TYPE !== 'undefined' && MAP_TYPE === 'plus') {
      const walkway = typeof WALKWAY_WIDTH !== 'undefined' ? WALKWAY_WIDTH : Math.min(width, height) * 0.4;
      const half = walkway / 2;
      const cx = width / 2;
      const cy = height / 2;
      ctx.fillStyle = '#f3f3f3';
      ctx.fillRect(0, cy - half, width, walkway);
      ctx.fillRect(cx - half, 0, walkway, height);
    }

    if (Array.isArray(this.obstacles)) {
      ctx.fillStyle = '#d0d0d0';
      for (const ob of this.obstacles) {
        ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
      }
    }
  }

  loadTextures() {
    const base = '/game/weaponballs/assets/textures/';
    const keys = Object.keys(TEXTURE_FILES);
    if (keys.length === 0) {
      window.WEAPON_TEXTURES = {};
      return Promise.resolve({});
    }
    const textures = {};
    let remaining = keys.length;
    return new Promise((resolve) => {
      keys.forEach(key => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          textures[key] = img;
          remaining--;
          if (remaining === 0) {
            this.textures = textures;
            window.WEAPON_TEXTURES = textures;
            resolve(textures);
          }
        };
        img.onerror = (e) => {
          console.warn('Failed to load texture for', key, 'from', base + TEXTURE_FILES[key], e);
          remaining--;
          if (remaining === 0) {
            this.textures = textures;
            window.WEAPON_TEXTURES = textures;
            resolve(textures);
          }
        };
        img.src = base + TEXTURE_FILES[key] + '?_=' + Date.now();
      });
    });
  }

  init() {
    width = canvas.width;
    height = canvas.height;

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
      const direction = index % 2 === 0 ? 1 : -1;
      let moveSpeed = 0.1;
      const def = (typeof WEAPON_TYPES !== 'undefined') ? WEAPON_TYPES[cfg.weaponType] : undefined;
      if (def && typeof def.moveSpeed === 'number') moveSpeed = def.moveSpeed;
      this.players.push(new Player({
        id: index,
        x: width * cfg.x,
        y: height * cfg.y,
        radius: 20,
        color: cfg.color,
        vx: moveSpeed * direction,
        vy: moveSpeed * direction,
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
    this.arrows = [];
    this.fireballs = [];
    this.explosionEffects = [];

    const obs = [];
    if (typeof MAP_TYPE !== 'undefined') {
      if (MAP_TYPE === 'box') {
        const boxW = width * 0.6;
        const boxH = height * 0.6;
        const boxX = (width - boxW) / 2;
        const boxY = (height - boxH) / 2;
        obs.push({ x: boxX, y: boxY, w: boxW, h: boxH });
      } else if (MAP_TYPE === 'battlefield') {
        const wallThickness = Math.max(20, Math.min(width, height) * 0.03);
        obs.push({ x: width * 0.3 - wallThickness / 2, y: height * 0.1, w: wallThickness, h: height * 0.8 });
        obs.push({ x: width * 0.7 - wallThickness / 2, y: height * 0.1, w: wallThickness, h: height * 0.8 });
        obs.push({ x: width * 0.2, y: height * 0.5 - wallThickness / 2, w: width * 0.6, h: wallThickness });
      } else if (MAP_TYPE === 'plus') {
        const walkway = typeof WALKWAY_WIDTH !== 'undefined' ? WALKWAY_WIDTH : Math.min(width, height) * 0.4;
        const half = walkway / 2;
        const cx = width / 2;
        const cy = height / 2;
        obs.push({ x: 0, y: 0, w: cx - half, h: cy - half });
        obs.push({ x: cx + half, y: 0, w: width - (cx + half), h: cy - half });
        obs.push({ x: 0, y: cy + half, w: cx - half, h: height - (cy + half) });
        obs.push({ x: cx + half, y: cy + half, w: width - (cx + half), h: height - (cy + half) });
      }
    }

    this.obstacles = obs;
    window.OBSTACLES = obs;

    this.loadTextures().then(() => {
      requestAnimationFrame(this.loop.bind(this));
    }).catch(() => {
      requestAnimationFrame(this.loop.bind(this));
    });
  }

  loop(timestamp) {
    if (!this.running) return;
    const delta = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    this.drawMapBackground();
    this.updateDeaths(timestamp);

    const paused = timestamp < this.pauseUntil;
    if (!paused) {
      for (const p of this.players) p.update(delta);
      for (let i = 0; i < this.players.length; i++) {
        for (let j = i + 1; j < this.players.length; j++) {
          const p1 = this.players[i];
          const p2 = this.players[j];
          if (circleCollision(p1, p2)) resolveBodyCollision(p1, p2);
        }
      }
      this.handleWeaponInteractions(timestamp);
      this.updateArrows(delta, timestamp);
      if (typeof this.updateFireballs === 'function') this.updateFireballs(delta, timestamp);
      if (typeof this.updatePoisonEffects === 'function') this.updatePoisonEffects(delta, timestamp);
    }

    for (const p of this.players) p.draw(ctx);
    this.drawDeathEffects(timestamp);
    this.drawArrows();
    if (typeof this.drawFireballs === 'function') this.drawFireballs();
    this.updateScoreboard();

    const survivors = this.players.filter(p => p.health > 0);
    if (survivors.length <= 1) {
      this.running = false;
      this.showGameOver(survivors[0]);
    } else {
      requestAnimationFrame(this.loop.bind(this));
    }
  }

  updateDeaths(time) {
    for (const p of this.players) {
      if (p.health <= 0 && !p.dead) {
        p.health = 0;
        p.dead = true;
        p.vx = 0;
        p.vy = 0;
        p.rotationSpeed = 0;
        this.deathEffects.push({ x: p.x, y: p.y, color: p.color, start: time });
      }
    }
  }

  drawDeathEffects(time) {
    const duration = 500;
    const stillActive = [];
    for (const effect of this.deathEffects) {
      const progress = (time - effect.start) / duration;
      if (progress >= 1) continue;
      const maxR = effect.maxRadius || 40;
      const color = effect.color || '#ffffff';
      const radius = progress * maxR;
      const alpha = 1 - progress;
      ctx.beginPath();
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

  /* -------------------- weapon interactions & related methods -------------------- */
  handleWeaponInteractions(time) {
    const hitCooldown = 300;

    // Unarmed body collisions
    for (let i = 0; i < this.players.length; i++) {
      const attacker = this.players[i];
      if (attacker.weaponType !== 'unarmed') continue;
      for (let j = 0; j < this.players.length; j++) {
        if (i === j) continue;
        const target = this.players[j];
        if (target.health > 0 && circleCollision(attacker, target)) {
          const extraDamage = attacker.accelSpeed * 8;
          attacker.damage += extraDamage;
          attacker.accelSpeed /= 5;
          const last = attacker.lastHit[target.id] || 0;
          if (time - last > hitCooldown) {
            const dx = attacker.x - target.x;
            const dy = attacker.y - target.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
              const nx = dx / dist;
              const ny = dy / dist;
              const knockbackStrength = 1;
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

    // Melee weapon hitting bodies
    for (let i = 0; i < this.players.length; i++) {
      const attacker = this.players[i];
      const tipA = attacker.getWeaponTip();
      const lineStartA = attacker.getWeaponBase();
      for (let j = 0; j < this.players.length; j++) {
        if (i === j) continue;
        const target = this.players[j];
        if (attacker.weaponType !== 'bow' && attacker.weaponType !== 'shield' && attacker.weaponType !== 'staff') {
          const effectiveRadius = target.radius + attacker.weaponThickness / 2;
          if (lineCircleCollision(lineStartA, tipA, { x: target.x, y: target.y }, effectiveRadius) && target.health > 0) {
            const last = attacker.lastHit[target.id] || 0;
            if (time - last > hitCooldown) {
              this.applyDamage(attacker, target, attacker.damage, time);
            }
          }
        }
      }
    }

    // Weapon-to-weapon collisions
    for (let i = 0; i < this.players.length; i++) {
      const p1 = this.players[i];
      if (p1.weaponType === 'unarmed') continue;
      const tip1 = p1.getWeaponTip();
      const start1 = p1.getWeaponBase();
      for (let j = i + 1; j < this.players.length; j++) {
        const p2 = this.players[j];
        const tip2 = p2.getWeaponTip();
        const start2 = p2.getWeaponBase();
        let collides = segmentsIntersect(start1, tip1, start2, tip2);
        if (!collides) {
          const distSq = segmentDistanceSquared(start1, tip1, start2, tip2);
          const threshold = (p1.weaponThickness / 2 + p2.weaponThickness / 2);
          if (distSq < threshold * threshold / 10) collides = true;
        }
        if (collides) {
          if (typeof playSound === 'function') playSound('swordsclash');
          const parryFlashDuration = 50;
          p1.weaponFlashUntil = Math.max(p1.weaponFlashUntil || 0, time + parryFlashDuration);
          p2.weaponFlashUntil = Math.max(p2.weaponFlashUntil || 0, time + parryFlashDuration);

          const isP1Shield = p1.weaponType === 'shield';
          const isP2Shield = p2.weaponType === 'shield';
          if (isP1Shield !== isP2Shield) {
            const attacker = isP1Shield ? p2 : p1;
            const defender = isP1Shield ? p1 : p2;
            if (attacker.health > 0) {
              attacker.health -= attacker.damage;
              if (attacker.health < 0) attacker.health = 0;
              if (typeof playSound === 'function') playSound('hit');
              defender.damageDealt += attacker.damage;
              attacker.damageReceived += attacker.damage;
              const def = WEAPON_TYPES[defender.weaponType];
              if (def && typeof def.buff === 'function') def.buff(defender);
              const dxDef = attacker.x - defender.x;
              const dyDef = attacker.y - defender.y;
              const normDef = Math.hypot(dxDef, dyDef);
              if (normDef > 0) {
                const push = 1;
                attacker.vx += (dxDef / normDef) * push;
                attacker.vy += (dyDef / normDef) * push;
                if (typeof MAX_PLAYER_SPEED !== 'undefined') {
                  const spd = Math.hypot(attacker.vx, attacker.vy);
                  if (spd > MAX_PLAYER_SPEED) {
                    const scl = MAX_PLAYER_SPEED / spd;
                    attacker.vx *= scl;
                    attacker.vy *= scl;
                  }
                }
              }
              const flashDuration = 50;
              attacker.flashColor = '#ff5555';
              attacker.flashUntil = time + flashDuration;
              this.pauseUntil = time + flashDuration;
              if (!defender.lastHit) defender.lastHit = {};
              defender.lastHit[attacker.id] = time;
            }
          }

          p1.weaponAngularVelocity *= -1;
          p2.weaponAngularVelocity *= -1;
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

  applyDamage(attacker, target, damage, time) {
    target.health -= damage;
    if (target.health < 0) target.health = 0;
    attacker.damageDealt += damage;
    target.damageReceived += damage;
    const def = WEAPON_TYPES[attacker.weaponType];
    if (def && typeof def.buff === 'function') def.buff(attacker);
    const flashDuration = 50;
    target.flashColor = '#ff5555';
    target.flashUntil = time + flashDuration;
    this.pauseUntil = time + flashDuration;
    if (!attacker.lastHit) attacker.lastHit = {};
    attacker.lastHit[target.id] = time;
    if (attacker.weaponType === 'scythe') this.applyPoisonStack(attacker, target);
    if (typeof playSound === 'function') playSound('hit');
  }

  updateArrows(delta, time) {
    for (const p of this.players) {
      if (p.weaponType !== 'bow') continue;
      if (p.arrowCooldown === undefined) p.arrowCooldown = 1000;
      if (p.lastArrowShotTime === undefined) p.lastArrowShotTime = 0;
      if (p.arrowCount === undefined) p.arrowCount = 1;
      if (p.arrowsRemaining === undefined) p.arrowsRemaining = 0;
      if (p.nextArrowTime === undefined) p.nextArrowTime = 0;
      if (p.arrowsRemaining > 0) {
        if (time >= p.nextArrowTime) {
          const angle = p.weaponAngle;
          const speed = 0.5;
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          const start = p.getWeaponTip();
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
        if (time - p.lastArrowShotTime >= p.arrowCooldown) {
          p.arrowsRemaining = p.arrowCount;
          p.lastArrowShotTime = time;
          p.nextArrowTime = time;
        }
      }
    }

    const remaining = [];
    arrowLoop:
    for (const arrow of this.arrows) {
      arrow.x += arrow.vx * delta;
      arrow.y += arrow.vy * delta;
      if (arrow.x < 0 || arrow.x > width || arrow.y < 0 || arrow.y > height) continue;
      const arrowThickness = 6;
      const arrowRadius = arrowThickness / 2;
      for (const target of this.players) {
        if (target === arrow.owner) continue;
        const segStart = target.getWeaponBase();
        const segEnd = target.getWeaponTip();
        const distSq = distancePointToSegmentSquared({ x: arrow.x, y: arrow.y }, segStart, segEnd);
        const threshold = (target.weaponThickness / 2 + arrowRadius);
        if (distSq <= threshold * threshold) {
          if (target.weaponType === 'shield') {
            const owner = arrow.owner;
            if (owner && owner.health > 0) {
              owner.health -= arrow.damage;
              if (owner.health < 0) owner.health = 0;
              target.damageDealt += arrow.damage;
              owner.damageReceived += arrow.damage;
              const def = WEAPON_TYPES[target.weaponType];
              if (def && typeof def.buff === 'function') def.buff(target);
              const dx = owner.x - target.x;
              const dy = owner.y - target.y;
              const nrm = Math.hypot(dx, dy);
              if (nrm > 0) {
                const push = 0.1;
                owner.vx += (dx / nrm) * push;
                owner.vy += (dy / nrm) * push;
                if (typeof MAX_PLAYER_SPEED !== 'undefined') {
                  const spd2 = Math.hypot(owner.vx, owner.vy);
                  if (spd2 > MAX_PLAYER_SPEED) {
                    const scl2 = MAX_PLAYER_SPEED / spd2;
                    owner.vx *= scl2;
                    owner.vy *= scl2;
                  }
                }
              }
              const flashDuration = 50;
              owner.flashColor = '#ff5555';
              owner.flashUntil = time + flashDuration;
              this.pauseUntil = time + flashDuration;
              if (!target.lastHit) target.lastHit = {};
              target.lastHit[owner.id] = time;
              if (typeof playSound === 'function') playSound('hit');
            }
          }
          continue arrowLoop;
        }
      }

      for (const target of this.players) {
        if (target === arrow.owner) continue;
        if (target.health <= 0) continue;
        const dx = arrow.x - target.x;
        const dy = arrow.y - target.y;
        if (dx * dx + dy * dy <= target.radius * target.radius) {
          target.health -= arrow.damage;
          if (target.health < 0) target.health = 0;
          arrow.owner.damageDealt += arrow.damage;
          target.damageReceived += arrow.damage;
          const def = WEAPON_TYPES[arrow.owner.weaponType];
          if (def && typeof def.buff === 'function') def.buff(arrow.owner);
          const flashDuration = 80;
          target.flashColor = '#ff5555';
          target.flashUntil = time + flashDuration;
          if (typeof playSound === 'function') playSound('hit');
          continue arrowLoop;
        }
      }
      remaining.push(arrow);
    }
    this.arrows = remaining;
  }

  updateFireballs(delta, time) {
    for (const p of this.players) {
      if (p.weaponType !== 'staff') continue;
      if (p.lastFireballTime === undefined) p.lastFireballTime = 0;
      if (p.fireballCooldown === undefined) p.fireballCooldown = 1000;
      if (p.fireballDamage === undefined) p.fireballDamage = 2;
      if (p.fireballRadius === undefined) p.fireballRadius = 40;
      if (time - p.lastFireballTime >= p.fireballCooldown) {
        const angle = p.weaponAngle;
        const speed = 0.4;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const start = p.getWeaponTip();
        this.fireballs.push({ x: start.x, y: start.y, vx, vy, owner: p, damage: p.fireballDamage, radius: p.fireballRadius });
        p.lastFireballTime = time;
        if (typeof playSound === 'function') playSound('arrow');
      }
    }

    const stillActive = [];
    fireLoop: for (const fb of this.fireballs) {
      fb.x += fb.vx * delta;
      fb.y += fb.vy * delta;
      if (fb.x < 0 || fb.x > width || fb.y < 0 || fb.y > height) {
        this.explodeFireball(fb, time);
        continue;
      }
      if (Array.isArray(this.obstacles)) {
        for (const ob of this.obstacles) {
          if (fb.x >= ob.x && fb.x <= ob.x + ob.w && fb.y >= ob.y && fb.y <= ob.y + ob.h) {
            this.explodeFireball(fb, time);
            continue fireLoop;
          }
        }
      }
      for (const target of this.players) {
        if (target === fb.owner) continue;
        const segStart = target.getWeaponBase();
        const segEnd = target.getWeaponTip();
        const distSq = distancePointToSegmentSquared({ x: fb.x, y: fb.y }, segStart, segEnd);
        const threshold = (target.weaponThickness / 2 + 4);
        if (distSq <= threshold * threshold) {
          this.explodeFireball(fb, time);
          continue fireLoop;
        }
      }
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
      stillActive.push(fb);
    }
    this.fireballs = stillActive;
  }

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
        target.health -= fb.damage;
        if (target.health < 0) target.health = 0;
        owner.damageDealt += fb.damage;
        target.damageReceived += fb.damage;
        target.flashColor = '#ff8800';
        const flashDuration = 80;
        target.flashUntil = time + flashDuration;
        if (typeof playSound === 'function') playSound('hit');
      }
    }
    if (hitSomeone) {
      const def = WEAPON_TYPES[owner.weaponType];
      if (def && typeof def.buff === 'function') def.buff(owner);
    }
    this.deathEffects.push({ x: fb.x, y: fb.y, color: '#ff8800', maxRadius: fb.radius, start: time });
  }

  applyPoisonStack(owner, target) {
    const dmg = owner.poisonDamage || 0;
    const dur = owner.poisonDuration || 0;
    if (dmg > 0 && dur > 0) {
      if (!Array.isArray(target.poisonStacks)) target.poisonStacks = [];
      target.poisonStacks.push({ owner: owner, damage: dmg, remainingDamage: dmg, duration: dur, remainingTime: dur });
    }
  }

  updatePoisonEffects(delta, time) {
    for (const target of this.players) {
      if (!Array.isArray(target.poisonStacks) || target.poisonStacks.length === 0) continue;
      const remainingStacks = [];
      for (const stack of target.poisonStacks) {
        const rate = stack.damage / stack.duration;
        const dmg = rate * delta;
        const actual = Math.min(dmg, stack.remainingDamage);
        if (actual > 0 && target.health > 0) {
          target.health -= actual;
          if (target.health < 0) target.health = 0;
          stack.owner.damageDealt += actual;
          target.damageReceived += actual;
          target.flashColor = '#800080';
          const flashDuration = 50;
          target.flashUntil = Math.max(target.flashUntil, time + flashDuration);
        }
        stack.remainingDamage -= actual;
        stack.remainingTime -= delta;
        if (stack.remainingDamage > 0 && stack.remainingTime > 0) remainingStacks.push(stack);
      }
      target.poisonStacks = remainingStacks;
    }
  }

  drawArrows() {
    const textures = window.WEAPON_TEXTURES || {};
    const arrowImg = textures['arrow'];
    for (const arrow of this.arrows) {
      ctx.save();
      ctx.translate(arrow.x, arrow.y);
      const angle = Math.atan2(arrow.vy, arrow.vx);
      ctx.rotate(angle);
      if (arrowImg && arrowImg.complete && arrowImg.naturalWidth) {
        const length = 20;
        const thickness = 6;
        ctx.drawImage(arrowImg, -length / 2, -thickness / 2, length, thickness);
      } else {
        ctx.fillStyle = arrow.owner ? arrow.owner.color : '#000';
        const length = 20;
        const thickness = 6;
        ctx.fillRect(-length / 2, -thickness / 2, length, thickness);
      }
      ctx.restore();
    }
  }

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

  updateScoreboard() {
    let html = '';
    for (const p of this.players) {
      const def = WEAPON_TYPES[p.weaponType];
      let line = `${def.name} | Health: ${Math.max(0, Math.round(p.health))}`;
      if (p.weaponType !== 'dummy') line += ` | Damage: ${p.damage.toFixed(1)}`;
      if (p.weaponType !== 'dummy' && p.weaponType !== 'unarmed') line += ` | Range: ${p.weaponLength.toFixed(0)}`;
      if (p.weaponType === 'dummy' && p.weaponType !== 'unarmed') {
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
      if (p.weaponType === 'bow') {
        const count = p.arrowCount !== undefined ? p.arrowCount : 1;
        line += ` | Arrows: ${count}`;
      }
      if (p.weaponType === 'shield') line += ` | Width: ${Math.round(p.weaponThickness)}`;
      if (p.weaponType === 'staff') {
        const fd = p.fireballDamage !== undefined ? p.fireballDamage.toFixed(1) : '0';
        const fr = p.fireballRadius !== undefined ? p.fireballRadius.toFixed(0) : '0';
        line += ` | Fire: ${fd}/${fr}`;
      }
      if (p.weaponType === 'scythe') {
        const pd = p.poisonDamage !== undefined ? p.poisonDamage.toFixed(1) : '0';
        const durSec = p.poisonDuration !== undefined ? (p.poisonDuration / 1000).toFixed(1) : '0';
        line += ` | Poison: ${pd}/${durSec}s`;
      }
      line += ` | Dealt: ${Math.round(p.damageDealt)} | Taken: ${Math.round(p.damageReceived)}`;
      html += `<div style="display:inline-block;margin:0 20px;color:${p.color};font-weight:bold">${line}</div>`;
    }
    scoreboard.innerHTML = html;
  }

  showGameOver(winner) {
    const players = this.players;
    let maxDealt = 0, maxTaken = 0;
    for (const p of players) {
      if (p.damageDealt > maxDealt) maxDealt = p.damageDealt;
      if (p.damageReceived > maxTaken) maxTaken = p.damageReceived;
    }
    let overlay = document.getElementById('dynamicResultsOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'dynamicResultsOverlay';
      Object.assign(overlay.style, {
        position: 'absolute', top: '0', left: '0', right: '0', bottom: '0',
        background: 'rgba(0,0,0,0.8)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: '2000'
      });
      document.body.appendChild(overlay);
    }
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: '#ffffff', color: '#000000', padding: '20px 30px',
      borderRadius: '8px', maxWidth: '90%', maxHeight: '90%', overflowY: 'auto', textAlign: 'center'
    });
    const header = document.createElement('h2'); header.textContent = 'Game Over'; panel.appendChild(header);
    const winnerMsg = document.createElement('p');
    if (winner) winnerMsg.innerHTML = `<strong style="color:${winner.color}">Player ${winner.id + 1} (${winner.weaponType}) wins!</strong>`;
    else winnerMsg.innerHTML = '<strong>Tie!</strong>';
    panel.appendChild(winnerMsg);

    const table = document.createElement('table');
    table.style.margin = '0 auto'; table.style.borderCollapse = 'collapse'; table.style.minWidth = '300px';
    const thead = document.createElement('thead'); const headerRow = document.createElement('tr');
    ['Player', 'Weapon', 'Health', 'Damage Dealt', 'Damage Taken'].forEach(col => {
      const th = document.createElement('th'); th.textContent = col; th.style.padding = '4px 8px'; th.style.borderBottom = '2px solid #000'; headerRow.appendChild(th);
    });
    thead.appendChild(headerRow); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    const sorted = players.slice().sort((a, b) => b.damageDealt - a.damageDealt);
    sorted.forEach(p => {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td'); tdName.style.color = p.color; tdName.style.padding = '4px 8px'; tdName.textContent = `Player ${p.id + 1}`; tr.appendChild(tdName);
      const tdWeapon = document.createElement('td'); tdWeapon.style.padding = '4px 8px'; tdWeapon.textContent = p.weaponType; tr.appendChild(tdWeapon);
      const tdHealth = document.createElement('td'); tdHealth.style.padding = '4px 8px'; tdHealth.textContent = Math.max(0, Math.round(p.health)); tr.appendChild(tdHealth);
      const tdDealt = document.createElement('td'); tdDealt.style.padding = '4px 8px'; tdDealt.textContent = Math.round(p.damageDealt);
      if (p.damageDealt === maxDealt && maxDealt > 0) { tdDealt.style.fontWeight = 'bold'; tdDealt.style.backgroundColor = '#d0ffd0'; }
      tr.appendChild(tdDealt);
      const tdTaken = document.createElement('td'); tdTaken.style.padding = '4px 8px'; tdTaken.textContent = Math.round(p.damageReceived);
      if (p.damageReceived === maxTaken && maxTaken > 0) { tdTaken.style.fontWeight = 'bold'; tdTaken.style.backgroundColor = '#ffd0d0'; }
      tr.appendChild(tdTaken);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); panel.appendChild(table);
    const note = document.createElement('p'); note.style.marginTop = '10px'; note.style.fontSize = '0.9em';
    note.innerHTML = '<span style="background:#d0ffd0;padding:2px 4px;">Most Dealt</span> <span style="background:#ffd0d0;padding:2px 4px;">Most Taken</span>';
    panel.appendChild(note);

    const btn = restartButton; btn.hidden = false; if (btn.parentElement !== panel) panel.appendChild(btn);
    btn.onclick = () => {
      overlay.style.display = 'none';
      if (window.currentSpawnConfigs) game = new Game({ spawnConfigs: window.currentSpawnConfigs });
      else game = new Game();
      btn.hidden = true;
    };
    overlay.innerHTML = ''; overlay.appendChild(panel); overlay.style.display = 'flex';
  }
}

/* -------------------- Collision resolve -------------------- */
function resolveBodyCollision(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;
  const overlap = p1.radius + p2.radius - dist;
  if (overlap <= 0) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const separation = overlap / 2;
  p1.x -= nx * separation; p1.y -= ny * separation;
  p2.x += nx * separation; p2.y += ny * separation;
  const kx = p1.vx - p2.vx; const ky = p1.vy - p2.vy;
  const dot = kx * nx + ky * ny;
  if (dot > 0) return;
  const damping = 0.2;
  const impulse = dot * damping;
  p1.vx -= impulse * nx; p1.vy -= impulse * ny;
  p2.vx += impulse * nx; p2.vy += impulse * ny;
  if (typeof MAX_PLAYER_SPEED !== 'undefined') {
    const s1 = Math.hypot(p1.vx, p1.vy);
    if (s1 > MAX_PLAYER_SPEED) { const scale1 = MAX_PLAYER_SPEED / s1; p1.vx *= scale1; p1.vy *= scale1; }
    const s2 = Math.hypot(p2.vx, p2.vy);
    if (s2 > MAX_PLAYER_SPEED) { const scale2 = MAX_PLAYER_SPEED / s2; p2.vx *= scale2; p2.vy *= scale2; }
  }
}

/* -------------------- Override Player.draw to use textures and draw health -------------------- */
function installPlayerDrawOverride() {
  if (typeof Player === 'undefined') {
    console.warn('Player class not found - texture & health draw override skipped.');
    return;
  }
  Player.prototype.draw = function(ctx) {
    const now = performance.now();
    ctx.save();

    // draw body circle (respect flash)
    const fillColor = (this.flashUntil && now < this.flashUntil && this.flashColor) ? this.flashColor : this.color;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();

    // draw weapon as texture if available, otherwise as stroke
    try {
      const textures = window.WEAPON_TEXTURES || {};
      const base = (typeof this.getWeaponBase === 'function') ? this.getWeaponBase() : { x: this.x, y: this.y };
      const tip = (typeof this.getWeaponTip === 'function') ? this.getWeaponTip() : { x: this.x + (this.weaponLength || 30), y: this.y };
      const angle = Math.atan2(tip.y - base.y, tip.x - base.x);
      const length = Math.hypot(tip.x - base.x, tip.y - base.y) || (this.weaponLength || 30);
      const thickness = this.weaponThickness || (WEAPON_TYPES && WEAPON_TYPES[this.weaponType] && WEAPON_TYPES[this.weaponType].thickness) || 6;
      const img = textures[this.weaponType];

      if (img && img.complete && img.naturalWidth) {
        ctx.translate(base.x, base.y);
        ctx.rotate(angle);
        if (this.weaponFlashUntil && now < this.weaponFlashUntil) ctx.globalAlpha = 0.9;
        // draw image from base towards tip with size = weaponLength x weaponThickness
        ctx.drawImage(img, 0, -thickness / 2, length, thickness);
        ctx.globalAlpha = 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = thickness;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.closePath();
      }

      // shield fallback visual when no texture
      if (this.weaponType === 'shield' && !img) {
        ctx.fillStyle = this.color;
        const w = this.weaponThickness || 20;
        const h = this.weaponLength || 40;
        ctx.save();
        ctx.translate(base.x, base.y);
        ctx.rotate(angle);
        ctx.globalAlpha = 0.6;
        ctx.fillRect(0, -w / 2, h, w);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    } catch (e) {
      console.warn('Player draw error:', e);
    }

    // draw health number centered on the player
    try {
      const hp = Math.max(0, Math.round(this.health || 0));
      // font size proportional to radius (ensure minimum readable size)
      const fontSize = Math.max(10, Math.floor(this.radius * 0.8));
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // stroke for contrast
      ctx.lineWidth = Math.max(2, Math.floor(fontSize / 6));
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(String(hp), this.x, this.y);
      // fill text (white for visibility)
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(hp), this.x, this.y);
    } catch (e) {
      // don't break render on font issues
      console.warn('Failed to draw health text:', e);
    }

    ctx.restore();
  };
}
installPlayerDrawOverride();

/* End of file */
