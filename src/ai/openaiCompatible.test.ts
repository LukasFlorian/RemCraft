import { createOpenAiCompatibleProvider, loadAiConfig, saveAiConfig } from './openaiCompatible';

const config = { baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-test', model: 'm' };

describe('OpenAI-compatible provider', () => {
  it('sends chat completions and parses the answer', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] })),
    );
    const ai = createOpenAiCompatibleProvider(config, fetchMock as unknown as typeof fetch);
    expect(
      await ai.complete([{ role: 'user', content: 'x' }], { temperature: 0, json: true }),
    ).toBe('hi');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(JSON.parse(String(init!.body))).toMatchObject({
      model: 'm',
      temperature: 0,
      response_format: { type: 'json_object' },
      stream: false,
    });
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('streams server-sent events', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: {"choices":[{"delta":{"content":"b"}}]}\n\ndata: [DONE]\n\n';
    const ai = createOpenAiCompatibleProvider(
      config,
      (async () => new Response(sse)) as unknown as typeof fetch,
    );
    const parts: string[] = [];
    for await (const p of ai.stream([{ role: 'user', content: 'x' }])) parts.push(p);
    expect(parts).toEqual(['a', 'b']);
  });

  it('throws on HTTP errors', async () => {
    const ai = createOpenAiCompatibleProvider(
      config,
      (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch,
    );
    await expect(ai.complete([])).rejects.toThrow(/401/);
  });

  it('stores the configuration locally', () => {
    saveAiConfig(config);
    expect(loadAiConfig()).toEqual(config);
    saveAiConfig(null);
    expect(loadAiConfig()).toBeNull();
  });
});

describe('Claude provider', () => {
  it('sends system prompts separately and reads text blocks', async () => {
    const { createAnthropicProvider } = await import('./anthropic');
    const fetchMock = vi.fn(
      async (_u: string | URL | Request, _i?: RequestInit) =>
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'hallo' }] })),
    );
    const ai = createAnthropicProvider(
      { baseUrl: '', apiKey: 'k', model: 'm' },
      fetchMock as unknown as typeof fetch,
    );
    expect(
      await ai.complete([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'u' },
      ]),
    ).toBe('hallo');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(String(init!.body))).toMatchObject({
      system: 'sys',
      messages: [{ role: 'user', content: 'u' }],
      model: 'm',
    });
    expect((init!.headers as Record<string, string>)['x-api-key']).toBe('k');
  });
  it('is available in the registry', async () => {
    const { AI_PROVIDERS } = await import('./registry');
    expect(AI_PROVIDERS.list().map((p) => p.id)).toEqual(['openai-compatible', 'anthropic']);
  });
});
