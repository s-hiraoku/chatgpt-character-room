import type { Placement, FurniturePlacement } from "./contracts.js";
export function floorPoint(item: Pick<Placement, "x" | "y">) {
  return {
    x: ((item.x - 50) / 40) * 3.3,
    z: ((item.y - 45) / 51) * 4.7 - 2.35,
  };
}
export function floorPlacement(x: number, z: number) {
  return {
    x: Math.round(Math.max(10, Math.min(90, (x / 3.3) * 40 + 50))),
    y: Math.round(Math.max(45, Math.min(96, ((z + 2.35) / 4.7) * 51 + 45))),
  };
}
export function characterHeight(item: Pick<Placement, "size">) {
  return item.size * 0.05;
}
export type FloorItem = Placement | FurniturePlacement;
