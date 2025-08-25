/* 完整 game.js（包含 ballbounce 声音播放，scythe => 棍子+半圆 判定，weapon registry 等） */

/* ------------------ 基础环境 & UI ------------------ */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreboard = document.getElementById('scoreboard');
const restartButton = document.getElementById('restartButton');
let width = canvas.width;
let height = canvas.height;

/* ------------------ Geometry / collision helpers ------------------ */
function distancePointToSegmentSquared(p, v, w) {
  const l2 = (v.x - w.x)*(v.x - w.x) + (v.y - w.y)*(v.y - w.y);
  if (l2 === 0) { const dx = p.x - v.x, dy = p.y - v.y; return dx*dx + dy*dy; }
  let t = ((p.x - v.x)*(w.x - v.x) + (p.y - v.y)*(w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projx = v.x + t*(w.x - v.x);
  const projy = v.y + t*(w.y - v.y);
  const dx = p.x - projx, dy = p.y - projy;
  return dx*dx + dy*dy;
}
function lineCircleCollision(a,b,c,r) { return distancePointToSegmentSquared(c, a, b) <= r*r; }
function circleCollision(a,b) { const dx=a.x-b.x, dy=a.y-b.y, rr=a.radius+b.radius; return dx*dx+dy*dy<=rr*rr; }
function orient(a,b,c) { return (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x); }
function segmentsIntersect(a1,a2,b1,b2) {
  const o1 = orient(a1,a2,b1), o2 = orient(a1,a2,b2), o3 = orient(b1,b2,a1), o4 = orient(b1,b2,a2);
  if (o1*o2 < 0 && o3*o4 < 0) return true;
  return false;
}
function segmentDistanceSquared(a1,a2,b1,b2) {
  return Math.min(
    distancePointToSegmentSquared(a1,b1,b2),
    distancePointToSegmentSquared(a2,b1,b2),
    distancePointToSegmentSquared(b1,a1,a2),
    distancePointToSegmentSquared(b2,a1,a2)
  );
}
function pointInPolygon(pt, poly) {
  if (!poly || poly.length < 3) return false;
  let c=false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
    if (((poly[i].y>pt.y)!==(poly[j].y>pt.y)) && (pt.x < (poly[j].x-poly[i].x)*(pt.y-poly[i].y)/(poly[j].y-poly[i].y) + poly[i].x)) c = !c;
  }
  return c;
}
function segmentIntersectsPolygon(a,b,poly) {
  if (!poly || poly.length < 3) return false;
  if (pointInPolygon(a,poly) || pointInPolygon(b,poly)) return true;
  for (let i=0;i<poly.length;i++){
    const j=(i+1)%poly.length;
    if (segmentsIntersect(a,b,poly[i],poly[j])) return true;
  }
  return false;
}
function distancePointToPolylineSquared(pt, poly) {
  let best = Infinity;
  for (let i=0;i<poly.length-1;i++){
    const a=poly[i], b=poly[i+1];
    const d = distancePointToSegmentSquared(pt,a,b);
    if (d<best) best = d;
  }
  return best;
}

/* ------------------ Weapon / Texture / Sound registry（方便扩展） ------------------ */
window.WEAPON_REGISTRY = window.WEAPON_REGISTRY || {};
window.PROJECTILE_REGISTRY = window.PROJECTILE_REGISTRY || {};
window.SOUNDS = window.SOUNDS || {};
window.WEAPON_TEXTURES = window.WEAPON_TEXTURES || {};
window.PROJECTILE_TEXTURES = window.PROJECTILE_TEXTURES || {};

function registerWeapon(def) {
  if (!def || !def.key) throw new Error('registerWeapon requires def.key');
  window.WEAPON_REGISTRY[def.key] = Object.assign({
    name: def.key,
    texture: def.texture || null,
    textureAnchor: def.textureAnchor || { x:0, y:0.5 },
    angleOffset: def.angleOffset || 0,
    thickness: def.thickness || 8,
    baseRange: def.baseRange || 80,
    collisionScale: def.collisionScale || 1.0,
    scythe: def.scythe || { shaftRatio:0.55, bladeRadiusRatio:0.45, thicknessMultiplier:1.0, resolution:20 },
    onHit: def.onHit || null,
    onHitPlayer: def.onHitPlayer || null,
    projectile: def.projectile || null
  }, def);
  window.WEAPON_TYPES = window.WEAPON_REGISTRY;
}
function registerProjectile(def) {
  if (!def || !def.key) throw new Error('registerProjectile requires def.key');
  window.PROJECTILE_REGISTRY[def.key] = Object.assign({
    name: def.key,
    texture: def.texture || null,
    radius: def.radius || 4,
    speed: def.speed || 0.5
  }, def);
}
function registerSound(key, src, opts={}) {
  try {
    const a = new Audio(src);
    a.volume = typeof opts.volume === 'number' ? opts.volume : 0.4;
    window.SOUNDS[key] = a;
  } catch (e) { console.warn('registerSound failed', key, src, e); }
}
function playSound(name, volume=0.4) {
  const base = window.SOUNDS[name];
  if (!base) return;
  try {
    const inst = base.cloneNode();
    inst.volume = Math.min(1, Math.max(0, volume));
    inst.play().catch(()=>{});
  } catch(e){/* ignore */ }
}

/* ------------------ Default registrations（包含 ballbounce） ------------------ */
(function setupDefaults(){
  registerWeapon({ key:'sword', name:'Sword', texture:'sword.png', thickness:8, baseRange:80 });
  registerWeapon({ key:'spear', name:'Spear', texture:'spear.png', thickness:8, baseRange:90 });
  registerWeapon({ key:'dagger', name:'Dagger', texture:'dagger.png', thickness:6, baseRange:50 });
  registerWeapon({ key:'bow', name:'Bow', texture:'bow.png', thickness:6, baseRange:70, projectile:'arrow' });
  registerWeapon({ key:'shield', name:'Shield', texture:'shield.png', thickness:28, baseRange:48 });
  registerWeapon({
    key:'scythe', name:'Scythe', texture:'scythe.png', thickness:14, baseRange:110,
    scythe: { shaftRatio:0.55, bladeRadiusRatio:0.45, thicknessMultiplier:1.0, resolution:26 }
  });
  registerProjectile({ key:'arrow', texture:'arrow.png', radius:4, speed:0.5 });
  registerProjectile({ key:'fireball', texture:'fireball.png', radius:10, speed:0.35 });
  // register sounds (include ballbounce)
  registerSound('hit','/game/weaponballs/assets/sounds/hit.mp3');
  registerSound('swordsclash','/game/weaponballs/assets/sounds/swordsclash.mp3');
  registerSound('arrow','/game/weaponballs/assets/sounds/arrow.mp3');
  registerSound('ballbounce','/game/weaponballs/assets/sounds/ballbounce.mp3');
})();

/* ------------------ Asset loader（贴图） ------------------ */
function loadAllTexturesAndSounds(baseTexturePath='/game/weaponballs/assets/textures/') {
  const weaponKeys = Object.keys(window.WEAPON_REGISTRY || {});
  const projKeys = Object.keys(window.PROJECTILE_REGISTRY || {});
  const texturePromises = [];

  weaponKeys.forEach(k=>{
    const t = window.WEAPON_REGISTRY[k].texture;
    if (t) {
      texturePromises.push(new Promise((resolve)=>{
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = ()=>{ window.WEAPON_TEXTURES[k] = img; resolve(); };
        img.onerror = ()=>{ window.WEAPON_TEXTURES[k] = null; resolve(); };
        img.src = baseTexturePath + t + '?_=' + Date.now();
      }));
    } else {
      window.WEAPON_TEXTURES[k] = null;
    }
  });

  projKeys.forEach(k=>{
    const t = window.PROJECTILE_REGISTRY[k].texture;
    if (t) {
      texturePromises.push(new Promise((resolve)=>{
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = ()=>{ window.PROJECTILE_TEXTURES[k] = img; resolve(); };
        img.onerror = ()=>{ window.PROJECTILE_TEXTURES[k] = null; resolve(); };
        img.src = baseTexturePath + t + '?_=' + Date.now();
      }));
    } else {
      window.PROJECTILE_TEXTURES[k] = null;
    }
  });

  return Promise.all(texturePromises);
}

/* ------------------ scythe polygon: 棍子 + 半圆 ------------------ */
function buildScythePolygon(player, resolutionOverride) {
  const base = (typeof player.getWeaponBase === 'function') ? player.getWeaponBase() : { x: player.x, y: player.y };
  const tip  = (typeof player.getWeaponTip === 'function') ? player.getWeaponTip() : { x: player.x + Math.cos(player.weaponAngle) * (player.weaponLength||80), y: player.y + Math.sin(player.weaponAngle) * (player.weaponLength||80) };

  const len = Math.hypot(tip.x - base.x, tip.y - base.y) || (player.weaponLength || 80);
  const dirx = (tip.x - base.x) / len;
  const diry = (tip.y - base.y) / len;
  const nx = -diry, ny = dirx;

  const wdef = (window.WEAPON_REGISTRY && window.WEAPON_REGISTRY['scythe']) ? window.WEAPON_REGISTRY['scythe'].scythe : { shaftRatio:0.55, bladeRadiusRatio:0.45, thicknessMultiplier:1.0, resolution:20 };
  const shaftRatio = (typeof player.scytheShaftRatio === 'number') ? player.scytheShaftRatio : (wdef.shaftRatio || 0.55);
  const bladeRadiusRatio = (typeof player.scytheBladeRadiusRatio === 'number') ? player.scytheBladeRadiusRatio : (wdef.bladeRadiusRatio || 0.45);
  const thicknessMul = (typeof player.scytheThicknessMultiplier === 'number') ? player.scytheThicknessMultiplier : (wdef.thicknessMultiplier || 1.0);
  const res = (typeof player.scytheResolution === 'number') ? Math.max(6, Math.floor(player.scytheResolution)) : Math.max(6, Math.floor(resolutionOverride || wdef.resolution || 20));

  const shaftLen = len * shaftRatio;
  const bladeRadius = len * bladeRadiusRatio;
  const halfWidth = ((player.weaponThickness || ((window.WEAPON_REGISTRY[player.weaponType]&&window.WEAPON_REGISTRY[player.weaponType].thickness)||14)) * thicknessMul) / 2;

  const shaftEnd = { x: base.x + dirx * shaftLen, y: base.y + diry * shaftLen };

  const leftBase = { x: base.x + nx * halfWidth, y: base.y + ny * halfWidth };
  const rightBase = { x: base.x - nx * halfWidth, y: base.y - ny * halfWidth };
  const leftEnd = { x: shaftEnd.x + nx * halfWidth, y: shaftEnd.y + ny * halfWidth };
  const rightEnd = { x: shaftEnd.x - nx * halfWidth, y: shaftEnd.y - ny * halfWidth };

  const baseAngle = Math.atan2(diry, dirx);
  const startAngle = baseAngle - Math.PI/2;
  const endAngle = baseAngle + Math.PI/2;
  const semiPoints = [];
  for (let i=0;i<=res;i++){
    const t = i / res;
    const a = startAngle + (endAngle - startAngle) * t;
    semiPoints.push({ x: shaftEnd.x + Math.cos(a) * bladeRadius, y: shaftEnd.y + Math.sin(a) * bladeRadius });
  }

  const poly = [];
  poly.push(leftBase);
  poly.push(leftEnd);
  for (let i=0;i<semiPoints.length;i++) poly.push(semiPoints[i]);
  poly.push(rightEnd);
  poly.push(rightBase);
  return poly;
}

/* ------------------ Game class ------------------ */
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
    this.obstacles = [];
    this.assetBasePath = '/game/weaponballs/assets/textures/';
    this.init();
  }

  drawMapBackground() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    if (typeof MAP_TYPE !== 'undefined' && MAP_TYPE === 'plus') {
      const walkway = typeof WALKWAY_WIDTH !== 'undefined' ? WALKWAY_WIDTH : Math.min(width, height) * 0.4;
      const half = walkway / 2;
      const cx = width / 2, cy = height / 2;
      ctx.fillStyle = '#f3f3f3';
      ctx.fillRect(0, cy - half, width, walkway);
      ctx.fillRect(cx - half, 0, walkway, height);
    }
    if (Array.isArray(this.obstacles)) {
      ctx.fillStyle = '#d0d0d0';
      for (const ob of this.obstacles) ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
    }
  }

  init() {
    width = canvas.width; height = canvas.height;

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
      const def = (typeof WEAPON_TYPES !== 'undefined') ? WEAPON_TYPES[cfg.weaponType] : undefined;
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

      const wdef = (window.WEAPON_REGISTRY && window.WEAPON_REGISTRY[p.weaponType]) ? window.WEAPON_REGISTRY[p.weaponType] : null;
      if (wdef) {
        p.weaponThickness = p.weaponThickness || (wdef.thickness || 8);
        p.weaponLength = p.weaponLength || (wdef.baseRange || 80);
        p.textureAngleOffset = wdef.angleOffset || 0;
        if (p.weaponType === 'scythe') {
          if (typeof p.scytheShaftRatio !== 'number') p.scytheShaftRatio = (wdef.scythe && wdef.scythe.shaftRatio) || 0.55;
          if (typeof p.scytheBladeRadiusRatio !== 'number') p.scytheBladeRadiusRatio = (wdef.scythe && wdef.scythe.bladeRadiusRatio) || 0.45;
          if (typeof p.scytheThicknessMultiplier !== 'number') p.scytheThicknessMultiplier = (wdef.scythe && wdef.scythe.thicknessMultiplier) || 1.0;
          if (typeof p.scytheResolution !== 'number') p.scytheResolution = (wdef.scythe && wdef.scythe.resolution) || 20;
        }
      } else {
        p.weaponThickness = p.weaponThickness || 8;
        p.weaponLength = p.weaponLength || 60;
      }

      p.damage = p.damage || 1;
      p.damageDealt = 0;
      p.damageReceived = 0;
      p.flashUntil = 0; p.weaponFlashUntil = 0; p.lastHit = p.lastHit || {};
      this.players.push(p);
    });

    this.running = true; restartButton.hidden = true; this.lastTimestamp = performance.now();
    this.pauseUntil = 0; this.deathEffects = []; this.arrows = []; this.fireballs = []; this.explosionEffects = [];

    const obs = [];
    if (typeof MAP_TYPE !== 'undefined') {
      if (MAP_TYPE === 'box') {
        const boxW = width*0.6, boxH = height*0.6, boxX=(width-boxW)/2, boxY=(height-boxH)/2;
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
    this.obstacles = obs; window.OBSTACLES = obs;

    loadAllTexturesAndSounds(this.assetBasePath).then(()=>{
      requestAnimationFrame(this.loop.bind(this));
    }).catch(()=>{
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
      for (let i=0;i<this.players.length;i++){
        for (let j=i+1;j<this.players.length;j++){
          const p1 = this.players[i], p2 = this.players[j];
          if (circleCollision(p1,p2)) resolveBodyCollision(p1,p2);
        }
      }
      this.handleWeaponInteractions(timestamp);
      this.updateArrows(delta, timestamp);
      if (typeof this.updateFireballs === 'function') this.updateFireballs(delta, timestamp);
      if (typeof this.updatePoisonEffects === 'function') this.updatePoisonEffects(delta, timestamp);
    }

    for (const p of this.players) p.draw(ctx);

    for (const p of this.players) {
      if (p.weaponType === 'scythe' && (p.debugShowScytheHitbox || false)) {
        const poly = buildScythePolygon(p, p.scytheResolution);
        if (poly && poly.length) {
          ctx.save();
          ctx.beginPath();
          ctx.fillStyle = 'rgba(255,0,0,0.12)';
          ctx.strokeStyle = 'rgba(255,0,0,0.9)';
          ctx.moveTo(poly[0].x, poly[0].y);
          for (let i=1;i<poly.length;i++) ctx.lineTo(poly[i].x, poly[i].y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    this.drawDeathEffects(timestamp);
    this.drawArrows();
    if (typeof this.drawFireballs === 'function') this.drawFireballs();
    this.updateScoreboard();

    const survivors = this.players.filter(p => p.health > 0);
    if (survivors.length <= 1) { this.running = false; this.showGameOver(survivors[0]); }
    else requestAnimationFrame(this.loop.bind(this));
  }

  updateDeaths(time) {
    for (const p of this.players) {
      if (p.health <= 0 && !p.dead) {
        p.health = 0; p.dead = true; p.vx = 0; p.vy = 0; p.rotationSpeed = 0;
        this.deathEffects.push({ x: p.x, y: p.y, color: p.color, start: time });
      }
    }
  }

  drawDeathEffects(time) {
    const duration = 500; const stillActive = [];
    for (const effect of this.deathEffects) {
      const progress = (time - effect.start) / duration;
      if (progress >= 1) continue;
      const maxR = effect.maxRadius || 40;
      const color = effect.color || '#ffffff';
      const radius = progress * maxR;
      const alpha = 1 - progress;
      ctx.beginPath();
      let r=255,g=255,b=255;
      if (color.startsWith('#')) {
        const hex = color.replace('#','');
        if (hex.length===6) { r = parseInt(hex.substring(0,2),16); g = parseInt(hex.substring(2,4),16); b = parseInt(hex.substring(4,6),16); }
      }
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI*2);
      ctx.fill();
      ctx.closePath();
      stillActive.push(effect);
    }
    this.deathEffects = stillActive;
  }

  /* -------------------- weapon interactions & related methods (支持 scythe polygon) -------------------- */
  handleWeaponInteractions(time) {
    const hitCooldown = 300;

    // Unarmed body collisions
    for (let i=0;i<this.players.length;i++){
      const attacker = this.players[i];
      if (attacker.weaponType !== 'unarmed') continue;
      for (let j=0;j<this.players.length;j++){
        if (i===j) continue;
        const target = this.players[j];
        if (target.health > 0 && circleCollision(attacker,target)) {
          const extraDamage = attacker.accelSpeed * 8;
          attacker.damage += extraDamage; attacker.accelSpeed /= 5;
          const last = attacker.lastHit[target.id] || 0;
          if (time - last > hitCooldown) {
            const dx = attacker.x - target.x, dy = attacker.y - target.y, dist = Math.hypot(dx,dy);
            if (dist > 0) {
              const nx = dx/dist, ny = dy/dist, kb = 1;
              attacker.vx += nx*kb; attacker.vy += ny*kb; target.vx -= nx*kb; target.vy -= ny*kb;
            }
            this.applyDamage(attacker, target, attacker.damage, time);
          }
        }
      }
    }

    // Melee weapon hitting bodies (use scythe polygon if needed)
    for (let i=0;i<this.players.length;i++){
      const attacker = this.players[i];
      if (attacker.weaponType === 'bow' || attacker.weaponType === 'shield' || attacker.weaponType === 'staff') continue;
      const lineStartA = attacker.getWeaponBase ? attacker.getWeaponBase() : {x:attacker.x,y:attacker.y};
      const tipA = attacker.getWeaponTip ? attacker.getWeaponTip() : { x: attacker.x + Math.cos(attacker.weaponAngle)*(attacker.weaponLength||80), y: attacker.y + Math.sin(attacker.weaponAngle)*(attacker.weaponLength||80) };
      for (let j=0;j<this.players.length;j++){
        if (i===j) continue;
        const target = this.players[j];
        if (target.health <= 0) continue;
        const effectiveRadius = target.radius + (attacker.weaponThickness || 8)/2;
        let hit = false;
        if (attacker.weaponType === 'scythe') {
          const poly = buildScythePolygon(attacker, attacker.scytheResolution);
          if (pointInPolygon({x:target.x,y:target.y}, poly)) hit = true;
          else {
            const centerLineStart = lineStartA;
            const centerLineEnd = tipA;
            const dsq = distancePointToSegmentSquared({x:target.x,y:target.y}, centerLineStart, centerLineEnd);
            if (dsq <= effectiveRadius*effectiveRadius) hit = true;
          }
        } else {
          if (lineCircleCollision(lineStartA, tipA, {x:target.x,y:target.y}, effectiveRadius)) hit = true;
        }
        if (hit) {
          const last = attacker.lastHit[target.id] || 0;
          if (time - last > hitCooldown) this.applyDamage(attacker, target, attacker.damage, time);
        }
      }
    }

    // Weapon-to-weapon collisions: support scythe polygon vs segment/polygon
    for (let i=0;i<this.players.length;i++){
      const p1 = this.players[i];
      if (p1.weaponType === 'unarmed') continue;
      const start1 = p1.getWeaponBase ? p1.getWeaponBase() : {x:p1.x,y:p1.y};
      const tip1 = p1.getWeaponTip ? p1.getWeaponTip() : { x: p1.x + Math.cos(p1.weaponAngle)*(p1.weaponLength||80), y: p1.y + Math.sin(p1.weaponAngle)*(p1.weaponLength||80) };
      const isScy1 = p1.weaponType === 'scythe';
      const poly1 = isScy1 ? buildScythePolygon(p1, p1.scytheResolution) : null;

      for (let j=i+1;j<this.players.length;j++){
        const p2 = this.players[j];
        if (p2.weaponType === 'unarmed') continue;
        const start2 = p2.getWeaponBase ? p2.getWeaponBase() : {x:p2.x,y:p2.y};
        const tip2 = p2.getWeaponTip ? p2.getWeaponTip() : { x: p2.x + Math.cos(p2.weaponAngle)*(p2.weaponLength||80), y: p2.y + Math.sin(p2.weaponAngle)*(p2.weaponLength||80) };
        const isScy2 = p2.weaponType === 'scythe';
        const poly2 = isScy2 ? buildScythePolygon(p2, p2.scytheResolution) : null;

        let collides = false;
        if (!isScy1 && !isScy2) {
          if (segmentsIntersect(start1, tip1, start2, tip2)) collides = true;
          else {
            const distSq = segmentDistanceSquared(start1, tip1, start2, tip2);
            const threshold = (p1.weaponThickness/2 + p2.weaponThickness/2);
            if (distSq < threshold*threshold/10) collides = true;
          }
        } else if (isScy1 && isScy2) {
          outer:
          for (let a=0;a<poly1.length;a++){
            const a2=(a+1)%poly1.length;
            for (let b=0;b<poly2.length;b++){
              const b2=(b+1)%poly2.length;
              if (segmentsIntersect(poly1[a], poly1[a2], poly2[b], poly2[b2])) { collides = true; break outer; }
            }
          }
          if (!collides) {
            if (pointInPolygon(poly1[0], poly2) || pointInPolygon(poly2[0], poly1)) collides = true;
          }
        } else {
          const seg = isScy1 ? { start: start2, end: tip2, segOwner: p2 } : { start: start1, end: tip1, segOwner: p1 };
          const scyPoly = isScy1 ? poly1 : poly2;
          if (segmentIntersectsPolygon(seg.start, seg.end, scyPoly)) collides = true;
          if (!collides && (pointInPolygon(seg.start, scyPoly) || pointInPolygon(seg.end, scyPoly))) collides = true;
        }

        if (collides) {
          if (typeof playSound === 'function') playSound('swordsclash');
          const parryFlashDuration = 50;
          p1.weaponFlashUntil = Math.max(p1.weaponFlashUntil || 0, time + parryFlashDuration);
          p2.weaponFlashUntil = Math.max(p2.weaponFlashUntil || 0, time + parryFlashDuration);

          const isP1Shield = p1.weaponType === 'shield', isP2Shield = p2.weaponType === 'shield';
          if (isP1Shield !== isP2Shield) {
            const attacker = isP1Shield ? p2 : p1;
            const defender = isP1Shield ? p1 : p2;
            if (attacker.health > 0) {
              attacker.health -= attacker.damage; if (attacker.health < 0) attacker.health = 0;
              if (typeof playSound === 'function') playSound('hit');
              defender.damageDealt += attacker.damage; attacker.damageReceived += attacker.damage;
              const def = WEAPON_TYPES[defender.weaponType];
              if (def && typeof def.buff === 'function') def.buff(defender);
              const dxDef = attacker.x - defender.x, dyDef = attacker.y - defender.y, normDef = Math.hypot(dxDef,dyDef);
              if (normDef > 0) {
                const push = 1;
                attacker.vx += (dxDef / normDef) * push; attacker.vy += (dyDef / normDef) * push;
                if (typeof MAX_PLAYER_SPEED !== 'undefined') {
                  const spd = Math.hypot(attacker.vx, attacker.vy);
                  if (spd > MAX_PLAYER_SPEED) { const scl = MAX_PLAYER_SPEED / spd; attacker.vx *= scl; attacker.vy *= scl; }
                }
              }
              const flashDuration = 50;
              attacker.flashColor = '#ff5555'; attacker.flashUntil = time + flashDuration;
              this.pauseUntil = time + flashDuration;
              if (!defender.lastHit) defender.lastHit = {};
              defender.lastHit[attacker.id] = time;
            }
          }

          p1.weaponAngularVelocity *= -1; p2.weaponAngularVelocity *= -1;
          const dx = tip2.x - tip1.x, dy = tip2.y - tip1.y;
          const normal = Math.hypot(dx,dy);
          if (normal > 0) {
            const nx = dx/normal, ny = dy/normal, knock = 0.05;
            p1.vx -= nx*knock; p1.vy -= ny*knock; p2.vx += nx*knock; p2.vy += ny*knock;
          }
        }
      }
    }
  }

  applyDamage(attacker, target, damage, time) {
    target.health -= damage; if (target.health < 0) target.health = 0;
    attacker.damageDealt += damage; target.damageReceived += damage;
    const def = WEAPON_TYPES[attacker.weaponType];
    if (def && typeof def.buff === 'function') def.buff(attacker);
    const flashDuration = 50;
    target.flashColor = '#ff5555'; target.flashUntil = time + flashDuration;
    this.pauseUntil = time + flashDuration;
    if (!attacker.lastHit) attacker.lastHit = {};
    attacker.lastHit[target.id] = time;
    if (attacker.weaponType === 'scythe') this.applyPoisonStack(attacker, target);
    if (typeof playSound === 'function') playSound('hit');
    if (def && typeof def.onHitPlayer === 'function') def.onHitPlayer(attacker, target, damage, time);
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
          const projKey = (window.WEAPON_REGISTRY[p.weaponType] && window.WEAPON_REGISTRY[p.weaponType].projectile) || 'arrow';
          const projDef = window.PROJECTILE_REGISTRY[projKey] || { speed:0.5, radius:4 };
          const speed = projDef.speed || 0.5;
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          const start = p.getWeaponTip();
          const proj = { x: start.x, y: start.y, vx, vy, owner: p, damage: p.damage || 1, projKey };
          proj.radius = projDef.radius || 4;
          this.arrows.push(proj);
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
      arrow.x += arrow.vx * delta; arrow.y += arrow.vy * delta;

      // boundary "bounce" sound and drop
      if (arrow.x < 0 || arrow.x > width || arrow.y < 0 || arrow.y > height) {
        if (typeof playSound === 'function') playSound('ballbounce');
        continue;
      }

      const arrowRadius = arrow.radius || 4;

      // obstacle collisions for arrows: play bounce then remove
      if (Array.isArray(this.obstacles)) {
        let hitOb = false;
        for (const ob of this.obstacles) {
          if (arrow.x >= ob.x && arrow.x <= ob.x+ob.w && arrow.y >= ob.y && arrow.y <= ob.y+ob.h) {
            // arrow hits obstacle — play bounce sound and remove arrow
            if (typeof playSound === 'function') playSound('ballbounce');
            hitOb = true;
            break;
          }
        }
        if (hitOb) continue;
      }

      // check weapon parry collisions (if touches any weapon)
      for (const target of this.players) {
        if (target === arrow.owner) continue;
        if (target.weaponType === 'scythe') {
          const poly = buildScythePolygon(target, target.scytheResolution);
          if (pointInPolygon({x:arrow.x,y:arrow.y}, poly)) continue arrowLoop;
          const centerLineStart = target.getWeaponBase ? target.getWeaponBase() : {x:target.x,y:target.y};
          const centerLineEnd = target.getWeaponTip ? target.getWeaponTip() : { x: target.x + Math.cos(target.weaponAngle)*(target.weaponLength||80), y: target.y + Math.sin(target.weaponAngle)*(target.weaponLength||80) };
          const dsq = distancePointToSegmentSquared({x:arrow.x,y:arrow.y}, centerLineStart, centerLineEnd);
          const threshold = ((target.weaponThickness || 8)/2 + arrowRadius);
          if (dsq <= threshold*threshold) {
            if (target.weaponType === 'shield') {
              const owner = arrow.owner;
              if (owner && owner.health > 0) {
                owner.health -= arrow.damage; if (owner.health < 0) owner.health = 0;
                target.damageDealt += arrow.damage; owner.damageReceived += arrow.damage;
                const def = WEAPON_TYPES[target.weaponType];
                if (def && typeof def.buff === 'function') def.buff(target);
                const dx = owner.x - target.x, dy = owner.y - target.y, nrm = Math.hypot(dx,dy);
                if (nrm>0) { const push=0.1; owner.vx += (dx/nrm)*push; owner.vy += (dy/nrm)*push; }
                owner.flashColor = '#ff5555'; owner.flashUntil = time + 50; this.pauseUntil = time + 50;
                if (!target.lastHit) target.lastHit = {}; target.lastHit[owner.id] = time;
                if (typeof playSound === 'function') playSound('hit');
              }
            }
            continue arrowLoop;
          }
        } else {
          const segStart = target.getWeaponBase();
          const segEnd = target.getWeaponTip();
          const dsq = distancePointToSegmentSquared({ x: arrow.x, y: arrow.y }, segStart, segEnd);
          const threshold = (target.weaponThickness/2 + arrowRadius);
          if (dsq <= threshold*threshold) {
            if (target.weaponType === 'shield') {
              const owner = arrow.owner;
              if (owner && owner.health > 0) {
                owner.health -= arrow.damage; if (owner.health < 0) owner.health = 0;
                target.damageDealt += arrow.damage; owner.damageReceived += arrow.damage;
                const def = WEAPON_TYPES[target.weaponType];
                if (def && typeof def.buff === 'function') def.buff(target);
                const dx = owner.x - target.x, dy = owner.y - target.y, nrm = Math.hypot(dx,dy);
                if (nrm>0) { const push=0.1; owner.vx += (dx/nrm)*push; owner.vy += (dy/nrm)*push; }
                owner.flashColor = '#ff5555'; owner.flashUntil = time + 50; this.pauseUntil = time + 50;
                if (!target.lastHit) target.lastHit = {}; target.lastHit[owner.id] = time;
                if (typeof playSound === 'function') playSound('hit');
              }
            }
            continue arrowLoop;
          }
        }
      }

      // check player body hits
      for (const target of this.players) {
        if (target === arrow.owner) continue;
        if (target.health <= 0) continue;
        const dx = arrow.x - target.x, dy = arrow.y - target.y;
        if (dx*dx + dy*dy <= target.radius*target.radius) {
          target.health -= arrow.damage; if (target.health < 0) target.health = 0;
          arrow.owner.damageDealt += arrow.damage; target.damageReceived += arrow.damage;
          const def = WEAPON_TYPES[arrow.owner.weaponType];
          if (def && typeof def.buff === 'function') def.buff(arrow.owner);
          target.flashColor = '#ff5555'; target.flashUntil = time + 80;
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
        const projKey = (window.WEAPON_REGISTRY[p.weaponType] && window.WEAPON_REGISTRY[p.weaponType].projectile) || 'fireball';
        const projDef = window.PROJECTILE_REGISTRY[projKey] || { speed:0.35, radius:6 };
        const speed = projDef.speed || 0.35;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const start = p.getWeaponTip();
        const fb = { x: start.x, y: start.y, vx, vy, owner: p, damage: p.fireballDamage, radius: p.fireballRadius, projKey };
        this.fireballs.push(fb);
        p.lastFireballTime = time;
        if (typeof playSound === 'function') playSound('arrow');
      }
    }

    const stillActive = [];
    fireLoop:
    for (const fb of this.fireballs) {
      fb.x += fb.vx * delta; fb.y += fb.vy * delta;

      if (fb.x < 0 || fb.x > width || fb.y < 0 || fb.y > height) {
        if (typeof playSound === 'function') playSound('ballbounce');
        this.explodeFireball(fb, time);
        continue;
      }

      if (Array.isArray(this.obstacles)) {
        let hitOb = false;
        for (const ob of this.obstacles) {
          if (fb.x >= ob.x && fb.x <= ob.x+ob.w && fb.y >= ob.y && fb.y <= ob.y+ob.h) {
            // play bounce and explode
            if (typeof playSound === 'function') playSound('ballbounce');
            hitOb = true;
            break;
          }
        }
        if (hitOb) { this.explodeFireball(fb, time); continue fireLoop; }
      }

      for (const target of this.players) {
        if (target === fb.owner) continue;
        if (target.weaponType === 'scythe') {
          const poly = buildScythePolygon(target, target.scytheResolution);
          if (pointInPolygon({x:fb.x,y:fb.y}, poly)) { this.explodeFireball(fb, time); continue fireLoop; }
          const dsq = distancePointToPolylineSquared({x:fb.x,y:fb.y}, [ target.getWeaponBase(), target.getWeaponTip() ]);
          const threshold = (target.weaponThickness || 8)/2 + (fb.radius || 4);
          if (dsq <= threshold*threshold) { this.explodeFireball(fb, time); continue fireLoop; }
        } else {
          const segStart = target.getWeaponBase();
          const segEnd = target.getWeaponTip();
          const dsq = distancePointToSegmentSquared({x:fb.x,y:fb.y}, segStart, segEnd);
          const threshold = (target.weaponThickness || 8)/2 + (fb.radius || 4);
          if (dsq <= threshold*threshold) { this.explodeFireball(fb, time); continue fireLoop; }
        }
      }

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

  applyPoisonStack(owner,target) {
    const dmg = owner.poisonDamage || 0, dur = owner.poisonDuration || 0;
    if (dmg>0 && dur>0) {
      if (!Array.isArray(target.poisonStacks)) target.poisonStacks = [];
      target.poisonStacks.push({ owner, damage: dmg, remainingDamage: dmg, duration: dur, remainingTime: dur });
    }
  }

  updatePoisonEffects(delta,time) {
    for (const target of this.players) {
      if (!Array.isArray(target.poisonStacks) || target.poisonStacks.length===0) continue;
      const remaining=[];
      for (const stack of target.poisonStacks) {
        const rate = stack.damage / stack.duration;
        const dmg = rate * delta;
        const actual = Math.min(dmg, stack.remainingDamage);
        if (actual>0 && target.health>0) {
          target.health -= actual; if (target.health<0) target.health=0;
          stack.owner.damageDealt += actual; target.damageReceived += actual;
          target.flashColor = '#800080';
          target.flashUntil = Math.max(target.flashUntil, time + 50);
        }
        stack.remainingDamage -= actual; stack.remainingTime -= delta;
        if (stack.remainingDamage > 0 && stack.remainingTime > 0) remaining.push(stack);
      }
      target.poisonStacks = remaining;
    }
  }

  drawArrows() {
    const ptex = window.PROJECTILE_TEXTURES || {};
    for (const arrow of this.arrows) {
      ctx.save();
      ctx.translate(arrow.x, arrow.y);
      const angle = Math.atan2(arrow.vy, arrow.vx);
      ctx.rotate(angle);
      const tex = ptex[arrow.projKey];
      if (tex && tex.complete && tex.naturalWidth) {
        const drawW = (arrow.radius||4)*4;
        const drawH = (arrow.radius||4)*2;
        ctx.drawImage(tex, -drawW/2, -drawH/2, drawW, drawH);
      } else {
        ctx.fillStyle = arrow.owner ? arrow.owner.color : '#000';
        const length = 20;
        const thickness = (arrow.radius||4)*2;
        ctx.fillRect(-length/2, -thickness/2, length, thickness);
      }
      ctx.restore();
    }
  }

  drawFireballs() {
    const ptex = window.PROJECTILE_TEXTURES || {};
    for (const fb of this.fireballs) {
      const tex = ptex[fb.projKey];
      if (tex && tex.complete && tex.naturalWidth) {
        const s = fb.radius*2;
        ctx.drawImage(tex, fb.x - s/2, fb.y - s/2, s, s);
      } else {
        ctx.beginPath(); ctx.fillStyle='#ff8800'; ctx.arc(fb.x, fb.y, fb.radius||4, 0, Math.PI*2); ctx.fill(); ctx.closePath();
      }
    }
  }

  updateScoreboard() {
    let html = '';
    for (const p of this.players) {
      const def = WEAPON_TYPES[p.weaponType] || { name: p.weaponType };
      let line = `${def.name} | Health: ${Math.max(0, Math.round(p.health))}`;
      if (p.weaponType !== 'dummy') line += ` | Damage: ${p.damage.toFixed(1)}`;
      if (p.weaponType !== 'dummy' && p.weaponType !== 'unarmed') line += ` | Range: ${p.weaponLength?Math.round(p.weaponLength):0}`;
      if (p.weaponType === 'dummy' && p.weaponType !== 'unarmed') {
        const mspd = def.moveSpeed !== undefined ? def.moveSpeed : 0;
        line += ` | Move: ${mspd.toFixed(2)}`;
      } else {
        line += ` | Speed: ${(p.weaponAngularVelocity*1000 || 0).toFixed(2)}`;
      }
      if (p.weaponType === 'unarmed') {
        const accel = p.accelSpeed !== undefined ? p.accelSpeed : 0;
        const bonusDmg = (accel*2).toFixed(1);
        line += ` | Accel: ${accel.toFixed(2)} | A.Dmg: ${bonusDmg}`;
      }
      if (p.weaponType === 'bow') line += ` | Arrows: ${p.arrowCount || 1}`;
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
    ['Player','Weapon','Health','Damage Dealt','Damage Taken'].forEach(col=>{ const th=document.createElement('th'); th.textContent=col; th.style.padding='4px 8px'; th.style.borderBottom='2px solid #000'; headerRow.appendChild(th); });
    thead.appendChild(headerRow); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    const sorted = players.slice().sort((a,b)=>b.damageDealt - a.damageDealt);
    sorted.forEach(p=>{
      const tr=document.createElement('tr');
      const tdName=document.createElement('td'); tdName.style.color=p.color; tdName.style.padding='4px 8px'; tdName.textContent=`Player ${p.id+1}`; tr.appendChild(tdName);
      const tdWeapon=document.createElement('td'); tdWeapon.style.padding='4px 8px'; tdWeapon.textContent=p.weaponType; tr.appendChild(tdWeapon);
      const tdHealth=document.createElement('td'); tdHealth.style.padding='4px 8px'; tdHealth.textContent=Math.max(0, Math.round(p.health)); tr.appendChild(tdHealth);
      const tdDealt=document.createElement('td'); tdDealt.style.padding='4px 8px'; tdDealt.textContent=Math.round(p.damageDealt);
      if (p.damageDealt === maxDealt && maxDealt>0) { tdDealt.style.fontWeight='bold'; tdDealt.style.backgroundColor='#d0ffd0'; }
      tr.appendChild(tdDealt);
      const tdTaken=document.createElement('td'); tdTaken.style.padding='4px 8px'; tdTaken.textContent=Math.round(p.damageReceived);
      if (p.damageReceived === maxTaken && maxTaken>0) { tdTaken.style.fontWeight='bold'; tdTaken.style.backgroundColor='#ffd0d0'; }
      tr.appendChild(tdTaken);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); panel.appendChild(table);
    const note=document.createElement('p'); note.style.marginTop='10px'; note.style.fontSize='0.9em';
    note.innerHTML = '<span style="background:#d0ffd0;padding:2px 4px;">Most Dealt</span> <span style="background:#ffd0d0;padding:2px 4px;">Most Taken</span>';
    panel.appendChild(note);
    const btn = restartButton; btn.hidden = false;
    if (btn.parentElement !== panel) panel.appendChild(btn);
    btn.onclick = () => { overlay.style.display = 'none'; if (window.currentSpawnConfigs) window.game = new Game({ spawnConfigs: window.currentSpawnConfigs }); else window.game = new Game(); btn.hidden = true; };
    overlay.innerHTML = ''; overlay.appendChild(panel); overlay.style.display = 'flex';
  }
}

/* -------------------- Collision resolve -------------------- */
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
  const damping = 0.2; const impulse = dot * damping;
  p1.vx -= impulse * nx; p1.vy -= impulse * ny;
  p2.vx += impulse * nx; p2.vy += impulse * ny;
  if (typeof MAX_PLAYER_SPEED !== 'undefined') {
    const s1 = Math.hypot(p1.vx,p1.vy); if (s1 > MAX_PLAYER_SPEED) { const scale1 = MAX_PLAYER_SPEED / s1; p1.vx *= scale1; p1.vy *= scale1; }
    const s2 = Math.hypot(p2.vx,p2.vy); if (s2 > MAX_PLAYER_SPEED) { const scale2 = MAX_PLAYER_SPEED / s2; p2.vx *= scale2; p2.vy *= scale2; }
  }
}

/* -------------------- Override Player.draw to use textures and draw health + outline -------------------- */
function installPlayerDrawOverride() {
  if (typeof Player === 'undefined') {
    console.warn('Player class not found - texture & health draw override skipped.');
    return;
  }
  Player.prototype.draw = function(ctx) {
    const now = performance.now();
    ctx.save();

    const fillColor = (this.flashUntil && now < this.flashUntil && this.flashColor) ? this.flashColor : this.color;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    try {
      const outlineWidth = Math.max(2, Math.min(6, Math.floor(this.radius * 0.12)));
      ctx.lineWidth = outlineWidth;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.stroke();
    } catch (e) { /* ignore */ }
    ctx.closePath();

    try {
      const base = (typeof this.getWeaponBase === 'function') ? this.getWeaponBase() : { x: this.x, y: this.y };
      const tip = (typeof this.getWeaponTip === 'function') ? this.getWeaponTip() : { x: this.x + (this.weaponLength || 30), y: this.y };
      const angle = Math.atan2(tip.y - base.y, tip.x - base.x);
      const length = Math.hypot(tip.x - base.x, tip.y - base.y) || (this.weaponLength || 30);
      const thickness = this.weaponThickness || (WEAPON_TYPES && WEAPON_TYPES[this.weaponType] && WEAPON_TYPES[this.weaponType].thickness) || 6;
      const wdef = window.WEAPON_REGISTRY && window.WEAPON_REGISTRY[this.weaponType];
      const img = window.WEAPON_TEXTURES && window.WEAPON_TEXTURES[this.weaponType];

      if (this.weaponType === 'scythe') {
        if (img && img.complete && img.naturalWidth) {
          ctx.translate(base.x, base.y);
          ctx.rotate(angle + (wdef && wdef.angleOffset || 0));
          ctx.drawImage(img, 0, -thickness/2, length, thickness);
          ctx.setTransform(1,0,0,1,0,0);
        } else {
          ctx.strokeStyle = this.color;
          ctx.lineWidth = thickness;
          ctx.beginPath();
          ctx.moveTo(base.x, base.y);
          ctx.lineTo(tip.x, tip.y);
          ctx.stroke();
          ctx.closePath();
          const shaftLen = length * (this.scytheShaftRatio || (wdef && wdef.scythe && wdef.scythe.shaftRatio) || 0.55);
          const shaftEnd = { x: base.x + Math.cos(angle) * shaftLen, y: base.y + Math.sin(angle) * shaftLen };
          const bladeRadius = length * (this.scytheBladeRadiusRatio || (wdef && wdef.scythe && wdef.scythe.bladeRadiusRatio) || 0.45);
          ctx.beginPath();
          const startA = angle - Math.PI/2, endA = angle + Math.PI/2;
          ctx.moveTo(shaftEnd.x + Math.cos(startA)*bladeRadius, shaftEnd.y + Math.sin(*
