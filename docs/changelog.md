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
- Added a link to the changelog in the resources dialog.
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

- Added the `/terminate` chat command to terminate an ongoing game.
- Added the `/link` chat command, which links another account to yours so you
  won't be dealt the same seeds.
- Added the Sudoku 4-suit variants and the dark 6-suit variants.

## August 10th, 2023

- The Candy Corn Mix, Holiday Mix, and RGB Mix variants show suit names under
  the stacks.

## July 27th, 2023

- Reworked the Sudoku interface.

## July 26th, 2023

- Added the "Sudoku" variants.

## July 6th, 2023

- Ctrl + left-click opens a card's note, for Macs without right-click.

## May 31st, 2023

- A variant is now considered hard at 1.33 efficiency or higher.

## March 3rd, 2023

- Added the "RGB Mix" variants.

## February 1st, 2023

- Added the "Valentine Mix" variants.
- Seed pages show a chart of how often each score was reached, and the lobby's
  other-scores screen links to them.
- The games list on variant pages links each game's seed.

## January 20th, 2023

- A `!` note now shows an exclamation mark on the card.

## January 18th, 2023

- The lobby table list and game name now show the table options.

## January 11th, 2023

- Spectators can use the right-click note shortcuts (such as shift + right-click
  for `f`).
- A finished game's shared replay now keeps the table name, adding the game
  number.
- In a hypothetical, Empathy shows morphed cards as their morphed identity.

## January 4th, 2023

- Added the "Matryoshka" variants.

## January 3rd, 2023

- A `?` note shows a question mark on the card.
- Left-clicking the skull now votes to terminate the game, and right-clicking
  terminates it immediately.

## December 28th, 2022

- "unknown" is now a synonym for the "blank" card note.

## December 16th, 2022

- Anyone can pass the shared replay leader by clicking the crown, not just the
  leader.
- Total variant statistics no longer count strikeouts.

## December 8th, 2022

- Spectators' own notes now change how cards look for them (e.g. chop move and
  finesse borders), as players' notes do.

## December 1st, 2022

- Added the "Holiday Mix" variants.
- Added 3 new emotes.

## November 29th, 2022

- Morphing can make a card blank or restore it.
- Morphed cards count toward deductions and `/copy`.
- Escape now closes the morph dialog.

## November 22nd, 2022

- More chop move abbreviations in notes (such as `ttcm` and `atcm`) mark a card
  as chop moved.

## November 12th, 2022

- Spectators' notes are kept after they leave and shown after the game, below
  the players' notes.
- A new trash can icon marks cards that their holder can deduce are trash.

## October 28th, 2022

- Added Zen mode, which hides chat notifications and the spectator count. You
  can activate it by right-clicking the chat button in a game.

## October 6th, 2022

- Added the "Funnels" variants.

## October 5th, 2022

- Restarting a game offers to remake the table as a pre-game, so players can
  join or leave first.

## May 31st, 2022

- Suit pips are highlighted when a positive color clue touched that suit.
- Players can spectate a table before it starts by clicking on the spectators
  section of the row.

## February 23rd, 2022

- The player buttons in the clue area show a radio-button dot for the selected
  player.

## February 14th, 2022

- Arrows can now be used in solo replays.

## February 5th, 2022

- The Discord bot replies publicly instead of privately, and its commands work
  only in the Discord lobby channel.

## January 27th, 2022

- Added "Odds and Evens" variants.

## January 26th, 2022

- Discord spoilers (e.g., `||text||`) are hidden in the lobby chat until hovered
  over.

## January 19th, 2022

- The morphing dialog now shows a grid of every card, so a card can be picked
  with one click.

## January 15th, 2022

- Efficiency is now shown on the missing scores pages.

## January 11th, 2022

- Added the /copy chat command, which copies a hypothetical (with anonymized
  players) to the clipboard.

## January 8th, 2022

- The full history API now includes user tags.

## January 5th, 2022

- The Git repository for this website has moved to the Hanabi-Live organization.

## January 4th, 2022

- Added new JSON routes to the API.

## January 2nd, 2022

- The history, variant, and seed pages now load dynamically and show a spinner.

## December 23rd, 2021

- Added the `/levels` chat command.
- Added the `/manual` chat command.
- Added the `/sin` chat command.
- On narrow screens, the online users heading shows the number of users online.

## December 18th, 2021

- The dedicated statistics pages are now paginated and filterable.

## December 14th, 2021

- Added the `/tagsdeleteall` chat command.

## December 10th, 2021

- Added voting to terminate a game.

## December 9th, 2021

- Morphing now uses a dialog.

## December 7th, 2021

- Added 11 new emotes.

## November 29th, 2021

- Replaced browser dialogs with better-looking modals.

## November 2nd, 2021

- Players who are not the host can now propose options.

## October 29th, 2021

- Options can be changed in the pre-game screen.
- Added the "Synesthesia" and "Critical Fours" variants.
- Notes can now be edited on mobile.

## August 3rd, 2021

- While in a game, the up and down arrow keys will toggle the replay.

## May 11th, 2021

- Added indicators for cards that could be the last copy (for double discard
  avoidance).

## May 3rd, 2021

- Added tooltips for the play stacks.

## April 24th, 2021

- In "Up or Down" variants, there is now a pip for the start card.

## March 15th, 2021

- Added the "clued" identity note.

## March 11th, 2021

- Typing the start of a message and pressing up recalls your earlier messages
  that begin with it.

## March 5th, 2021

- The shift + right click and alt + right click shortcuts now put the
  corresponding identity note in square brackets.
- Players who are not the leader can now suggest variants with the dropdown.

## February 11th, 2021

- Card possibilities are now reduced by complex deduction, not just by counting
  visible cards.

## January 7th, 2021

- Added the ability to put negative identity notes with "!", like "!b".

## December 6th, 2020

- Overhauled the hypothetical interface.

## December 5th, 2020

- The future efficiency tooltip now shows more detailed information.

## December 1st, 2020

- Cards that have been denoted as being finessed with an "f" note will now
  automatically modify the future efficiency.
- Added the `/bga` and `/doc` chat commands.

## November 26th, 2020

- Added the "Impostor" detrimental character.
- Added efficiency for "Throw It in a Hole" variants.

## November 21st, 2020

- Hypotheticals can now be started in the middle of a game, not just in a
  replay.
- You can Ctrl + click a table row in the lobby to put a link for that table in
  the clipboard.

## November 20th, 2020

- Added the "Deceptive-Ones" and "Deceptive-Fives" variants.
- The current turn of a game is now stored in the URL.

## November 18th, 2020

- Hovering over the turn number shows the maximum rounds left and other
  statistics.
- In the Keldon layout, the current player arrow points at the player instead of
  their cards.

## November 11th, 2020

- Identity list notes will now automatically change the pips on a card to match.

## November 1st, 2020

- Future efficiency will now be shown on the right side of a game. You can
  manually modify it by right-clicking.

## October 29th, 2020

- Removed the `/here` chat command to ping Discord.

## August 25th, 2020

- Added the "Dark Prism" variants.
- The timer now starts when the first player has loaded (instead of when the
  game has started).

## August 24th, 2020

- Improved the shared missing scores page.

## August 21st, 2020

- Overlapping suit abbreviations are now handled automatically.

## August 18th, 2020

- The "Your Turn" UI now shows in the in-game replay.
- Seeds are now sorted by score.

## August 14th, 2020

- Anyone can now change the shared replay leader with the "/setleader" chat
  command.
- JSON games support detrimental characters.

## August 13th, 2020

- The loading time of the website has been reduced due to lazy initialization.

## July 30th, 2020

- Added the `/suggest` chat command.

## July 29th, 2020

- Added the `/missingscores` chat command.

## July 28th, 2020

- Misplays are now allowed in hypotheticals.
- The create game dialog now remembers its options and hides extra options by
  default.

## July 26th, 2020

- The history page can now be filtered by score.

## July 25th, 2020

- The lobby status is now clickable.

## July 24th, 2020

- The site was renamed to Hanab Live.

## July 20th, 2020

- Rewrote the efficiency calculation.

## July 14th, 2020

- Rank pips look like numbers.
- Added double discard detection.

## July 13th, 2020

- You no longer have to refresh the game after it ends in order to get
  up-to-date card information.

## July 12th, 2020

- The cursor changes over cards to show when you can drag or Empathy.
- Stack bases can now be morphed.

## July 7th, 2020

- Added animations for cards coming from the deck.
- Added the ability for animations to go in reverse.

## June 28th, 2020

- Added the logo to the header.

## June 21st, 2020

- Added mobile support for touching cards and other UI elements in-game.
- Added borders for clued cards.
- Arrows can now be placed on everything in the score area.

## June 14th, 2020

- Added the `/kick` chat command for administrators.

## June 9th, 2020

- The history page can now be filtered.

## June 1st, 2020

- Added the `/seed` endpoint.
- Perspectives can now be shifted in solo replays.
- Added reversed variants with special suits.

## May 31st, 2020

- Added the "unclued" note.
- Added an endpoint for creating tables automatically.

## May 30th, 2020

- Added the friends history feature.

## May 29th, 2020

- Added the tags feature, so that you can tag games with arbitrary text. Use
  `/tag` and `/untag` while in a game.
- Added a critical card indicator.
- The deck tooltip now shows the seed.

## May 28th, 2020

- Added the `/shrug` chat commands to display `¯\_(ツ)_/¯`.
- Added the `/setleader` chat command.
- Added reversed variants.

## May 25th, 2020

- Added a translucent dark box drawn behind the hand of the player whose turn it
  is.
- Added a password reset link to the login screen.

## May 24th, 2020

- Speedruns no longer announce how close they came to the record.

## May 16th, 2020

- Negative information can now cause a card to appear as its true suit or rank.
- Server notices are highlighted in the chat.

## May 15th, 2020

- In a hypothetical, cards can now be morphed into blank cards.

## May 12th, 2020

- Added the `/new` chat command to link the H-Group beginner's guide.

## May 9th, 2020

- Added the friends feature. Tables with friends will be automatically sorted to
  the top of the list.
- Added the `/friend`, `/unfriend`, and `/friends` chat commands.

## May 8th, 2020

- Added a message of the day feature.

## May 5th, 2020

- Added the `/changevariant` chat command.

## May 1st, 2020

- Passwords are stored more securely (with Argon2 hashing).
- Added a new "Your Turn" UI in-game.

## April 16th, 2020

- Re-added the desktop notification feature.

## April 15th, 2020

- Added 41 new emotes.
- Added tab completion for emotes.
- Games are now warned 10 minutes before a shutdown ends them (in addition to
  the existing 5 minutes).

## April 14th, 2020

- In the chat, the up and down arrows now recall previous chat messages.

## April 13th, 2020

- The profile shows the date the player joined the website.

## April 12th, 2020

- Added a password reset page.

## April 11th, 2020

- Added the `/rules` chat command to show the community guidelines.
- Added the "All History" button to the bottom of the history page.
- Shutdowns end unfinished games after 30 minutes, warning them 5 minutes
  before.

## April 5th, 2020

- Added server-side rate limiting to prevent denial of service attacks.
- In a shared replay, you can now change your perspective to a specific player.

## March 23rd, 2020

- Removed the desktop notification feature.

## March 31st, 2020

- While in a game, there is now an indicator to show that a player is currently
  typing.
- In the lobby, inactive users are given a special icon and faded.

## March 30th, 2020

- Added the ability to send private messages with `/pm`.
- Added the `/whoami` chat command.
- Added the ability for administrators to mute people.
- Added the "Slow-Witted" and "Quacker" detrimental characters.

## March 29th, 2020

- Added the `/uptime` chat command.
- Hypotheticals now have a back button.

## March 28th, 2020

- Added the "Forgetful" detrimental character.

## March 27th, 2020

- Added the `/findvariant` chat command.
- Added the "Make numbers on cards match the art style" option.

## March 26th, 2020

- The variant dropdown is now searchable.
- Scheduled restarts and shutdowns are announced in game chats as well as the
  lobby.

## March 25th, 2020

- Added a random variant button.
- Joined tables are sorted to the top.

## March 23rd, 2020

- Added an option for "Enable H-Group features".

## March 22nd, 2020

- Re-added the card cycling option.
- Revamped the statistics and missing scores pages.
- Tables are now sorted by status.

## November 19th, 2019

- Added in-game hypotheticals.
- Added morphing a card inside of a hypotheticals.

## November 17th, 2019

- A "blank" note blanks out a card.
- An "f" note gives a card an aqua border.

## November 1st, 2019

- Added the `/startin` chat command.
- Added the "Prism-Ones" and "Multi-Fives" variants.

## October 31st, 2019

- Added the `/link` chat command.

## September 24th, 2019

- Added the "Cocoa Rainbow" and "Chiaroscuro Pink" variants.

## September 23rd, 2019

- Added the "Extremely Ambiguous" variants and a speedrun mode setting.

## September 20th, 2019

- Added the "Very Ambiguous" variants.

## September 16th, 2019

- Added the "Alternating Clues" variants.
- The variant can now be searched in the create game dialog.

## September 13th, 2019

- Added the "Throw It in a Hole" variants.
- Added the `/maintenance` chat command.
- The turn can now be given in a replay URL.

## September 5th, 2019

- Added a red border around the discard pile when at 0 clues.

## September 3rd, 2019

- Added the "Ambiguous and Dual-Color" variants.

## September 2nd, 2019

- A tooltip shows the time taken on a turn.

## August 15th, 2019

- Added a sound for discarding clued cards.

## August 7th, 2019

- Replaced synth sounds with piano sounds.

## August 6th, 2019

- Links in the chat are clickable.
- Added the "Null" variants.

## August 1st, 2019

- Added the `/pause` and `/unpause` chat commands.

## July 30th, 2019

- Added the "Omni" variants.

## July 29th, 2019

- Cards can be morphed in solo replays.

## May 1st, 2019

- Profiles show the total time played.

## April 30th, 2019

- Added the "Prism-Ones" variants.
- Spectators can write notes.
- Chat is kept when a game is restarted.

## April 20th, 2019

- Spectators can shadow a player.

## April 17th, 2019

- You can see empathy for your own hand.

## April 16th, 2019

- Added pausing.
- Added the "Cow & Pig", "Number Blind", "Pink", "Color Mute", and "Number Mute"
  variants.

## April 15th, 2019

- Empty play stacks can be right-clicked.

## April 14th, 2019

- Cards morph according to their notes.

## April 13th, 2019

- Added correspondence games.
- Added "Gray" variants.
- Dead cards are faded.

## April 11th, 2019

- Cards that have already been played are faded.

## April 7th, 2019

- Settings are stored on the server.
- The BGA layout is the default.
- Added "real-life mode".

## March 27th, 2019

- Added the `/replay` chat command.
- History links are clickable.

## March 26th, 2019

- The server announces when it goes down.
- Speedruns in main variants announce how close they came to the record, with a
  sound for a new record.

## March 24th, 2019

- Added a misplay animation.
- Speedruns end as soon as a perfect score is impossible.

## March 21st, 2019

- Ctrl + C copies the game ID.
- Pace and efficiency have tooltips.

## March 20th, 2019

- Strikes have tooltips. Clicking on a strike box shows the misplayed card.

## March 17th, 2019

- Added emotes and emoji autocompletion.

## March 16th, 2019

- Replays show the game ID.

## March 11th, 2019

- Added a "Turns left" counter.

## February 24th, 2019

- Added JSON games and the `/export` API.

## February 15th, 2019

- Added the ability to restart a game.

## February 14th, 2019

- Added animated arrows.

## February 12th, 2019

- Added speedrun mode, which does not count toward statistics.

## February 10th, 2019

- The deck tooltip shows the game options.
- Clicking a played card goes to the turn it was played.
- The delete key deletes the hovered note.

## February 7th, 2019

- Added a tutorial for new users.

## January 25th, 2019

- Added pregame chat and a draggable/resizable in-game chat.

## January 23rd, 2019

- Added the "Clue Starved" variants.

## January 10th, 2019

- Added the missing scores page.

## January 3rd, 2019

- Up or Down cards are now labeled with their direction.

## January 2nd, 2019

- Added the "Up or Down" variants.

## January 1st, 2019

- Preplaying is now an optional setting.
- Added three suit and four suit variants.
- The history screens are full screen.

## December 30th, 2018

- Added the "White (6 Suits)" variant.

## November 10th, 2018

- Added the "Detrimental Characters" option.
- Removed the card cycling option.

## October 1st, 2018

- Added lobby chat.

## September 28th, 2018

- Added the Board Game Arena layout option.

## September 7th, 2018

- Added speedrun hotkeys.

## August 14th, 2018

- The lobby shows all game modifiers.

## August 13th, 2018

- Added the `/help` chat command to get the list of commands.
- Added the `/last` chat command to see how long it was before the last ping.

## August 8th, 2018

- Added password-protected games.
- The lobby shows spectator names.

## August 7th, 2018

- Added shared replay progress indicators in the lobby.

## July 24th, 2018

- Added the `/here` chat command to ping Discord.

## July 20th, 2018

- Added the `/list` chat command to get the waiting list.

## July 6th, 2018

- Added the double discard feature.
- The server tracks the maximum score.

## July 5th, 2018

- Added the `/next` chat command to be pinged on Discord.

## June 28th, 2018

- Player names link to their profiles.

## June 25th, 2018

- Added idle table/game timeouts.

## June 21st, 2018

- Added the reverse hand direction option.
- Added the "Dark Rainbow" variant.

## June 18th, 2018

- Added efficiency statistics.

## March 4th, 2018

- Added colorful arrows.

## March 2nd, 2018

- Added "Ambiguous", "Very Ambiguous", and "Color Blind" variants.

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

- Positive/negative clues are now recorded on every card.

## October 22nd, 2017

- Notes work in replays and shared replays.
- Game results are announced on Discord.
- Arrows replace border indicators, and gold borders replace clue circles.

## October 21st, 2017

- The lobby shows table options.
- The history shows game dates and other players.

## October 3rd, 2017

- In replays, faded pips show which suits and ranks clues have ruled out.

## September 23rd, 2017

- Added a separate setting for the timer ticking sound.

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

- Added the "Dual-Color Mix" variant.

## August 1st, 2017

- Added a new font.

## July 30th, 2017

- Added the "White & Rainbow (6 Suits)" variant.
- The clue label turns red at 8 clues.

## July 27th, 2017

- Added automatic resume.
- Added a cursor for the shared replay leader.

## July 26th, 2017

- Added the card cycling option.
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

- Changed the appearance of dual-color suits.
- Timers are shown in untimed games.
- Renamed "loss rate" to "strikeout rate".

## July 17th, 2017

- Lobby chat is echoed to and from Discord.

## July 16th, 2017

- Added dual-color variants.
- Added clue hotkeys.

## July 14th, 2017

- Added colorblind mode.

## July 12th, 2017

- The lobby shows each player's status.
- Added a spectator count.
- Games now automatically end when no more cards can be played.

## July 9th, 2017

- A sound plays when a player's timer runs low.

## July 7th, 2017

- Added the "Bottom-Deck Blind-Plays" table option.

## July 6th, 2017

- Added the "Timed" table option.

## July 2nd, 2017

- The initial release, based on Keldon's Hanabi server.
