/**
 * Cloudflare Docs Query Utility
 * Provides tools for querying Cloudflare documentation using Workers AI
 */

import type { Env } from "../types";

export interface DocsQueryResult {
  answer: string;
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  confidence: number;
}

export interface DocsQueryOptions {
  query: string;
  topic?: "workers" | "durable-objects" | "d1" | "r2" | "ai" | "agents" | "general" | "cloudflare agents sdk" | "cloudflare actors";
  maxResults?: number;
}

/**
 * Query Cloudflare documentation using Workers AI
 * Uses AI to search and summarize relevant documentation
 */
export async function queryCloudflareDocs(
  env: Env,
  options: DocsQueryOptions,
): Promise<DocsQueryResult> {
  const { query, topic = "general", maxResults = 5 } = options;

  if (!env.AI?.run) {
    throw new Error("Workers AI binding not available");
  }

  // Construct a comprehensive prompt for the AI
  const prompt = `You are a Cloudflare documentation assistant. Answer the following question about Cloudflare services, focusing on ${topic}:

Question: ${query}

Please provide:
1. A clear, concise answer based on Cloudflare's official documentation
2. Relevant code examples if applicable
3. Links to official documentation pages (use developers.cloudflare.com URLs)
4. Best practices and common patterns

Format your response as JSON with:
- answer: The main answer
- sources: Array of {title, url, snippet}
- confidence: Number between 0-1 indicating confidence level`;

  try {
    const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      prompt,
      max_tokens: 2000,
    });

    // Extract text from AI response
    const text = extractTextFromResponse(response);

    // Try to parse as JSON, fallback to structured text
    let result: DocsQueryResult;
    try {
      result = JSON.parse(text);
    } catch {
      // If not JSON, create structured result from text
      result = {
        answer: text,
        sources: extractSources(text),
        confidence: 0.7,
      };
    }

    // Limit sources
    result.sources = result.sources.slice(0, maxResults);

    return result;
  } catch (error) {
    console.error("Error querying Cloudflare docs:", error);
    throw new Error(`Failed to query documentation: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Search specific Cloudflare documentation topics
 */
export async function searchDocsTopic(
  env: Env,
  topic: string,
  question: string,
): Promise<DocsQueryResult> {
  const topicMap: Record<string, DocsQueryOptions["topic"]> = {
    workers: "workers",
    "durable-objects": "durable-objects",
    "durable objects": "durable-objects",
    d1: "d1",
    r2: "r2",
    ai: "ai",
    agents: "cloudflare agents sdk",
    agent: "cloudflare agents sdk",
    "cloudflare agents sdk": "cloudflare agents sdk",
    actors: "cloudflare actors",
    "cloudflare actors": "cloudflare actors",
  };

  const normalizedTopic: DocsQueryOptions["topic"] = topicMap[topic.toLowerCase()] || "general";

  return queryCloudflareDocs(env, {
    query: question,
    topic: normalizedTopic,
  });
}

/**
 * Extract text from various AI response formats
 */
function extractTextFromResponse(response: unknown): string {
  if (typeof response === "string") return response;
  if (typeof response === "object" && response !== null) {
    const obj = response as Record<string, unknown>;
    if (obj.result) return String(obj.result);
    if (obj.response) return String(obj.response);
    if (obj.text) return String(obj.text);
    if (Array.isArray(obj.output)) {
      return obj.output
        .map((item: unknown) => {
          if (typeof item === "object" && item !== null && "text" in item) {
            return String((item as { text: string }).text);
          }
          return String(item);
        })
        .join("\n");
    }
  }
  return JSON.stringify(response);
}

/**
 * Extract documentation sources from text
 */
function extractSources(text: string): Array<{ title: string; url: string; snippet: string }> {
  const sources: Array<{ title: string; url: string; snippet: string }> = [];
  const urlRegex = /https?:\/\/developers\.cloudflare\.com\/[^\s\)]+/g;
  const matches = text.match(urlRegex) || [];

  for (const url of matches.slice(0, 5)) {
    const title = url.split("/").pop()?.replace(/-/g, " ") || "Cloudflare Documentation";
    const snippet = extractSnippetAroundUrl(text, url);
    sources.push({ title, url, snippet });
  }

  // If no URLs found, add default Cloudflare docs links
  if (sources.length === 0) {
    sources.push({
      title: "Cloudflare Workers Documentation",
      url: "https://developers.cloudflare.com/workers/",
      snippet: "Official Cloudflare Workers documentation",
    });
  }

  return sources;
}

/**
 * Extract a snippet of text around a URL
 */
function extractSnippetAroundUrl(text: string, url: string, length = 150): string {
  const index = text.indexOf(url);
  if (index === -1) return "";

  const start = Math.max(0, index - length / 2);
  const end = Math.min(text.length, index + url.length + length / 2);
  let snippet = text.slice(start, end);

  // Clean up snippet
  snippet = snippet.replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}

