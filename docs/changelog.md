# Changelog

This page lists the changes to Hanab Live, excluding bug fixes.

## November 8th, 2026

- Breaking changes:
  - Removed the card cycling option (used in about 0.03% of games) and the games
    that used it.
  - Removed the legacy starting player option and the pre-April 2020 games that
    did not start with the first seat.
  - Removed legacy seeds (those beginning with `legacy-`), which only those
    games used.
  - Public pages and API endpoints now reject unknown or invalid query
    parameters with an error that names the problem, instead of silently using
    defaults.
- Removed the following chat commands:
  - `/playerinfo`
  - `/vote` (tap the skull button instead, which also works on touch devices)
  - `/tagdelete` (use `/untag` instead)
  - `/linked` (use `/links` instead)
- Removed the full-history and full-seed API aliases.
- Removed the videos page.
- Added a confirmation when playing a card whose note says it is unplayable.
- The note icon glows when the note determines the suit or rank shown on the
  card.
- The deck tooltip in a shared replay shows how long the replay has been
  running.
- The CSS bundle loads without blocking page rendering.
- Database migrations are now run with `hanabi-live migrate` (SQLx), and a
  migration is cancelled if it blocks live queries for too long.

## November 7th, 2026

- Added the following chat commands:
  - `/block`
  - `/unblock`
  - `/blocked`
- Players with a block between them cannot join or spectate each other's tables
  or send each other private messages.
- Added spoiler-free shared replay reviews, which only reveal what has already
  happened.
- Opening a link to a shared replay now joins the existing shared replay of that
  game instead of creating a separate copy.
- Added a warning before an idle game ends.
- Players at a full table are now told when someone else tries to join.
- Cards with a "spook" note now show a ghost.
- In speedrun mode, clicking to give a clue with no clue tokens now buzzes.
- Each browser tab now keeps its own signed-in account, so reloading one tab no
  longer switches it to the account most recently used in another tab.
- Average scores and strikeout rates are no longer calculated or shown, so that
  the site feels less competitive.
- Chat messages older than one year are deleted daily.
- Security:
  - Login attempts are rate limited per address and per account.
  - Password hashing is limited per address.
  - Credential checks and rejected connections are logged.
- Graceful restarts and stops are explained to players, and the startup
  announcement reports how long the server was down.
- Server and HTTP errors are posted to Discord instead of Sentry.
- The classic client validates every message from the server.
- Many database queries and server code paths were optimized.
- Installation and development:
  - Added a production setup script.
  - PostgreSQL and Redis memory are sized from the server's RAM.
  - Failed database backups are reported to Discord.
  - Local development runs with one command, using Podman or Docker for
    PostgreSQL and Redis.
  - The client is bundled with Vite and tested with Vitest.

## November 6th, 2026

- The server was rewritten in Rust, replacing the Go server. Live game state is
  now stored durably in Redis, so games survive restarts.
- Added a game-preserving graceful stop for maintenance, which is announced on
  Discord.
- Errors shown to players now include an actionable cause and a diagnostic ID.
- Table names are now based on the table owner instead of being randomly
  generated.
- Removed friends history.
- Personal history now loads only when its screen is opened.
- Removed support for legacy SHA-256 password hashes.
- Installation and development:
  - Added anonymous release downloads and `deploy.sh`, which deploys a release
    that has passed CI.
  - `bash lint.sh` runs every check, with Turborepo caching.

## November 5th, 2026

- Disconnected players are removed from a pregame table after a short grace
  period, and abandoned pregame tables are closed.
- Simplified the global statistics page.
- JavaScript tooling moved to Bun.

## November 3rd, 2026

- Database backups no longer risk filling the disk.

## November 1st, 2026

- Added advanced filters to the shared missing scores page.

## October 20th, 2026

- Added the missing Double Dark variants, such as "Black & Dark Orange".

## October 16th, 2026

- Deleting a lobby message in Discord now also deletes it on the site.
- Added the following note shorthands for unclued finesses (call to play):
  - `[xf]`
  - `[ctp]`

## October 7th, 2026

- Added the `/pmhistory` chat command, which shows recent private messages.
- Improved card dragging.

## October 2nd, 2026

- Added dark mode, with a System / Light / Dark setting.

## September 28th, 2026

- Improved tooltips.

## September 27th, 2026

- Added a read-only tag search API:
  - `/api/v1/tags/[username]`
  - `/api/v1/tag/[tag]`

## September 18th, 2026

- Replay JSON now includes the seed.

## August 24th, 2026

- Placing a local arrow on a card prints the card's order in the chat.

## June 18th, 2026

- The time in `/si` can omit the 0 before the decimal point.

## June 13th, 2026

- Changed the arrow color of chop-moved cards for H-Group players.

## May 20th, 2026

- Added the `/split`, `/splitauto`, and `/sa` chat commands.

## April 11th, 2026

- Note hotkeys keep only the parts of a note that affect the card, removing
  prose.

## April 3rd, 2026

- Added Shift + Alt + right-click as a shortcut for a "ptd" note.

## March 14th, 2026

- The game UI resizes responsively.
- Added identity tokens and the `/token` chat command, which let other sites
  confirm a player's identity.

## March 10th, 2026

- Added the Scarce Ones variants.

## March 2nd, 2026

- Added a Nix development environment.

## February 1st, 2026

- Cards with a "ptd" note get a maroon border.

## January 11th, 2026

- Spectators keep spectating when a table is restarted.

## January 5th, 2026

- The deck tooltip shows the table owner.

## January 2nd, 2026

- Restored the Yam suit.

## December 28th, 2025

- Added a pips reference page.
- Added the Dark Orange suit and orange custom variants.
- Pips are generated automatically for new suits.
- Updated the black and inverted pips.

## December 22nd, 2025

- Incrementing a seed number keeps its leading zeros.

## December 2nd, 2025

- Detrimental characters are sorted.

## November 11th, 2025

- Sound options are chosen from a dropdown.

## November 3rd, 2025

- Added a tooltip for the inverted suit.

## October 20th, 2025

- Added the inverted suit.

## September 16th, 2025

- Added hanabi.wiki to the list of resources.

## July 28th, 2025

- Notes support autocompletion, emotes, and emojis.

## July 27th, 2025

- Added a button to join or spectate a pregame table.

## July 26th, 2025

- Added a button to apply the variant found by `/findvariant`.
- Added the White Reversed & Rainbow variants.

## July 22nd, 2025

- Added an emote and emoji picker.

## June 9th, 2025

- Clicking a notification focuses the tab.

## June 5th, 2025

- Added an API endpoint with more information about variants.

## December 25th, 2024

- Added a Christmas theme.

## November 10th, 2024

- The deck tooltip shows the length of the game.

## October 19th, 2024

- Added the `/vote` chat command to vote to terminate a game.

## September 28th, 2024

- Added a clap sound effect.

## July 23rd, 2024

- Private messages received during a game show a chat notification.

## June 20th, 2024

- Added an animation while waiting for the server after performing an action.

## June 10th, 2024

- Discarding a clued card is prefixed with "(clued)" in the action log.

## May 24th, 2024

- Discarding a critical card is called out in the action log.

## March 8th, 2024

- Added a hotkey for "kt" notes.

## December 12th, 2023

- Added the `/terminate` chat command.
- Added account linking.
- Added the Sudoku 4-suit variants and the dark 6-suit variants.

## August 10th, 2023

- Suit names are shown under the stacks whenever they are needed.

## July 27th, 2023

- Reworked the Sudoku interface.

## July 26th, 2023

- Added the Sudoku variants.

## July 15th, 2023

- API queries sort by game ID as a secondary column.

## July 6th, 2023

- Ctrl + left-click opens a card's note.

## May 31st, 2023

- A variant is considered hard at 1.33 efficiency or higher.

## March 3rd, 2023

- Added the RGB Mix variants.

## March 2nd, 2023

- Simple chat commands are easier to edit.

## February 1st, 2023

- Added seed statistics and charts.
- Added links to seeds from the variant page.
- Added the Valentine Mix variants.

## January 20th, 2023

- Added the `[!]` note.

## January 18th, 2023

- The lobby table list and game name show the table options.

## January 11th, 2023

- Spectators can use note hotkeys.
- Shared replays keep their names.
- Empathy shows morphed cards.

## January 4th, 2023

- Added the Matryoshka variants.

## January 3rd, 2023

- Added the `?` note.
- Right-click to terminate a game.

## December 28th, 2022

- "unknown" is a synonym for "blank" in notes.

## December 16th, 2022

- Anyone can set the shared replay leader.
- Total variant statistics no longer count strikeouts.

## December 8th, 2022

- Spectator notes affect how cards look.

## December 5th, 2022

- Added the FAQ.

## December 1st, 2022

- Added the Holiday Mix variants and new emotes.

## November 30th, 2022

- Added the `/untag` chat command.
- Copying a game also copies its bombs.

## November 29th, 2022

- Improved card morphing.

## November 22nd, 2022

- Added "cm" notes.

## November 21st, 2022

- Cards known to be trash are shown as trash.

## November 12th, 2022

- Spectator notes are saved.
- Added a trash can indicator.

## October 28th, 2022

- Added Zen mode.
- Added `/suggest` to the in-game commands.

## October 6th, 2022

- Added the Funnels variants.

## October 5th, 2022

- A table can be remade from its restart.

## May 31st, 2022

- Added positive color clues.
- The lobby shows each table's spectators and owner.

## April 24th, 2022

- Changed the license from AGPL back to GPL.

## February 23rd, 2022

- The cluing interface is more obvious.

## February 14th, 2022

- Arrows can be used in solo replays.

## February 9th, 2022

- Hypothetical links are compressed.

## February 5th, 2022

- Variants have new string IDs.
- Restored `/ping`, `/here`, `/subscribe`, and `/unsubscribe`, and added
  `/teachme`.
- Bot replies are public, and bot commands work only in the lobby.

## February 4th, 2022

- Notes can be used in speedruns.

## February 2nd, 2022

- Seeds starting with `legacy-` are supported.

## February 1st, 2022

- Added the Odds and Evens variants.
- Added the `/mem` and `/memory` chat commands.

## January 27th, 2022

- Added the Those Cards Are Odd variants.

## January 26th, 2022

- Text between `||` is shown as a spoiler.

## January 19th, 2022

- Improved the morphing dialog.

## January 16th, 2022

- Variant search can search from the start of a name and by color clues.

## January 15th, 2022

- Efficiency is shown on the missing scores pages.

## January 13th, 2022

- Seeds have names.

## January 11th, 2022

- A hypothetical can be copied to the clipboard.

## January 8th, 2022

- The full history API includes user tags.

## January 6th, 2022

- Options can be updated from a seed.

## January 5th, 2022

- The repository moved to the Hanabi-Live organization.

## January 4th, 2022

- The table host can accept proposed options.
- Added new JSON routes to the API.

## January 2nd, 2022

- The history, variant, and seed pages load with Ajax and show a spinner.

## December 23rd, 2021

- Added the `/levels` chat command.
- The number of online users is shown on both tabs.
- Added more chat commands.

## December 18th, 2021

- Statistics are paginated and filterable.

## December 16th, 2021

- The variant can be set directly.

## December 14th, 2021

- Added the `/tagsdeleteall` chat command.

## December 10th, 2021

- Added voting to terminate a game.

## December 9th, 2021

- Morphing uses a dialog.

## December 7th, 2021

- Added eleven emotes.

## November 29th, 2021

- Replaced browser dialogs with modals.

## November 2nd, 2021

- Players who are not the host can propose options.

## October 29th, 2021

- Options can be changed in the pregame.
- Added the `/rtfm` chat command and aliases for common commands.
- Added the Synesthesia and Critical Fours variants.
- Notes can be edited on mobile.

## August 3rd, 2021

- The up and down arrow keys toggle the replay.

## May 11th, 2021

- Added indicators for cards that could be the last copy (DDA).
- Plays from a rewound state can be disabled.

## May 3rd, 2021

- Suits have tooltips that explain prisms and dual-color suits.

## April 24th, 2021

- Added a pip for the start card.

## March 15th, 2021

- Added the "clued" note.

## March 11th, 2021

- Chat history can be searched.

## March 5th, 2021

- Appending notes uses bracket syntax.
- Players who are not the leader can suggest variants with the dropdown.

## February 11th, 2021

- Card possibilities are reduced by deduction.

## January 7th, 2021

- Added negative identity notes.

## December 6th, 2020

- Overhauled the hypothetical interface.

## December 5th, 2020

- The number of finesses is tracked.

## December 1st, 2020

- Notes can modify efficiency.
- Added the `/bga`, `/doc`, and `/issue` chat commands.

## November 26th, 2020

- Added the Impostor character.
- Added efficiency for Throw It in a Hole.

## November 21st, 2020

- Hypotheticals can be started during a game.
- Ctrl + click copies a link from the lobby.

## November 20th, 2020

- Added the Deceptive Ones and Deceptive Fives variants.
- Added the `/notation` chat command.
- The turn is stored in the URL hash.

## November 18th, 2020

- Hovering over the turn number shows the maximum rounds left and other
  statistics.
- Added arrow rotation.

## November 11th, 2020

- Added identity list notes.

## November 1st, 2020

- Added future efficiency, which can be modified with a right-click.

## October 29th, 2020

- Removed `/here`.

## August 25th, 2020

- Added the Dark Prism suit.
- The timer starts when the first player has loaded.

## August 24th, 2020

- Improved the shared missing scores page.

## August 21st, 2020

- Added the `/tell` and `/t` chat commands.
- Overlapping suit abbreviations are handled automatically.

## August 18th, 2020

- The "Your Turn" interface shows in the in-game replay.
- Seeds are sorted by score.

## August 14th, 2020

- Anyone can change the shared replay leader.
- JSON games support characters.

## August 13th, 2020

- Lazy initialization cut loading times.

## July 30th, 2020

- Added the `/suggest` chat command.

## July 29th, 2020

- Added the `/missingscores` chat command.

## July 28th, 2020

- Misplays are allowed in hypotheticals.
- The create game dialog remembers its options and hides extra options by
  default.

## July 26th, 2020

- The history page can be filtered by score.

## July 25th, 2020

- The lobby status is clickable.

## July 24th, 2020

- The site was renamed to Hanab Live.

## July 20th, 2020

- Rewrote the efficiency calculation.

## July 14th, 2020

- Rank pips look like numbers.
- Added double discard detection.

## July 13th, 2020

- Players replay the game as spectators when it ends.

## July 12th, 2020

- Added custom cursors.
- Stack bases can be morphed.

## July 7th, 2020

- Added deck animations and reverse animations.

## July 4th, 2020

- Card properties are reactive.

## June 28th, 2020

- Added the logo to the header.

## June 21st, 2020

- Added touch actions.
- Added borders for clued cards.
- Arrows can be placed on everything in the score area.

## June 14th, 2020

- Added the `/kick` chat command.

## June 9th, 2020

- The history page can be filtered.

## June 1st, 2020

- Added the `/seed` endpoint.
- Perspectives can be shifted in solo replays.
- Added reversed variants with special suits.

## May 31st, 2020

- Added the "unclued" note.
- Added an endpoint for creating tables automatically.

## May 30th, 2020

- Added friends history.
- Added the `/tagdelete` chat command.

## May 29th, 2020

- Added tags.
- Added a critical card indicator.
- The deck tooltip shows the seed.

## May 28th, 2020

- Added the `/shrug` and `/setleader` chat commands.
- Added reversed suits.

## May 26th, 2020

- Added the `/friendlist` chat command.

## May 25th, 2020

- Added a marker for the current turn.
- Added a password reset link to the login screen.

## May 24th, 2020

- Removed the speedrun record feature.

## May 16th, 2020

- Negative information can reveal suits and ranks.
- Server notices are highlighted in the chat.

## May 15th, 2020

- Cards can be morphed into blank cards.

## May 12th, 2020

- Added the `/new` chat command.

## May 9th, 2020

- Added friends, with the `/friend`, `/unfriend`, and `/friends` chat commands.

## May 8th, 2020

- Added a message of the day.

## May 5th, 2020

- Added the `/changevariant` chat command.

## May 1st, 2020

- Passwords are hashed with Argon2.
- Added a new "Your Turn" interface.

## April 16th, 2020

- Restored desktop notifications.

## April 15th, 2020

- Added tab completion and new emotes.
- Shutdowns give notice at 5 and 10 minutes.

## April 14th, 2020

- The up and down arrows recall previous chat messages.

## April 13th, 2020

- The profile shows the date the player joined.

## April 12th, 2020

- Added a password reset page.
- Added the `/timeleft` chat command.

## April 11th, 2020

- Added the `/rules` chat command and the "All History" button.

## April 9th, 2020

- Added the `/lastmove` chat command.

## April 5th, 2020

- Added rate limiting.
- Shared replays can change perspective.

## April 4th, 2020

- Added a maintenance page.

## March 31st, 2020

- Added a typing indicator.
- Inactive users are shown.

## March 30th, 2020

- Added private messages.
- Added the `/whoami` chat command and muting.
- Added the Slow-Witted and Quacker characters.

## March 29th, 2020

- Added the `/uptime` chat command.
- Hypotheticals have a back button.

## March 28th, 2020

- Added the Forgetful character.

## March 27th, 2020

- Added the `/findvariant` chat command.
- Added the legible numbers option.

## March 26th, 2020

- The variant dropdown is searchable.
- Ongoing tables are notified of server restarts and shutdowns.

## March 25th, 2020

- Added a random variant button.
- Joined tables are sorted to the top.

## March 23rd, 2020

- Added the hyphen-ated conventions option.

## March 22nd, 2020

- Added the card cycling option.
- Revamped the statistics and missing scores pages.
- Tables are sorted by status.

## March 21st, 2020

- Added aliases for `/link`.

## November 19th, 2019

- Hypotheticals work, and morphing is limited to hypotheticals.

## November 17th, 2019

- Added a note for blanking out a card.
- An "f" note gives a card an aqua border.

## November 1st, 2019

- Added the `/startin` chat command.
- Added the Prism Ones and Multi Fives variants.

## October 31st, 2019

- Added the `/link` chat command.

## September 24th, 2019

- Added the Cocoa Rainbow and Chiaroscuro Pink variants.

## September 23rd, 2019

- Added the Extremely Ambiguous variants and a speedrun mode setting.

## September 20th, 2019

- Added the Very Ambiguous variants.

## September 16th, 2019

- Added the Alternating Clues variants.
- The variant can be searched in the create game dialog.

## September 13th, 2019

- Added the `/maintenance` chat command.
- The turn can be given in the URL.

## September 5th, 2019

- A red border indicates 0 clues.

## September 3rd, 2019

- Added the Ambiguous and Dual-Color variants.

## September 2nd, 2019

- A tooltip shows the time taken on a turn.

## August 15th, 2019

- Added a sound for discarding clued cards.

## August 7th, 2019

- Replaced synth sounds with piano sounds.

## August 6th, 2019

- Links in the chat are clickable.
- Added the Null suit.

## August 1st, 2019

- Added the `/pause` and `/unpause` chat commands.

## July 30th, 2019

- Added the Omni suit.

## July 29th, 2019

- Cards can be morphed in solo replays.

## May 1st, 2019

- Profiles show the total time played.

## April 30th, 2019

- Added the Prism Ones variants.
- Spectators can write notes.
- Chat is kept when a game is restarted.

## April 20th, 2019

- Spectators can shadow a player.

## April 17th, 2019

- You can see empathy for your own hand.

## April 16th, 2019

- Added pausing.
- Added the Cow & Pig, Number Blind, Pink, Color Mute, and Number Mute variants.

## April 15th, 2019

- Empty play stacks can be right-clicked.

## April 14th, 2019

- Cards morph according to their notes.

## April 13th, 2019

- Added correspondence games.
- Added the Gray suit.
- Dead cards are faded.

## April 11th, 2019

- Cards that have already been played are faded.

## April 7th, 2019

- Settings are stored on the server.
- The BGA layout is the default, and a real-life layout was added.

## March 27th, 2019

- Added the `/replay` chat command.
- History links are clickable.

## March 26th, 2019

- The server announces when it goes down.

## March 24th, 2019

- Added a misplay animation.
- Speedruns end as soon as a perfect score is impossible.

## March 21st, 2019

- Ctrl + C copies the game ID.
- Pace and efficiency have tooltips.

## March 20th, 2019

- Strikes have tooltips, and clicking one shows the misplayed card.

## March 17th, 2019

- Added emotes and emoji autocompletion.

## March 16th, 2019

- Replays show the game ID.

## March 11th, 2019

- Added a "Turns left" counter.

## February 24th, 2019

- Added JSON games and the `/export` API.

## February 15th, 2019

- Added restarting a game.

## February 14th, 2019

- Added animated arrows.

## February 12th, 2019

- Added speedrun mode, which does not count toward statistics.
- Games can start automatically.

## February 10th, 2019

- The deck tooltip shows the game options.
- Clicking a played card goes to the turn it was played.
- The delete key deletes the hovered note.

## February 7th, 2019

- Added a tutorial for new users.

## January 25th, 2019

- Added pregame chat and a draggable, resizable in-game chat.

## January 23rd, 2019

- Added the Clue Starved variants.

## January 18th, 2019

- Added a flowchart guidance system.

## January 13th, 2019

- Rewrote the lobby.

## January 10th, 2019

- Added the missing scores page.

## January 3rd, 2019

- Up or Down cards are labeled with their direction.

## January 1st, 2019

- Preplaying is an optional setting.
- Added the Four Suits and Three Suits variants.
- The history screens are full screen.

## December 30th, 2018

- Added new variants.

## November 10th, 2018

- Added characters.
- Removed the reorder cards feature.

## October 25th, 2018

- Renamed "Acid Trip" to "Color Blind".

## October 1st, 2018

- Added in-game chat.

## September 28th, 2018

- Added the Board Game Arena layout option.

## September 7th, 2018

- Added speedrun hotkeys.

## August 14th, 2018

- The lobby shows all game modifiers.

## August 13th, 2018

- Added the `/help` and `/last` chat commands.

## August 8th, 2018

- Added password-protected games.
- The lobby shows spectator names.

## August 7th, 2018

- Added shared replay progress.

## July 24th, 2018

- Added the `/here` chat command.

## July 20th, 2018

- Added the `/list` chat command.

## July 6th, 2018

- Added the double discard feature.
- The server tracks the maximum score.

## July 5th, 2018

- Added the `/next` chat command.

## June 28th, 2018

- Player names link to their profiles.

## June 25th, 2018

- Added idle timeouts.

## June 21st, 2018

- Added the reverse hand direction option.
- Added the Single Multi Rainbow variant.

## June 18th, 2018

- Added efficiency statistics.

## March 4th, 2018

- Added colorful arrows.

## March 2nd, 2018

- Added new variants.

## January 18th, 2018

- Rewrote the lobby.

## January 17th, 2018

- Previous notes are highlighted when editing.

## January 9th, 2018

- The server was rewritten from Node.js to Go.
- Added a new card back.
- Players rejoin shared replays automatically.

## November 29th, 2017

- Added timer settings and an option to hide timers in untimed games.

## November 26th, 2017

- Added HTTPS.

## November 21st, 2017

- The lobby shows game progress.

## November 19th, 2017

- Colorblind mode lists component colors.

## October 25th, 2017

- Replays can be watched and shared by ID.

## October 23rd, 2017

- Clues can be applied to other players' cards.

## October 22nd, 2017

- Notes work in replays and shared replays.
- Game results are announced on Discord.
- Arrows replace border indicators, and gold borders replace clue circles.

## October 21st, 2017

- The lobby shows table options.
- The history shows game dates and other players.

## October 3rd, 2017

- Pips show learned information.

## September 23rd, 2017

- The timer ticking sound is a separate setting.

## September 6th, 2017

- The shared replay leader can indicate cards.
- Followers can detach from a shared replay.

## August 14th, 2017

- Added score comparisons to the history.

## August 11th, 2017

- Added suit and rank pips.

## August 8th, 2017

- Shared replays show when a note is added.

## August 3rd, 2017

- Added new variants.

## August 1st, 2017

- Added a new font.

## July 30th, 2017

- Added the White variant.
- The clue label turns red at 8 clues.

## July 27th, 2017

- Added automatic resume.
- Added a cursor for the shared replay leader.

## July 26th, 2017

- Added card reordering.
- Added black clues to black suit variants.

## July 24th, 2017

- Hovering over the spectator count shows the spectators.
- Added a shared replay leader icon.

## July 23rd, 2017

- Added lobby hotkeys and credits.

## July 22nd, 2017

- Notes are stored on the server and persist across computers.
- Improved the login screen.

## July 21st, 2017

- Tables get randomly generated names.

## July 20th, 2017

- Added shared replays.

## July 19th, 2017

- Added solid color cards with triangles.
- Timers are shown in untimed games.
- Renamed "loss rate" to "strikeout rate".

## July 17th, 2017

- Lobby chat is echoed to and from Discord.

## July 16th, 2017

- Added the Mixed-Color Suits variant.
- Added username, password, and table name validation.
- Added clue hotkeys.

## July 14th, 2017

- Added colorblind mode.

## July 12th, 2017

- The lobby shows each player's status.
- Added sound preloading and a spectator count.
- A game ends when no more cards can be played.

## July 9th, 2017

- A sound plays when a player's timer runs low.

## July 7th, 2017

- Added bottom-deck blind plays.

## July 6th, 2017

- Added clocks.

## July 2nd, 2017

- Initial release, based on Keldon's Hanabi server.
