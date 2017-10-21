keldon-hanabi
=============

## Description

* This is the source code for my [Hanabi game server](http://hanabi.live/).
* This is an emulation of the [Keldon Hanabi game server](http://keldon.net/hanabi/), of which the source code is not published.
* It is programmed in [Node.js](https://nodejs.org/en/) using [Socket.IO](https://socket.io/).
* It uses a [MariaDB](https://mariadb.org/) database to store information about the users and games.
* The main file is `src/index.js`, which listens for HTTP connections.
* Handlers for messages (commands) recieved from the client are located in the `src/messages` subdirectory.
* All database logic is in the `src/models` subdirectory.
* The client-side JavaScript is located in `public/js`.

<br />

## Discord

Find teammates to play games with at [the Hanabi Discord server](https://discord.gg/FADvkJp). We also discuss code changes here.

<br />

## List of Changes & Improvements

See the [changes documentation](https://github.com/Zamiell/keldon-hanabi/tree/master/docs/CHANGES.md).

<br />

## Installation

See the [installation documentation](https://github.com/Zamiell/keldon-hanabi/tree/master/docs/INSTALL.md).

<br />

## Credits

* [Keldon Jones](http://keldon.net/) was the original creator of this amazing software. The client is around 6000 lines of code, so it must have taken a long time to make.
* [Hyphen-ated](https://github.com/Hyphen-ated/) created the extremely useful Chrome extension called [Make Hanabi Great Again](https://github.com/Hyphen-ated/MakeHanabiGreatAgain), which extended the features of the original site. MHGA is seamlessly integrated into the emulator.
