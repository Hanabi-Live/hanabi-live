// A short tutorial that brand-new users see before the lobby. Each answer fades the step out and
// the next one in.

import { PROJECT_NAME } from "@hanabi-live/data";
import { useEffect, useState } from "react";
import { FADE_TIME_MS } from "../../constants.ts";
import * as login from "../login.ts";

type Step =
  | "1"
  | "2"
  | "2-1"
  | "2-2"
  | "3"
  | "4"
  | "4-1"
  | "5"
  | "5-1"
  | "6"
  | "7"
  | "7-1"
  | "8";

/** Where an answer leads: another step, or the lobby. */
type Next = Step | "lobby";

export function Tutorial(): React.JSX.Element {
  const [step, setStep] = useState<Step>("1");
  // The step that comes after the one that is fading out.
  const [next, setNext] = useState<Next>();

  useEffect(() => {
    if (next === undefined) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      if (next === "lobby") {
        login.hide(false);
      } else {
        setStep(next);
        setNext(undefined);
      }
    }, FADE_TIME_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [next]);

  function go(target: Next) {
    if (next === undefined) {
      setNext(target);
    }
  }

  return (
    <section
      className="container tw:py-16 tw:narrow-980:py-2"
      id="main-tutorial"
    >
      <div className="row">
        <div className="col-10 off-1">
          <section
            className={`box align-center tw:transition-opacity tw:starting:opacity-0${next === undefined ? "" : " tw:opacity-0"}`}
            id={`tutorial-${step}`}
            key={step}
            style={{ transitionDuration: `${FADE_TIME_MS}ms` }}
          >
            <StepContent go={go} step={step} />
          </section>
        </div>
      </div>
    </section>
  );
}

function StepContent({
  go,
  step,
}: {
  readonly go: (next: Next) => void;
  readonly step: Step;
}) {
  // eslint-disable-next-line func-style -- It needs "go" from this scope.
  const button = (
    id: string,
    icon: string,
    next: Next,
    label: string,
    fit = false,
  ) => (
    <a
      className={`button${fit ? " fit" : ""} icon ${icon}`}
      id={`tutorial-${id}`}
      onClick={() => {
        go(next);
      }}
    >
      {label}
    </a>
  );

  switch (step) {
    case "1": {
      return (
        <>
          <h3>Welcome!</h3>
          <p>
            It looks like you are logging on to <em>{PROJECT_NAME}</em> for the
            first time. There are some things you should know.
          </p>
          <Pair
            left={button(
              "yes",
              "fa-question-circle",
              "2",
              spaced("Give me a basic rundown."),
              true,
            )}
            right={button(
              "no",
              "fa-sign-in-alt",
              "lobby",
              spaced("I already know how everything works."),
              true,
            )}
          />
        </>
      );
    }

    case "2": {
      return (
        <>
          <h3>The Rules</h3>
          <p>Do you already know how to play?</p>
          <Pair
            left={button("2-yes", "fa-check", "3", "Yup.", true)}
            right={button("2-no", "fa-times", "2-2", "Nope.", true)}
          />
        </>
      );
    }

    case "2-1": {
      return (
        <>
          <h3>The Rules</h3>
          <p>
            Good, because the website assumes that you already know how to play.
          </p>
          <Single centered>
            {button("2-1-ok", "fa-check", "3", "Ok, what's next?")}
          </Single>
        </>
      );
    }

    case "2-2": {
      return (
        <>
          <h3>The Rules</h3>
          <p>
            Well, unfortunately the website does not have a tutorial mode or
            anything like that. You will have to learn{" "}
            <ExternalLink href="https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/rules.md">
              the rules
            </ExternalLink>{" "}
            on your own. So read those, or try watching{" "}
            <ExternalLink href="https://www.youtube.com/watch?v=VrFCekQb4nY">
              {" "}
              this video explanation{" "}
            </ExternalLink>
            .
          </p>
          <Single centered>
            {button(
              "2-2-ok",
              "fa-check",
              "3",
              spaced("Ok, I'll learn the rules on my own."),
            )}
          </Single>
        </>
      );
    }

    case "3": {
      return (
        <>
          <h3>Using the Website</h3>
          <p>
            Getting a game going should be fairly straightforward:
            <br />
            1) Click on the &quot;Create Game&quot; button in the top navigation
            bar.
            <br />
            2) Other people join the game by clicking on the row in the list of
            games.
            <br />
            3) Then, you click on the &quot;Start Game&quot; button.
          </p>
          <p>
            Once the game has started:
            <br />
            1) Play a card by clicking and dragging it to the stacks in the
            center of the screen.
            <br />
            2) Discard a card by clicking and dragging it to the
            bottom-right-hand corner.
            <br />
            3) Give a clue by clicking the buttons in the middle of the screen.
            <br />
          </p>
          <p>
            For more detailed info, click on the &quot;Help&quot; button on the
            top navigation bar.
          </p>
          <Single centered>
            {button("3-ok", "fa-check", "4", "Ok, that sounds easy.")}
          </Single>
        </>
      );
    }

    case "4": {
      return (
        <>
          <h3>Other Players</h3>
          <p>
            You can&apos;t play by yourself. Do you already have a team / a
            group of players to play with?
          </p>
          <Pair
            left={button("4-yes", "fa-check", "4-1", "Yup.", true)}
            right={button("4-no", "fa-times", "5", "Nope.", true)}
          />
        </>
      );
    }

    case "4-1": {
      return (
        <>
          <h3>Other Players</h3>
          <p>
            Good, because this website is mostly used with people who already
            have a team.
            <br />
            Good luck and enjoy the website!
          </p>
          <Single centered>
            {button("4-1-ok", "fa-sign-in-alt", "lobby", "Thanks.")}
          </Single>
        </>
      );
    }

    case "5": {
      return (
        <>
          <h3>Other Players</h3>
          <p>
            This game is a lot like Chess in that it is easy to learn, but hard
            to master, even after spending hundreds of hours playing.
          </p>
          <p>
            Are you looking to play a few casual one-off games?
            <br />
            Or, are you looking to &quot;get into&quot; the game and have a
            permanent team to learn from and grow with?
          </p>
          {button(
            "5-casual",
            "fa-dice-one",
            "5-1",
            spaced(
              "I'm not super into this, so I just want to play a few one-off games.",
            ),
            true,
          )}
          <br />
          <br />
          {button(
            "5-expert",
            "fa-dice-six",
            "6",
            spaced(
              "I love this game and would be willing to spend a lot of time to play with experienced players.",
            ),
            true,
          )}
        </>
      );
    }

    case "5-1": {
      return (
        <>
          <h3>Other Players</h3>
          <p>
            Unfortunately, finding quick games with strangers on the website is
            difficult because it is mostly used by people who already have a
            team. You can always try to join random games with other people, but
            don&apos;t be offended if people don&apos;t want to play with
            strangers.
          </p>
          <p>
            It used to be easy to find pick-up games on{" "}
            <ExternalLink href="https://en.boardgamearena.com/">
              Board Game Arena
            </ExternalLink>
            , but not so many people play on there anymore because there is a
            pseudo-paywall (as of December 2020). You can try to find pick-up
            games on BGA, or you can try your luck in the lobby here.
          </p>
          <Single>
            {button(
              "5-1-lobby",
              "fa-sign-in-alt",
              "lobby",
              spaced("Take me to the lobby for now."),
            )}
          </Single>
        </>
      );
    }

    case "6": {
      return (
        <>
          <h3>Other Players</h3>
          <p>
            That&apos;s good to hear. In general, the website is mostly used by
            people who already have a team, so finding quick games with
            strangers can be difficult. If you are interested in doing some prep
            work, I would like to welcome you to play with my group, the{" "}
            <em>H-Group</em>. We have been playing the game for many years, but
            we could always use new players.
          </p>
          <p />
          <Pair
            left={button(
              "6-ok",
              "fa-question-circle",
              "7",
              spaced("Ok, how do I join the H-Group?"),
            )}
            right={button(
              "6-lobby",
              "fa-sign-in-alt",
              "lobby",
              spaced("I'll pass, just take me to the lobby."),
            )}
          />
        </>
      );
    }

    case "7": {
      return (
        <>
          <h3>Voice Chat</h3>
          <p>
            After my group finishes a game, we all get together in a voice chat
            to review it. This is important - everyone gets to learn from their
            mistakes and everyone can become more synchronized. As you may
            imagine, using a voice chat is much more productive than everyone
            typing text-snippets at each other.
          </p>
          <p>
            Do you have a working microphone and are you able to voice chat?
          </p>
          <Pair
            left={button("7-yes", "fa-check", "8", spaced("Yup."))}
            right={button("7-no", "fa-times", "7-1", spaced("Nope."))}
          />
        </>
      );
    }

    case "7-1": {
      return (
        <>
          <h3>Voice Chat</h3>
          <p>
            That&apos;s too bad. Doing post-game reviews without a microphone is
            a real pain. Remember that if you do not have a desktop microphone
            or a headset, you can also use the Discord app on a cell phone. If
            you do not have a cell phone, you could always grab a cheap
            microphone from a local electronics store.
          </p>
          <Pair
            left={button(
              "7-1-microphone",
              "fa-check",
              "8",
              spaced("I think I can get a microphone after all."),
            )}
            right={button(
              "7-1-lobby",
              "fa-sign-in-alt",
              "lobby",
              spaced("I'll pass, just take me to the lobby."),
            )}
          />
        </>
      );
    }

    case "8": {
      return (
        <>
          <h3>Some Basic Conventions</h3>
          <p>
            If you try to play with our group and don&apos;t understand what our
            clues mean, things won&apos;t go well. We ask that you spend some
            time and read the{" "}
            <ExternalLink href="https://hanabi.github.io/beginner">
              {" "}
              H-Group beginners guide{" "}
            </ExternalLink>
            . It {"shouldn't"} take all that long. And the guide has further
            instructions about how to get games going with members of the group.
          </p>
          <Single>
            {button(
              "8-ok",
              "fa-sign-in-alt",
              "lobby",
              spaced("I'll read the guide, thanks. Take me to the lobby."),
            )}
          </Single>
        </>
      );
    }
  }
}

/**
 * Some answers have a space around their text, which adds a space after the icon of the button. The
 * template that they come from had it.
 */
function spaced(label: string): string {
  return ` ${label} `;
}

/** Two answers side by side. */
function Pair({
  left,
  right,
}: {
  readonly left: React.ReactNode;
  readonly right: React.ReactNode;
}) {
  return (
    <div className="row">
      <div className="col-6">{left}</div>
      <div className="col-6">{right}</div>
    </div>
  );
}

/** One answer on its own row. */
function Single({
  centered = false,
  children,
}: {
  readonly centered?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="row">
      <div className={centered ? "col-12 align-center" : "col-12"}>
        {children}
      </div>
    </div>
  );
}

function ExternalLink({
  children,
  href,
}: {
  readonly children: React.ReactNode;
  readonly href: string;
}) {
  return (
    <a href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}
