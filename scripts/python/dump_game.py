#!/usr/bin/env python3
"""
dump_game
~~~~~~~~~

Parse, analyze hanabi.live games
Game format documented at
  https://github.com/Zamiell/hanabi-live/blob/master/misc/example_game_with_comments.json

Retrieve games via e.g. wget https://hanabi.live/export/46008

%InsertOptionParserUsage%

Examples:
  dump_game.py 46008
  dump_game -h


TODO:
   refactor print to provide method to retrieve info to be displayed, and allow other
   methods of display besides printing on stdout.
   print notes, game id, etc


SPDX-License-Identifier:	GPL-3.0-or-later
"""

import sys
import logging
import argparse
from pprint import pprint
import json

__version__ = "0.1.0"


parser = argparse.ArgumentParser(description="Parse and dump hanabi-live game")

parser.add_argument('-v', '--version', action='store_true',
                    help='Print version number, or print verbose test results')

parser.add_argument("--test",  action="store_true", default=False,
  help="Run tests")

parser.add_argument("-d", "--debuglevel", type=int, default=logging.WARNING,
  help="Set logging level to debuglevel, expressed as an integer: "
  "DEBUG=10, INFO=20, WARNING=30, ERROR=40, CRITICAL=50. "
  "The default is %(default)s" )

parser.add_argument('filenames', nargs='*',
                    help='Game records to parse and dump, in json format')


# incorporate OptionParser usage documentation in our docstring
# alternative: reference __doc__ as desc from https://realpython.com/python-comments-guide/
__doc__ = __doc__.replace("%InsertOptionParserUsage%\n", parser.format_help())


class Struct(object):
    """Read in dictionary and recursively make it into a class instance of nested Structs"""

    def __init__(self, data):
        for name, value in data.items():
            setattr(self, name, self._wrap(value))

    def _wrap(self, value):
        if isinstance(value, (tuple, list, set, frozenset)): 
            return type(value)([self._wrap(v) for v in value])
        else:
            return Struct(value) if isinstance(value, dict) else value


colornames = ['blue', 'green', 'yellow', 'red', 'purple', 'black']
colors = ['B', 'G', 'Y', 'R', 'P', 'B']
cluetypes = ['rank', 'color']


class Game(Struct):
    def card(self, index):
        card = self.deck[index]
        return "%s%s" % (colors[card.suit], card.rank)

    def print(self):
        """Print human-readable interpretation of game

        """

        print("hanabi-live game\nVariant: %s\nPlayers: %s\n" % (self.variant, self.players))

        turn = 1
        playerid = self.firstPlayer
        for action in self.actions:
            if action.type == 0:
                cluetype = cluetypes[action.clue.type]
                if cluetype == "color":
                    value = colornames[action.clue.value]
                else:
                    value = action.clue.value
                desc = "Clue: %s %s to %s" % (cluetype, value, self.players[action.target])
            elif action.type == 1:
                desc = "Play: %s" % self.card(action.target)
            elif action.type == 2:
                desc = "Discard: %s" % self.card(action.target)
            else:
                desc = "Invalid action"
            print("Turn %d: %s by %s" % (turn, desc, self.players[playerid]) )
            playerid = (playerid + 1) % len(self.players)
            turn += 1


def totest(n):
    """
    >>> totest(2)
    2
    """
    return n


def _test():
    import doctest
    return doctest.testmod()


def main(parser):
    "Run dump_game with given argparse arguments"

    args = parser.parse_args()

    #configure the root logger.  Without filename, default is StreamHandler with output to stderr.
    # Default level is WARNING
    logging.basicConfig(level=args.debuglevel)   # ..., format='%(message)s', filename= "/file/to/log/to", filemode='w' )

    logging.debug("args: %s", args)

    if args.test:
        _test()
        sys.exit(0)

    if args.version:
        print("%s version %s" % (parser.prog, __version__))
        sys.exit(0)

    for name in args.filenames:
        logging.debug("Processing argument %s", name)

        game = Game(json.load(open(name, 'r')))
        game.print()


if __name__ == "__main__":
    main(parser)
