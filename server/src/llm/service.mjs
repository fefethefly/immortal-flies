import { hash } from "../../../src/brain/codec.mjs";
import {
  EXPLAINER,
  TOOL_WHITELIST,
  QUESTIONS,
  explainFly,
  retrieveEvents,
  answerQuestion,
  policyCard,
} from "../../../src/brain/flyswarm/explain.mjs";
import { proposePlans, validatePlans, worldView } from "../../../src/brain/flyswarm/world.mjs";
import { pitView } from "../../../src/brain/flyswarm/pit.mjs";
import { AppError, badRequest, unauthorized } from "../shared/errors.mjs";

const WHITELIST_IDS = new Set(TOOL_WHITELIST.map((t) => t.id));

/** codec.hash 拒绝 undefined；审计载荷先 JSON 规范化。 */
async function auditHash(value) {
  return hash(JSON.parse(JSON.stringify(value)));
}

function openaiTools() {
  return TOOL_WHITELIST.map((t) => ({
    type: "function",
    function: {
      name: t.id,
      description: `${t.titleKey} (${t.scopeKey}); sign=${t.sign} write=${t.write} budget=${t.budget}`,
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string" },
          flyId: { type: "number" },
          tick: { type: "number" },
          note: { type: "string" },
        },
      },
    },
  }));
}

function runTool(session, name, args = {}) {
  if (!WHITELIST_IDS.has(name)) {
    return { error: "TOOL_NOT_ALLOWED", name };
  }
  const world = session.world;
  const view = worldView(session);
  switch (name) {
    case "read-market":
      return {
        price: session.kernel.colony.market.price,
        prices: session.aux.prices.slice(-16),
        audit: "SIM",
      };
    case "compute-risk":
      return {
        drawdown: view.risk.drawdown,
        concentrationCapBps: view.risk.concentrationCapBps,
        rejects: view.risk.rejects.slice(0, 8),
      };
    case "query-world":
      return {
        society: view.society,
        pressure: view.pressure,
        events: retrieveEvents(world, { kind: args.kind || null, flyId: args.flyId ?? null, tick: args.tick ?? null }).slice(0, 8),
      };
    case "draft-report":
      return {
        note: args.note || "draft-only",
        policy: policyCard(),
        audit: "SIM",
      };
    case "propose-plan": {
      const plans = proposePlans(session);
      const validated = validatePlans(session, plans);
      return { plans: validated, executed: false };
    }
    default:
      return { error: "TOOL_UNKNOWN", name };
  }
}

/** P1 LLM 服务：解释 / ask / plan / validate；缺席降级到本地确定性解释器。 */
export function createLlmService({ sessions, store, provider, logger }) {
  async function audit(record) {
    try {
      await store.appendLlmAudit(record);
    } catch (err) {
      logger.warn("llm audit write failed", { error: err?.message || String(err) });
    }
  }

  async function requireSession(sessionId, req) {
    const row = await sessions.getRow(sessionId);
    sessions.assertOwner(row, req);
    return row;
  }

  async function explain(body, req) {
    const sessionId = body?.sessionId;
    const flyId = body?.flyId;
    if (!sessionId) throw badRequest("MISSING_SESSION", "sessionId required");
    if (flyId == null) throw badRequest("MISSING_FLY", "flyId required");
    const row = await requireSession(sessionId, req);
    const locale = body?.locale || "zh";
    const local = explainFly(row.session, flyId);
    const contextRefs = local.steps.flatMap((s) => s.refs || []);
    const policy = policyCard();
    const policyHash = await auditHash(policy);
    const promptHash = await auditHash({
      kind: "explain",
      sessionId,
      flyId,
      locale,
      tick: row.session.kernel.colony.tick,
      steps: local.steps,
    });

    let narrative = null;
    let modelId = EXPLAINER.modelId;
    let providerId = EXPLAINER.provider;
    let degraded = true;
    let toolCalls = [];

    if (provider.configured) {
      try {
        const result = await provider.chat({
          messages: [
            {
              role: "system",
              content:
                "You explain Immortal Flyswarm paper-world behavior. Never claim real profit, never invent fills, never request signatures. Cite only provided evidence refs. Reply in the user locale.",
            },
            {
              role: "user",
              content: JSON.stringify({ locale, explanation: local, pit: pitView(row.session).flies.find((f) => f.id === flyId) }),
            },
          ],
          tools: openaiTools(),
          temperature: 0.2,
        });
        modelId = result.modelId;
        providerId = result.provider;
        narrative = result.message?.content || null;
        toolCalls = (result.message?.tool_calls || []).map((c) => ({
          id: c.id,
          name: c.function?.name,
          arguments: c.function?.arguments,
        }));
        for (const call of toolCalls) {
          if (call.name) {
            let args = {};
            try {
              args = JSON.parse(call.arguments || "{}");
            } catch {
              args = {};
            }
            runTool(row.session, call.name, args);
          }
        }
        degraded = false;
      } catch (err) {
        logger.warn("llm explain degraded", { error: err?.message || String(err) });
        degraded = true;
      }
    }

    const payload = {
      schema: "iff.explain/1",
      explainer: { ...EXPLAINER, modelId, provider: providerId, degraded },
      sessionId,
      flyId,
      locale,
      steps: local.steps,
      narrative,
      tools: TOOL_WHITELIST,
      promptHash,
      policyHash,
      contextRefs,
      toolCalls,
      resultHash: null,
    };
    payload.resultHash = await auditHash({
      steps: payload.steps,
      narrative: payload.narrative,
      promptHash,
      policyHash,
    });
    await audit({
      at: Date.now(),
      kind: "explain",
      sessionId,
      modelId,
      provider: providerId,
      promptHash,
      contextRefs,
      toolCalls,
      policyHash,
      resultHash: payload.resultHash,
      degraded,
    });
    return payload;
  }

  async function ask(body, req) {
    const sessionId = body?.sessionId;
    if (!sessionId) throw badRequest("MISSING_SESSION", "sessionId required");
    const row = await requireSession(sessionId, req);
    const locale = body?.locale || "zh";
    const questionId = body?.questionId || null;
    const text = typeof body?.text === "string" ? body.text.slice(0, 500) : "";

    if (questionId) {
      if (!QUESTIONS.some((q) => q.id === questionId)) {
        throw badRequest("UNKNOWN_QUESTION", `Unknown questionId: ${questionId}`);
      }
      const answer = answerQuestion(row.session, questionId);
      const promptHash = await auditHash({ kind: "ask", questionId, tick: row.session.kernel.colony.tick });
      const policyHash = await auditHash(policyCard());
      const resultHash = await auditHash(answer);
      await audit({
        at: Date.now(),
        kind: "ask",
        sessionId,
        modelId: EXPLAINER.modelId,
        provider: EXPLAINER.provider,
        promptHash,
        contextRefs: answer.refs || [],
        toolCalls: [],
        policyHash,
        resultHash,
        degraded: true,
        questionId,
      });
      return {
        schema: "iff.ask/1",
        sessionId,
        questionId,
        answer,
        narrative: null,
        degraded: true,
        promptHash,
        policyHash,
        resultHash,
        catalog: QUESTIONS,
      };
    }

    if (!text) throw badRequest("MISSING_QUESTION", "questionId or text required");

    const hits = retrieveEvents(row.session.world, {});
    const promptHash = await auditHash({ kind: "ask-free", text, tick: row.session.kernel.colony.tick });
    const policyHash = await auditHash(policyCard());
    let narrative = null;
    let degraded = true;
    let modelId = EXPLAINER.modelId;
    let providerId = EXPLAINER.provider;
    let toolCalls = [];

    if (provider.configured) {
      try {
        const result = await provider.chat({
          messages: [
            {
              role: "system",
              content:
                "Answer using only Flyswarm evidence. SIM paper world — no real yields. If unsure, say so. Locale follows user.",
            },
            {
              role: "user",
              content: JSON.stringify({
                locale,
                text,
                society: worldView(row.session).society,
                events: hits.slice(0, 8),
              }),
            },
          ],
          tools: openaiTools(),
        });
        narrative = result.message?.content || null;
        modelId = result.modelId;
        providerId = result.provider;
        toolCalls = (result.message?.tool_calls || []).map((c) => ({
          id: c.id,
          name: c.function?.name,
        }));
        degraded = false;
      } catch (err) {
        logger.warn("llm ask degraded", { error: err?.message || String(err) });
        narrative = "解释层降级：仅返回检索到的事件引用，未生成自然语言。";
      }
    } else {
      narrative = "解释层降级：未配置 LLM，返回检索证据。";
    }

    const answer = {
      key: "ask.free",
      params: { text },
      refs: hits.slice(0, 8).map((h) => h.event.id),
    };
    const resultHash = await auditHash({ answer, narrative });
    await audit({
      at: Date.now(),
      kind: "ask",
      sessionId,
      modelId,
      provider: providerId,
      promptHash,
      contextRefs: answer.refs,
      toolCalls,
      policyHash,
      resultHash,
      degraded,
    });
    return {
      schema: "iff.ask/1",
      sessionId,
      questionId: null,
      text,
      answer,
      narrative,
      degraded,
      promptHash,
      policyHash,
      resultHash,
      catalog: QUESTIONS,
    };
  }

  async function plan(body, req) {
    const sessionId = body?.sessionId;
    if (!sessionId) throw badRequest("MISSING_SESSION", "sessionId required");
    const row = await requireSession(sessionId, req);
    const booksBefore = row.session.kernel.colony.members.map((m) => ({
      id: m.id,
      bnb: m.book.bnb,
      token: m.book.token,
      realized: m.book.realized,
    }));
    const proposed = proposePlans(row.session);
    const validated = validatePlans(row.session, proposed);
    const booksAfter = row.session.kernel.colony.members.map((m) => ({
      id: m.id,
      bnb: m.book.bnb,
      token: m.book.token,
      realized: m.book.realized,
    }));
    const mutated = JSON.stringify(booksBefore) !== JSON.stringify(booksAfter);
    if (mutated) {
      throw new AppError("PLAN_MUTATION", 500, "validatePlans must not mutate books");
    }

    let narrative = null;
    let degraded = true;
    let modelId = EXPLAINER.modelId;
    let providerId = EXPLAINER.provider;
    const promptHash = await auditHash({ kind: "plan", sessionId, tick: row.session.kernel.colony.tick, plans: proposed });
    const policyHash = await auditHash(policyCard());

    if (provider.configured) {
      try {
        const result = await provider.chat({
          messages: [
            {
              role: "system",
              content:
                "You may suggest candidate trading plans for a SIM paper world. Plans are never executed. Do not request signatures or claim yields.",
            },
            {
              role: "user",
              content: JSON.stringify({ plans: validated, society: worldView(row.session).society }),
            },
          ],
        });
        narrative = result.message?.content || null;
        modelId = result.modelId;
        providerId = result.provider;
        degraded = false;
      } catch (err) {
        logger.warn("llm plan degraded", { error: err?.message || String(err) });
      }
    }

    const resultHash = await auditHash({ validated, narrative });
    await audit({
      at: Date.now(),
      kind: "plan",
      sessionId,
      modelId,
      provider: providerId,
      promptHash,
      contextRefs: validated.map((p) => p.id),
      toolCalls: [{ name: "propose-plan" }],
      policyHash,
      resultHash,
      degraded,
    });
    return {
      schema: "iff.plan-bundle/1",
      sessionId,
      plans: validated,
      executed: false,
      narrative,
      degraded,
      promptHash,
      policyHash,
      resultHash,
    };
  }

  async function validate(body, req) {
    const sessionId = body?.sessionId;
    if (!sessionId) throw badRequest("MISSING_SESSION", "sessionId required");
    const row = await requireSession(sessionId, req);
    const plans = Array.isArray(body?.plans) ? body.plans : null;
    if (!plans) throw badRequest("MISSING_PLANS", "plans array required");
    const validated = validatePlans(row.session, plans);
    const policyHash = await auditHash(policyCard());
    const resultHash = await auditHash(validated);
    await audit({
      at: Date.now(),
      kind: "validate",
      sessionId,
      modelId: EXPLAINER.modelId,
      provider: EXPLAINER.provider,
      promptHash: await auditHash({ plans }),
      contextRefs: validated.map((p) => p.id),
      toolCalls: [],
      policyHash,
      resultHash,
      degraded: true,
    });
    return {
      schema: "iff.plan-bundle/1",
      sessionId,
      plans: validated,
      executed: false,
      policyHash,
      resultHash,
    };
  }

  return { explain, ask, plan, validate, TOOL_WHITELIST, QUESTIONS };
}

export { unauthorized };
