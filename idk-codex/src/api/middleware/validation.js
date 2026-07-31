/**
 * Input validation middleware (Phase 3.9)
 *
 * Uses Zod to validate request bodies. Exported as a separate module so
 * individual route files can import it without creating circular dependencies
 * with the routes/index.js aggregator.
 */

import { z } from 'zod';

/**
 * Zod schema for a chat message POST body.
 * Used by /api/conversations/:id/messages.
 */
export const chatSchema = z.object({
  message: z.string().min(1).max(32000),
  runAgent: z.boolean().optional(),
  images: z.array(z.string()).optional(),
  files: z.array(z.any()).optional()
});

/**
 * Zod schema for creating a new conversation.
 */
export const createConversationSchema = z.object({
  platform: z.string().max(50).optional(),
  title: z.string().max(200).optional()
});

/**
 * Zod schema for renaming a conversation.
 */
export const renameConversationSchema = z.object({
  title: z.string().min(1).max(200)
});

/**
 * Middleware factory that validates req.body against a Zod schema.
 * On failure, responds 400 with a list of issues.
 *
 * @param {z.ZodType} schema
 * @returns {import('express').RequestHandler}
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        issues: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message
        }))
      });
    }
    // Replace req.body with the parsed (and coerced) values
    req.body = result.data;
    next();
  };
}

export default { chatSchema, createConversationSchema, renameConversationSchema, validateBody };
