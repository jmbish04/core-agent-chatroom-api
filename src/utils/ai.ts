import type { AiAnalysisResult, Env } from "../types";

const DEFAULT_ANALYST_MODEL = "@cf/meta/llama-3-8b-instruct";

type FailureAnalysisInput = {
  testName: string;
  errorCode?: string;
  raw?: unknown;
  context?: Record<string, unknown>;
};

type WorkersAiResponse = {
  result?: string;
  response?: string;
  output?: Array<{ type: string; text?: string }>;
};

const extractText = (response: WorkersAiResponse | string): string => {
  if (typeof response === "string") return response;
  if (response.result) return response.result;
  if (response.response) return response.response;
  if (response.output?.length) {
    return response.output
      .map((item) => ("text" in item && item.text ? item.text : ""))
      .join("\n");
  }
  return "";
};

export const analyzeFailure = async (
  env: Env,
  input: FailureAnalysisInput,
): Promise<AiAnalysisResult | null> => {
  if (!env.AI?.run) {
    console.warn("Workers AI binding missing");
    return null;
  }

  const prompt = `You are an SRE copilot. Analyse the following failed test and provide a human readable summary and a remediation prompt.
Test: ${input.testName}
Error Code: ${input.errorCode ?? "n/a"}
Raw: ${JSON.stringify(input.raw)}
Context: ${JSON.stringify(input.context ?? {})}

Provide your response in this format:
Summary: [human-readable description of the failure]
Remediation: [actionable steps to fix the issue]`;

  try {
    const result = (await env.AI.run(DEFAULT_ANALYST_MODEL, { prompt })) as WorkersAiResponse;
    const text = extractText(result).trim();
    if (!text) {
      return null;
    }

    const summaryMatch = text.match(/Summary:\s*(.+?)(?=Remediation:|$)/is);
    const remedyMatch = text.match(/Remediation:\s*(.+?)$/is);
    
    return {
      description: summaryMatch?.[1]?.trim() || text.split("Remediation:")[0]?.trim() || text,
      fixPrompt: remedyMatch?.[1]?.trim() || "Review failure details and retry when conditions stabilise.",
      raw: result,
    };
  } catch (error) {
    console.error("Workers AI analysis failed", error);
    return null;
  }
};

/**
 * Attempts safe auto-remediation for common failure scenarios
 * Returns remediation notes to append to test result raw JSON
 */
export const attemptSelfHealing = async (
  _env: Env,
  errorCode: string | undefined,
  _testName: string,
  raw: unknown,
): Promise<{ attempted: boolean; remediationNote?: string; raw?: unknown }> => {
  if (!errorCode) {
    return { attempted: false };
  }

  const remediationActions: Record<string, () => Promise<{ success: boolean; note: string }>> = {
    // Retry transient failures
    NO_200: async () => {
      // Could warm cache or retry, but for now just note it
      return {
        success: false,
        note: "Transient failure detected. Consider implementing retry logic with exponential backoff.",
      };
    },
    HANDSHAKE_FAILED: async () => {
      // Could attempt to recreate DO or verify bindings
      return {
        success: false,
        note: "WebSocket handshake failed. Verify Durable Object bindings and room configuration.",
      };
    },
    // For other errors, we could implement KV-based feature flags, cache warming, etc.
  };

  const action = remediationActions[errorCode];
  if (!action) {
    return { attempted: false };
  }

  try {
    const result = await action();
    return {
      attempted: true,
      remediationNote: result.note,
      raw: {
        ...(typeof raw === "object" && raw !== null ? raw : {}),
        selfHealingAttempted: true,
        selfHealingResult: result,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("Self-healing attempt failed", error);
    return {
      attempted: true,
      remediationNote: `Self-healing attempt failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
