export const characters = [
  {
    id: "darapan",
    name: "だらぱん",
    description: "白黒のパンダ耳フードを着た、黒髪のサイバーパンダ。",
    variants: [
      {
        id: "cyber",
        name: "サイバーパンダ",
        image: "characters/darapan-cyber.png",
      },
      { id: "chibi", name: "ちびだらぱん", image: "darapan-chibi.png" },
      { id: "classic", name: "だらぱん", image: "darapan-classic.png" },
    ],
  },
  {
    id: "mochipan",
    name: "もちぱん",
    description: "紫のリボンをつけた、まるいパンダ。",
    variants: [
      {
        id: "normal",
        name: "いつものもちぱん",
        image: "characters/mochipan.png",
      },
    ],
  },
];

export const backgrounds = [
  {
    id: "night",
    name: "夜のアトリエ",
    description: "紫と水色の光が灯る、夜のサイバーアトリエ。",
    image: null,
  },
  {
    id: "day",
    name: "昼のアトリエ",
    description: "同じ部屋を明るい照明で表示。",
    image: null,
  },
  {
    id: "plain",
    name: "シンプル",
    description: "キャラと家具だけを表示する、シンプルなスタジオ。",
    image: null,
  },
] as { id: string; name: string; description: string; image: string | null }[];

export function findVariant(characterId: string, variantId: string) {
  return characters
    .find((item) => item.id === characterId)
    ?.variants.find((item) => item.id === variantId);
}

export const furnitureCatalog = [
  { id: "table", name: "ローテーブル", model: "table.glb", icon: "▱" },
  { id: "sofa", name: "ソファ", model: "sofa.glb", icon: "▰" },
  { id: "lamp", name: "フロアライト", model: "lamp.glb", icon: "◠" },
  { id: "plant", name: "鉢植え", model: "plant.glb", icon: "♧" },
];
