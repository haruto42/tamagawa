// ドット絵データ。各文字がパレットの色に対応し、"." は透明
const PIXEL_SCALE = 5; // キャラ・アイテム用の拡大率
const TILE_SCALE = 6; // 地面・川・橋のタイル用の拡大率
const TREE_SCALE = 8; // 立ち木用の拡大率
const CABIN_SCALE = 8; // 小屋用の拡大率(ドア1枚が斧1本ぶんの幅になる)
const AXE_SCALE = 4;
const WORKBENCH_SCALE = 6;

function makeSprite(rows, palette, scale) {
  const c = document.createElement("canvas");
  c.width = rows[0].length * scale;
  c.height = rows.length * scale;
  const g = c.getContext("2d");
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = palette[ch];
      g.fillRect(x * scale, y * scale, scale, scale);
    });
  });
  return c;
}

const SPRITES = {
  // 12x12: 男の子
  boy: makeSprite([
    "...KKKKKK...",
    "..KKKKKKKK..",
    "..KSSSSSSK..",
    "..KSWSSWSK..",
    "..SSSSSSSS..",
    "...SSSSSS...",
    "..BBBBBBBB..",
    ".SBBBBBBBBS.",
    ".SBBBBBBBBS.",
    "..BBBBBBBB..",
    "..DDD..DDD..",
    "..DDD..DDD..",
  ], { K: "#3b2a20", S: "#ffd7b0", W: "#222222", B: "#4da3ff", D: "#2c4a8a" }, PIXEL_SCALE),

  // 12x12: 女の子
  girl: makeSprite([
    "...KKKKKK...",
    "..KKPKKKKK..",
    ".KKSSSSSSKK.",
    ".KKSWSSWSKK.",
    ".KKSSSSSSKK.",
    ".KK.SSSS.KK.",
    "...RRRRRR...",
    "..SRRRRRRS..",
    "..RRRRRRRR..",
    ".RRRRRRRRRR.",
    "RRRRRRRRRRRR",
    "...SS..SS...",
  ], { K: "#7a4a2a", P: "#ffffff", S: "#ffd7b0", W: "#222222", R: "#ff7eb0" }, PIXEL_SCALE),

  // 8x8: 紐(巻いたロープ)
  rope: makeSprite([
    "..YYYY..",
    ".YOOOOY.",
    "YOYYYYOY",
    "YOY..YOY",
    "YOY..YOY",
    "YOYYYYOY",
    ".YOOOOY.",
    "..YYYY..",
  ], { Y: "#e8c261", O: "#a9743f" }, PIXEL_SCALE),

  // 8x8: 木(丸太)
  wood: makeSprite([
    "........",
    ".NNNNNN.",
    "NNNNNNNN",
    "NMMMMMMN",
    "NMTTTTMN",
    "NMMMMMMN",
    ".NNNNNN.",
    "........",
  ], { N: "#6b4220", M: "#c68a4e", T: "#8b5a2b" }, PIXEL_SCALE),

  // 8x8: 木の枝(木を揺すると落ちる)
  branch: makeSprite([
    "........",
    ".....BB.",
    "....BB..",
    "...BB.B.",
    "..BBBB..",
    ".BBB.B..",
    "BBB.....",
    "........",
  ], { B: "#8b5a2b" }, PIXEL_SCALE),

  // 12x16: 立ち木
  tree: makeSprite([
    "....LLLL....",
    "..LLLllLLL..",
    ".LLllLLLLLL.",
    ".LLLLLllLLL.",
    "LLLllLLLLLLL",
    "LLLLLLLllLLL",
    "LLlLLLLLLLLL",
    ".LLLLLlLLLL.",
    "..LLLLLLLL..",
    "...LLLLLL...",
    ".....TT.....",
    ".....TT.....",
    ".....Tt.....",
    ".....TT.....",
    "....TTtT....",
    "....TTTT....",
  ], { L: "#3f8f4a", l: "#5bb563", T: "#7a4a2a", t: "#5a3519" }, TREE_SCALE),

  // 16x14: 小屋(ドア閉)
  cabin: makeSprite([
    "......RRRR......",
    "....RRRRRRRR....",
    "..RRRRRRRRRRRR..",
    ".RRRRRRRRRRRRRR.",
    "RRrRRrRRrRRrRRrR",
    "rrrrrrrrrrrrrrrr",
    ".WWWWWWWWWWWWWW.",
    ".WGGWWWWWWWWGGW.",
    ".WGGWWDDDDWWGGW.",
    ".WWWWWDDDDWWWWW.",
    ".wWWWWDDDDWWWWw.",
    ".WWWWWDDHDWWWWW.",
    ".WWWWWDDDDWWWWW.",
    ".wwwwwwwwwwwwww.",
  ], { R: "#b5483a", r: "#8a3328", W: "#c68a4e", w: "#a96f36", G: "#8fd3ff", D: "#6b4220", H: "#ffd84d" }, CABIN_SCALE),

  // 16x14: 小屋(ドア開。中は暗く、ドアの板が左に開いている)
  cabinOpen: makeSprite([
    "......RRRR......",
    "....RRRRRRRR....",
    "..RRRRRRRRRRRR..",
    ".RRRRRRRRRRRRRR.",
    "RRrRRrRRrRRrRRrR",
    "rrrrrrrrrrrrrrrr",
    ".WWWWWWWWWWWWWW.",
    ".WGGWWWWWWWWGGW.",
    ".WGGWWDKKKWWGGW.",
    ".WWWWWDKKKWWWWW.",
    ".wWWWWDKKKWWWWw.",
    ".WWWWWDKKKWWWWW.",
    ".WWWWWDKKKWWWWW.",
    ".wwwwwwwwwwwwww.",
  ], { R: "#b5483a", r: "#8a3328", W: "#c68a4e", w: "#a96f36", G: "#8fd3ff", D: "#6b4220", K: "#2a1a0d" }, CABIN_SCALE),

  // 8x8: 板材(2枚重ね)
  board: makeSprite([
    "........",
    "PPPPPPPP",
    "PQPPPPQP",
    "pppppppp",
    "PPPPPPPP",
    "PPPQPPPP",
    "pppppppp",
    "........",
  ], { P: "#d9a066", Q: "#c28a52", p: "#9a6a35" }, PIXEL_SCALE),

  // 8x8: 投げロープ(輪にした紐の先に石が付いている)
  throwrope: makeSprite([
    "..YYY...",
    ".Y...Y..",
    "Y.....Y.",
    "Y.....Y.",
    ".Y...Y..",
    "..YYYSSS",
    ".....SSS",
    ".....SS.",
  ], { Y: "#e8c261", S: "#9aa0a6" }, PIXEL_SCALE),

  // 8x8: ツタ
  vine: makeSprite([
    ".GG.....",
    "..GG.G..",
    "...GGG..",
    "..GG....",
    ".GG.GG..",
    "GG...GG.",
    ".G....G.",
    "........",
  ], { G: "#3f8f4a" }, PIXEL_SCALE),

  // 8x8: 石ころ
  stone: makeSprite([
    "........",
    "..SSSS..",
    ".SsSSSS.",
    "SSSSSSsS",
    "SSSSSSSS",
    ".SSSsSS.",
    "..SSSS..",
    "........",
  ], { S: "#9aa0a6", s: "#6e7479" }, PIXEL_SCALE),

  // 12x8: 作業台
  workbench: makeSprite([
    "............",
    "....GGG..H..",
    "PPPPPPPPPPPP",
    "pppppppppppp",
    ".LL......LL.",
    ".LL.xxxx.LL.",
    ".LL......LL.",
    ".LL......LL.",
  ], { P: "#d9a066", p: "#9a6a35", L: "#7a4a2a", x: "#5a3519", G: "#c9d3da", H: "#8b5a2b" }, WORKBENCH_SCALE),

  // 8x8: 斧
  axe: makeSprite([
    ".GGG....",
    "GGGGH...",
    "GGGGH...",
    ".GGH....",
    "...H....",
    "...H....",
    "...H....",
    "...H....",
  ], { G: "#c9d3da", H: "#8b5a2b" }, AXE_SCALE),

  // 8x8: ハート(相手の頭上)
  heart: makeSprite([
    ".RR..RR.",
    "RRRRRRRR",
    "RRRRRRRR",
    "RRRRRRRR",
    ".RRRRRR.",
    "..RRRR..",
    "...RR...",
    "........",
  ], { R: "#ff4f7e" }, PIXEL_SCALE),

  // 8x8: 花(飾り)
  flower: makeSprite([
    "........",
    "..W.....",
    ".WYW..P.",
    "..W..PYP",
    "...G..P.",
    "...G..G.",
    "..GG..G.",
    "........",
  ], { W: "#ffffff", Y: "#ffd84d", P: "#ff9ec4", G: "#3f8f4a" }, PIXEL_SCALE),

  // 8x8: 地面タイル
  grass: makeSprite([
    "GGGGGGGG",
    "GGgGGGGG",
    "GGGGGGGG",
    "GGGGGgGG",
    "GGGGGGGG",
    "GgGGGGGG",
    "GGGGGGGG",
    "GGGGgGGG",
  ], { G: "#6fbf73", g: "#5aa862" }, TILE_SCALE),

  // 8x8: 川タイル(2コマで波打つ)
  water: [
    makeSprite([
      "WWWWWWWW",
      "WWhhWWWW",
      "WWWWWWWW",
      "WWWWWWWW",
      "WWWWWhhW",
      "WWWWWWWW",
      "WhhWWWWW",
      "WWWWWWWW",
    ], { W: "#3a8fd8", h: "#7cc4f5" }, TILE_SCALE),
    makeSprite([
      "WWWWWWWW",
      "WWWWWWhh",
      "WWWWWWWW",
      "WWWWWWWW",
      "WhhWWWWW",
      "WWWWWWWW",
      "WWWWWhhW",
      "WWWWWWWW",
    ], { W: "#3a8fd8", h: "#7cc4f5" }, TILE_SCALE),
  ],

  // 8x8: 橋の板タイル
  plank: makeSprite([
    "PPPPPPPP",
    "pppppppp",
    "PPPPPPPP",
    "PPPPPPPP",
    "pppppppp",
    "PPPPPPPP",
    "PPPPPPPP",
    "pppppppp",
  ], { P: "#b98350", p: "#7a4f28" }, TILE_SCALE),
};
