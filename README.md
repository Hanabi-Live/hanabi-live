<p align="center">
  <img src="https://github.com/Zamiell/hanabi-live/raw/master/public/img/logos/2.png" height=200 alt="Logo" title="Logo">
</p>
<br />

## Description

* This is the source code for [Hanab Live](http://hanab.live/), which is a website that allows people to play a cooperative card game online. It is similar to the card game [Hanabi](https://boardgamegeek.com/boardgame/98778/hanabi).
* This site is a fan-made creation and has no affiliation with the card game Hanabi, [Antoine Bauza](https://en.wikipedia.org/wiki/Antoine_Bauza) (the creator of Hanabi), or any of the the real-life publishers of the game (of which there are many).
* The client is programmed in [TypeScript](https://www.typescriptlang.org/). It is located in the `client` directory.
  * A lot of the code was originally taken from [Keldon Jones'](http://keldon.net/) implementation of the game. (His site no longer exists.)
* The server is programmed in [Go](https://golang.org/). It is located in the `server` subdirectory.
  * It uses a [PostgreSQL](https://www.postgresql.org/) database to store information about the users and games.

<br />

## Discord

Find teammates to play games with at [the Discord server](https://discord.gg/FADvkJp). We also discuss code changes here.

<br />

## List of Variants

Hanab Live is different from normal Hanabi in that it implements [many special variants](https://github.com/Zamiell/hanabi-live/tree/master/docs/VARIANTS.md), in which the rules are changed to make the game more difficult.

<br />

## List of Features

See the [features documentation](https://github.com/Zamiell/hanabi-live/tree/master/docs/FEATURES.md).

<br />

## Installation

See the [installation documentation](https://github.com/Zamiell/hanabi-live/tree/master/docs/INSTALL.md).

<br />

## Credits

* [Antoine Bauza](https://en.wikipedia.org/wiki/Antoine_Bauza) created Hanabi, which was the inspiration for this website. If you enjoy playing online, then you should purchase a physical copy of the game, since he will presumably receive a portion of the proceeds.
* [Keldon Jones](http://keldon.net/) was the original creator of the slick client-side user interface.
* [Hyphen-ated](https://github.com/Hyphen-ated/) coded many useful add-on features for Keldon's site that are integrated into Hanab Live.
