import type { Instrumentation } from 'next';
import { buildErrorReport, sendErrorReport } from '@/server/error-report';

/**
 * Server error reporting without extra dependencies: every unhandled request error is written as
 * one JSON line to the host logs and, when ERROR_WEBHOOK_URL (https) is set, posted to that webhook.
 * Query strings, headers and bodies are never included.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  await sendErrorReport(buildErrorReport(err, request, context), process.env.ERROR_WEBHOOK_URL);
};
