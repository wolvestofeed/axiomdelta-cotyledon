import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

/** HMR-safe Anthropic client singleton. ANTHROPIC_API_KEY is read once at first use; the SDK throws if it is missing. */
export function anthropic(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

/** Structured extraction (the Compare agent). Tool use enforces shape. */
export const INGESTION_MODEL = 'claude-sonnet-4-6';
