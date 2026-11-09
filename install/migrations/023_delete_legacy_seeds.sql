/*
 * A "legacy-N-" seed marked a game from before April 2020 that started with seat N. Migration 020
 * deleted those games but left their seed rows, which no game references any more.
 */
DELETE FROM seeds WHERE seed LIKE 'legacy-%';
