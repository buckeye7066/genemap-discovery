import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../client.js';
import type { PublicationInvocationOptions } from '../types.js';

const TASK_INPUT = Object.freeze({
  version: 1 as const,
  cohort: {
    sampleCount: 50,
    classification: 'deidentified_aggregate' as const,
    hasControls: true,
  },
  modalities: ['wes'] as const,
  objective: 'identify_variants' as const,
});

describe('ApiClient.invokePublicationTask', () => {
  it('serializes only the bounded publication generation option allow-list', async () => {
    const client = new ApiClient('https://api.example.test');
    const request = vi.spyOn(client, 'request').mockResolvedValue({});
    const plainJavaScriptOptions = {
      provider: 'anthropic',
      temperature: 0.25,
      maxTokens: 640,
      model: 'caller-selected-model',
      size: '2048x2048',
      quality: 'hd',
      publicationTask: 'candidate_gene_research',
      agent: 'retired-agent',
      arbitrary: true,
    } as unknown as PublicationInvocationOptions;

    await client.invokePublicationTask(
      'aggregate_genomics_research',
      TASK_INPUT,
      plainJavaScriptOptions,
    );

    expect(request).toHaveBeenCalledOnce();
    const [path, init] = request.mock.calls[0];
    expect(path).toBe('/llm/invoke');
    expect(JSON.parse(String(init?.body))).toEqual({
      publicationTask: 'aggregate_genomics_research',
      taskInput: TASK_INPUT,
      options: {
        temperature: 0.25,
        maxTokens: 640,
      },
    });
  });
});
