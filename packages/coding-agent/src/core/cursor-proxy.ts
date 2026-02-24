/**
 * Cursor proxy provider: discovers models from a local cursor_agent_proxy server.
 * The proxy exposes GET /v1/models (OpenAI-compatible) and handles Cursor auth internally.
 */

import type { ProviderConfigInput } from "./model-registry.js";

export const CURSOR_PROXY_BASE_URL = process.env.CURSOR_PROXY_BASE_URL?.trim() || "http://127.0.0.1:3333/v1";

const DEFAULT_CONTEXT_WINDOW = 200_000;
const DEFAULT_MAX_TOKENS = 8_192;
const DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const MODEL_SPECS: Array<{
	match: (id: string) => boolean;
	contextWindow: number;
	maxTokens: number;
}> = [
	{ match: (id) => /claude.*thinking/i.test(id), contextWindow: 200_000, maxTokens: 16_000 },
	{ match: (id) => /claude/i.test(id), contextWindow: 200_000, maxTokens: 8_192 },
	{ match: (id) => /gemini.*pro/i.test(id), contextWindow: 2_000_000, maxTokens: 65_536 },
	{ match: (id) => /gemini.*flash/i.test(id), contextWindow: 1_000_000, maxTokens: 65_536 },
	{ match: (id) => /gemini/i.test(id), contextWindow: 1_000_000, maxTokens: 65_536 },
	{ match: (id) => /grok-code/i.test(id), contextWindow: 256_000, maxTokens: 128_000 },
	{ match: (id) => /grok-4/i.test(id), contextWindow: 256_000, maxTokens: 128_000 },
	{ match: (id) => /grok-3/i.test(id), contextWindow: 131_072, maxTokens: 32_768 },
	{ match: (id) => /grok/i.test(id), contextWindow: 131_072, maxTokens: 32_768 },
	{ match: (id) => /gpt-5/i.test(id), contextWindow: 400_000, maxTokens: 128_000 },
	{ match: (id) => /gpt-4\.1/i.test(id), contextWindow: 1_047_576, maxTokens: 32_768 },
	{ match: (id) => /\bo[34]/i.test(id), contextWindow: 200_000, maxTokens: 100_000 },
	{ match: (id) => /gpt-4o/i.test(id), contextWindow: 128_000, maxTokens: 16_384 },
	{ match: (id) => /deepseek/i.test(id), contextWindow: 128_000, maxTokens: 8_192 },
];

/** @internal Exported for testing. */
export function resolveModelSpec(modelId: string): { contextWindow: number; maxTokens: number } {
	for (const spec of MODEL_SPECS) {
		if (spec.match(modelId)) {
			return { contextWindow: spec.contextWindow, maxTokens: spec.maxTokens };
		}
	}
	return { contextWindow: DEFAULT_CONTEXT_WINDOW, maxTokens: DEFAULT_MAX_TOKENS };
}

export interface CursorProxyModel {
	id: string;
	object: string;
	created: number;
	owned_by: string;
	display_name?: string;
}

interface CursorProxyModelsResponse {
	object: string;
	data: CursorProxyModel[];
}

/** @internal Exported for testing. Parse a proxy /models response into a ProviderConfigInput. */
export function parseCursorProxyModels(models: CursorProxyModel[], baseUrl: string): ProviderConfigInput {
	const parsed = models.map((model) => {
		const modelId = model.id;
		const lower = modelId.toLowerCase();
		const isReasoning =
			lower.includes("r1") ||
			lower.includes("reasoning") ||
			lower.includes("thinking") ||
			lower.includes("o1") ||
			lower.includes("o3") ||
			lower.includes("o4");
		const { contextWindow, maxTokens } = resolveModelSpec(modelId);

		return {
			id: modelId,
			name: model.display_name || modelId,
			reasoning: isReasoning,
			input: ["text"] as ("text" | "image")[],
			cost: DEFAULT_COST,
			contextWindow,
			maxTokens,
		};
	});

	return {
		baseUrl,
		api: "openai-completions",
		apiKey: "none",
		models: parsed,
	};
}

/**
 * Discover models from the cursor_agent_proxy server and return a ProviderConfigInput
 * ready for ModelRegistry.registerProvider(). Returns null if the proxy is unreachable.
 */
export async function discoverCursorProxyProvider(): Promise<ProviderConfigInput | null> {
	if (process.env.VITEST || process.env.NODE_ENV === "test") {
		return null;
	}

	try {
		const response = await fetch(`${CURSOR_PROXY_BASE_URL}/models`, {
			signal: AbortSignal.timeout(3000),
		});
		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as CursorProxyModelsResponse;
		if (!Array.isArray(data.data) || data.data.length === 0) {
			return null;
		}

		return parseCursorProxyModels(data.data, CURSOR_PROXY_BASE_URL);
	} catch {
		return null;
	}
}
