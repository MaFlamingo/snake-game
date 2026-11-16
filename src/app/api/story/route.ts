import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const { collectedWords, newWord, currentStory, resonance } = await req.json()

    if (!newWord || typeof newWord !== "string") {
      return NextResponse.json({ error: "newWord is required" }, { status: 400 })
    }

    const words = Array.isArray(collectedWords) ? collectedWords : []
    const story = typeof currentStory === "string" ? currentStory : ""
    const isResonance = Boolean(resonance)

    const systemPrompt =
      `你是一位奇幻诗人与说书人。玩家正在游玩一个吞噬"魔咒字"的贪吃蛇游戏，每吞下一个字，世界便随之改变。` +
      `请用第二人称（"你……"）、诗意而克制的笔触，每次续写 1 到 2 句故事，自然地融入刚吞下的字「${newWord}」及其意象，让故事像河流般向前流淌。` +
      (isResonance
        ? "此时玩家刚刚达成共鸣（连续吞下同主题的字），请写一句富有转折或顿悟意味的句子，推动故事走向新的层次。"
        : "") +
      `不要写标题，不要解释，不要使用引号包裹整段，只输出故事正文，控制在 70 字以内。`

    const userContent = story
      ? `已有故事：\n${story}\n\n已收集的魔咒字：${words.join("、")}\n\n请以刚吞下的「${newWord}」为引，续写 1-2 句。`
      : `游戏刚刚开始。已收集的魔咒字：${words.join("、") || "（无）"}\n\n请以「${newWord}」为引，写下故事的开篇 1-2 句。`

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      thinking: { type: "disabled" },
    })

    const text = completion.choices[0]?.message?.content?.trim() ?? ""

    if (!text) {
      return NextResponse.json(
        { text: `你吞下了「${newWord}」，世界轻轻颤动了一下……` },
        { status: 200 }
      )
    }

    return NextResponse.json({ text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json(
      { text: `你吞下了魔咒字，一阵迷雾遮蔽了前路……（${msg}）` },
      { status: 200 }
    )
  }
}
