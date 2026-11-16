"use client"

import { useEffect, useRef } from "react"
import type { ParticleKind } from "@/lib/spellbook"

interface P {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
  life: number
  maxLife: number
  rot: number
  vr: number
}

interface Props {
  theme: ParticleKind | null
  color: string
  size: number
  className?: string
}

/**
 * A self-contained particle field rendered on its own canvas with an internal
 * RAF loop. The visual behaviour is driven entirely by `theme` + `color`.
 */
export function ParticleCanvas({ theme, color, size, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<P[]>([])
  const themeRef = useRef<ParticleKind | null>(theme)
  const colorRef = useRef<string>(color)
  const flashRef = useRef<number>(0)

  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { colorRef.current = color }, [color])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    let raf = 0
    let last = performance.now()

    const spawnRate: Record<ParticleKind, number> = {
      wind: 0.5, fireflies: 0.4, bubbles: 0.35, rain: 1.4,
      snow: 0.6, embers: 0.6, mist: 0.18, sparkles: 0.7, stars: 0.15,
    }

    const make = (t: ParticleKind): P => {
      const base: P = {
        x: Math.random() * W, y: Math.random() * H,
        vx: 0, vy: 0, size: 2, alpha: 0.6,
        life: 0, maxLife: 200, rot: Math.random() * Math.PI * 2, vr: 0,
      }
      switch (t) {
        case "wind":
          base.vx = 0.6 + Math.random() * 0.8; base.vy = 0.15 + Math.random() * 0.2
          base.y = Math.random() * H; base.size = 1 + Math.random() * 2
          base.alpha = 0.2 + Math.random() * 0.3; base.maxLife = 300; break
        case "fireflies":
          base.vx = (Math.random() - 0.5) * 0.3; base.vy = -0.2 - Math.random() * 0.3
          base.size = 1 + Math.random() * 1.8; base.alpha = 0.5 + Math.random() * 0.5
          base.maxLife = 240 + Math.random() * 120; break
        case "bubbles":
          base.vx = Math.sin(base.x) * 0.2; base.vy = -0.3 - Math.random() * 0.4
          base.size = 2 + Math.random() * 4; base.alpha = 0.3 + Math.random() * 0.3
          base.y = H + 5; base.maxLife = 280; break
        case "rain":
          base.vx = -0.4; base.vy = 6 + Math.random() * 4
          base.size = 1; base.alpha = 0.35; base.y = -5
          base.maxLife = 120; break
        case "snow":
          base.vx = (Math.random() - 0.5) * 0.4; base.vy = 0.4 + Math.random() * 0.6
          base.size = 1.5 + Math.random() * 2.5; base.alpha = 0.5 + Math.random() * 0.4
          base.y = -5; base.maxLife = 360; break
        case "embers":
          base.vx = (Math.random() - 0.5) * 0.3; base.vy = -0.5 - Math.random() * 0.8
          base.size = 1 + Math.random() * 2; base.alpha = 0.6 + Math.random() * 0.4
          base.y = H + 5; base.maxLife = 200; break
        case "mist":
          base.vx = (Math.random() - 0.5) * 0.2; base.vy = -0.05 - Math.random() * 0.1
          base.size = 30 + Math.random() * 40; base.alpha = 0.04 + Math.random() * 0.05
          base.maxLife = 400; break
        case "sparkles":
          base.vx = 0; base.vy = (Math.random() - 0.5) * 0.1
          base.size = 1 + Math.random() * 2; base.alpha = 0.7
          base.maxLife = 80 + Math.random() * 80; break
        case "stars":
          base.vx = 0; base.vy = 0; base.size = 0.6 + Math.random() * 1.6
          base.alpha = 0.3 + Math.random() * 0.6; base.maxLife = 300; break
      }
      return base
    }

    const loop = (now: number) => {
      const dt = Math.min(60, now - last)
      last = now
      const t = themeRef.current ?? "fireflies"
      const c = colorRef.current
      const particles = particlesRef.current

      // spawn
      const rate = spawnRate[t]
      const spawns = rate * (dt / 16)
      let acc = spawns
      while (acc >= 1) {
        if (particles.length < 220) particles.push(make(t))
        acc -= 1
      }
      if (Math.random() < acc && particles.length < 220) particles.push(make(t))

      // thunder flash for rain theme
      if (t === "rain" && Math.random() < 0.003) flashRef.current = 1

      ctx.clearRect(0, 0, W, H)

      // update + draw
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life += dt
        p.x += p.vx * (dt / 16)
        p.y += p.vy * (dt / 16)
        p.rot += p.vr * (dt / 16)

        const lifeRatio = p.life / p.maxLife
        let a = p.alpha
        if (t === "fireflies" || t === "sparkles" || t === "stars") {
          a = p.alpha * (0.4 + 0.6 * Math.sin(p.life * 0.05))
        } else {
          if (lifeRatio > 0.7) a = p.alpha * (1 - (lifeRatio - 0.7) / 0.3)
        }

        if (p.life > p.maxLife || p.y < -10 || p.y > H + 10 || p.x < -10 || p.x > W + 10) {
          particles.splice(i, 1)
          continue
        }

        ctx.globalAlpha = Math.max(0, Math.min(1, a))
        drawParticle(ctx, p, t, c)
      }
      ctx.globalAlpha = 1

      // thunder flash overlay
      if (flashRef.current > 0) {
        ctx.fillStyle = `rgba(250, 204, 21, ${flashRef.current * 0.25})`
        ctx.fillRect(0, 0, W, H)
        flashRef.current = Math.max(0, flashRef.current - dt / 220)
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    />
  )
}

function drawParticle(ctx: CanvasRenderingContext2D, p: P, t: ParticleKind, color: string) {
  ctx.fillStyle = color
  ctx.strokeStyle = color
  switch (t) {
    case "wind":
      ctx.lineWidth = p.size
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx * 12, p.y - p.vy * 12)
      ctx.stroke()
      break
    case "rain":
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3)
      ctx.stroke()
      break
    case "mist":
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      break
    case "sparkles":
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.beginPath()
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2)
        ctx.moveTo(0, 0)
        ctx.lineTo(0, p.size * 3)
      }
      ctx.lineWidth = 0.8
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, p.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      break
    case "snow":
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      break
    case "bubbles":
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.stroke()
      break
    default: // fireflies, embers, stars -> soft glow dot
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      break
  }
}
