import type { LLMOptions, PublicationInvocationOptions } from './types.js';

type Assert<T extends true> = T;
type Reject<T extends false> = T;
type IsAssignable<Source, Target> = [Source] extends [Target] ? true : false;

// Supported settings remain assignable.
type _SupportedOptionsAreAccepted = Assert<IsAssignable<{
  provider: 'anthropic';
  temperature: number;
  maxTokens: number;
}, PublicationInvocationOptions>>;

// These assertions fail the shared build if the invocation boundary widens.
type _BroadLLMOptionsAreRejected = Reject<
  IsAssignable<LLMOptions, PublicationInvocationOptions>
>;
type _ModelIsRejected = Reject<
  IsAssignable<{ model: string }, PublicationInvocationOptions>
>;
type _SizeIsRejected = Reject<
  IsAssignable<{ size: string }, PublicationInvocationOptions>
>;
type _QualityIsRejected = Reject<
  IsAssignable<{ quality: string }, PublicationInvocationOptions>
>;
type _NestedTaskIsRejected = Reject<
  IsAssignable<{ publicationTask: 'research_hypothesis' }, PublicationInvocationOptions>
>;

export {};
