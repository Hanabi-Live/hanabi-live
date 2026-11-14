// The form of the password reset page, which hashes a new password for the user to give to an
// administrator.

import {
  errorDetails,
  httpError,
  passwordHashRequestSchema,
  passwordHashResponseSchema,
} from "@hanabi-live/data";
import { useEffect, useRef, useState } from "react";

const OPERATION = "Generating the hash";

async function generateHash(password: string): Promise<string> {
  const response = await fetch("/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(passwordHashRequestSchema.parse({ password })),
  });
  if (!response.ok) {
    throw await httpError(response, OPERATION);
  }
  return passwordHashResponseSchema.parse(await response.json()).hash;
}

export function PasswordReset(): React.JSX.Element {
  const [password, setPassword] = useState("");
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [generating, setGenerating] = useState(false);
  const hashInput = useRef<HTMLInputElement>(null);

  // A new hash is ready to copy.
  useEffect(() => {
    if (hash !== "") {
      hashInput.current?.focus();
      hashInput.current?.select();
    }
  }, [hash]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setGenerating(true);
    setHash("");
    setError(undefined);
    generateHash(password)
      .then(setHash)
      .catch((error_: unknown) => {
        setError(errorDetails(error_, OPERATION));
      })
      .finally(() => {
        setGenerating(false);
      });
  }

  return (
    <form id="password-reset-form" onSubmit={submit}>
      <input
        autoComplete="new-password"
        autoFocus
        id="new-password"
        name="password"
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        placeholder="New Password"
        required
        type="password"
        value={password}
      />
      <br />
      <button
        className="button fit"
        disabled={generating}
        id="generate-hash-button"
        type="submit"
      >
        <i className="fas fa-key icon-label" />
        Generate Hash
      </button>
      <br />
      <br />
      <input
        id="generated-hash"
        placeholder="Generated Hash"
        readOnly
        ref={hashInput}
        type="text"
        value={hash}
      />
      <p hidden={error === undefined} id="password-reset-error" role="alert">
        {error}
      </p>
    </form>
  );
}
