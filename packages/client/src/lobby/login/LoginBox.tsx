// The box in the middle of the login screen: a wait while "login.ts" checks our saved session, a
// warning for Firefox users, or the form to sign in. The template shows the same wait until this
// renders.

import { PROJECT_NAME } from "@hanabi-live/data";
import { useEffect, useRef, useState } from "react";
import {
  FADE_IN_CLASS,
  getFadeStyle,
  useReducedMotion,
  useRevealClassName,
} from "../../fade.ts";
import { outdatedClientHtml } from "../../notice.ts";
import { store, useAppSelector } from "../../store.ts";
import {
  WaitingCard,
  WaitingLabel,
  getWaitingButtonClass,
} from "../../WaitingCard.tsx";
import { acceptFirefoxWarning, retryAutomaticLogin, signIn } from "../login.ts";
import { confirmingUsernameCleared, loginFailed } from "./loginSlice.ts";

/** How long the form to change a password takes to open or close. */
const CHANGE_PASSWORD_TRANSITION_MS = 500;

export function LoginBox(): React.JSX.Element {
  const stage = useAppSelector((state) => state.login.stage);
  // An error stops the loading, so the turning card stops too.
  const failed = useAppSelector(
    (state) => state.messageModal.modal?.type === "error",
  );

  switch (stage) {
    case "loading": {
      return (
        <section className="box align-center" id="loading">
          <h3>Loading...</h3>
          <p>{PROJECT_NAME} is loading. Please wait!</p>
          {failed ? <FailedCard /> : <WaitingCard />}
        </section>
      );
    }

    case "firefoxWarning": {
      return (
        <section className="box align-center" id="firefox-warning">
          <h3>Warning!</h3>
          <p>
            You are using Firefox.
            <br />
            Firefox is incredibly slow at drawing Canvas-based graphics.
            <br />
            For your sanity, please use Chrome or Chromium when using this
            website.
          </p>
          <button
            className="button align-center"
            id="firefox-warning-button"
            onClick={acceptFirefoxWarning}
            type="button"
          >
            OK
          </button>
        </section>
      );
    }

    case "signIn": {
      return <SignIn />;
    }
  }
}

/**
 * The card of the loading animation, at rest and struck out like a misplayed card. It has the same
 * size as the animation, so that the box does not move.
 */
function FailedCard() {
  return (
    <svg
      aria-label="Error"
      className="tw:inline-block"
      height="64"
      role="img"
      viewBox="0 0 64 64"
      width="64"
    >
      <g transform="rotate(-12 32 32)">
        <rect
          fill="white"
          height="52"
          rx="4"
          stroke="#3355cc"
          strokeWidth="2.5"
          width="38"
          x="13"
          y="6"
        />
        <text
          fill="#3355cc"
          fontFamily="sans-serif"
          fontSize="12"
          fontWeight="bold"
          x="17"
          y="18"
        >
          1
        </text>
      </g>
      {/* The X of a strike, as "x.png" draws it. */}
      <path
        d="M18 18 L46 46 M46 18 L18 46"
        stroke="black"
        strokeLinecap="round"
        strokeWidth="13"
      />
      <path
        d="M18 18 L46 46 M46 18 L18 46"
        stroke="#ff0000"
        strokeLinecap="round"
        strokeWidth="8"
      />
    </svg>
  );
}

function SignIn() {
  const busy = useAppSelector((state) => state.login.busy);
  const confirmingUsername = useAppSelector(
    (state) => state.login.confirmingUsername,
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const reducedMotion = useReducedMotion();
  const changePasswordClass = useRevealClassName(changingPassword);
  const usernameRef = useRef<HTMLInputElement>(null);

  let buttonLabel = "Sign In";
  if (confirmingUsername !== undefined) {
    buttonLabel = "Create Account";
  } else if (changingPassword) {
    buttonLabel = "Sign In & Change Password";
  }

  function submit() {
    if (busy) {
      return;
    }
    if (username === "") {
      store.dispatch(loginFailed({ message: "You must provide a username." }));
      return;
    }
    if (password === "") {
      store.dispatch(loginFailed({ message: "You must provide a password." }));
      return;
    }
    if (changingPassword && newPassword === "") {
      store.dispatch(
        loginFailed({ message: "You must provide a new password." }),
      );
      return;
    }

    signIn(
      username,
      password,
      changingPassword ? newPassword : undefined,
      username === confirmingUsername,
    );
  }

  return (
    <section
      className="box align-center tw:mx-auto tw:max-w-[26em] tw:px-8 tw:py-7"
      id="sign-in"
    >
      <h3 className="tw:mb-5">Sign In / Create Account</h3>
      <form
        id="login-form"
        onKeyDown={(event) => {
          if (event.key !== "Enter") {
            return;
          }

          event.preventDefault();
          submit();
        }}
        onSubmit={(event) => {
          // By default, the form would reload the page.
          event.preventDefault();
          submit();
        }}
      >
        <InputRow icon="fa-user">
          <input
            autoFocus
            id="login-username"
            onChange={(event) => {
              setUsername(event.target.value);
              // Editing the username cancels the account creation that it was about to confirm.
              if (confirmingUsername !== undefined) {
                store.dispatch(confirmingUsernameCleared());
              }
            }}
            placeholder="Username"
            ref={usernameRef}
            type="text"
            value={username}
          />
        </InputRow>
        <InputRow icon="fa-key">
          <input
            id="login-password"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            placeholder={changingPassword ? "Old Password" : "Password"}
            type="password"
            value={password}
          />
        </InputRow>
        <div
          className={changePasswordClass}
          id="change-password-container"
          style={getFadeStyle(reducedMotion, CHANGE_PASSWORD_TRANSITION_MS)}
        >
          <InputRow icon="fa-sync">
            <input
              id="change-password"
              onChange={(event) => {
                setNewPassword(event.target.value);
              }}
              placeholder="New Password"
              type="password"
              value={newPassword}
            />
          </InputRow>
        </div>
        <div className="tw:mt-5">
          {/* While it waits, the card replaces the icon too. */}
          <a
            aria-busy={busy}
            className={`button fit primary icon fa-sign-in-alt ${getWaitingButtonClass(busy)}${busy ? " tw:before:invisible" : ""}`}
            id="login-button"
            onClick={submit}
          >
            <WaitingLabel waiting={busy}>{buttonLabel}</WaitingLabel>
          </a>
        </div>
        <div className="tw:mt-4">
          <LoginAlert />
          {confirmingUsername !== undefined && (
            <p
              className={FADE_IN_CLASS}
              id="login-no-account"
              style={getFadeStyle(reducedMotion)}
            >
              There is no account named <strong>{confirmingUsername}</strong>.
              Check the spelling, or click &quot;Create Account&quot; to create
              it.
            </p>
          )}
          <p className="tw:m-0 tw:text-[0.85em]">
            <a
              href="#"
              id="change-password-link"
              onClick={(event) => {
                event.preventDefault();
                setChangingPassword(!changingPassword);
                store.dispatch(confirmingUsernameCleared());
                usernameRef.current!.focus();
              }}
            >
              Change password
            </a>{" "}
            | <a href="/password-reset">Forgot password?</a>
          </p>
        </div>
        <p className="tw:mt-5 tw:mb-0 tw:border-0 tw:border-t tw:border-solid tw:border-border tw:pt-4 tw:text-[0.9em] tw:leading-normal tw:text-text-label">
          A new username creates a new account.
          <br />
          Use a password that you do not use on any other site.{" "}
          <a
            href="https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/passwords.md"
            rel="noopener noreferrer"
            target="_blank"
          >
            Why?
          </a>
        </p>
      </form>
    </section>
  );
}

/** A field with its icon inside it, on the left. */
function InputRow({
  children,
  icon,
}: {
  readonly children: React.ReactNode;
  readonly icon: string;
}) {
  return (
    <div className="tw:relative tw:mb-3 tw:[&_input]:pl-[2.75em]">
      <i
        className={`fas ${icon} tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-[1em] tw:-translate-y-1/2 tw:text-text-label`}
      />
      {children}
    </div>
  );
}

/** Why the login failed. It fades in, and the page scrolls to it. */
function LoginAlert() {
  const alert = useAppSelector((state) => state.login.alert);
  const ref = useRef<HTMLParagraphElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    ref.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [alert?.count]);

  if (alert === undefined) {
    return undefined;
  }

  return (
    <p
      className={`tw:mb-4 tw:whitespace-pre-line tw:rounded-(--radius) tw:border tw:border-solid tw:border-(--login-alert-border) tw:bg-(--login-alert-bg) tw:p-[0.9em] tw:text-(--login-alert-text) ${FADE_IN_CLASS}`}
      id="login-alert"
      key={alert.count}
      ref={ref}
      style={getFadeStyle(reducedMotion)}
    >
      {alert.latestVersion === undefined ? (
        alert.message
      ) : (
        <span
          // The HTML escapes both releases.
          dangerouslySetInnerHTML={{
            __html: outdatedClientHtml(alert.latestVersion),
          }}
        />
      )}
      {alert.passwordReset && (
        <>
          {" "}
          Please follow the{" "}
          <a href="/password-reset">password reset instructions</a>.
        </>
      )}
      {alert.retry && (
        <>
          {" "}
          <button onClick={retryAutomaticLogin} type="button">
            Retry
          </button>
        </>
      )}
    </p>
  );
}
