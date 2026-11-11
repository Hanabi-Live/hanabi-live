// The body of a login request, which the server reads as a form.

import type { loginRequestSchema } from "@hanabi-live/data";
import type { z } from "zod";

/**
 * Leaves out an absent new password. (`URLSearchParams` would send it as the text "undefined",
 * which the server would set as the new password.)
 */
export function loginRequestBody(
  data: z.output<typeof loginRequestSchema>,
): URLSearchParams {
  const { newPassword, darkMode, createAccount, bot, ...fields } = data;
  return new URLSearchParams({
    ...fields,
    ...(newPassword !== undefined && { newPassword }),
    darkMode: String(darkMode),
    createAccount: String(createAccount),
    bot: String(bot),
  });
}
