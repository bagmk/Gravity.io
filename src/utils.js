import { MAP_W, MAP_H } from "./constants.js";

export const mr = (m) => Math.sqrt(m) * 3;
export const uid = () => Math.random().toString(36).slice(2, 9);

export function wrapDx(ax, bx) {
  let d = bx - ax;
  if (d > MAP_W / 2) d -= MAP_W;
  if (d < -MAP_W / 2) d += MAP_W;
  return d;
}

export function wrapDy(ay, by) {
  let d = by - ay;
  if (d > MAP_H / 2) d -= MAP_H;
  if (d < -MAP_H / 2) d += MAP_H;
  return d;
}

export function di(a, b) {
  const dx = wrapDx(a.x, b.x), dy = wrapDy(a.y, b.y);
  return Math.sqrt(dx * dx + dy * dy);
}

export function wrapPos(obj) {
  obj.x = ((obj.x % MAP_W) + MAP_W) % MAP_W;
  obj.y = ((obj.y % MAP_H) + MAP_H) % MAP_H;
}
