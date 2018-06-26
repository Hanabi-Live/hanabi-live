hanabi-live
===========

## Description

* This is the source code for my [Hanabi game server](http://hanabi.live/).
* This is an emulation of the [Keldon Hanabi game server](http://keldon.net/hanabi/), of which the source code is not published.
* It is programmed in [Go](https://golang.org/).
* It uses a [MariaDB](https://mariadb.org/) database to store information about the users and games.
* All database logic is in the `src/models` subdirectory.
* The client-side JavaScript is located in `public/js`.

<br />



## Discord

Find teammates to play games with at [the Hanabi Discord server](https://discord.gg/FADvkJp). We also discuss code changes here.

<br />



## List of Variants

Hanabi.live implements [many different kinds of special variants](https://github.com/Zamiell/hanabi-live/tree/master/docs/VARIANTS.md), in which the rules are changed to make the game more difficult.

<br />



## List of Changes & Improvements

See the [changes documentation](https://github.com/Zamiell/hanabi-live/tree/master/docs/CHANGES.md).

<br />



## Installation

See the [installation documentation](https://github.com/Zamiell/hanabi-live/tree/master/docs/INSTALL.md).

<br />



## Credits

* [Keldon Jones](http://keldon.net/) was the original creator of game UI.
* [Hyphen-ated](https://github.com/Hyphen-ated/) created the useful Chrome extension called [Make Hanabi Great Again](https://github.com/Hyphen-ated/MakeHanabiGreatAgain), which extended the features of the original site. The features from the extension are integrated into the new site.
