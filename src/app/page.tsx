'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Play, RotateCcw, Pause, Trophy, Apple, Gauge
} from "lucide-react"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Game configuration                                                 */
/* ------------------------------------------------------------------ */

const GRID_SIZE = 20            // 20 x 20 board
const CELL = 22                // pixel size of each cell
const BOARD_PX = GRID_SIZE * CELL
const INITIAL_SPEED = 160      // ms per tick
const MIN_SPEED = 70           // fastest the snake can go
const SPEED_STEP = 4           // speed up per food eaten

type Point = { x: number; y: number }
type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT"
type Status = "idle" | "running" | "paused" | "over"

const DIR_VECTORS: Record<Direction, Point> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
}

const OPPOSITE: Record<Direction, Direction> = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT",
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function equal(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y
}

function randomFood(snake: Point[]): Point {
  // pick a random cell that is not occupied by the snake
  let p: Point
  do {
    p = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    }
  } while (snake.some((s) => equal(s, p)))
  return p
}

function initialSnake(): Point[] {
  const cy = Math.floor(GRID_SIZE / 2)
  const cx = Math.floor(GRID_SIZE / 2)
  // head first, tail last. Snake starts moving RIGHT.
  return [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ]
}

/* ------------------------------------------------------------------ */
/*  Canvas helper (module scope)                                       */
/* ------------------------------------------------------------------ */

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

// stable initial state computed once at module load
const INITIAL_SNAKE = initialSnake()
const INITIAL_FOOD = randomFood(INITIAL_SNAKE)

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // mutable game state lives in refs so the interval loop stays stable
  const snakeRef = useRef<Point[]>(INITIAL_SNAKE)
  const foodRef = useRef<Point>(INITIAL_FOOD)
  const dirRef = useRef<Direction>("RIGHT")
  const nextDirRef = useRef<Direction>("RIGHT")
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // UI-facing state
  const [status, setStatus] = useState<Status>("idle")
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [speed, setSpeed] = useState(INITIAL_SPEED)

  /* ----------------------- rendering ------------------------------ */

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // background
    ctx.fillStyle = "#0b1220"
    ctx.fillRect(0, 0, BOARD_PX, BOARD_PX)

    // subtle grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)"
    ctx.lineWidth = 1
    for (let i = 1; i < GRID_SIZE; i++) {
      ctx.beginPath()
      ctx.moveTo(i * CELL + 0.5, 0)
      ctx.lineTo(i * CELL + 0.5, BOARD_PX)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * CELL + 0.5)
      ctx.lineTo(BOARD_PX, i * CELL + 0.5)
      ctx.stroke()
    }

    // food (pulsing apple-like dot)
    const food = foodRef.current
    const fx = food.x * CELL + CELL / 2
    const fy = food.y * CELL + CELL / 2
    const fr = CELL / 2 - 3
    const glow = ctx.createRadialGradient(fx, fy, 1, fx, fy, fr + 6)
    glow.addColorStop(0, "rgba(248,113,113,0.55)")
    glow.addColorStop(1, "rgba(248,113,113,0)")
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(fx, fy, fr + 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#f87171"
    ctx.beginPath()
    ctx.arc(fx, fy, fr, 0, Math.PI * 2)
    ctx.fill()
    // little leaf
    ctx.fillStyle = "#4ade80"
    ctx.beginPath()
    ctx.ellipse(fx + 2, fy - fr + 1, 2, 3, -0.6, 0, Math.PI * 2)
    ctx.fill()

    // snake
    const snake = snakeRef.current
    snake.forEach((seg, i) => {
      const isHead = i === 0
      const t = i / Math.max(snake.length - 1, 1)
      // head bright emerald -> tail deeper teal
      const r = Math.round(52 + (16 - 52) * t)
      const g = Math.round(211 + (185 - 211) * t)
      const b = Math.round(153 + (129 - 153) * t)
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`

      const pad = isHead ? 2 : 3
      const x = seg.x * CELL + pad
      const y = seg.y * CELL + pad
      const w = CELL - pad * 2
      const radius = isHead ? 7 : 5
      roundRect(ctx, x, y, w, w, radius)
      ctx.fill()

      // eyes on the head
      if (isHead) {
        const v = DIR_VECTORS[dirRef.current]
        const cx = seg.x * CELL + CELL / 2
        const cy = seg.y * CELL + CELL / 2
        const eyeOffset = 4
        const ex1 = cx - v.y * eyeOffset - v.x * 2
        const ey1 = cy + v.x * eyeOffset - v.y * 2
        const ex2 = cx + v.y * eyeOffset - v.x * 2
        const ey2 = cy - v.x * eyeOffset - v.y * 2
        ctx.fillStyle = "#0b1220"
        ctx.beginPath()
        ctx.arc(ex1, ey1, 2.2, 0, Math.PI * 2)
        ctx.arc(ex2, ey2, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
    })
  }, [])

  /* ----------------------- core loop ------------------------------ */

  const gameOver = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    setStatus("over")
  }, [])

  const step = useCallback(() => {
    const dir = nextDirRef.current
    dirRef.current = dir
    const v = DIR_VECTORS[dir]

    const snake = snakeRef.current
    const head = snake[0]
    const newHead: Point = { x: head.x + v.x, y: head.y + v.y }

    // wall collision
    if (
      newHead.x < 0 || newHead.x >= GRID_SIZE ||
      newHead.y < 0 || newHead.y >= GRID_SIZE
    ) {
      return gameOver()
    }

    // self collision (ignore tail tip because it will move, unless we grow)
    const willEat = equal(newHead, foodRef.current)
    const bodyToCheck = willEat ? snake : snake.slice(0, -1)
    if (bodyToCheck.some((s) => equal(s, newHead))) {
      return gameOver()
    }

    const next = [newHead, ...snake]
    if (willEat) {
      foodRef.current = randomFood(next)
      setScore((s) => {
        const ns = s + 10
        setHighScore((h) => Math.max(h, ns))
        return ns
      })
      setSpeed((sp) => Math.max(MIN_SPEED, sp - SPEED_STEP))
    } else {
      next.pop()
    }
    snakeRef.current = next
    draw()
  }, [draw, gameOver])

  /* ----------------------- controls ------------------------------ */

  const setDirection = useCallback((d: Direction) => {
    // can't reverse directly into yourself
    if (d === OPPOSITE[dirRef.current]) return
    nextDirRef.current = d
  }, [])

  /* ----------------------- lifecycle ----------------------------- */

  const startGame = useCallback(() => {
    snakeRef.current = initialSnake()
    foodRef.current = randomFood(snakeRef.current)
    dirRef.current = "RIGHT"
    nextDirRef.current = "RIGHT"
    setScore(0)
    setSpeed(INITIAL_SPEED)
    setStatus("running")
    draw()
  }, [draw])

  const pauseGame = useCallback(() => setStatus("paused"), [])
  const resumeGame = useCallback(() => setStatus("running"), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key
      let d: Direction | null = null
      if (key === "ArrowUp" || key === "w" || key === "W") d = "UP"
      else if (key === "ArrowDown" || key === "s" || key === "S") d = "DOWN"
      else if (key === "ArrowLeft" || key === "a" || key === "A") d = "LEFT"
      else if (key === "ArrowRight" || key === "d" || key === "D") d = "RIGHT"

      if (d) {
        // prevent page scroll for arrows / space
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
          e.preventDefault()
        }
        if (status === "idle" || status === "over") {
          startGame()
        }
        setDirection(d)
      }

      if (key === " " || key === "Spacebar") {
        e.preventDefault()
        if (status === "running") pauseGame()
        else if (status === "paused") resumeGame()
        else if (status === "idle" || status === "over") startGame()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [status, setDirection, startGame, pauseGame, resumeGame])

  // (re)create the interval whenever speed or status changes
  useEffect(() => {
    if (status !== "running") return
    tickRef.current = setInterval(step, speed)
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
  }, [status, speed, step])

  // initial paint
  useEffect(() => {
    draw()
  }, [draw])

  /* ----------------------- UI ------------------------------------ */

  const speedLevel = Math.round(((INITIAL_SPEED - speed) / (INITIAL_SPEED - MIN_SPEED)) * 100)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Header */}
      <header className="w-full px-4 py-5 border-b border-white/5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/30 flex items-center justify-center">
              <span className="text-emerald-400 font-bold text-lg">S</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">贪吃蛇</h1>
              <p className="text-xs text-slate-400 -mt-0.5">Snake Game</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Trophy className="size-4 text-amber-400" />
            <span>最高 {highScore}</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 w-full px-4 py-6 sm:py-10">
        <div className="max-w-5xl mx-auto grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
          {/* Game panel */}
          <div className="flex flex-col items-center gap-5">
            {/* Score bar */}
            <div className="w-full max-w-[440px] grid grid-cols-3 gap-3">
              <StatCard icon={<Apple className="size-4 text-rose-400" />} label="得分" value={score} />
              <StatCard icon={<Trophy className="size-4 text-amber-400" />} label="最高" value={highScore} />
              <StatCard icon={<Gauge className="size-4 text-emerald-400" />} label="速度" value={`${speedLevel}%`} />
            </div>

            {/* Board */}
            <div className="relative">
              <Card className="p-2 bg-slate-900/60 border-white/10 shadow-2xl shadow-emerald-950/30 backdrop-blur">
                <canvas
                  ref={canvasRef}
                  width={BOARD_PX}
                  height={BOARD_PX}
                  className="block rounded-md"
                  style={{ width: "min(86vw, 440px)", height: "min(86vw, 440px)" }}
                />
              </Card>

              {/* Overlays */}
              {status === "idle" && (
                <Overlay>
                  <p className="text-slate-300 text-sm mb-1">准备好了吗？</p>
                  <h2 className="text-2xl font-bold mb-4">开始游戏</h2>
                  <Button onClick={startGame} size="lg" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold">
                    <Play className="size-4" /> 开始
                  </Button>
                  <p className="text-xs text-slate-500 mt-4">方向键 / WASD 控制方向</p>
                </Overlay>
              )}

              {status === "paused" && (
                <Overlay>
                  <h2 className="text-2xl font-bold mb-4">已暂停</h2>
                  <Button onClick={resumeGame} size="lg" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold">
                    <Play className="size-4" /> 继续
                  </Button>
                </Overlay>
              )}

              {status === "over" && (
                <Overlay>
                  <p className="text-rose-400 text-sm mb-1 font-medium">游戏结束</p>
                  <h2 className="text-2xl font-bold mb-1">Game Over</h2>
                  <p className="text-slate-300 mb-4">
                    本局得分 <span className="text-emerald-400 font-bold text-lg">{score}</span>
                  </p>
                  <Button onClick={startGame} size="lg" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold">
                    <RotateCcw className="size-4" /> 重新开始
                  </Button>
                </Overlay>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {status !== "running" ? (
                <Button
                  onClick={startGame}
                  size="lg"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold"
                >
                  <Play className="size-4" />
                  {status === "idle" ? "开始游戏" : status === "paused" ? "重新开始" : "再玩一次"}
                </Button>
              ) : (
                <Button onClick={pauseGame} size="lg" variant="secondary">
                  <Pause className="size-4" /> 暂停
                </Button>
              )}
              <Button onClick={startGame} size="lg" variant="outline" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white">
                <RotateCcw className="size-4" /> 重置
              </Button>
            </div>
          </div>

          {/* Side: controls + help */}
          <aside className="w-full lg:w-72 flex flex-col gap-4">
            {/* D-Pad */}
            <Card className="p-5 bg-slate-900/60 border-white/10">
              <h3 className="text-sm font-semibold mb-3 text-slate-200">触屏控制</h3>
              <div className="grid grid-cols-3 grid-rows-3 gap-2 w-44 mx-auto">
                <span />
                <DPadButton dir="UP" onDir={setDirection} disabled={status !== "running"}>
                  <ArrowUp className="size-5" />
                </DPadButton>
                <span />
                <DPadButton dir="LEFT" onDir={setDirection} disabled={status !== "running"}>
                  <ArrowLeft className="size-5" />
                </DPadButton>
                <div className="flex items-center justify-center">
                  <div className="size-2 rounded-full bg-emerald-400/60" />
                </div>
                <DPadButton dir="RIGHT" onDir={setDirection} disabled={status !== "running"}>
                  <ArrowRight className="size-5" />
                </DPadButton>
                <span />
                <DPadButton dir="DOWN" onDir={setDirection} disabled={status !== "running"}>
                  <ArrowDown className="size-5" />
                </DPadButton>
                <span />
              </div>
            </Card>

            {/* How to play */}
            <Card className="p-5 bg-slate-900/60 border-white/10">
              <h3 className="text-sm font-semibold mb-3 text-slate-200">玩法说明</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex gap-2">
                  <span className="text-emerald-400">·</span>
                  使用 <Kbd>↑</Kbd> <Kbd>↓</Kbd> <Kbd>←</Kbd> <Kbd>→</Kbd> 或 <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> 控制方向
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">·</span>
                  吃到红色食物得 10 分，蛇会变长
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">·</span>
                  撞到墙壁或自己的身体游戏结束
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">·</span>
                  按 <Kbd>Space</Kbd> 暂停 / 继续
                </li>
              </ul>
            </Card>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto w-full px-4 py-4 border-t border-white/5">
        <p className="text-center text-xs text-slate-500">
          用方向键开始你的贪吃蛇之旅 · Built with Next.js + Canvas
        </p>
      </footer>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Small presentational helpers                                       */
/* ------------------------------------------------------------------ */

function StatCard({
  icon, label, value
}: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card className="px-3 py-2.5 bg-slate-900/60 border-white/10 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </Card>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-2 rounded-md bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center text-center px-4">
      {children}
    </div>
  )
}

function DPadButton({
  dir, onDir, disabled, children,
}: {
  dir: Direction
  onDir: (d: Direction) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onDir(dir)}
      className={cn(
        "h-12 rounded-lg flex items-center justify-center transition-colors",
        "bg-white/5 border border-white/10 text-slate-200",
        "hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-400/40",
        "active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:text-slate-200"
      )}
      aria-label={dir}
    >
      {children}
    </button>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded border border-white/15 bg-white/5 text-[11px] font-mono text-slate-200">
      {children}
    </kbd>
  )
}
