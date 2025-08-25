/*
 * game.js — 带贴图（箭/火球）与镰刀形状碰撞的完整实现
 *
 * 说明：
 * - 纹理从 BASE_TEXTURE_PATH + file 加载（默认 'assets/textures/'）
 * - 镰刀使用多段线拟合弧形刀刃，碰撞基于点到多段线距离
 * - 箭与火球使用贴图并且判定半径使用贴图高度的半值（可微调）
 *
 * 请确保 Player 类存在 getWeaponBase/getWeaponTip/weaponAngle 等接口（与之前一致）。
 */

/* globals Player, WEAPON_TYPES, MAP_TYPE, WALKWAY_WIDTH, MAX_PLAYER_SPEED */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreboard = document.getElementById('scoreboard');
const restartButton = document.getElementById('restartButton');
let width = canvas.width;
let height = canvas.height;

/* ---------------- config: textures ---------------- */
const BASE_TEXTURE_PATH = 'assets/textures/'; // <- 如果你资源在 /game/weaponballs/assets/textures/ 请改为 '/game/weaponballs/assets/textures/'

const TEXTURE_META = {
  sword:     { file: 'sword.png',  anchor: { x: 0.05, y: 0.5 }, angleOffset: 0,        scale: 1.0, collisionScale: 1.0 },
  spear:     { file: 'spear.png',  anchor: { x: 0.05, y: 0.5 }, angleOffset: 0,        scale: 1.0, collisionScale: 1.0 },
  dagger:    { file: 'dagger.png', anchor: { x: 0.05, y: 0.5 }, angleOffset: 0,        scale: 1.0, collisionScale: 1.0 },
  bow:       { file: 'bow.png',    anchor: { x: 0.12, y: 0.5 }, angleOffset: 0.75,     scale: 1.0, collisionScale: 1.0 },
  shield:    { file: 'shield.png', anchor: { x: 0.02, y: 0.5 }, angleOffset: 0,        scale: 1.0, collisionScale: 1.0 },
  scythe:    { file: 'scythe.png', anchor: { x: 0.12, y: 0.5 }, angleOffset: 0,        scale: 1.0, collisionScale: 1.0 },
  // projectile textures
  arrow:     { file: 'arrow.png',  anchor: { x: 0.5,  y: 0.5 }, angleOffset: 0,        scale: 1.0, collisionScale: 1.0 },
  fireball:  { file: 'fireball.png', anchor: { x: 0.5, y: 0.5}, angleOffset: 0,       scale: 1.0, collisionScale: 1.0 }
};

window.WEAPON_TEXTURES = window.WEAPON_TEXTURES || {};

/* preload textures */
function preloadWeaponTextures() {
  for (const key in TEXTURE_META) {
    const meta = TEXTURE_META[key];
    const img = new Image();
    img.src = BASE_TEXTURE_PATH + meta.file;
    img.__meta = meta;
    img.__key = key;
    img.onload = function() {
      this.__loaded = true;
      this.__naturalWidth = this.naturalWidth || this.width;
      this.__naturalHeight = this.naturalHeight || this.height;
      window.WEAPON_TEXTURES[key] = this;
      // If there is an active game, assign newly loaded texture to matching players
      if (window.game && Array.isArray(window.game.players)) {
        window.game.players.forEach(p => {
          if (p.weaponType === key || key === 'arrow' || key === 'fireball') {
            // assign only when relevant: for players with weaponType matching
            if (p.weaponType === key) assignTextureToPlayer(p, this, meta);
          }
        });
      }
    };
    img.onerror = function(e) {
      console.warn('Texture load error:', BASE_TEXTURE_PATH + meta.file, e);
      this.__loaded = false;
      window.WEAPON_TEXTURES[key] = this;
    };
    // immediate store
    window.WEAPON_TEXTURES[key] = img;
  }
}
preloadWeaponTextures();

/* ---------------- sounds ---------------- */
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
function playSound(name, volume = 0.4) {
  const base = SOUNDS[name];
  if (!base) return;
  const inst = base.cloneNode();
  inst.volume = volume;
  inst.play().catch(()=>{});
}

/* --------------- geometry helpers ---------------- */
function distancePointToSegmentSquared(p, v, w) {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) {
    const dx = p.x - v.x, dy = p.y - v.y;
    return dx*dx + dy*dy;
  }
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projx = v.x + t * (w.x - v.x);
  const projy = v.y + t * (w.y - v.y);
  const dx = p.x - projx, dy = p.y - projy;
  return dx*dx + dy*dy;
}

function lineCircleCollision(a, b, c, r) {
  const dsq = distancePointToSegmentSquared(c, a, b);
  return dsq <= r*r;
}

function circleCollision(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, r = a.radius + b.radius;
  return dx*dx + dy*dy <= r*r;
}

function segmentsIntersect(a1,a2,b1,b2) {
  function orient(a,b,c) { return (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x); }
  const o1 = orient(a1,a2,b1), o2 = orient(a1,a2,b2), o3 = orient(b1,b2,a1), o4 = orient(b1,b2,a2);
  if (o1*o2 < 0 && o3*o4 < 0) return true;
  return false;
}
function segmentDistanceSquared(p1,p2,q1,q2) {
  return Math.min(
    distancePointToSegmentSquared(p1,q1,q2),
    distancePointToSegmentSquared(p2,q1,q2),
    distancePointToSegmentSquared(q1,p1,p2),
    distancePointToSegmentSquared(q2,p1,p2)
  );
}

/* distance from point to polyline (array of points) squared */
function distancePointToPolylineSquared(pt, poly) {
  let best = Infinity;
  for (let i=0;i<poly.length-1;i++){
    const a = poly[i], b = poly[i+1];
    const d = distancePointToSegmentSquared(pt, a, b);
    if (d < best) best = d;
  }
  return best;
}

/* build a scythe-like polyline for player p
   - returns array of {x,y} points describing the blade centerline from base to tip
   - uses weaponLength and an outward control offset to create curvature
*/
function buildScythePolyline(p, segments = 12) {
  const base = (typeof p.getWeaponBase === 'function') ? p.getWeaponBase() : {x:p.x, y:p.y};
  const tip  = (typeof p.getWeaponTip === 'function') ? p.getWeaponTip() : {x: p.x + Math.cos(p.weaponAngle || 0) * (p.weaponLength||60), y: p.y + Math.sin(p.weaponAngle || 0) * (p.weaponLength||60)};
  const dx = tip.x - base.x, dy = tip.y - base.y;
  const len = Math.hypot(dx, dy) || (p.weaponLength || 60);
  // normal perpendicular pointing to blade's outward side (rotate -90deg)
  const nx = -dy / (len || 1);
  const ny = dx / (len || 1);
  // control offset magnitude: fraction of length (tweakable)
  const controlMag = Math.max(8, len * 0.25);
  // control point placed mid-way plus normal offset -> creates arc
  const cx = base.x + dx * 0.5 + nx * controlMag;
  const cy = base.y + dy * 0.5 + ny * controlMag;
  // sample quadratic Bezier from base -> control -> tip
  const poly = [];
  for (let i=0;i<=segments;i++){
    const t = i / segments;
    const ix = (1-t)*(1-t)*base.x + 2*(1-t)*t*cx + t*t*tip.x;
    const iy = (1-t)*(1-t)*base.y + 2*(1-t)*t*cy + t*t*tip.y;
    poly.push({x:ix, y:iy});
  }
  return poly;
}

/* ---------------- texture assignment to player ---------------- */
function assignTextureToPlayer(p, img, meta) {
  try {
    p.texture = img;
    p.textureMeta = meta || img.__meta || {};
    const nw = img.__naturalWidth || img.naturalWidth || img.width || 40;
    const nh = img.__naturalHeight || img.naturalHeight || img.height || 8;
    const scale = p.textureMeta.scale || 1.0;
    p.weaponLength = (p.textureMeta.length || nw) * scale;
    p.weaponThickness = nh * (p.textureMeta.collisionScale || 1.0) * scale;
    const ax = (p.textureMeta.anchor && typeof p.textureMeta.anchor.x === 'number') ? p.textureMeta.anchor.x : 0;
    const ay = (p.textureMeta.anchor && typeof p.textureMeta.anchor.y === 'number') ? p.textureMeta.anchor.y : 0.5;
    p.textureAnchorPx = { x: nw * ax, y: nh * ay };
    p.textureAngleOffset = p.textureMeta.angleOffset || 0;
  } catch (e) {
    console.warn('assignTextureToPlayer error', e);
  }
}

/* ---------------- main Game class ---------------- */
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
    this.init();
  }

  drawMapBackground() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,width,height);
    if (typeof MAP_TYPE !== 'undefined' && MAP_TYPE === 'plus') {
      const walkway = typeof WALKWAY_WIDTH !== 'undefined' ? WALKWAY_WIDTH : Math.min(width,height)*0.4;
      const half = walkway/2;
      const cx = width/2, cy = height/2;
      ctx.fillStyle = '#f3f3f3';
      ctx.fillRect(0, cy-half, width, walkway);
      ctx.fillRect(cx-half, 0, walkway, height);
    }
    if (Array.isArray(this.obstacles)) {
      ctx.fillStyle = '#d0d0d0';
      for (const ob of this.obstacles) ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
    }
  }

  init() {
    width = canvas.width;
    height = canvas.height;
    let spawnConfigs;
    if (this.settings && Array.isArray(this.settings.spawnConfigs)) spawnConfigs = this.settings.spawnConfigs;
    else spawnConfigs = [
      { x: 0, y: 0.5, weaponType: 'bow', color: '#F5A623', health: 250 },
      { x: 0.25, y: 0.5, weaponType: 'spear', color: '#1944d1ff', health: 250 },
      { x: 0.5, y: 0.5, weaponType: 'dagger', color: '#37D86B', health: 250 },
      { x: 0.75, y: 0.5, weaponType: 'sword', color: '#d46b15ff', health: 250 },
    ];

    this.players = [];
    spawnConfigs.forEach((cfg, index) => {
      const direction = index % 2 === 0 ? 1 : -1;
      let moveSpeed = 0.1;
      const def = (typeof WEAPON_TYPES !== 'undefined') ? WEAPON_TYPES[cfg.weaponType] : null;
      if (def && typeof def.moveSpeed === 'number') moveSpeed = def.moveSpeed;

      const p = new Player({
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
      });

      p.damage = p.damage || 1;
      p.damageDealt = 0;
      p.damageReceived = 0;
      p.flashUntil = 0;
      p.weaponFlashUntil = 0;
      p.lastHit = p.lastHit || {};

      // assign texture if available
      const img = window.WEAPON_TEXTURES[cfg.weaponType];
      if (img && img.__loaded) {
        assignTextureToPlayer(p, img, img.__meta || TEXTURE_META[cfg.weaponType]);
      } else {
        // fallback sizes (may be overridden on texture load)
        const fallbackLen = (def && def.baseRange) ? def.baseRange : 60;
        const fallbackTh = (def && def.thickness) ? def.thickness : 8;
        p.weaponLength = fallbackLen;
        p.weaponThickness = fallbackTh;
        p.texture = img || null;
        p.textureMeta = TEXTURE_META[cfg.weaponType] || null;
        p.textureAnchorPx = { x: 0, y: p.weaponThickness/2 };
        p.textureAngleOffset = (TEXTURE_META[cfg.weaponType] && TEXTURE_META[cfg.weaponType].angleOffset) || 0;
      }

      this.players.push(p);
    });

    this.running = true;
    restartButton.hidden = true;
    this.lastTimestamp = performance.now();
    this.pauseUntil = 0;
    this.deathEffects = [];
    this.arrows = [];
    this.fireballs = [];
    this.explosionEffects = [];

    // obstacles
    const obs = [];
    if (typeof MAP_TYPE !== 'undefined') {
      if (MAP_TYPE === 'box') {
        const boxW = width*0.6, boxH = height*0.6, boxX = (width-boxW)/2, boxY = (height-boxH)/2;
        obs.push({x:boxX,y:boxY,w:boxW,h:boxH});
      } else if (MAP_TYPE === 'battlefield') {
        const wallThickness = Math.max(20, Math.min(width,height)*0.03);
        obs.push({ x: width*0.3 - wallThickness/2, y: height*0.1, w: wallThickness, h: height*0.8 });
        obs.push({ x: width*0.7 - wallThickness/2, y: height*0.1, w: wallThickness, h: height*0.8 });
        obs.push({ x: width*0.2, y: height*0.5 - wallThickness/2, w: width*0.6, h: wallThickness });
      } else if (MAP_TYPE === 'plus') {
        const walkway = typeof WALKWAY_WIDTH !== 'undefined' ? WALKWAY_WIDTH : Math.min(width,height)*0.4;
        const half = walkway/2, cx=width/2, cy=height/2;
        obs.push({x:0,y:0,w:cx-half,h:cy-half});
        obs.push({x:cx+half,y:0,w:width-(cx+half),h:cy-half});
        obs.push({x:0,y:cy+half,w:cx-half,h:height-(cy+half)});
        obs.push({x:cx+half,y:cy+half,w:width-(cx+half),h:height-(cy+half)});
      }
    }
    this.obstacles = obs;
    window.OBSTACLES = obs;

    // expose global
    window.game = this;

    requestAnimationFrame(this.loop.bind(this));
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

      for (let i=0;i<this.players.length;i++){
        for (let j=i+1;j<this.players.length;j++){
          const p1 = this.players[i], p2 = this.players[j];
          if (circleCollision(p1,p2)) resolveBodyCollision(p1,p2);
        }
      }

      // weapon interactions
      this.handleWeaponInteractions(timestamp);

      // arrows/fireballs
      this.updateArrows(delta, timestamp);
      if (typeof this.updateFireballs === 'function') this.updateFireballs(delta, timestamp);

      if (typeof this.updatePoisonEffects === 'function') this.updatePoisonEffects(delta, timestamp);
    }

    // draw base player visuals (relies on Player.draw)
    for (const p of this.players) p.draw(ctx);

    // draw textures for weapons (non-scythe use texture; scythe kept special)
    for (const p of this.players) {
      if (p.health <= 0) continue;
      try {
        if (p.weaponType === 'scythe') {
          // keep original scythe drawing by player.draw; but ensure weaponLength/thickness set
          if (!p.weaponLength) p.weaponLength = p.weaponLength || (WEAPON_TYPES && WEAPON_TYPES[p.weaponType] && WEAPON_TYPES[p.weaponType].baseRange) || 60;
          if (!p.weaponThickness) p.weaponThickness = p.weaponThickness || (WEAPON_TYPES && WEAPON_TYPES[p.weaponType] && WEAPON_TYPES[p.weaponType].thickness) || 14;
          continue;
        }

        const img = (p.texture && p.texture.__loaded) ? p.texture : (window.WEAPON_TEXTURES[p.weaponType] || null);
        const meta = p.textureMeta || (img && img.__meta) || TEXTURE_META[p.weaponType] || null;
        const base = (typeof p.getWeaponBase === 'function') ? p.getWeaponBase() : {x:p.x, y:p.y};
        const angle = (p.weaponAngle || 0) + (p.textureAngleOffset || 0);

        if (img && img.__loaded && img.__naturalWidth > 0) {
          const nw = img.__naturalWidth, nh = img.__naturalHeight;
          const intendedLen = p.weaponLength || nw * (meta && meta.scale || 1);
          const scale = intendedLen / nw;
          const drawW = nw * scale, drawH = nh * scale;
          const anchorPx = p.textureAnchorPx || { x: (meta.anchor.x * nw), y: (meta.anchor.y * nh) };

          ctx.save();
          ctx.translate(base.x, base.y);
          ctx.rotate(angle);
          ctx.drawImage(img, -anchorPx.x * scale, -anchorPx.y * scale, drawW, drawH);
          ctx.restore();

          // update weapon sizes used for collisions
          p.weaponLength = drawW;
          p.weaponThickness = drawH * (meta && meta.collisionScale ? meta.collisionScale : 1.0);
        } else {
          // fallback shaft
          const len = p.weaponLength || 60;
          const bx = base.x, by = base.y;
          const tx = bx + Math.cos(p.weaponAngle) * len;
          const ty = by + Math.sin(p.weaponAngle) * len;
          ctx.save();
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.weaponThickness || 8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.closePath();
          ctx.restore();
        }
      } catch (e) {
        console.warn('draw weapon texture error', e);
      }
    }

    // draw death effects, arrows, fireballs
    this.drawDeathEffects(timestamp);
    this.drawArrows();
    if (typeof this.drawFireballs === 'function') this.drawFireballs();

    // draw outline and health on balls
    for (const p of this.players) {
      if (p.health <= 0) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
      ctx.lineWidth = Math.max(2, Math.round(Math.min(4, p.radius * 0.12)));
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.closePath();

      const healthText = String(Math.max(0, Math.round(p.health)));
      const fontSize = Math.max(10, Math.round(p.radius * 0.7));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.14));
      ctx.strokeStyle = '#000';
      ctx.strokeText(healthText, p.x, p.y);
      ctx.fillStyle = '#fff';
      ctx.fillText(healthText, p.x, p.y);
    }

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
        p.vx = 0; p.vy = 0; p.rotationSpeed = 0;
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
      const color = effect.color || '#fff';
      const radius = progress * maxR;
      const alpha = 1 - progress;
      ctx.beginPath();
      let r=255,g=255,b=255;
      if (color && color.startsWith && color.startsWith('#')) {
        const hex = color.replace('#','');
        if (hex.length===6){ r=parseInt(hex.substring(0,2),16); g=parseInt(hex.substring(2,4),16); b=parseInt(hex.substring(4,6),16); }
      }
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI*2);
      ctx.fill();
      ctx.closePath();
      stillActive.push(effect);
    }
    this.deathEffects = stillActive;
  }

  /* ---------------- weapon interactions (kept logic, with scythe handling) ---------------- */
  handleWeaponInteractions(time) {
    const hitCooldown = 300;

    // unarmed body collisions (unchanged)
    for (let i=0;i<this.players.length;i++){
      const attacker = this.players[i];
      if (attacker.weaponType !== 'unarmed') continue;
      for (let j=0;j<this.players.length;j++){
        if (i===j) continue;
        const target = this.players[j];
        if (target.health > 0 && circleCollision(attacker, target)) {
          const extraDamage = attacker.accelSpeed * 8;
          attacker.damage += extraDamage;
          attacker.accelSpeed /= 5;
          const last = attacker.lastHit[target.id] || 0;
          if (time - last > hitCooldown) {
            const dx = attacker.x - target.x;
            const dy = attacker.y - target.y;
            const dist = Math.hypot(dx,dy);
            if (dist > 0) {
              const nx = dx/dist, ny = dy/dist, knockbackStrength = 1;
              attacker.vx += nx * knockbackStrength; attacker.vy += ny * knockbackStrength;
              target.vx -= nx * knockbackStrength; target.vy -= ny * knockbackStrength;
            }
            this.applyDamage(attacker, target, attacker.damage, time);
          }
        }
      }
    }

    // melee weapon vs body detection (use line or scythe poly)
    for (let i=0;i<this.players.length;i++){
      const attacker = this.players[i];
      const tipA = attacker.getWeaponTip ? attacker.getWeaponTip() : null;
      const lineStartA = attacker.getWeaponBase ? attacker.getWeaponBase() : null;
      for (let j=0;j<this.players.length;j++){
        if (i===j) continue;
        const target = this.players[j];
        if (attacker.weaponType !== 'bow' && attacker.weaponType !== 'shield' && attacker.weaponType !== 'staff') {
          const effectiveRadius = target.radius + (attacker.weaponThickness || 8)/2;
          let hit = false;
          if (attacker.weaponType === 'scythe') {
            const poly = buildScythePolyline(attacker);
            const dsq = distancePointToPolylineSquared({x:target.x,y:target.y}, poly);
            hit = dsq <= effectiveRadius * effectiveRadius;
          } else {
            if (lineStartA && tipA) {
              hit = lineCircleCollision(lineStartA, tipA, {x:target.x, y:target.y}, effectiveRadius);
            }
          }
          if (hit && target.health > 0) {
            const last = attacker.lastHit[target.id] || 0;
            if (time - last > hitCooldown) this.applyDamage(attacker, target, attacker.damage, time);
          }
        }
      }
    }

    // weapon-to-weapon collisions (handle scythe specially)
    for (let i=0;i<this.players.length;i++){
      const p1 = this.players[i];
      if (p1.weaponType === 'unarmed') continue;
      const start1 = p1.getWeaponBase ? p1.getWeaponBase() : null;
      const tip1 = p1.getWeaponTip ? p1.getWeaponTip() : null;
      for (let j=i+1;j<this.players.length;j++){
        const p2 = this.players[j];
        if (p2.weaponType === 'unarmed') continue;
        const start2 = p2.getWeaponBase ? p2.getWeaponBase() : null;
        const tip2 = p2.getWeaponTip ? p2.getWeaponTip() : null;

        let collides = false;
        // if neither is scythe, use segment intersection/distance
        if (p1.weaponType !== 'scythe' && p2.weaponType !== 'scythe') {
          collides = segmentsIntersect(start1, tip1, start2, tip2);
          if (!collides) {
            const distSq = segmentDistanceSquared(start1, tip1, start2, tip2);
            const threshold = (p1.weaponThickness/2 + p2.weaponThickness/2);
            if (distSq < threshold*threshold/10) collides = true;
          }
        } else {
          // at least one scythe -> compare polyline distance
          const poly1 = (p1.weaponType === 'scythe') ? buildScythePolyline(p1) : [start1, tip1];
          const poly2 = (p2.weaponType === 'scythe') ? buildScythePolyline(p2) : [start2, tip2];
          // do coarse check: any segment pair intersects or close
          outer:
          for (let a=0;a<poly1.length-1;a++){
            for (let b=0;b<poly2.length-1;b++){
              const a1 = poly1[a], a2 = poly1[a+1], b1 = poly2[b], b2 = poly2[b+1];
              if (segmentsIntersect(a1,a2,b1,b2)) { collides = true; break outer; }
              const d = segmentDistanceSquared(a1,a2,b1,b2);
              const threshold = (p1.weaponThickness/2 + p2.weaponThickness/2);
              if (d < (threshold*threshold)/10) { collides = true; break outer; }
            }
          }
        }

        if (collides) {
          if (typeof playSound === 'function') playSound('swordsclash');
          const parryFlashDuration = 50;
          p1.weaponFlashUntil = Math.max(p1.weaponFlashUntil||0, time + parryFlashDuration);
          p2.weaponFlashUntil = Math.max(p2.weaponFlashUntil||0, time + parryFlashDuration);

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
              const dxDef = attacker.x - defender.x, dyDef = attacker.y - defender.y;
              const normDef = Math.hypot(dxDef,dyDef);
              if (normDef > 0) {
                const push = 1;
                attacker.vx += (dxDef / normDef) * push;
                attacker.vy += (dyDef / normDef) * push;
                if (typeof MAX_PLAYER_SPEED !== 'undefined') {
                  const spd = Math.hypot(attacker.vx, attacker.vy);
                  if (spd > MAX_PLAYER_SPEED) { const scl = MAX_PLAYER_SPEED/spd; attacker.vx *= scl; attacker.vy *= scl; }
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

          // reverse rotation
          p1.weaponAngularVelocity *= -1;
          p2.weaponAngularVelocity *= -1;
          const dx = tip2.x - tip1.x, dy = tip2.y - tip1.y;
          const normal = Math.hypot(dx,dy);
          if (normal > 0) {
            const nx = dx/normal, ny = dy/normal;
            const knock = 0.05;
            p1.vx -= nx * knock; p1.vy -= ny * knock;
            p2.vx += nx * knock; p2.vy += ny * knock;
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
    // spawn volleys
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
          const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
          const start = p.getWeaponTip();
          // create arrow object with visual rotation and texture if available
          const arrowImg = (window.WEAPON_TEXTURES['arrow'] && window.WEAPON_TEXTURES['arrow'].__loaded) ? window.WEAPON_TEXTURES['arrow'] : null;
          const arrowObj = { x: start.x, y: start.y, vx, vy, owner: p, damage: 1, img: arrowImg };
          if (arrowImg && arrowImg.__naturalHeight) arrowObj.radius = (arrowImg.__naturalHeight * (arrowImg.__meta && arrowImg.__meta.scale || 1)) / 2;
          else arrowObj.radius = 3;
          this.arrows.push(arrowObj);
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
      if (arrow.x < -50 || arrow.x > width+50 || arrow.y < -50 || arrow.y > height+50) continue;

      // collision with weapons (parry); check against scythe poly or segment
      const arrowRadius = arrow.radius || 3;
      for (const target of this.players) {
        if (target === arrow.owner) continue;
        const segStart = target.getWeaponBase();
        const segEnd = target.getWeaponTip();
        let distSq = Infinity;
        if (target.weaponType === 'scythe') {
          const poly = buildScythePolyline(target);
          distSq = distancePointToPolylineSquared({x:arrow.x,y:arrow.y}, poly);
        } else {
          distSq = distancePointToSegmentSquared({x:arrow.x,y:arrow.y}, segStart, segEnd);
        }
        const threshold = ( (target.weaponThickness || 8) / 2 + arrowRadius );
        if (distSq <= threshold * threshold) {
          if (target.weaponType === 'shield') {
            const owner = arrow.owner;
            if (owner && owner.health > 0) {
              owner.health -= arrow.damage; if (owner.health < 0) owner.health = 0;
              target.damageDealt += arrow.damage;
              owner.damageReceived += arrow.damage;
              const def = WEAPON_TYPES[target.weaponType];
              if (def && typeof def.buff === 'function') def.buff(target);
              const dx = owner.x - target.x, dy = owner.y - target.y;
              const nrm = Math.hypot(dx,dy);
              if (nrm > 0) {
                const push = 0.1;
                owner.vx += (dx / nrm) * push;
                owner.vy += (dy / nrm) * push;
                if (typeof MAX_PLAYER_SPEED !== 'undefined') {
                  const spd2 = Math.hypot(owner.vx, owner.vy);
                  if (spd2 > MAX_PLAYER_SPEED) { const scl2 = MAX_PLAYER_SPEED/spd2; owner.vx *= scl2; owner.vy *= scl2; }
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

      // collision with body
      for (const target of this.players) {
        if (target === arrow.owner) continue;
        if (target.health <= 0) continue;
        const dx = arrow.x - target.x, dy = arrow.y - target.y;
        if (dx*dx + dy*dy <= target.radius * target.radius) {
          target.health -= arrow.damage; if (target.health < 0) target.health = 0;
          arrow.owner.damageDealt += arrow.damage; target.damageReceived += arrow.damage;
          const def = WEAPON_TYPES[arrow.owner.weaponType];
          if (def && typeof def.buff === 'function') def.buff(arrow.owner);
          const flashDuration = 80;
          target.flashColor = '#ff5555'; target.flashUntil = time + flashDuration;
          if (typeof playSound === 'function') playSound('hit');
          continue arrowLoop;
        }
      }

      remaining.push(arrow);
    }
    this.arrows = remaining;
  }

  drawArrows() {
    for (const arrow of this.arrows) {
      const img = arrow.img;
      if (img && img.__loaded && img.__naturalWidth > 0) {
        ctx.save();
        ctx.translate(arrow.x, arrow.y);
        const angle = Math.atan2(arrow.vy, arrow.vx) + (img.__meta && img.__meta.angleOffset ? img.__meta.angleOffset : 0);
        ctx.rotate(angle);
        const nw = img.__naturalWidth, nh = img.__naturalHeight;
        const scale = ( (arrow.radius*2) / (nh*(img.__meta && img.__meta.collisionScale?img.__meta.collisionScale:1)) ) || 1;
        const drawW = nw * scale, drawH = nh * scale;
        const anchorX = (img.__meta && img.__meta.anchor) ? img.__meta.anchor.x * nw * scale : -drawW/2;
        const anchorY = (img.__meta && img.__meta.anchor) ? img.__meta.anchor.y * nh * scale : -drawH/2;
        ctx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(arrow.x, arrow.y);
        const angle = Math.atan2(arrow.vy, arrow.vx);
        ctx.rotate(angle);
        ctx.fillStyle = arrow.owner.color;
        const length = 20, thickness = arrow.radius*2 || 6;
        ctx.fillRect(-length/2, -thickness/2, length, thickness);
        ctx.restore();
      }
    }
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
        const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
        const start = p.getWeaponTip();
        const fbImg = (window.WEAPON_TEXTURES['fireball'] && window.WEAPON_TEXTURES['fireball'].__loaded) ? window.WEAPON_TEXTURES['fireball'] : null;
        const fb = { x: start.x, y: start.y, vx, vy, owner: p, damage: p.fireballDamage, radius: p.fireballRadius, img: fbImg };
        if (fbImg && fbImg.__naturalHeight) fb.radius = (fbImg.__naturalHeight * (fbImg.__meta && fbImg.__meta.scale || 1)) / 2;
        this.fireballs.push(fb);
        p.lastFireballTime = time;
        if (typeof playSound === 'function') playSound('arrow');
      }
    }

    const stillActive = [];
    fireLoop:
    for (const fb of this.fireballs) {
      fb.x += fb.vx * delta; fb.y += fb.vy * delta;
      if (fb.x < -50 || fb.x > width+50 || fb.y < -50 || fb.y > height+50) { this.explodeFireball(fb, time); continue; }
      if (Array.isArray(this.obstacles)) {
        for (const ob of this.obstacles) {
          if (fb.x >= ob.x && fb.x <= ob.x+ob.w && fb.y >= ob.y && fb.y <= ob.y+ob.h) { this.explodeFireball(fb, time); continue fireLoop; }
        }
      }

      // collision with weapon shafts (parry) - check scythe poly too
      for (const target of this.players) {
        if (target === fb.owner) continue;
        let distSq = Infinity;
        if (target.weaponType === 'scythe') {
          const poly = buildScythePolyline(target);
          distSq = distancePointToPolylineSquared({x:fb.x,y:fb.y}, poly);
        } else {
          const segStart = target.getWeaponBase(), segEnd = target.getWeaponTip();
          distSq = distancePointToSegmentSquared({x:fb.x,y:fb.y}, segStart, segEnd);
        }
        const threshold = (target.weaponThickness/2 + 4);
        if (distSq <= threshold * threshold) { this.explodeFireball(fb, time); continue fireLoop; }
      }

      // collision with bodies
      for (const target of this.players) {
        if (target === fb.owner || target.health <= 0) continue;
        const dx = fb.x - target.x, dy = fb.y - target.y, dist = Math.hypot(dx,dy);
        if (dist <= target.radius) { this.explodeFireball(fb, time); continue fireLoop; }
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
      const dx = target.x - fb.x, dy = target.y - fb.y;
      if (dx*dx + dy*dy <= radiusSq) {
        hitSomeone = true;
        target.health -= fb.damage; if (target.health < 0) target.health = 0;
        owner.damageDealt += fb.damage; target.damageReceived += fb.damage;
        target.flashColor = '#ff8800'; target.flashUntil = time + 80;
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
      target.poisonStacks.push({ owner, damage: dmg, remainingDamage: dmg, duration: dur, remainingTime: dur });
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
          target.health -= actual; if (target.health < 0) target.health = 0;
          stack.owner.damageDealt += actual; target.damageReceived += actual;
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

  drawFireballs() {
    for (const fb of this.fireballs) {
      const img = fb.img;
      if (img && img.__loaded && img.__naturalWidth > 0) {
        ctx.save();
        ctx.translate(fb.x, fb.y);
        ctx.drawImage(img, - (img.__naturalWidth*(img.__meta&&img.__meta.scale||1))/2, - (img.__naturalHeight*(img.__meta&&img.__meta.scale||1))/2,
                      (img.__naturalWidth*(img.__meta&&img.__meta.scale||1)), (img.__naturalHeight*(img.__meta&&img.__meta.scale||1)));
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.fillStyle = '#ff8800'; ctx.arc(fb.x, fb.y, fb.radius || 4, 0, Math.PI*2); ctx.fill(); ctx.closePath();
      }
    }
  }

  drawArrows() {
    for (const arrow of this.arrows) {
      const img = arrow.img;
      if (img && img.__loaded && img.__naturalWidth > 0) {
        ctx.save();
        ctx.translate(arrow.x, arrow.y);
        const angle = Math.atan2(arrow.vy, arrow.vx) + (img.__meta && img.__meta.angleOffset ? img.__meta.angleOffset : 0);
        ctx.rotate(angle);
        const nw = img.__naturalWidth, nh = img.__naturalHeight;
        const scale = ( (arrow.radius*2) / (nh*(img.__meta && img.__meta.collisionScale?img.__meta.collisionScale:1)) ) || 1;
        const drawW = nw * scale, drawH = nh * scale;
        ctx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(arrow.x, arrow.y);
        const angle = Math.atan2(arrow.vy, arrow.vx);
        ctx.rotate(angle);
        ctx.fillStyle = arrow.owner.color;
        const length = 20, thickness = arrow.radius*2 || 6;
        ctx.fillRect(-length/2, -thickness/2, length, thickness);
        ctx.restore();
      }
    }
  }

  updateScoreboard() {
    let html = '';
    for (const p of this.players) {
      const def = WEAPON_TYPES[p.weaponType] || {name:p.weaponType};
      let line = `${def.name} | Health: ${Math.max(0, Math.round(p.health))}`;
      if (p.weaponType !== 'dummy') line += ` | Damage: ${p.damage.toFixed(1)}`;
      if (p.weaponType !== 'dummy' && p.weaponType !== 'unarmed') line += ` | Range: ${p.weaponLength?Math.round(p.weaponLength):0}`;
      if (p.weaponType === 'dummy' && p.weaponType !== 'unarmed') {
        const mspd = def.moveSpeed !== undefined ? def.moveSpeed : 0;
        line += ` | Move: ${mspd.toFixed(2)}`;
      } else {
        line += ` | Speed: ${(p.weaponAngularVelocity * 1000 || 0).toFixed(2)}`;
      }
      if (p.weaponType === 'unarmed') {
        const accel = p.accelSpeed !== undefined ? p.accelSpeed : 0;
        const bonusDmg = (accel*2).toFixed(1);
        line += ` | Accel: ${accel.toFixed(2)} | A.Dmg: ${bonusDmg}`;
      }
      if (p.weaponType === 'bow') {
        const count = p.arrowCount !== undefined ? p.arrowCount : 1; line += ` | Arrows: ${count}`;
      }
      if (p.weaponType === 'shield') line += ` | Width: ${Math.round(p.weaponThickness||0)}`;
      if (p.weaponType === 'staff') {
        const fd = p.fireballDamage !== undefined ? p.fireballDamage.toFixed(1) : '0';
        const fr = p.fireballRadius !== undefined ? p.fireballRadius.toFixed(0) : '0';
        line += ` | Fire: ${fd}/${fr}`;
      }
      if (p.weaponType === 'scythe') {
        const pd = p.poisonDamage !== undefined ? p.poisonDamage.toFixed(1) : '0';
        const durSec = p.poisonDuration !== undefined ? (p.poisonDuration/1000).toFixed(1) : '0';
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
    for (const p of players) { if (p.damageDealt > maxDealt) maxDealt = p.damageDealt; if (p.damageReceived > maxTaken) maxTaken = p.damageReceived; }
    let overlay = document.getElementById('dynamicResultsOverlay');
    if (!overlay) {
      overlay = document.createElement('div'); overlay.id = 'dynamicResultsOverlay';
      Object.assign(overlay.style, { position:'absolute', top:'0', left:'0', right:'0', bottom:'0', background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:'2000' });
      document.body.appendChild(overlay);
    }
    const panel = document.createElement('div');
    Object.assign(panel.style, { background:'#fff', color:'#000', padding:'20px 30px', borderRadius:'8px', maxWidth:'90%', maxHeight:'90%', overflowY:'auto', textAlign:'center' });
    const header = document.createElement('h2'); header.textContent = 'Game Over'; panel.appendChild(header);
    const winnerMsg = document.createElement('p');
    if (winner) winnerMsg.innerHTML = `<strong style="color:${winner.color}">Player ${winner.id+1} (${winner.weaponType}) wins!</strong>`;
    else winnerMsg.innerHTML = '<strong>Tie!</strong>';
    panel.appendChild(winnerMsg);
    const table = document.createElement('table'); table.style.margin='0 auto'; table.style.borderCollapse='collapse'; table.style.minWidth='300px';
    const thead = document.createElement('thead'); const headerRow = document.createElement('tr');
    ['Player','Weapon','Health','Damage Dealt','Damage Taken'].forEach(col=>{ const th=document.createElement('th'); th.textContent=col; th.style.padding='4px 8px'; th.style.borderBottom='2px solid #000'; headerRow.appendChild(th)});
    thead.appendChild(headerRow); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    const sorted = players.slice().sort((a,b)=>b.damageDealt - a.damageDealt);
    sorted.forEach(p=>{
      const tr = document.createElement('tr');
      const tdName = document.createElement('td'); tdName.style.color=p.color; tdName.style.padding='4px 8px'; tdName.textContent = `Player ${p.id+1}`; tr.appendChild(tdName);
      const tdWeapon = document.createElement('td'); tdWeapon.style.padding='4px 8px'; tdWeapon.textContent = p.weaponType; tr.appendChild(tdWeapon);
      const tdHealth = document.createElement('td'); tdHealth.style.padding='4px 8px'; tdHealth.textContent = Math.max(0, Math.round(p.health)); tr.appendChild(tdHealth);
      const tdDealt = document.createElement('td'); tdDealt.style.padding='4px 8px'; tdDealt.textContent = Math.round(p.damageDealt);
      if (p.damageDealt === maxDealt && maxDealt > 0) { tdDealt.style.fontWeight = 'bold'; tdDealt.style.backgroundColor = '#d0ffd0'; }
      tr.appendChild(tdDealt);
      const tdTaken = document.createElement('td'); tdTaken.style.padding='4px 8px'; tdTaken.textContent = Math.round(p.damageReceived);
      if (p.damageReceived === maxTaken && maxTaken > 0) { tdTaken.style.fontWeight = 'bold'; tdTaken.style.backgroundColor = '#ffd0d0'; }
      tr.appendChild(tdTaken);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); panel.appendChild(table);
    const note = document.createElement('p'); note.style.marginTop='10px'; note.style.fontSize='0.9em';
    note.innerHTML = '<span style="background:#d0ffd0;padding:2px 4px;">Most Dealt</span> <span style="background:#ffd0d0;padding:2px 4px;">Most Taken</span>';
    panel.appendChild(note);
    const btn = restartButton; btn.hidden = false;
    if (btn.parentElement !== panel) panel.appendChild(btn);
    btn.onclick = ()=>{
      overlay.style.display = 'none';
      if (window.currentSpawnConfigs) game = new Game({ spawnConfigs: window.currentSpawnConfigs });
      else game = new Game();
      btn.hidden = true;
    };
    overlay.innerHTML = ''; overlay.appendChild(panel); overlay.style.display = 'flex';
  }
}

/* resolveBodyCollision (unchanged) */
function resolveBodyCollision(p1,p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist === 0) return;
  const overlap = p1.radius + p2.radius - dist;
  if (overlap <= 0) return;
  const nx = dx / dist, ny = dy / dist;
  const separation = overlap / 2;
  p1.x -= nx * separation; p1.y -= ny * separation;
  p2.x += nx * separation; p2.y += ny * separation;
  const kx = p1.vx - p2.vx, ky = p1.vy - p2.vy;
  const dot = kx * nx + ky * ny;
  if (dot > 0) return;
  const damping = 0.2;
  const impulse = dot * damping;
  p1.vx -= impulse * nx; p1.vy -= impulse * ny;
  p2.vx += impulse * nx; p2.vy += impulse * ny;
  if (typeof MAX_PLAYER_SPEED !== 'undefined') {
    const s1 = Math.hypot(p1.vx,p1.vy);
    if (s1 > MAX_PLAYER_SPEED) { const scale1 = MAX_PLAYER_SPEED / s1; p1.vx *= scale1; p1.vy *= scale1; }
    const s2 = Math.hypot(p2.vx,p2.vy);
    if (s2 > MAX_PLAYER_SPEED) { const scale2 = MAX_PLAYER_SPEED / s2; p2.vx *= scale2; p2.vy *= scale2; }
  }
}

window.Game = Game;
