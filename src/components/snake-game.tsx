"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Play, RotateCcw, Pause, Sparkles, BookOpen, ScrollText,
  Copy, Check, Trophy, Wand2, Zap, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  SPELLBOOK, type Spell, type Point, type ParticleKind,
  spawnBoardSpell, getThemeColor, getParticleKind, hexToRgba,
} from "@/lib/spellbook"
import { ParticleCanvas } from "@/components/particle-canvas"

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const GRID_SIZE = 20
const CELL = 22
const BOARD_PX = GRID_SIZE * CELL
const INITIAL_SPEED = 170
const MIN_SPEED = 80
const SPEED_STEP = 5

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT"
type Status = "idle" | "running" | "paused" | "over"
interface CollectedItem { spell: Spell; resonance: boolean }

const DIR_VECTORS: Record<Direction, Point> = {
  UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 },
}
const OPPOSITE: Record<Direction, Direction> = {
  UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT",
}

function initialSnake(): Point[] {
  const cy = Math.floor(GRID_SIZE / 2)
  const cx = Math.floor(GRID_SIZE / 2)
  return [
    { x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy },
  ]
}

const INITIAL_SNAKE = initialSnake()
const INITIAL_SPELL = spawnBoardSpell(INITIAL_SNAKE, GRID_SIZE)

/* module-scope canvas helper */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  /* ----- game-loop refs (mutable, not for render) ----- */
  const snakeRef = useRef<Point[]>(INITIAL_SNAKE)
  const boardSpellRef = useRef<Spell & Point>(INITIAL_SPELL)
  const dirRef = useRef<Direction>("RIGHT")
  const nextDirRef = useRef<Direction>("RIGHT")

  const sceneImgRef = useRef<HTMLImageElement | null>(null)
  const loadedScenesRef = useRef<Map<string, HTMLImageElement>>(new Map())

  const themeRef = useRef<string | null>(null)
  const resonanceRef = useRef(false)
  const comboRef = useRef(0)
  const lastThemeRef = useRef<string | null>(null)

  // mirrors of state so async callbacks stay stable
  const collectedRef = useRef<CollectedItem[]>([])
  const storyRef = useRef<string[]>([])

  /* ----- meta state (for render) ----- */
  const [status, setStatus] = useState<Status>("idle")
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [speed, setSpeed] = useState(INITIAL_SPEED)
  const [story, setStory] = useState<string[]>([])
  const [storyLoading, setStoryLoading] = useState(false)
  const [collected, setCollected] = useState<CollectedItem[]>([])
  const [currentTheme, setCurrentTheme] = useState<string | null>(null)
  const [sceneLoading, setSceneLoading] = useState(false)
  const [combo, setCombo] = useState(0)
  const [copied, setCopied] = useState(false)

  /* ----------------------- rendering ------------------------------ */

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const color = getThemeColor(themeRef.current)

    // background base
    ctx.fillStyle = "#0b1220"
    ctx.fillRect(0, 0, BOARD_PX, BOARD_PX)

    const img = sceneImgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.globalAlpha = 0.55
      ctx.drawImage(img, 0, 0, BOARD_PX, BOARD_PX)
      ctx.globalAlpha = 1
      ctx.fillStyle = "rgba(11,18,32,0.42)"
      ctx.fillRect(0, 0, BOARD_PX, BOARD_PX)
    } else {
      const g = ctx.createRadialGradient(
        BOARD_PX / 2, BOARD_PX / 2, 8,
        BOARD_PX / 2, BOARD_PX / 2, BOARD_PX / 1.25
      )
      g.addColorStop(0, hexToRgba(color, 0.22))
      g.addColorStop(1, "rgba(11,18,32,0)")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, BOARD_PX, BOARD_PX)
    }

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.045)"
    ctx.lineWidth = 1
    for (let i = 1; i < GRID_SIZE; i++) {
      ctx.beginPath()
      ctx.moveTo(i * CELL + 0.5, 0); ctx.lineTo(i * CELL + 0.5, BOARD_PX); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * CELL + 0.5); ctx.lineTo(BOARD_PX, i * CELL + 0.5); ctx.stroke()
    }

    // spell word on board
    const sp = boardSpellRef.current
    if (sp) {
      const cx = sp.x * CELL + CELL / 2
      const cy = sp.y * CELL + CELL / 2
      const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, CELL)
      glow.addColorStop(0, hexToRgba(sp.color, 0.6))
      glow.addColorStop(1, hexToRgba(sp.color, 0))
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(cx, cy, CELL, 0, Math.PI * 2); ctx.fill()

      ctx.fillStyle = hexToRgba(sp.color, 0.22)
      ctx.beginPath(); ctx.arc(cx, cy, CELL / 2 - 2, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = sp.color; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, cy, CELL / 2 - 2, 0, Math.PI * 2); ctx.stroke()

      const pulse = 1 + 0.06 * Math.sin(performance.now() / 220)
      ctx.save()
      ctx.translate(cx, cy); ctx.scale(pulse, pulse); ctx.translate(-cx, -cy)
      ctx.fillStyle = "#fff"
      const fs = sp.word.length > 1 ? CELL - 12 : CELL - 6
      ctx.font = `bold ${fs}px Georgia, "Songti SC", serif`
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.shadowColor = sp.color; ctx.shadowBlur = 8
      ctx.fillText(sp.word, cx, cy + 1)
      ctx.shadowBlur = 0
      ctx.restore()
    }

    // snake
    const snake = snakeRef.current
    const resonance = resonanceRef.current
    snake.forEach((seg, i) => {
      const isHead = i === 0
      const t = i / Math.max(snake.length - 1, 1)
      ctx.fillStyle = isHead ? color : hexToRgba(color, 0.9 - t * 0.45)
      if (isHead && resonance) {
        ctx.shadowColor = color; ctx.shadowBlur = 16
      }
      const pad = isHead ? 2 : 3
      roundRect(ctx, seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, isHead ? 7 : 5)
      ctx.fill()
      ctx.shadowBlur = 0
      if (isHead) {
        const v = DIR_VECTORS[dirRef.current]
        const hx = seg.x * CELL + CELL / 2
        const hy = seg.y * CELL + CELL / 2
        const off = 4
        ctx.fillStyle = "#0b1220"
        ctx.beginPath()
        ctx.arc(hx - v.y * off - v.x * 2, hy + v.x * off - v.y * 2, 2.2, 0, Math.PI * 2)
        ctx.arc(hx + v.y * off - v.x * 2, hy - v.x * off - v.y * 2, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
    })
  }, [])

  // continuous RAF so the spell word pulse stays smooth
  useEffect(() => {
    let raf = 0
    const loop = () => { draw(); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  /* ----------------------- game over ------------------------------ */

  const gameOver = useCallback(() => {
    setStatus("over")
  }, [])

  /* ----------------------- eat handler ----------------------------- */

  const handleEat = useCallback((spell: Spell) => {
    const sameTheme = lastThemeRef.current === spell.theme
    const newCombo = sameTheme ? comboRef.current + 1 : 0
    comboRef.current = newCombo
    lastThemeRef.current = spell.theme
    resonanceRef.current = newCombo >= 1
    themeRef.current = spell.theme
    setCombo(newCombo)
    setCurrentTheme(spell.theme)

    const resonance = newCombo >= 1
    const pts = spell.points * (resonance ? 2 : 1)
    setScore((s) => {
      const ns = s + pts
      setHighScore((h) => Math.max(h, ns))
      return ns
    })
    setSpeed((sp) => Math.max(MIN_SPEED, sp - SPEED_STEP))

    const newItem: CollectedItem = { spell, resonance }
    const newCollected = [...collectedRef.current, newItem]
    collectedRef.current = newCollected
    setCollected(newCollected)

    /* --- story (LLM) --- */
    setStoryLoading(true)
    const words = newCollected.map((c) => c.spell.word)
    const storyText = storyRef.current.join("\n")
    fetch("/api/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collectedWords: words,
        newWord: spell.word,
        currentStory: storyText,
        resonance,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        const seg: string = d?.text || `你吞下了「${spell.word}」，世界轻轻颤动了一下……`
        const newStory = [...storyRef.current, seg]
        storyRef.current = newStory
        setStory(newStory)
      })
      .catch(() => {
        const seg = `你吞下了「${spell.word}」，一阵迷雾遮蔽了前路……`
        const newStory = [...storyRef.current, seg]
        storyRef.current = newStory
        setStory(newStory)
      })
      .finally(() => setStoryLoading(false))

    /* --- scene (image gen, cached) --- */
    if (loadedScenesRef.current.has(spell.theme)) {
      sceneImgRef.current = loadedScenesRef.current.get(spell.theme)!
    } else {
      setSceneLoading(true)
      fetch("/api/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: spell.theme }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!d?.image) { setSceneLoading(false); return }
          const img = new Image()
          img.onload = () => {
            sceneImgRef.current = img
            loadedScenesRef.current.set(spell.theme, img)
            setSceneLoading(false)
          }
          img.onerror = () => setSceneLoading(false)
          img.src = d.image
        })
        .catch(() => setSceneLoading(false))
    }
  }, [])

  /* ----------------------- core loop ------------------------------- */

  const step = useCallback(() => {
    const dir = nextDirRef.current
    dirRef.current = dir
    const v = DIR_VECTORS[dir]
    const snake = snakeRef.current
    const head = snake[0]
    const newHead: Point = { x: head.x + v.x, y: head.y + v.y }

    if (
      newHead.x < 0 || newHead.x >= GRID_SIZE ||
      newHead.y < 0 || newHead.y >= GRID_SIZE
    ) {
      return gameOver()
    }

    const sp = boardSpellRef.current
    const willEat = !!(sp && sp.x === newHead.x && sp.y === newHead.y)
    const body = willEat ? snake : snake.slice(0, -1)
    if (body.some((s) => s.x === newHead.x && s.y === newHead.y)) {
      return gameOver()
    }

    const next = [newHead, ...snake]
    if (willEat && sp) {
      const eaten = sp
      boardSpellRef.current = spawnBoardSpell(next, GRID_SIZE)
      handleEat(eaten)
    } else {
      next.pop()
    }
    snakeRef.current = next
  }, [gameOver, handleEat])

  /* ----------------------- interval -------------------------------- */

  useEffect(() => {
    if (status !== "running") return
    const id = setInterval(step, speed)
    return () => clearInterval(id)
  }, [status, speed, step])

  /* ----------------------- controls ------------------------------- */

  const setDirection = useCallback((d: Direction) => {
    if (d === OPPOSITE[dirRef.current]) return
    nextDirRef.current = d
  }, [])

  const startGame = useCallback(() => {
    // synchronous reset
    snakeRef.current = initialSnake()
    boardSpellRef.current = spawnBoardSpell(snakeRef.current, GRID_SIZE)
    dirRef.current = "RIGHT"; nextDirRef.current = "RIGHT"
    comboRef.current = 0; lastThemeRef.current = null; resonanceRef.current = false
    themeRef.current = null; sceneImgRef.current = null
    collectedRef.current = []; storyRef.current = []
    setCombo(0); setScore(0); setSpeed(INITIAL_SPEED)
    setCollected([]); setStory([])
    setCurrentTheme(null)
    setStoryLoading(false); setSceneLoading(false)
    setStatus("running")
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key
      let d: Direction | null = null
      if (key === "ArrowUp" || key === "w" || key === "W") d = "UP"
      else if (key === "ArrowDown" || key === "s" || key === "S") d = "DOWN"
      else if (key === "ArrowLeft" || key === "a" || key === "A") d = "LEFT"
      else if (key === "ArrowRight" || key === "d" || key === "D") d = "RIGHT"

      if (d) {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
          e.preventDefault()
        }
        if (status === "idle" || status === "over") startGame()
        setDirection(d)
      }
      if (key === " " || key === "Spacebar") {
        e.preventDefault()
        if (status === "running") setStatus("paused")
        else if (status === "paused") setStatus("running")
        else startGame()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [status, setDirection, startGame])

  /* ----------------------- derived -------------------------------- */

  const speedLevel = Math.round(((INITIAL_SPEED - speed) / (INITIAL_SPEED - MIN_SPEED)) * 100)
  const themeColor = getThemeColor(currentTheme)
  const themeSpell = SPELLBOOK.find((s) => s.theme === currentTheme)
  const particleKind: ParticleKind = getParticleKind(currentTheme)
  const resonanceActive = combo >= 1

  const copyStory = useCallback(() => {
    const text =
      `《魔法字贪吃蛇》\n` +
      `收集的咒语：${collected.map((c) => c.spell.word).join(" · ")}\n` +
      `最终得分：${score}\n\n` +
      story.join("\n\n")
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }, [collected, score, story])

  /* ----------------------- UI ------------------------------------- */

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Header */}
      <header className="w-full px-4 py-4 border-b border-white/5 backdrop-blur-sm sticky top-0 z-30 bg-slate-950/60">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="size-9 rounded-xl flex items-center justify-center ring-1 transition-colors"
              style={{
                backgroundColor: hexToRgba(themeColor, 0.16),
                boxShadow: `0 0 18px ${hexToRgba(themeColor, 0.35)}`,
                // ring color via borderColor
                borderColor: hexToRgba(themeColor, 0.4),
              } as React.CSSProperties}
            >
              <Wand2 className="size-4" style={{ color: themeColor }} />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight leading-tight">
                魔法字贪吃蛇
              </h1>
              <p className="text-[11px] text-slate-400 -mt-0.5">
                Spellbound Snake · 吞字成诗
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {themeSpell && (
              <span
                className="hidden sm:inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                style={{
                  backgroundColor: hexToRgba(themeColor, 0.14),
                  color: themeColor,
                }}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: themeColor }} />
                {themeSpell.word} · {themeSpell.theme}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <Trophy className="size-4 text-amber-400" />
              <span className="tabular-nums">{highScore}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 w-full px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
          {/* Game column */}
          <div className="flex flex-col items-center gap-4 mx-auto">
            {/* Score row */}
            <div className="w-full max-w-[440px] grid grid-cols-4 gap-2">
              <Stat icon={<Sparkles className="size-3.5" style={{ color: themeColor }} />} label="得分" value={score} accent={themeColor} />
              <Stat icon={<Trophy className="size-3.5 text-amber-400" />} label="最高" value={highScore} />
              <Stat icon={<Zap className="size-3.5 text-sky-400" />} label="速度" value={`${speedLevel}%`} />
              <Stat
                icon={<Wand2 className="size-3.5" style={{ color: resonanceActive ? themeColor : "#94a3b8" }} />}
                label="共鸣"
                value={resonanceActive ? `×${combo + 1}` : "—"}
                accent={resonanceActive ? themeColor : undefined}
              />
            </div>

            {/* Board */}
            <div className="relative" style={{ width: "min(88vw, 440px)", height: "min(88vw, 440px)" }}>
              <Card
                className={cn(
                  "absolute inset-0 p-2 bg-slate-900/70 border-white/10 overflow-hidden transition-shadow",
                  sceneLoading && "animate-pulse"
                )}
                style={sceneLoading ? { boxShadow: `0 0 0 2px ${hexToRgba(themeColor, 0.5)}, 0 0 30px ${hexToRgba(themeColor, 0.3)}` } : undefined}
              >
                <canvas
                  ref={canvasRef}
                  width={BOARD_PX}
                  height={BOARD_PX}
                  className="block w-full h-full rounded-md"
                />
                <div className="absolute inset-2 rounded-md pointer-events-none ring-1 ring-inset ring-white/5" />
              </Card>

              {/* Particle layer */}
              <div className="absolute inset-2 rounded-md overflow-hidden pointer-events-none">
                <ParticleCanvas
                  theme={particleKind}
                  color={themeColor}
                  size={BOARD_PX}
                  className="w-full h-full"
                />
              </div>

              {/* Loading chips */}
              {(sceneLoading || storyLoading) && (
                <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end z-20">
                  {sceneLoading && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-slate-950/70 border border-white/10 text-slate-300">
                      <Loader2 className="size-3 animate-spin" style={{ color: themeColor }} />
                      氛围生成中
                    </span>
                  )}
                  {storyLoading && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-slate-950/70 border border-white/10 text-slate-300">
                      <Loader2 className="size-3 animate-spin text-amber-300" />
                      故事续写中
                    </span>
                  )}
                </div>
              )}

              {/* Overlays */}
              {status === "idle" && (
                <BoardOverlay>
                  <div className="mb-1 text-[11px] tracking-widest text-slate-400 uppercase">Spellbound Snake</div>
                  <h2 className="text-2xl font-bold mb-2" style={{ color: themeColor }}>魔法字贪吃蛇</h2>
                  <p className="text-sm text-slate-400 mb-5 max-w-xs">
                    吞下散落的魔咒字，世界随之改变。<br />你的每一次选择，都在书写一段故事。
                  </p>
                  <Button onClick={startGame} size="lg" className="font-semibold text-slate-950" style={{ backgroundColor: themeColor }}>
                    <Play className="size-4" /> 开始游戏
                  </Button>
                  <p className="text-[11px] text-slate-500 mt-4">方向键 / WASD 控制方向</p>
                </BoardOverlay>
              )}
              {status === "paused" && (
                <BoardOverlay>
                  <h2 className="text-xl font-bold mb-4">已暂停</h2>
                  <Button onClick={() => setStatus("running")} size="lg" className="font-semibold text-slate-950" style={{ backgroundColor: themeColor }}>
                    <Play className="size-4" /> 继续
                  </Button>
                </BoardOverlay>
              )}
              {status === "over" && (
                <BoardOverlay>
                  <p className="text-rose-400 text-xs mb-1 font-medium tracking-wider uppercase">Game Over</p>
                  <h2 className="text-2xl font-bold mb-1">咒语已尽</h2>
                  <p className="text-slate-400 text-sm mb-1">本局得分</p>
                  <p className="text-3xl font-bold mb-4 tabular-nums" style={{ color: themeColor }}>{score}</p>
                  <Button onClick={startGame} size="lg" className="font-semibold text-slate-950" style={{ backgroundColor: themeColor }}>
                    <RotateCcw className="size-4" /> 再玩一次
                  </Button>
                </BoardOverlay>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {status === "running" ? (
                <Button onClick={() => setStatus("paused")} size="lg" variant="secondary">
                  <Pause className="size-4" /> 暂停
                </Button>
              ) : (
                <Button onClick={startGame} size="lg" className="font-semibold text-slate-950" style={{ backgroundColor: themeColor }}>
                  <Play className="size-4" />
                  {status === "idle" ? "开始游戏" : status === "paused" ? "重新开始" : "再玩一次"}
                </Button>
              )}
              <Button onClick={startGame} size="lg" variant="outline" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white">
                <RotateCcw className="size-4" /> 重置
              </Button>
            </div>
          </div>

          {/* Side column: story + spellbook */}
          <aside className="flex flex-col gap-4 lg:max-h-[calc(100vh-7rem)] lg:sticky lg:top-20">
            {/* Story scroll */}
            <Card className="flex flex-col bg-slate-900/60 border-white/10 min-h-[220px] lg:flex-1 lg:min-h-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                <ScrollText className="size-4 text-amber-300" />
                <h3 className="text-sm font-semibold">故事卷轴</h3>
                {storyLoading && <Loader2 className="size-3.5 animate-spin text-amber-300 ml-auto" />}
              </div>
              <div className="fancy-scroll overflow-y-auto p-4 max-h-[280px] lg:max-h-none lg:flex-1">
                {story.length === 0 ? (
                  <p className="text-sm text-slate-500 italic text-center py-8">
                    故事尚未开始。<br />吞下第一个魔咒字，诗篇便会在此流淌。
                  </p>
                ) : (
                  <div className="space-y-3">
                    {story.map((seg, i) => (
                      <p
                        key={i}
                        className={cn(
                          "text-sm leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-500",
                          collected[i]?.resonance ? "text-slate-100 font-medium" : "text-slate-300"
                        )}
                      >
                        <span className="inline-block mr-1.5 text-[10px] align-middle px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: hexToRgba(collected[i]?.spell.color || "#34d399", 0.18),
                            color: collected[i]?.spell.color || "#34d399",
                          }}>
                          {collected[i]?.spell.word}
                        </span>
                        {collected[i]?.resonance && <Sparkles className="inline size-3 mr-1 text-amber-300" />}
                        {seg}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Spell book */}
            <Card className="bg-slate-900/60 border-white/10">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                <BookOpen className="size-4 text-emerald-300" />
                <h3 className="text-sm font-semibold">咒语书</h3>
                <span className="ml-auto text-[11px] text-slate-500 tabular-nums">{collected.length} 字</span>
              </div>
              <div className="p-4 max-h-[200px] overflow-y-auto fancy-scroll">
                {collected.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-4">
                    还未收集任何魔咒字
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {collected.map((c, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs"
                        style={{
                          backgroundColor: hexToRgba(c.spell.color, 0.14),
                          border: `1px solid ${hexToRgba(c.spell.color, 0.35)}`,
                          color: c.spell.color,
                        }}
                        title={c.spell.desc}
                      >
                        {c.spell.word}
                        {c.resonance && <Sparkles className="size-3" />}
                        {c.spell.rarity === 3 && <span className="text-[9px] opacity-70">★</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto w-full px-4 py-4 border-t border-white/5">
        <p className="text-center text-xs text-slate-500">
          吞下魔咒字 · AI 续写诗篇 · 氛围随之流转 · Built with Next.js + Canvas + z-ai-web-dev-sdk
        </p>
      </footer>

      {/* Game-over ritual modal */}
      {status === "over" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <Card className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-slate-900/95 border-white/10 shadow-2xl">
            <div className="px-6 py-5 border-b border-white/5 text-center">
              <p className="text-[11px] tracking-widest text-slate-500 uppercase mb-1">咒语已尽 · The Tale Ends</p>
              <h2 className="text-2xl font-bold" style={{ color: themeColor }}>魔法字贪吃蛇</h2>
              <p className="text-sm text-slate-400 mt-1">
                得分 <span className="font-bold text-slate-100 tabular-nums">{score}</span>
                <span className="mx-2 text-slate-600">·</span>
                收集 <span className="font-bold text-slate-100 tabular-nums">{collected.length}</span> 字
              </p>
            </div>

            <div className="fancy-scroll overflow-y-auto px-6 py-5 flex-1">
              {collected.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] text-slate-500 mb-2 tracking-wider uppercase">咒语</p>
                  <div className="flex flex-wrap gap-1.5">
                    {collected.map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                        style={{
                          backgroundColor: hexToRgba(c.spell.color, 0.14),
                          border: `1px solid ${hexToRgba(c.spell.color, 0.3)}`,
                          color: c.spell.color,
                        }}>
                        {c.spell.word}
                        {c.resonance && <Sparkles className="size-3" />}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-500 mb-2 tracking-wider uppercase">诗篇</p>
              {story.length === 0 ? (
                <p className="text-sm text-slate-500 italic">这一次，没有故事被书写……</p>
              ) : (
                <div className="space-y-3">
                  {story.map((seg, i) => (
                    <p key={i} className="text-sm leading-relaxed text-slate-200">
                      <span className="inline-block mr-1.5 text-[10px] align-middle px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: hexToRgba(collected[i]?.spell.color || "#34d399", 0.18),
                          color: collected[i]?.spell.color || "#34d399",
                        }}>
                        {collected[i]?.spell.word}
                      </span>
                      {seg}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-white/5 flex flex-wrap items-center justify-end gap-2">
              <Button onClick={copyStory} variant="outline" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white">
                {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                {copied ? "已复制" : "复制故事"}
              </Button>
              <Button onClick={startGame} className="font-semibold text-slate-950" style={{ backgroundColor: themeColor }}>
                <RotateCcw className="size-4" /> 再玩一次
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Presentational helpers                                            */
/* ------------------------------------------------------------------ */

function Stat({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: number | string; accent?: string }) {
  return (
    <Card className="px-2.5 py-2 bg-slate-900/60 border-white/10 flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[10px] text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-base font-bold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </Card>
  )
}

function BoardOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-2 z-20 rounded-md bg-slate-950/82 backdrop-blur-sm flex flex-col items-center justify-center text-center px-4">
      {children}
    </div>
  )
}
