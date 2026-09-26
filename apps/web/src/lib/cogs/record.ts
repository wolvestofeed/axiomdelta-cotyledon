import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';

export type AiCostOutcome = 'success' | 'validation_error' | 'api_error';

export interface RecordAiCostInput {
  surface: string;
  model: string;
  usage: Anthropic.Messages.Usage | null;
  computeMs: number;
  outcome: AiCostOutcome;
}

/**
 * AI usage telemetry. One line to the server log per metered call; there is no
 * cost table here. The shape matches what the callers pass so a store can be
 * added without touching them.
 */
export async function recordAiCostEvent(input: RecordAiCostInput): Promise<void> {
  const inTok = input.usage?.input_tokens ?? 0;
  const outTok = input.usage?.output_tokens ?? 0;
  console.info(`AI_USAGE surface=${input.surface} model=${input.model} in=${inTok} out=${outTok} ms=${input.computeMs} outcome=${input.outcome}`);
}
