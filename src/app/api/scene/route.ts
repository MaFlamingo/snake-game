import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { SPELLBOOK } from "@/lib/spellbook"

export const runtime = "nodejs"

// In-memory cache keyed by theme. Survives across requests in the same server
// process so the same atmosphere is only ever generated once.
const cache = new Map<string, string>()

export async function POST(req: NextRequest) {
  try {
    const { theme } = await req.json()

    if (!theme || typeof theme !== "string") {
      return NextResponse.json({ error: "theme is required" }, { status: 400 })
    }

    const spell = SPELLBOOK.find((s) => s.theme === theme)
    if (!spell) {
      return NextResponse.json({ error: "unknown theme" }, { status: 400 })
    }

    if (cache.has(theme)) {
      return NextResponse.json({ image: cache.get(theme), cached: true, theme })
    }

    const prompt =
      `Atmospheric top-down game board background, ${spell.keywords}, ` +
      `dark vignette around edges, cinematic, dreamlike, painterly digital art, ` +
      `no text, no characters, no UI elements, high detail, 4k`

    const zai = await ZAI.create()
    const response = await zai.images.generations.create({
      prompt,
      size: "1024x1024",
    })

    const base64 = response.data?.[0]?.base64
    if (!base64) {
      return NextResponse.json({ error: "no image returned" }, { status: 502 })
    }

    const dataUrl = `data:image/png;base64,${base64}`
    cache.set(theme, dataUrl)

    return NextResponse.json({ image: dataUrl, cached: false, theme })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
