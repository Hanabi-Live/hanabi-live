// The menu that opens when we click on the name of an online user.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { globals } from "../../Globals.ts";
import { Tooltip } from "../../Tooltip.ts";
import { useAppSelector } from "../../store.ts";
import { getHtmlInputElement } from "../../utils.ts";
import type { UserRow } from "./usersSlice.ts";

const NAME_CLASSES = {
  self: "tw:text-name-me",
  friend: "tw:text-friend",
  other: undefined,
} as const satisfies Record<UserRow["kind"], string | undefined>;

/** The link or button of each item in the menu. */
const ITEM_CLASS_NAME = [
  "tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-[0.6em] tw:rounded-[3px] tw:border-none",
  "tw:bg-transparent tw:px-[0.6em] tw:py-[0.4em] tw:text-left tw:whitespace-nowrap tw:no-underline",
  "tw:[font-family:inherit] tw:[font-size:inherit] tw:[font-weight:inherit] tw:[line-height:inherit] tw:text-(--menu-text)",
  "tw:hover:bg-(--menu-hover-bg) tw:hover:text-(--menu-hover-text)",
].join(" ");

const ICON_CLASS_NAME = "tw:w-4 tw:text-center";

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

  const profileUrl = `/scores/${encodeURIComponent(user.username)}`;
  function closeMenu() {
    tooltipRef.current?.close();
  }

  return (
    <>
      <a
        className={NAME_CLASSES[kind]}
        href={profileUrl}
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
        <ul className="tw:m-0 tw:list-none tw:p-0 tw:text-[0.75em]">
          <li>
            <a
              className={ITEM_CLASS_NAME}
              href={profileUrl}
              onClick={closeMenu}
              rel="noopener noreferrer"
              target="_blank"
            >
              <i className={`fas fa-user ${ICON_CLASS_NAME}`} />
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
                      globals.conn!.send("friendRemove", {
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
                      globals.conn!.send("friendAdd", {
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
                    globals.conn!.send(blocked ? "blockRemove" : "blockAdd", {
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
    <button className={ITEM_CLASS_NAME} onClick={onClick} type="button">
      <i className={`fas ${icon} ${ICON_CLASS_NAME}`} />
      {children}
    </button>
  );
}

/** Starts a private message to a user in the lobby chat, which is also shown in the pre-game. */
function startPrivateMessage(name: string) {
  const input = getHtmlInputElement("#lobby-chat-input");
  input.value = `/pm ${name} `;
  input.focus();
}
