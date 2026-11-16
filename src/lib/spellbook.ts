// Magic-word spellbook + theme/atmosphere configuration for Spellbound Snake

export type ParticleKind =
  | "wind" | "fireflies" | "bubbles" | "rain"
  | "snow" | "embers" | "mist" | "sparkles" | "stars"

export interface Point { x: number; y: number }

export interface Spell {
  word: string        // the character shown on the board (e.g. 风、夜、梦)
  theme: string       // unique theme key, used to cache AI scene images
  color: string       // primary hex color (snake body, glow, UI accent)
  rarity: 1 | 2 | 3    // 1 common, 2 uncommon, 3 rare
  points: number       // base score before multiplier
  keywords: string     // fed into the image-generation prompt
  particles: ParticleKind
  desc: string         // short flavor text for the spell book
}

export const SPELLBOOK: Spell[] = [
  { word: "风", theme: "wind",    color: "#34d399", rarity: 1, points: 10, particles: "wind",      keywords: "gentle wind, flowing green mist, drifting silk threads, emerald aura, airy", desc: "流动的风，编织无形的轨迹。" },
  { word: "夜", theme: "night",   color: "#6366f1", rarity: 1, points: 10, particles: "fireflies", keywords: "calm night sky, deep indigo, stars, fireflies rising, moonlit, serene",   desc: "沉静的夜，星辰低语。" },
  { word: "梦", theme: "dream",   color: "#a855f7", rarity: 2, points: 25, particles: "bubbles",   keywords: "dreamscape, floating bubbles, purple haze, surreal, ethereal, soft glow", desc: "漂浮的梦，界限开始模糊。" },
  { word: "影", theme: "shadow",  color: "#7c3aed", rarity: 1, points: 10, particles: "mist",      keywords: "shadow realm, dark mist, purple haze, mysterious, dim, hidden",          desc: "潜行的影，藏着未言之事。" },
  { word: "星", theme: "star",    color: "#cbd5e1", rarity: 2, points: 25, particles: "stars",     keywords: "galaxy, glittering stars, silver cosmic dust, nebula, vast",             desc: "坠落的星，划过永恒。" },
  { word: "雨", theme: "storm",   color: "#475569", rarity: 1, points: 10, particles: "rain",      keywords: "rainstorm, rain curtain, dramatic grey-blue sky, moody, wet",            desc: "倾盆的雨，洗刷旧日。" },
  { word: "雷", theme: "thunder", color: "#facc15", rarity: 2, points: 25, particles: "sparkles", keywords: "thunderstorm, electric arcs, yellow lightning flash, intense, charged",   desc: "炸裂的雷，唤醒沉睡之力。" },
  { word: "雪", theme: "snow",    color: "#e0f2fe", rarity: 1, points: 10, particles: "snow",      keywords: "gentle snowfall, drifting flakes, soft white, serene winter, quiet",     desc: "无声的雪，覆盖一切喧嚣。" },
  { word: "冰", theme: "ice",     color: "#7dd3fc", rarity: 2, points: 25, particles: "snow",      keywords: "ice cavern, crystalline shards, cyan glacial, frozen, sharp",            desc: "凝冻的冰，时间在此停滞。" },
  { word: "火", theme: "fire",    color: "#f97316", rarity: 1, points: 10, particles: "embers",    keywords: "crackling fire, embers, warm orange glow, sparks rising, cozy",        desc: "跃动的火，灼烧旧的故事。" },
  { word: "海", theme: "ocean",   color: "#0891b2", rarity: 2, points: 25, particles: "bubbles",   keywords: "deep ocean, teal water, bioluminescence, underwater rays, vast",       desc: "深渊的海，藏着古老的回响。" },
  { word: "光", theme: "light",   color: "#fbbf24", rarity: 3, points: 60, particles: "sparkles", keywords: "divine light, golden rays, radiant, holy glow, beams from above",        desc: "圣洁的光，照亮命运之路。" },
  { word: "轮回", theme: "samsara", color: "#f0abfc", rarity: 3, points: 60, particles: "stars",   keywords: "cosmic wheel, infinite loops, timeless void, surreal, ethereal",        desc: "无尽的轮回，终即始。" },
]

export interface BoardSpell extends Spell { x: number; y: number }

/** Pick a random spell weighted by inverse rarity, at a free cell. */
export function spawnBoardSpell(snake: Point[], gridSize: number): BoardSpell {
  const weights = SPELLBOOK.map((s) => 4 - s.rarity) // 3, 2, 1
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  let idx = 0
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) { idx = i; break }
  }
  const spell = SPELLBOOK[idx]

  let p: Point
  let tries = 0
  do {
    p = { x: Math.floor(Math.random() * gridSize), y: Math.floor(Math.random() * gridSize) }
    tries++
  } while (snake.some((s) => s.x === p.x && s.y === p.y) && tries < 200)

  return { ...spell, x: p.x, y: p.y }
}

export function getSpellByTheme(theme: string | null): Spell | undefined {
  if (!theme) return undefined
  return SPELLBOOK.find((s) => s.theme === theme)
}

export function getThemeColor(theme: string | null): string {
  return getSpellByTheme(theme)?.color ?? "#34d399"
}

export function getParticleKind(theme: string | null): ParticleKind {
  return getSpellByTheme(theme)?.particles ?? "fireflies"
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "")
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
