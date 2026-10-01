export const characters = [
  {
    id: "darapan",
    name: "だらぱん",
    description: "白黒のパンダ耳フードを着た、黒髪のサイバーパンダ。",
    variants: [
      { id: "chibi", name: "ちびだらぱん", image: "darapan-chibi.png" },
      { id: "classic", name: "だらぱん", image: "darapan-classic.png" },
    ],
  },
];

export const backgrounds = [
  {
    id: "night",
    name: "夜のアトリエ",
    description: "静かな夜の仮背景。",
    image: null,
  },
  {
    id: "day",
    name: "昼のアトリエ",
    description: "明るい昼の仮背景。",
    image: null,
  },
  {
    id: "plain",
    name: "シンプル",
    description: "キャラを見やすくする無地の背景。",
    image: null,
  },
] as { id: string; name: string; description: string; image: string | null }[];

export function findVariant(characterId: string, variantId: string) {
  return characters
    .find((item) => item.id === characterId)
    ?.variants.find((item) => item.id === variantId);
}
