import { AppError } from "../shared/errors.mjs";

/** OpenAI 兼容 chat completions（DeepSeek / OpenAI）。测试可注入 fetchImpl。 */
export function createOpenAIProvider({ baseUrl, apiKey, model, fetchImpl = fetch } = {}) {
  const configured = Boolean(apiKey);

  async function chat({ messages, tools = null, temperature = 0.2 } = {}) {
    if (!configured) {
      throw new AppError("LLM_UNAVAILABLE", 503, "OPENAI_API_KEY not configured");
    }
    const body = {
      model,
      messages,
      temperature,
    };
    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = "auto";
    }
    const res = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AppError("LLM_PROVIDER_ERROR", 502, `Provider HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    if (!choice) throw new AppError("LLM_PROVIDER_ERROR", 502, "Empty provider response");
    return {
      modelId: data.model || model,
      provider: baseUrl,
      message: choice,
      usage: data.usage || null,
      raw: data,
    };
  }

  return {
    configured,
    model,
    baseUrl,
    chat,
  };
}

/** 测试用假 provider：不打网，返回固定叙述。 */
export function createFakeProvider({ narrative = "本地假模型：行为由规则解释，非收益承诺。" } = {}) {
  return {
    configured: true,
    model: "fake-llm-v1",
    baseUrl: "fake://local",
    async chat() {
      return {
        modelId: "fake-llm-v1",
        provider: "fake://local",
        message: { role: "assistant", content: narrative },
        usage: null,
        raw: null,
      };
    },
  };
}
