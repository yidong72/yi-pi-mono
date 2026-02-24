import { describe, expect, test } from "vitest";
import { type CursorProxyModel, parseCursorProxyModels, resolveModelSpec } from "../src/core/cursor-proxy.js";

describe("resolveModelSpec", () => {
	test("claude thinking gets extended maxTokens", () => {
		const spec = resolveModelSpec("claude-opus-4-6-thinking");
		expect(spec.contextWindow).toBe(200_000);
		expect(spec.maxTokens).toBe(16_000);
	});

	test("claude non-thinking gets standard maxTokens", () => {
		const spec = resolveModelSpec("claude-opus-4-6");
		expect(spec.contextWindow).toBe(200_000);
		expect(spec.maxTokens).toBe(8_192);
	});

	test("gemini pro", () => {
		const spec = resolveModelSpec("gemini-2.5-pro");
		expect(spec.contextWindow).toBe(2_000_000);
		expect(spec.maxTokens).toBe(65_536);
	});

	test("gemini flash", () => {
		const spec = resolveModelSpec("gemini-2.5-flash");
		expect(spec.contextWindow).toBe(1_000_000);
		expect(spec.maxTokens).toBe(65_536);
	});

	test("grok-code", () => {
		const spec = resolveModelSpec("grok-code-fast-1");
		expect(spec.contextWindow).toBe(256_000);
		expect(spec.maxTokens).toBe(128_000);
	});

	test("grok-4", () => {
		const spec = resolveModelSpec("grok-4-fast");
		expect(spec.contextWindow).toBe(256_000);
		expect(spec.maxTokens).toBe(128_000);
	});

	test("grok-3 fallback", () => {
		const spec = resolveModelSpec("grok-3-mini");
		expect(spec.contextWindow).toBe(131_072);
		expect(spec.maxTokens).toBe(32_768);
	});

	test("gpt-5", () => {
		const spec = resolveModelSpec("gpt-5.1-codex");
		expect(spec.contextWindow).toBe(400_000);
		expect(spec.maxTokens).toBe(128_000);
	});

	test("gpt-4.1", () => {
		const spec = resolveModelSpec("gpt-4.1");
		expect(spec.contextWindow).toBe(1_047_576);
		expect(spec.maxTokens).toBe(32_768);
	});

	test("o3", () => {
		const spec = resolveModelSpec("o3-mini");
		expect(spec.contextWindow).toBe(200_000);
		expect(spec.maxTokens).toBe(100_000);
	});

	test("gpt-4o", () => {
		const spec = resolveModelSpec("gpt-4o");
		expect(spec.contextWindow).toBe(128_000);
		expect(spec.maxTokens).toBe(16_384);
	});

	test("deepseek", () => {
		const spec = resolveModelSpec("deepseek-v3");
		expect(spec.contextWindow).toBe(128_000);
		expect(spec.maxTokens).toBe(8_192);
	});

	test("unknown model gets defaults", () => {
		const spec = resolveModelSpec("some-unknown-model");
		expect(spec.contextWindow).toBe(200_000);
		expect(spec.maxTokens).toBe(8_192);
	});
});

describe("parseCursorProxyModels", () => {
	function makeModel(id: string, displayName?: string): CursorProxyModel {
		return { id, object: "model", created: 0, owned_by: "cursor", display_name: displayName };
	}

	test("returns correct provider config structure", () => {
		const result = parseCursorProxyModels([makeModel("claude-opus-4-6")], "http://localhost:3333/v1");
		expect(result.baseUrl).toBe("http://localhost:3333/v1");
		expect(result.api).toBe("openai-completions");
		expect(result.apiKey).toBe("none");
		expect(result.models).toHaveLength(1);
	});

	test("uses display_name when available", () => {
		const result = parseCursorProxyModels(
			[makeModel("claude-opus-4-6", "Claude Opus 4.6")],
			"http://localhost:3333/v1",
		);
		expect(result.models![0].name).toBe("Claude Opus 4.6");
	});

	test("falls back to id when no display_name", () => {
		const result = parseCursorProxyModels([makeModel("claude-opus-4-6")], "http://localhost:3333/v1");
		expect(result.models![0].name).toBe("claude-opus-4-6");
	});

	test("detects reasoning models", () => {
		const result = parseCursorProxyModels(
			[
				makeModel("claude-opus-4-6-thinking"),
				makeModel("o3-mini"),
				makeModel("o4-preview"),
				makeModel("deepseek-r1"),
				makeModel("claude-opus-4-6"),
				makeModel("gpt-4o"),
			],
			"http://localhost:3333/v1",
		);
		const names = result.models!.map((m) => ({ id: m.id, reasoning: m.reasoning }));
		expect(names).toEqual([
			{ id: "claude-opus-4-6-thinking", reasoning: true },
			{ id: "o3-mini", reasoning: true },
			{ id: "o4-preview", reasoning: true },
			{ id: "deepseek-r1", reasoning: true },
			{ id: "claude-opus-4-6", reasoning: false },
			{ id: "gpt-4o", reasoning: false },
		]);
	});

	test("resolves model specs per family", () => {
		const result = parseCursorProxyModels(
			[makeModel("claude-opus-4-6"), makeModel("gpt-5.1-codex"), makeModel("gemini-2.5-pro")],
			"http://localhost:3333/v1",
		);
		const specs = result.models!.map((m) => ({
			id: m.id,
			contextWindow: m.contextWindow,
			maxTokens: m.maxTokens,
		}));
		expect(specs).toEqual([
			{ id: "claude-opus-4-6", contextWindow: 200_000, maxTokens: 8_192 },
			{ id: "gpt-5.1-codex", contextWindow: 400_000, maxTokens: 128_000 },
			{ id: "gemini-2.5-pro", contextWindow: 2_000_000, maxTokens: 65_536 },
		]);
	});

	test("all models have zero cost", () => {
		const result = parseCursorProxyModels(
			[makeModel("claude-opus-4-6"), makeModel("gpt-4o")],
			"http://localhost:3333/v1",
		);
		for (const model of result.models!) {
			expect(model.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
		}
	});

	test("all models have text-only input", () => {
		const result = parseCursorProxyModels([makeModel("gpt-4o")], "http://localhost:3333/v1");
		expect(result.models![0].input).toEqual(["text"]);
	});
});
