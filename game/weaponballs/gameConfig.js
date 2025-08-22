// gameConfig.js
// 全局配置：显式挂到 window，避免模块/作用域导致在 index.html 中引用时未定义的问题

// 物理 & 游戏全局参数（可在菜单里被覆盖）
window.GRAVITY = 0.0001;
window.MAP_TYPE = 'rectangle';      // 'rectangle' | 'plus' | 'box' | 'battlefield'
window.WALKWAY_WIDTH = 200;         // 用于 plus 地图
window.MAX_PLAYER_SPEED = 1.2;      // 最大移动速度（px/ms）
window.MAX_RANGE = 300;             // 默认最大武器长度上限（像素）
window.DEFAULT_CANVAS_WIDTH = 400;
window.DEFAULT_CANVAS_HEIGHT = 400;

// 预定义颜色（菜单会读取 DEFAULT_COLORS）
window.DEFAULT_COLORS = {
  sword: '#d46b15',
  spear: '#1944d1',
  dagger: '#37D86B',
  bow: '#F5A623',
  shield: '#9e9e9e',
  staff: '#8e44ad',
  scythe: '#e74c3c',
  unarmed: '#607d8b',
  dummy: '#bdbdbd'
};

// WEAPON_TYPES：每个武器的默认属性和 buff 行为。
// 注意：不要在这里使用 export 或 module 语法 —— 直接在全局可见即可。
window.WEAPON_TYPES = {
  sword: {
    name: 'Sword',
    baseRange: 70,
    baseDamage: 12,
    baseSpeed: 0.003, // blade rotation speed base (rad/ms)
    moveSpeed: 0.12,
    thickness: 8,
    maxRange: 120,
    // buff：每次命中增加短暂伤害/范围
    buff: function(player) {
      if (!player) return;
      player.damage = (player.damage || this.baseDamage) + (this.buffDamage || 1.5);
      player.weaponLength = Math.min((player.weaponLength || this.baseRange) + (this.buffRange || 6), this.maxRange || window.MAX_RANGE);
      // 持久化短期 buff timeout（game 逻辑里用 time 比较）
    },
    // 默认 buff 参数（可被武器配置界面覆盖）
    buffDamage: 1.5,
    buffRange: 6
  },
  spear: {
    name: 'Spear',
    baseRange: 110,
    baseDamage: 10,
    baseSpeed: 0.002,
    moveSpeed: 0.11,
    thickness: 6,
    maxRange: 180,
    buff: function(player) {
      if (!player) return;
      player.damage = (player.damage || this.baseDamage) + (this.buffDamage || 1);
      player.weaponLength = Math.min((player.weaponLength || this.baseRange) + (this.buffRange || 8), this.maxRange || window.MAX_RANGE);
    },
    buffDamage: 1,
    buffRange: 8
  },
  dagger: {
    name: 'Dagger',
    baseRange: 45,
    baseDamage: 8,
    baseSpeed: 0.005,
    moveSpeed: 0.14,
    thickness: 4,
    maxRange: 80,
    buff: function(player) {
      if (!player) return;
      // dagger 更偏向增加速度/临时伤害
      player.damage = (player.damage || this.baseDamage) + (this.buffDamage || 2);
      player.weaponAngularVelocity = (player.weaponAngularVelocity || this.baseSpeed) + (this.buffSpin || 0.0005);
    },
    buffDamage: 2,
    buffSpin: 0.0005
  },
  bow: {
    name: 'Bow',
    baseRange: 140,
    baseDamage: 3,
    baseSpeed: 0.002,
    moveSpeed: 0.10,
    thickness: 6,
    maxRange: 220,
    // 弓的 buff 增加 volley 箭数或减冷却
    buff: function(player) {
      if (!player) return;
      player.arrowCount = Math.min((player.arrowCount || 1) + (this.buffArrows || 0), 6);
      player.arrowCooldown = Math.max((player.arrowCooldown || 1000) - (this.buffDuration || 0), 120);
    },
    buffArrows: 1,
    buffDuration: 80
  },
  shield: {
    name: 'Shield',
    baseRange: 90,
    baseDamage: 0,
    baseSpeed: 0.001,
    moveSpeed: 0.09,
    thickness: 18,
    maxRange: 200,
    buff: function(player) {
      if (!player) return;
      // 每次成功挡格，增加盾宽（临时）
      player.weaponThickness = Math.min((player.weaponThickness || this.thickness) + (this.buffThickness || 4), this.maxThickness || 80);
    },
    buffThickness: 4,
    maxThickness: 80
  },
  staff: {
    name: 'Staff',
    baseRange: 100,
    baseDamage: 6,
    baseSpeed: 0.0025,
    moveSpeed: 0.095,
    thickness: 6,
    // fireball specifics
    fireballDamage: 2,
    fireballRadius: 36,
    fireballCooldown: 1200,
    buff: function(player) {
      if (!player) return;
      player.fireballDamage = (player.fireballDamage || this.fireballDamage) + (this.buffDamage || 0.5);
      player.fireballRadius = Math.min((player.fireballRadius || this.fireballRadius) + (this.buffRadius || 4), 160);
    },
    buffDamage: 0.5,
    buffRadius: 4
  },
  scythe: {
    name: 'Scythe',
    baseRange: 120,
    baseDamage: 9,
    baseSpeed: 0.002,
    moveSpeed: 0.1,
    thickness: 6,
    poisonDamage: 4,
    poisonDuration: 3000, // ms
    buff: function(player) {
      if (!player) return;
      player.poisonDamage = (player.poisonDamage || this.poisonDamage) + (this.buffDamage || 0.5);
      player.poisonDuration = Math.max((player.poisonDuration || this.poisonDuration) + (this.buffDuration || 200), 500);
    },
    buffDamage: 0.5,
    buffDuration: 200
  },
  unarmed: {
    name: 'Unarmed',
    baseRange: 0,
    baseDamage: 6,
    baseSpeed: 0,
    moveSpeed: 0.13,
    thickness: 0,
    buff: function(player) {
      if (!player) return;
      // unarmed 用于加速伤害（player.accelSpeed 在 player.js 中控制）
      player.damage = (player.damage || this.baseDamage) + (this.buffDamage || 1.2);
    },
    buffDamage: 1.2
  },
  dummy: {
    name: 'Dummy',
    baseRange: 0,
    baseDamage: 0,
    baseSpeed: 0,
    moveSpeed: 0.05,
    thickness: 0,
    buff: function() { /* do nothing */ }
  }
};

// 其他可全局覆盖的常量（用于安全默认）
window.DEFAULT_SPAWN = [
  { x: 0, y: 0.5, weaponType: 'bow', color: '#F5A623', health: 250 },
  { x: 0.25, y: 0.5, weaponType: 'spear', color: '#1944d1', health: 250 },
  { x: 0.5, y: 0.5, weaponType: 'dagger', color: '#37D86B', health: 250 },
  { x: 0.75, y: 0.5, weaponType: 'sword', color: '#d46b15', health: 250 }
];

// 兼容检查（开发时可打开）
// console.log('gameConfig loaded', window.WEAPON_TYPES && Object.keys(window.WEAPON_TYPES));
