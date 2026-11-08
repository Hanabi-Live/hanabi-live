// The password reset page, which hashes a new password for the user to give to an administrator.

import {
  errorDetails,
  httpError,
  passwordHashRequestSchema,
  passwordHashResponseSchema,
} from "@hanabi-live/data";

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.querySelector(`#${id}`);
  if (!(found instanceof type)) {
    throw new TypeError(`Failed to find the "${id}" element.`);
  }
  return found;
}

const form = element("password-reset-form", HTMLFormElement);
const password = element("new-password", HTMLInputElement);
const button = element("generate-hash-button", HTMLButtonElement);
const output = element("generated-hash", HTMLInputElement);
const errorMessage = element("password-reset-error", HTMLParagraphElement);

async function generateHash(): Promise<string> {
  const response = await fetch("/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      passwordHashRequestSchema.parse({ password: password.value }),
    ),
  });
  if (!response.ok) {
    throw await httpError(response, "Generating the hash");
  }
  return passwordHashResponseSchema.parse(await response.json()).hash;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  button.disabled = true;
  output.value = "";
  errorMessage.hidden = true;
  generateHash()
    .then((hash) => {
      output.value = hash;
      output.focus();
      output.select();
    })
    .catch((error: unknown) => {
      errorMessage.textContent = errorDetails(error, "Generating the hash");
      errorMessage.hidden = false;
    })
    .finally(() => {
      button.disabled = false;
    });
});

password.focus();
