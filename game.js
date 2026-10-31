const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const messageEl = document.getElementById("message");
const craftEl = document.getElementById("craft");
const muteBtn = document.getElementById("mute");

// 音は最初の操作のあとでないと鳴らせない
for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, Sound.unlock);
muteBtn.addEventListener("click", () => {
  muteBtn.textContent = Sound.toggleMute() ? "🔇" : "🔊";
});

// 画面の縮尺。1より小さいほど、キャラや地形が小さく(視野が広く)見える。
// 内部の画面を 1/VIEW_SCALE 倍の大きさで作り、CSS で表示サイズに縮める
const VIEW_SCALE = 0.75;
const MIN_WORLD_H = 620; // 木や小屋、川が縦に収まるのに必要な高さ
const MIN_WORLD_W = 3200; // マップの最低の横幅
let viewScale = VIEW_SCALE;
// ゲームを映す高さ。縦向きのタッチ端末では、下の操作用の余白ぶん canvas の高さより小さい
let worldH = 0;
const touchDevice = window.matchMedia("(pointer: coarse)").matches;
const PAD_RATIO = 0.2;

// 川は画面中央の横帯。下の岸に主人公、上の岸に相手を置く
const RIVER = { y: 0, height: 0 };

// rx, ry は画面に対する中心位置の割合。画面サイズが変わっても配置を保つ
// rx は横長マップ全体、ry は画面の高さに対する中心位置の割合
const player = { rx: 0.06, ry: 0.85, size: 12 * PIXEL_SCALE, speed: 8, sprite: SPRITES.boy };
// 相手の縦位置は向こう岸に収まるよう layout() で決める
const partner = { rx: 0.85, ry: 0, size: 12 * PIXEL_SCALE, sprite: SPRITES.girl };

// 手前の岸に散らして置くアイテム
const items = [
  { type: "rope", label: "紐", rx: 0.2, ry: 0.7, size: 8 * PIXEL_SCALE, sprite: SPRITES.rope, taken: false },
  { type: "stone", label: "石ころ", rx: 0.1, ry: 0.62, size: 8 * PIXEL_SCALE, sprite: SPRITES.stone, taken: false },
  { type: "stone", label: "石ころ", rx: 0.52, ry: 0.93, size: 8 * PIXEL_SCALE, sprite: SPRITES.stone, taken: false },
  { type: "stone", label: "石ころ", rx: 0.78, ry: 0.7, size: 8 * PIXEL_SCALE, sprite: SPRITES.stone, taken: false },
  { type: "stone", label: "石ころ", rx: 0.34, ry: 0.6, size: 8 * PIXEL_SCALE, sprite: SPRITES.stone, taken: false },
];

// 手前の岸の立ち木。近づくと揺れて枝を1本、斧を持っていれば切って枝3本・丸太1つ・ツタ1本を落とす。
// 切った木は消える。枝・丸太・ツタは別々に数える
// ry は根元の位置。枝が川に落ちないよう川から離して置く
const TREE_REACH = 110;
const SHAKE_MS = 600;
const CHOP_MS = 900;
const trees = [0.3, 0.62, 0.92].map((rx, i) => ({
  rx, ry: [0.85, 0.82, 0.8][i], w: 12 * TREE_SCALE, h: 16 * TREE_SCALE,
  sprite: SPRITES.tree, shakeStart: 0, dropped: false, chopStart: 0, chopped: false,
}));

// 手前の岸の小屋。近づくとドアが開き、中の斧を取れる。
// ドアは幅4・高さ5ドットで、小屋の左上から (6, 8) ドットの位置
const OPEN_MS = 300;
const CABIN_REACH = 130; // この距離までドアに近づくと開く
const AXE_PAD = 30; // 斧は小屋の壁越しに、この距離まで近づけば取れる
const cabin = {
  rx: 0.46, ry: 0.75, w: 16 * CABIN_SCALE, h: 14 * CABIN_SCALE,
  openStart: 0, open: false, axeTaken: false,
};
const AXE_SIZE = 8 * AXE_SCALE;

// 作業台は最初からマップにあるが、小屋のドアが開くまで見えない。小屋の右隣に置く
const WORKBENCH_POP_MS = 400;
const workbench = {
  w: 12 * WORKBENCH_SCALE, h: 8 * WORKBENCH_SCALE, gap: 24,
  x: 0, y: 0, appearStart: 0, visible: false,
};

function placeWorkbench() {
  workbench.x = cabin.x + cabin.w + workbench.gap;
  workbench.y = cabin.y + cabin.h - workbench.h;
}

function doorRect() {
  return { x: cabin.x + 6 * CABIN_SCALE, y: cabin.y + 8 * CABIN_SCALE, w: 4 * CABIN_SCALE, h: 5 * CABIN_SCALE };
}

// 当たり判定のない飾り(両岸の花)。[横の割合, 縦の割合]
const flowers = [
  [0.05, 0.1], [0.15, 0.6], [0.25, 0.12], [0.3, 0.9], [0.42, 0.7],
  [0.5, 0.1], [0.6, 0.95], [0.68, 0.55], [0.78, 0.1], [0.9, 0.75], [0.95, 0.15],
];
const inventory = [];

// 橋の作り方: 作業台で投げロープ2本と板材6枚を作る。川岸で投げロープを使うと
// 向こう岸へ2本張って石で固定し、その間の岸で板材6枚と木の枝12本を持っていれば、
// 板材1枚ごとに枝2本を使って1枚ずつ橋が架かる
const ITEM_NAMES = {
  vine: "ツタ", rope: "紐", log: "丸太", plank: "板材", stone: "石",
  throwrope: "投げロープ", // 仮の名前
};
const RECIPES = [
  { cost: { vine: 3 }, gain: { rope: 1 } },
  { cost: { log: 1 }, gain: { plank: 2 } },
  { cost: { stone: 1, rope: 1 }, gain: { throwrope: 1 } },
];
const WORKBENCH_REACH = 150; // 作業台にこの距離まで近づくと、作るボタンが出る
const ROPES_TO_THROW = 2;
const STONES_TO_FIX = 2; // 自分側を固定するのに使う石
const PLANKS_FOR_BRIDGE = 6;
const BRANCHES_PER_PLANK = 2;
const THROW_MS = 900; // ロープが川を越える時間
const ROPE_STAGGER_MS = 300; // 2本目を投げるまでの間
const PLANK_STEP_MS = 450; // 板材を1枚置く間隔

// 持ち物の表示欄。持っているものだけ、絵と現在の個数を出す
const inventoryEl = document.getElementById("inventory");
const SLOTS = [
  { type: "rope", sprite: SPRITES.rope },
  { type: "throwrope", sprite: SPRITES.throwrope },
  { type: "branch", sprite: SPRITES.branch },
  { type: "log", sprite: SPRITES.wood },
  { type: "plank", sprite: SPRITES.board },
  { type: "vine", sprite: SPRITES.vine },
  { type: "stone", sprite: SPRITES.stone },
  { type: "axe", sprite: SPRITES.axe },
];
const PARTNER_FOLLOW = 0.08; // 1フレームで主人公との横のずれを縮める割合
const BRIDGE_WIDTH = 110;
const BUILD_REACH = 40;
let bridge = null;
let ropes = null; // 向こう岸へ張った2本のロープ。x は左のロープの位置

const keys = {};
const stick = { x: 0, y: 0 }; // -1〜1 のスティック入力
const STICK_RADIUS = 60;
let cleared = false;
let clearStart = 0;
let clearShown = false;
const CLEAR_DIALOG_MS = 1800;

// マップは画面より横に広い。画面(canvas)はその一部をカメラで映す
let worldW = 0;
let cameraX = 0;

function place(o) {
  o.x = o.rx * worldW - o.size / 2;
  o.y = o.ry * worldH - o.size / 2;
}

function layout() {
  const prevWorldW = worldW;
  const prevH = worldH;
  // タッチ端末を縦向きで持っているときは、画面下に操作用の余白(PAD)を取る
  const padCss = touchDevice && window.innerHeight > window.innerWidth ? Math.round(window.innerHeight * PAD_RATIO) : 0;
  // ゲーム部分は必ず MIN_WORLD_H 以上の高さを映す(低い画面ではさらに縮める)
  viewScale = Math.min(VIEW_SCALE, (window.innerHeight - padCss) / MIN_WORLD_H);
  canvas.width = Math.round(window.innerWidth / viewScale);
  canvas.height = Math.round(window.innerHeight / viewScale);
  worldH = Math.round((window.innerHeight - padCss) / viewScale);
  // スマホのアドレスバーで 100vh が実際の表示域より大きくなるため、表示域の大きさをそのまま使う
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  // 画面の幅で木などの距離が極端に変わらないよう、最低でも MIN_WORLD_W は確保し、
  // 広い画面でも画面幅の1.3倍までにとどめる
  worldW = Math.max(MIN_WORLD_W, canvas.width * 1.3);

  // 向こう岸は相手が立つだけの細さ、川も細め
  RIVER.y = Math.max(worldH * 0.2, 130);
  RIVER.height = Math.max(worldH * 0.3, 175);
  // 作業台のボタンは、スティックを動かす下の方を避けて、川の真ん中あたりに出す
  craftEl.style.top = `${(RIVER.y + RIVER.height / 2) * viewScale}px`;

  // 初回は割合から配置、リサイズ後は現在位置を拡縮して引き継ぐ
  const first = prevWorldW === 0;
  for (const o of [player, partner, ...items]) {
    if (first) {
      place(o);
    } else {
      o.x = (o.x * worldW) / prevWorldW;
      o.y = (o.y * worldH) / prevH;
    }
  }
  for (const t of [...trees, cabin]) {
    if (first) {
      t.x = t.rx * worldW - t.w / 2;
      t.y = t.ry * worldH - t.h;
    } else {
      t.x = (t.x * worldW) / prevWorldW;
      t.y = (t.y * worldH) / prevH;
    }
  }
  placeWorkbench();
  partner.y = RIVER.y - 6 - partner.size - 16;
  if (bridge) bridge.x = (bridge.x * worldW) / prevWorldW;
  if (ropes) ropes.x = (ropes.x * worldW) / prevWorldW;
}

window.addEventListener("resize", layout);

window.addEventListener("keydown", (e) => {
  if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    keys[e.key] = true;
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

// 動的スティック: 最初に触れた位置が中心、そこからのドラッグ量が入力になる
const touch = { id: null, originX: 0, originY: 0, dx: 0, dy: 0 };

function moveStick(e) {
  let dx = e.clientX - touch.originX;
  let dy = e.clientY - touch.originY;
  const dist = Math.hypot(dx, dy);
  if (dist > STICK_RADIUS) {
    dx = (dx / dist) * STICK_RADIUS;
    dy = (dy / dist) * STICK_RADIUS;
  }
  touch.dx = dx;
  touch.dy = dy;
  stick.x = dx / STICK_RADIUS;
  stick.y = dy / STICK_RADIUS;
}

function releaseStick() {
  touch.id = null;
  stick.x = 0;
  stick.y = 0;
}

canvas.addEventListener("pointerdown", (e) => {
  if (touch.id !== null) return;
  touch.id = e.pointerId;
  touch.originX = e.clientX;
  touch.originY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  moveStick(e);
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId === touch.id) moveStick(e);
});
canvas.addEventListener("pointerup", (e) => {
  if (e.pointerId === touch.id) releaseStick();
});
canvas.addEventListener("pointercancel", (e) => {
  if (e.pointerId === touch.id) releaseStick();
});

function overlaps(a, b) {
  return a.x < b.x + b.size && a.x + a.size > b.x &&
         a.y < b.y + b.size && a.y + a.size > b.y;
}

function count(type) {
  return inventory.filter((t) => t === type).length;
}

function removeItems(type, n) {
  for (let i = 0; i < n; i++) inventory.splice(inventory.indexOf(type), 1);
}

function showStatus(text) {
  messageEl.textContent = text;
}

function renderInventory() {
  inventoryEl.replaceChildren(
    ...SLOTS.filter((s) => count(s.type) > 0).map((s) => {
      const slot = document.createElement("div");
      slot.className = "slot";
      const img = document.createElement("img");
      img.src = s.sprite.toDataURL();
      const num = document.createElement("span");
      num.textContent = count(s.type);
      slot.append(img, num);
      return slot;
    }),
  );
  renderCraft();
}

// 作業台のボタン。材料が足りないものは押せない
function recipeText(items) {
  return Object.entries(items).map(([type, n]) => `${ITEM_NAMES[type]}×${n}`).join(" + ");
}

function canCraft(recipe) {
  return Object.entries(recipe.cost).every(([type, n]) => count(type) >= n);
}

function craft(recipe) {
  if (!canCraft(recipe)) return;
  for (const [type, n] of Object.entries(recipe.cost)) removeItems(type, n);
  for (const [type, n] of Object.entries(recipe.gain)) inventory.push(...Array(n).fill(type));
  renderInventory();
  Sound.craft();
  showStatus(`${recipeText(recipe.gain)}を作った!`);
}

const craftButtons = RECIPES.map((recipe) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = `${recipeText(recipe.cost)} → ${recipeText(recipe.gain)}`;
  b.addEventListener("click", () => craft(recipe));
  return b;
});
craftEl.append(...craftButtons);

function renderCraft() {
  RECIPES.forEach((recipe, i) => {
    craftButtons[i].disabled = !canCraft(recipe);
  });
}

function canThrowRopes() {
  return !ropes && count("throwrope") >= ROPES_TO_THROW && count("stone") >= STONES_TO_FIX;
}

// 投げロープを向こう岸へ投げ、自分側を石で固定する。ロープは今いる位置に張る
function throwRopes() {
  removeItems("throwrope", ROPES_TO_THROW);
  removeItems("stone", STONES_TO_FIX);
  const now = performance.now();
  const x = player.x + player.size / 2 - BRIDGE_WIDTH / 2;
  ropes = {
    x: Math.max(0, Math.min(worldW - BRIDGE_WIDTH, x)), inside: false,
    throwStart: now, readyAt: now + THROW_MS + ROPE_STAGGER_MS,
  };
  renderInventory();
  closeDialog();
  messageEl.textContent = "投げロープを向こう岸へ投げた!";
  // 1本ずつ投げて、2本とも向こう岸に着いた音を鳴らす
  Sound.whoosh(0);
  Sound.whoosh(ROPE_STAGGER_MS / 1000);
  Sound.thud(THROW_MS / 1000);
  Sound.thud((THROW_MS + ROPE_STAGGER_MS) / 1000);
}

function plankRect(i) {
  const seg = (RIVER.height + 12) / PLANKS_FOR_BRIDGE;
  // 手前の岸(下)から向こう岸(上)へ順に置く
  return { x: bridge.x, y: RIVER.y - 6 + (PLANKS_FOR_BRIDGE - 1 - i) * seg, w: bridge.width, h: seg };
}

// ロープを張り終えたあと、2本の間の岸に材料を持って立つと、板材を1枚ずつ置いて橋を架ける
function updateBridge() {
  const now = performance.now();
  if (!ropes || now < ropes.readyAt) return;

  if (!bridge) {
    const atBank = player.y <= RIVER.y + RIVER.height + BUILD_REACH && player.y + player.size >= RIVER.y;
    const between = atBank && player.x >= ropes.x && player.x + player.size <= ropes.x + BRIDGE_WIDTH;
    const ready = count("plank") >= PLANKS_FOR_BRIDGE && count("branch") >= PLANKS_FOR_BRIDGE * BRANCHES_PER_PLANK;
    if (between && ready) {
      bridge = { x: ropes.x, width: BRIDGE_WIDTH, laid: 0, nextAt: now, done: false };
      messageEl.textContent = "橋を架けている…";
    } else if (between && !ropes.inside) {
      messageEl.textContent = `橋には板材${PLANKS_FOR_BRIDGE}枚と木の枝${PLANKS_FOR_BRIDGE * BRANCHES_PER_PLANK}本がいる (今は板材${count("plank")}枚、枝${count("branch")}本)`;
    }
    ropes.inside = between;
    return;
  }

  if (!bridge.done && now >= bridge.nextAt) {
    removeItems("plank", 1);
    removeItems("branch", BRANCHES_PER_PLANK);
    renderInventory();
    const r = plankRect(bridge.laid);
    spawnDust(r.x + r.w / 2, r.y + r.h / 2);
    Sound.plank();
    bridge.laid++;
    bridge.nextAt = now + PLANK_STEP_MS;
    if (bridge.laid >= PLANKS_FOR_BRIDGE) {
      bridge.done = true;
      Sound.success();
      messageEl.textContent = "橋が架かった! 向こう岸へ渡ろう";
    }
  }
}

// 川の上は、橋の帯の中にいる間だけ歩ける
function canStand(x, y, size) {
  const inRiver = y + size > RIVER.y && y < RIVER.y + RIVER.height;
  if (!inRiver) return true;
  return bridge !== null && bridge.done && x >= bridge.x && x + size <= bridge.x + bridge.width;
}

// 木の当たり判定は幹(下の3段)、小屋は壁(屋根の下から下端まで)だけ。
// 屋根の部分は奥に回り込める
function hitsObstacle(x, y) {
  const hits = (rx, ry, rw, rh) =>
    x < rx + rw && x + player.size > rx && y < ry + rh && y + player.size > ry;
  return trees.some((t) => !t.gone && hits(t.x + 4 * TREE_SCALE, t.y + 13 * TREE_SCALE, 4 * TREE_SCALE, 3 * TREE_SCALE)) ||
    hits(cabin.x, cabin.y + 6 * CABIN_SCALE, cabin.w, cabin.h - 6 * CABIN_SCALE) ||
    (workbench.visible && hits(workbench.x, workbench.y + 2 * WORKBENCH_SCALE, workbench.w, workbench.h - 2 * WORKBENCH_SCALE));
}

const DROP_KINDS = {
  branch: { label: "木の枝", sprite: SPRITES.branch },
  log: { label: "丸太", sprite: SPRITES.wood },
  vine: { label: "ツタ", sprite: SPRITES.vine },
};

// drops は [横, 縦, 種類] で、根元からのずれ
function dropWood(tree, drops) {
  const baseX = tree.x + tree.w / 2;
  const baseY = tree.y + tree.h;
  const size = 8 * PIXEL_SCALE;
  for (const [dx, dy, kind] of drops) {
    items.push({
      type: kind, label: DROP_KINDS[kind].label, sprite: DROP_KINDS[kind].sprite,
      x: baseX + dx - size / 2, y: baseY + dy - size / 2,
      size, taken: false, lift: 110, fallV: 0,
    });
  }
}

// 揺すると枝が1本、斧で切るとさらに枝3本・丸太1つ・ツタ1本が落ちる(1本の木で枝は計4本)
function dropBranches(tree) {
  tree.dropped = true;
  dropWood(tree, [[0, 45, "branch"]]);
  messageEl.textContent = "木を揺すったら枝が落ちてきた!";
}

function chopTree(tree) {
  tree.chopped = true;
  tree.gone = true;
  Sound.treeFall();
  dropWood(tree, [
    [-90, 5, "branch"], [-45, 45, "branch"], [45, 45, "branch"], [90, 5, "vine"], [0, 80, "log"],
  ]);
  spawnChips(tree);
  messageEl.textContent = "斧で切ったら枝と丸太とツタが落ちてきた!";
}

function spawnHearts(x, y) {
  for (let i = 0; i < 18; i++) {
    particles.push({
      kind: "heart", life: 1, size: 20 + Math.random() * 24,
      x: x + (Math.random() - 0.5) * 120, y: y + (Math.random() - 0.5) * 40,
      vx: 0, vy: -1 - Math.random() * 1.5,
    });
  }
}

function spawnDust(x, y) {
  for (let i = 0; i < 14; i++) {
    particles.push({
      kind: "splash", color: "#f2f2f2", life: 1, x, y,
      vx: (Math.random() - 0.5) * 9, vy: -1 - Math.random() * 3, size: 5 + Math.random() * 5,
    });
  }
}

function spawnChips(tree) {
  for (let i = 0; i < 10; i++) {
    particles.push({
      kind: "splash", color: "#c68a4e", life: 1,
      x: tree.x + tree.w / 2, y: tree.y + tree.h - 20,
      vx: (Math.random() - 0.5) * 8, vy: -2 - Math.random() * 4, size: 4 + Math.random() * 4,
    });
  }
}

function readInput() {
  let dx = stick.x;
  let dy = stick.y;
  if (keys.ArrowLeft) dx -= 1;
  if (keys.ArrowRight) dx += 1;
  if (keys.ArrowUp) dy -= 1;
  if (keys.ArrowDown) dy += 1;
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    dx /= len;
    dy /= len;
  }
  return { dx, dy };
}

// ダイアログ表示中はゲームを止める
const dialogEl = document.getElementById("dialog");
const dialogTextEl = document.getElementById("dialog-text");
const dialogButtonsEl = document.getElementById("dialog-buttons");
const dialogExtraEl = document.getElementById("dialog-extra");
let paused = false;
let declinedUntil = 0; // 「やめておく」の直後にすぐ再表示しないための時刻
let lastStepAt = 0; // 足音を鳴らした時刻

function showDialog(text, buttons, { extra = false } = {}) {
  paused = true;
  releaseStick();
  dialogTextEl.textContent = text;
  dialogExtraEl.hidden = !extra;
  dialogButtonsEl.replaceChildren(
    ...buttons.map(({ label, className, icon, onClick }) => {
      const b = document.createElement("button");
      b.type = "button";
      if (icon) {
        const img = document.createElement("img");
        img.src = icon.toDataURL();
        b.append(img);
      }
      b.append(label);
      if (className) b.className = className;
      b.addEventListener("click", () => {
        Sound.click();
        onClick();
      });
      return b;
    }),
  );
  dialogEl.hidden = false;
}

function closeDialog() {
  dialogEl.hidden = true;
  paused = false;
}

function askSwim() {
  const buttons = [{ label: "渡る", className: "danger", onClick: startDrowning }];
  if (canThrowRopes()) buttons.push({ label: "投げロープを使う", onClick: throwRopes });
  buttons.push({
    label: "やめておく",
    onClick: () => {
      declinedUntil = performance.now() + 1500;
      closeDialog();
    },
  });
  showDialog("川で向こうに行けない。泳いで渡りますか?", buttons);
}

// 溺れる演出: 川に入る → しぶきを上げて沈む → ゲームオーバー表示
const DROWN_ENTER_MS = 500;
const DROWN_SINK_MS = 1500;
let drowning = null;
const particles = []; // しぶき(splash)と泡(bubble)

function startDrowning() {
  closeDialog();
  craftEl.hidden = true;
  drowning = { start: performance.now(), startY: player.y, splashed: false, done: false };
}

function spawnSplash(x, y) {
  Sound.splash();
  for (let i = 0; i < 18; i++) {
    particles.push({
      kind: "splash", x, y, life: 1,
      vx: (Math.random() - 0.5) * 7, vy: -3 - Math.random() * 5,
      size: 5 + Math.random() * 5,
    });
  }
}

function updateParticles() {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.kind === "splash") {
      p.vy += 0.4;
      p.life -= 0.025;
    } else if (p.kind === "heart") {
      p.vx = Math.sin(p.y / 20) * 1.2;
      p.life -= 0.006;
    } else {
      p.vx = Math.sin(p.y / 10) * 0.6;
      p.life -= 0.012;
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
}

function updateDrowning(now) {
  const t = now - drowning.start;
  const waterY = RIVER.y + RIVER.height * 0.35;
  const cx = player.x + player.size / 2;

  if (t < DROWN_ENTER_MS) {
    player.y = drowning.startY + (waterY - drowning.startY) * (t / DROWN_ENTER_MS);
  } else {
    player.y = waterY;
    if (!drowning.splashed) {
      drowning.splashed = true;
      spawnSplash(cx, waterY + player.size * 0.6);
    }
    if (Math.random() < 0.2) {
      if (Math.random() < 0.3) Sound.bubble();
      particles.push({
        kind: "bubble", x: cx + (Math.random() - 0.5) * player.size * 0.6,
        y: waterY + player.size * 0.6, vx: 0, vy: -1 - Math.random(),
        life: 1, size: 3 + Math.random() * 4,
      });
    }
  }
  updateParticles();

  if (t > DROWN_ENTER_MS + DROWN_SINK_MS + 600 && !drowning.done) {
    drowning.done = true;
    Sound.gameover();
    showDialog("流れが速くて溺れてしまった…\nゲームオーバー", [
      { label: "もう一度", onClick: () => location.reload() },
    ]);
  }
}

function drawDrowning(now) {
  const t = now - drowning.start;
  if (t < DROWN_ENTER_MS) {
    // 川に飛び込むまでは、じたばたしながら進む
    drawSprite(player, Math.sin(now / 50) * 4);
    return;
  }

  const sink = Math.min(1, (t - DROWN_ENTER_MS) / DROWN_SINK_MS);
  const waterline = player.y + player.size * 0.8;
  const cx = player.x + player.size / 2;

  // 水面より下は描かないで、沈んで見えるようにする
  ctx.save();
  ctx.beginPath();
  ctx.rect(player.x - 30, player.y - 60, player.size + 60, waterline - (player.y - 60));
  ctx.clip();
  ctx.drawImage(
    player.sprite,
    Math.round(player.x + Math.sin(now / 50) * (1 - sink) * 5),
    Math.round(player.y + sink * player.size * 0.9),
  );
  ctx.restore();

  // 広がる波紋
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    const phase = ((t - DROWN_ENTER_MS) / 1000 + k / 3) % 1;
    ctx.globalAlpha = 1 - phase;
    ctx.beginPath();
    ctx.ellipse(cx, waterline, 12 + phase * 60, 4 + phase * 18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    if (p.kind === "splash") {
      ctx.fillStyle = p.color || "#bfe6ff";
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    } else if (p.kind === "heart") {
      ctx.drawImage(SPRITES.heart, Math.round(p.x), Math.round(p.y), p.size, p.size);
    } else {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function update() {
  if (drowning) {
    updateDrowning(performance.now());
    return;
  }
  updateParticles();
  if (cleared) {
    // ハートが舞うのを少し見せてから、クリア画面を出す
    if (!clearShown && performance.now() - clearStart > CLEAR_DIALOG_MS) {
      clearShown = true;
      showDialog(`ゲームクリア!\n川を越えて、2人は会えました ♥${rtaResultText}`, [
        { label: "もう一度", onClick: () => location.reload() },
      ]);
    }
    return;
  }
  if (paused) return;

  updateBridge();
  // 橋を架けている間は、その場で見守る
  if (bridge && !bridge.done) return;

  const { dx, dy } = readInput();
  const startX = player.x;
  const startY = player.y;
  let nx = player.x + dx * player.speed;
  let ny = player.y + dy * player.speed;
  nx = Math.max(0, Math.min(worldW - player.size, nx));
  ny = Math.max(0, Math.min(worldH - player.size, ny));

  // 軸ごとに判定して、壁(川)に沿って滑れるようにする
  if (canStand(nx, player.y, player.size) && !hitsObstacle(nx, player.y)) player.x = nx;
  const riverOk = canStand(player.x, ny, player.size);
  if (riverOk && !hitsObstacle(player.x, ny)) player.y = ny;

  if ((player.x !== startX || player.y !== startY) && performance.now() - lastStepAt > 280) {
    lastStepAt = performance.now();
    Sound.step();
  }

  // 橋のない川に突っ込もうとしたら、泳ぐかどうかを尋ねる
  const onRiverRows = player.y + player.size > RIVER.y && player.y < RIVER.y + RIVER.height;
  if (!riverOk && !onRiverRows && performance.now() > declinedUntil) askSwim();

  // 近づいた木は揺れ始め、少し遅れて枝が落ちる
  const now = performance.now();
  for (const t of trees) {
    if (t.gone) continue;
    const near = Math.hypot(player.x + player.size / 2 - (t.x + t.w / 2), player.y + player.size / 2 - (t.y + t.h));
    if (!t.shakeStart && near < TREE_REACH) {
      t.shakeStart = now;
      Sound.rustle();
    }
    if (t.shakeStart && !t.dropped && now - t.shakeStart > SHAKE_MS) dropBranches(t);

    // 揺すり終えた木に斧を持って近づくと切り始める
    if (cabin.axeTaken && t.dropped && !t.chopStart && now - t.shakeStart > SHAKE_MS * 2 && near < TREE_REACH) {
      t.chopStart = now;
      t.shakeStart = now;
      spawnChips(t);
      messageEl.textContent = "斧で木を切っている…";
      for (const d of [0, 0.3, 0.6]) Sound.chop(d);
    }
    if (t.chopStart && !t.chopped && now - t.chopStart > CHOP_MS) chopTree(t);
  }
  for (const item of items) {
    if (item.lift > 0) {
      item.fallV += 0.7;
      item.lift = Math.max(0, item.lift - item.fallV);
      if (item.lift === 0) Sound.land();
    }
  }

  // 小屋の前に来るとドアが開き、中の斧に近づけば取れる
  const door = doorRect();
  const nearDoor = Math.hypot(player.x + player.size / 2 - (door.x + door.w / 2), player.y + player.size / 2 - (cabin.y + cabin.h));
  if (!cabin.openStart && nearDoor < CABIN_REACH) cabin.openStart = now;
  if (cabin.openStart && !cabin.open && now - cabin.openStart > OPEN_MS) {
    cabin.open = true;
    Sound.door();
    setTimeout(Sound.pop, 350);
    workbench.visible = true;
    workbench.appearStart = now;
    spawnDust(workbench.x + workbench.w / 2, workbench.y + workbench.h - 6);
    messageEl.textContent = "小屋のドアを開けた。中に斧がある! 作業台も置かれた";
  }
  if (cabin.open && !cabin.axeTaken) {
    const zone = { x: door.x + (door.w - AXE_SIZE) / 2 - AXE_PAD, y: door.y + door.h - AXE_SIZE - AXE_PAD, size: AXE_SIZE + AXE_PAD * 2 };
    if (overlaps(player, zone)) {
      cabin.axeTaken = true;
      inventory.push("axe");
      renderInventory();
      Sound.pickup();
      messageEl.textContent = "斧を手に入れた!";
    }
  }

  // 作業台に近づいている間だけ、作るボタンを出す
  const benchNear = workbench.visible && Math.hypot(
    player.x + player.size / 2 - (workbench.x + workbench.w / 2),
    player.y + player.size / 2 - (workbench.y + workbench.h / 2),
  ) < WORKBENCH_REACH;
  craftEl.hidden = !benchNear;

  // 相手は向こう岸で主人公の真上へなめらかに追いかける
  partner.x += (player.x - partner.x) * PARTNER_FOLLOW;

  for (const item of items) {
    if (!item.taken && !item.lift && overlaps(player, item)) {
      item.taken = true;
      inventory.push(item.type);
      renderInventory();
      Sound.pickup();
      showStatus(`${item.label}を手に入れた!`);
    }
  }

  if (overlaps(player, partner)) {
    cleared = true;
    clearStart = now;
    if (rtaOn) recordResult();
    messageEl.textContent = "会えた! ♥";
    spawnHearts((player.x + partner.x) / 2 + player.size / 2, (player.y + partner.y) / 2);
    Sound.fanfare();
  }
}

function drawSprite(o, offsetY = 0) {
  // 足元の影
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(o.x + o.size / 2, o.y + o.size - 2, o.size / 2.5, o.size / 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(o.sprite, Math.round(o.x), Math.round(o.y + offsetY));
}

// 向こう岸まで張った2本のロープ。橋が架かると手すりになる。
// 投げている間は、石の付いた先端が弧を描いて飛び、あとを追ってロープが伸びる
function drawRopes(now) {
  if (!ropes) return;
  const top = RIVER.y - 6;
  const bottom = RIVER.y + RIVER.height + 6;
  [ropes.x, ropes.x + BRIDGE_WIDTH].forEach((x, i) => {
    const p = Math.min(1, (now - ropes.throwStart - i * ROPE_STAGGER_MS) / THROW_MS);
    if (p <= 0) return;
    const headY = bottom + (top - bottom) * p - Math.sin(Math.PI * p) * 70;

    ctx.lineCap = "round";
    for (const [color, width] of [["#5a3a1c", 9], ["#e8c261", 5]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, bottom);
      ctx.lineTo(x, headY);
      ctx.stroke();
    }

    if (p < 1) {
      ctx.drawImage(SPRITES.stone, Math.round(x - 14), Math.round(headY - 14), 28, 28);
      return;
    }
    ctx.fillStyle = "#e8c261";
    ctx.beginPath();
    ctx.arc(x, top, 7, 0, Math.PI * 2);
    ctx.fill();
    // 手前の岸側は石で固定
    ctx.drawImage(SPRITES.stone, Math.round(x - 14), Math.round(bottom - 4), 28, 28);
  });
}

function drawCabin() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(cabin.x + cabin.w / 2, cabin.y + cabin.h - 2, cabin.w / 2.2, cabin.w / 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(cabin.open ? SPRITES.cabinOpen : SPRITES.cabin, Math.round(cabin.x), Math.round(cabin.y));

  // 開いたドアの奥に斧が立てかけてある
  if (cabin.open && !cabin.axeTaken) {
    const door = doorRect();
    ctx.drawImage(SPRITES.axe, Math.round(door.x + (door.w - AXE_SIZE) / 2), Math.round(door.y + door.h - AXE_SIZE));
  }
}

// 現れるときは、下を支点にぽんと膨らんで定位置に収まる
function drawWorkbench(now) {
  const t = Math.min(1, (now - workbench.appearStart) / WORKBENCH_POP_MS);
  const s = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.2 : 1;
  const w = workbench.w * s * t;
  const h = workbench.h * s * t;

  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(workbench.x + workbench.w / 2, workbench.y + workbench.h - 2, workbench.w / 2.2, workbench.w / 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(
    SPRITES.workbench,
    Math.round(workbench.x + (workbench.w - w) / 2),
    Math.round(workbench.y + workbench.h - h),
    Math.round(w),
    Math.round(h),
  );
}

function drawTree(t, now) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(t.x + t.w / 2, t.y + t.h - 4, t.w / 3, t.w / 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // 揺れ始めてからだんだん収まる
  const left = t.shakeStart ? 1 - (now - t.shakeStart) / (SHAKE_MS * 2) : 0;
  const shake = left > 0 && left < 1 ? Math.sin(now / 25) * 5 * left : 0;
  ctx.drawImage(t.sprite, Math.round(t.x + shake), Math.round(t.y));
}

function fillTiles(sprite, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = ctx.createPattern(sprite, "repeat");
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// 画面下の操作用の余白。ここをなぞってもスティックが出る
function drawPad() {
  if (worldH >= canvas.height) return;
  ctx.fillStyle = "#1b2a49";
  ctx.fillRect(0, worldH, canvas.width, canvas.height - worldH);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, worldH, canvas.width, 3);
  if (touch.id === null) {
    const cx = canvas.width / 2;
    const cy = worldH + (canvas.height - worldH) / 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 45, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawStick() {
  if (touch.id === null) return;
  // スティックは画面上の位置(CSS px)で扱うので、内部の画面の大きさに合わせて描く
  ctx.save();
  ctx.scale(1 / viewScale, 1 / viewScale);
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(touch.originX, touch.originY, STICK_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.beginPath();
  ctx.arc(touch.originX + touch.dx, touch.originY + touch.dy, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  const now = performance.now();

  // カメラは主人公を横方向に追い、マップの端では止まる
  cameraX = Math.round(Math.max(0, Math.min(worldW - canvas.width, player.x + player.size / 2 - canvas.width / 2)));
  ctx.save();
  ctx.translate(-cameraX, 0);
  // ゲームは上の worldH の範囲だけに描く
  ctx.beginPath();
  ctx.rect(cameraX, 0, canvas.width, worldH);
  ctx.clip();

  fillTiles(SPRITES.grass, cameraX, 0, canvas.width, worldH);

  for (const [rx, ry] of flowers) {
    ctx.drawImage(SPRITES.flower, Math.round(rx * worldW), Math.round(ry * worldH));
  }

  // 川: 波のコマを交互に切り替える。岸には砂のふちを付ける
  fillTiles(SPRITES.water[Math.floor(now / 500) % 2], cameraX, RIVER.y, canvas.width, RIVER.height);
  ctx.fillStyle = "#d8c690";
  ctx.fillRect(cameraX, RIVER.y - 6, canvas.width, 6);
  ctx.fillRect(cameraX, RIVER.y + RIVER.height, canvas.width, 6);

  if (bridge) {
    // 置いたばかりの板材は、横からすっと滑り込む
    for (let i = 0; i < bridge.laid; i++) {
      const r = plankRect(i);
      const t = i === bridge.laid - 1 ? Math.min(1, (now - (bridge.nextAt - PLANK_STEP_MS)) / 200) : 1;
      ctx.save();
      ctx.globalAlpha = t;
      fillTiles(SPRITES.plank, r.x - (1 - t) * 40, r.y, r.w, r.h);
      ctx.restore();
    }
  }
  drawRopes(now);

  for (const item of items) {
    if (!item.taken) drawSprite(item, -(item.lift || 0));
  }

  // 木と小屋は、主人公より奥(足元が上)のものを先に、手前のものを後に描く
  const playerFeet = player.y + player.size;
  const props = [
    ...trees.filter((t) => !t.gone).map((t) => ({ base: t.y + t.h, draw: () => drawTree(t, now) })),
    { base: cabin.y + cabin.h, draw: drawCabin },
  ];
  if (workbench.visible) props.push({ base: workbench.y + workbench.h, draw: () => drawWorkbench(now) });
  for (const p of props) {
    if (p.base <= playerFeet) p.draw();
  }

  // 相手の頭上でハートがふわふわ揺れる
  drawSprite(partner);
  const heart = SPRITES.heart;
  ctx.drawImage(
    heart,
    Math.round(partner.x + (partner.size - heart.width) / 2),
    Math.round(partner.y - heart.height - 4 + Math.sin(now / 300) * 3),
  );

  // 歩いている間だけ小さく跳ねる
  const walking = Math.hypot(stick.x, stick.y) > 0.1 || keys.ArrowLeft || keys.ArrowRight || keys.ArrowUp || keys.ArrowDown;
  if (drowning) {
    drawDrowning(now);
  } else {
    drawSprite(player, walking ? -Math.abs(Math.sin(now / 90)) * 4 : 0);
  }
  for (const p of props) {
    if (p.base > playerFeet) p.draw();
  }
  drawParticles();
  ctx.restore();
  drawPad();
  drawStick();
}

// RTA: キャラを選んでから「会えた」までのタイム。最高記録は Cookie に残す(この端末だけ)
const timerEl = document.getElementById("timer");
const rtaCheck = document.getElementById("rta-check");
const bestEl = document.getElementById("best-record");
const BEST_COOKIE = "tamagawa_best";
let rtaOn = false;
let rtaStart = 0;
let lastTimerText = "";
let rtaResultText = ""; // クリア画面に足す、タイムと記録の文

// 「会えた」の瞬間のタイムを、自己ベストと比べて保存する
function recordResult() {
  const cs = Math.floor((clearStart - rtaStart) / 10);
  const best = readBest();
  if (best === null || cs < best) {
    saveBest(cs);
    rtaResultText = `\n\nタイム: ${formatTime(cs)}秒\n最高記録を更新!`;
  } else {
    rtaResultText = `\n\nタイム: ${formatTime(cs)}秒\n最高記録: ${formatTime(best)}秒`;
  }
}

// マップの長さなどタイムに影響する調整をしたら、この版番号を上げる。
// 古い版(版のない旧形式も含む)の最高記録は、読み込んだときに消す
const GAME_VERSION = 2;

// 記録は 1/100 秒(整数)で扱い、Cookie には「v版番号_記録」の形で入れる
function readBest() {
  const m = document.cookie.match(new RegExp(`(?:^|; )${BEST_COOKIE}=([^;]*)`));
  if (!m) return null;
  const [ver, cs] = m[1].split("_");
  if (ver !== `v${GAME_VERSION}` || !/^\d+$/.test(cs ?? "")) {
    clearBest();
    return null;
  }
  return Number(cs);
}

function saveBest(cs) {
  document.cookie = `${BEST_COOKIE}=v${GAME_VERSION}_${cs}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
}

function clearBest() {
  document.cookie = `${BEST_COOKIE}=; max-age=0; path=/`;
}

function formatTime(cs) {
  const min = Math.floor(cs / 6000);
  const rest = ((cs % 6000) / 100).toFixed(2).padStart(5, "0");
  return min > 0 ? `${min}:${rest}` : `${(cs / 100).toFixed(2)}`;
}

function renderBest() {
  const best = readBest();
  const record = best === null ? "なし" : `${formatTime(best)}秒`;
  bestEl.textContent = `最高記録: ${record} (ver ${GAME_VERSION})`;
}

document.getElementById("clear-record").addEventListener("click", () => {
  if (readBest() !== null && !confirm("最高記録を消しますか?")) return;
  clearBest();
  renderBest();
});

function updateTimer(now) {
  if (!rtaOn) return;
  const text = formatTime(Math.floor(((cleared ? clearStart : now) - rtaStart) / 10));
  if (text !== lastTimerText) {
    lastTimerText = text;
    timerEl.textContent = text;
  }
}

function loop() {
  update();
  updateTimer(performance.now());
  draw();
  requestAnimationFrame(loop);
}

// 開始時に操作するキャラを選ぶ。選ばなかった方が向こう岸の相手になる
function chooseCharacter(playerSprite, partnerSprite) {
  player.sprite = playerSprite;
  partner.sprite = partnerSprite;
  closeDialog();
  Sound.start();

  rtaOn = rtaCheck.checked;
  if (rtaOn) {
    rtaStart = performance.now();
    timerEl.hidden = false;
  }
}

layout();
renderInventory();
showDialog("操作するキャラを選んでね", [
  { label: "男の子", icon: SPRITES.boy, onClick: () => chooseCharacter(SPRITES.boy, SPRITES.girl) },
  { label: "女の子", icon: SPRITES.girl, onClick: () => chooseCharacter(SPRITES.girl, SPRITES.boy) },
], { extra: true });
renderBest();
loop();
