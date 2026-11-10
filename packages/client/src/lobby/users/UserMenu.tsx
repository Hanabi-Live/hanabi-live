// The menu that opens when we click on the name of an online user.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { globals } from "../../Globals";
import { Tooltip } from "../../Tooltip";
import { useAppSelector } from "../../store";
import { getHTMLInputElement } from "../../utils";
import type { UserRow } from "./usersSlice";

const NAME_CLASSES = {
  self: "name-me",
  friend: "friend",
  other: undefined,
} as const satisfies Record<UserRow["kind"], string | undefined>;

/** The name of a user, which opens a menu of the things that we can do with them. */
export function UserLink({
  row: { user, kind },
}: {
  readonly row: UserRow;
}): React.JSX.Element {
  const blocked = useAppSelector((state) =>
    state.session.blocked.includes(user.username),
  );
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const [menu] = useState(() => document.createElement("div"));
  const tooltipRef = useRef<Tooltip>(null);
  useEffect(() => {
    const tooltip = new Tooltip(anchorRef.current!, {
      content: menu,
      interactive: true,
    });
    tooltipRef.current = tooltip;
    return () => {
      tooltip.destroy();
    };
  }, [menu]);

  const profileURL = `/scores/${encodeURIComponent(user.username)}`;
  function closeMenu() {
    tooltipRef.current?.close();
  }

  return (
    <>
      <a
        className={NAME_CLASSES[kind]}
        href={profileURL}
        onClick={(event) => {
          // A modified click still opens the profile, like other links.
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
          }
          event.preventDefault();
          const tooltip = tooltipRef.current!;
          if (tooltip.isOpen) {
            tooltip.close();
          } else {
            tooltip.openUntilClickElsewhere();
          }
        }}
        ref={anchorRef}
        rel="noopener noreferrer"
        target="_blank"
      >
        {user.username}
      </a>
      {createPortal(
        <ul className="user-menu">
          <li>
            <a
              href={profileURL}
              onClick={closeMenu}
              rel="noopener noreferrer"
              target="_blank"
            >
              <i className="fas fa-user" />
              Profile
            </a>
          </li>
          {kind !== "self" && (
            <>
              <li>
                <MenuButton
                  icon="fa-envelope"
                  onClick={() => {
                    closeMenu();
                    startPrivateMessage(user.username);
                  }}
                >
                  Private Message
                </MenuButton>
              </li>
              <li>
                {kind === "friend" ? (
                  <MenuButton
                    icon="fa-user-minus"
                    onClick={() => {
                      closeMenu();
                      globals.conn!.send("chatUnfriend", {
                        username: user.username,
                      });
                    }}
                  >
                    Remove from Friends
                  </MenuButton>
                ) : (
                  <MenuButton
                    icon="fa-user-plus"
                    onClick={() => {
                      closeMenu();
                      globals.conn!.send("chatFriend", {
                        username: user.username,
                      });
                    }}
                  >
                    Add to Friends
                  </MenuButton>
                )}
              </li>
              <li>
                <MenuButton
                  icon={blocked ? "fa-check-circle" : "fa-ban"}
                  onClick={() => {
                    closeMenu();
                    globals.conn!.send(blocked ? "chatUnblock" : "chatBlock", {
                      username: user.username,
                    });
                  }}
                >
                  {blocked ? "Unblock" : "Block"}
                </MenuButton>
              </li>
            </>
          )}
        </ul>,
        menu,
      )}
    </>
  );
}

function MenuButton({
  icon,
  onClick,
  children,
}: {
  readonly icon: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} type="button">
      <i className={`fas ${icon}`} />
      {children}
    </button>
  );
}

/** Starts a private message to a user in the lobby chat, which is also shown in the pre-game. */
function startPrivateMessage(name: string) {
  const input = getHTMLInputElement("#lobby-chat-input");
  input.value = `/pm ${name} `;
  input.focus();
}
