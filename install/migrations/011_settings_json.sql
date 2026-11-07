-- Store settings as one JSON object on users holding only the values a user changed, keyed by
-- the client-facing names; the server supplies every default. user_settings is no longer read
-- and is dropped by a later migration.
ALTER TABLE users ADD COLUMN settings JSONB NOT NULL DEFAULT '{}';

UPDATE users SET settings = changed.settings
FROM (
  SELECT user_id, jsonb_strip_nulls(jsonb_build_object(
      'desktopNotification', CASE WHEN desktop_notification <> FALSE THEN to_jsonb(desktop_notification) END,
      'soundMove', CASE WHEN sound_move <> 0 THEN to_jsonb(sound_move) END,
      'soundTimer', CASE WHEN sound_timer <> TRUE THEN to_jsonb(sound_timer) END,
      'keldonMode', CASE WHEN keldon_mode <> FALSE THEN to_jsonb(keldon_mode) END,
      'colorblindMode', CASE WHEN colorblind_mode <> FALSE THEN to_jsonb(colorblind_mode) END,
      'realLifeMode', CASE WHEN real_life_mode <> FALSE THEN to_jsonb(real_life_mode) END,
      'reverseHands', CASE WHEN reverse_hands <> FALSE THEN to_jsonb(reverse_hands) END,
      'styleNumbers', CASE WHEN style_numbers <> FALSE THEN to_jsonb(style_numbers) END,
      'showTimerInUntimed', CASE WHEN show_timer_in_untimed <> FALSE THEN to_jsonb(show_timer_in_untimed) END,
      'speedrunPreplay', CASE WHEN speedrun_preplay <> FALSE THEN to_jsonb(speedrun_preplay) END,
      'speedrunMode', CASE WHEN speedrun_mode <> FALSE THEN to_jsonb(speedrun_mode) END,
      'hyphenatedConventions', CASE WHEN hyphenated_conventions <> FALSE THEN to_jsonb(hyphenated_conventions) END,
      'volume', CASE WHEN volume <> 50 THEN to_jsonb(volume) END,
      'createTableVariant', CASE WHEN create_table_variant <> 'No Variant' THEN to_jsonb(create_table_variant) END,
      'createTableTimed', CASE WHEN create_table_timed <> FALSE THEN to_jsonb(create_table_timed) END,
      'createTableTimeBaseMinutes', CASE WHEN create_table_time_base_minutes <> 2 THEN to_jsonb(create_table_time_base_minutes) END,
      'createTableTimePerTurnSeconds', CASE WHEN create_table_time_per_turn_seconds <> 20 THEN to_jsonb(create_table_time_per_turn_seconds) END,
      'createTableSpeedrun', CASE WHEN create_table_speedrun <> FALSE THEN to_jsonb(create_table_speedrun) END,
      'createTableCardCycle', CASE WHEN create_table_card_cycle <> FALSE THEN to_jsonb(create_table_card_cycle) END,
      'createTableDeckPlays', CASE WHEN create_table_deck_plays <> FALSE THEN to_jsonb(create_table_deck_plays) END,
      'createTableEmptyClues', CASE WHEN create_table_empty_clues <> FALSE THEN to_jsonb(create_table_empty_clues) END,
      'createTableOneExtraCard', CASE WHEN create_table_one_extra_card <> FALSE THEN to_jsonb(create_table_one_extra_card) END,
      'createTableOneLessCard', CASE WHEN create_table_one_less_card <> FALSE THEN to_jsonb(create_table_one_less_card) END,
      'createTableAllOrNothing', CASE WHEN create_table_all_or_nothing <> FALSE THEN to_jsonb(create_table_all_or_nothing) END,
      'createTableDetrimentalCharacters', CASE WHEN create_table_detrimental_characters <> FALSE THEN to_jsonb(create_table_detrimental_characters) END,
      'createTableMaxPlayers', CASE WHEN create_table_max_players <> 5 THEN to_jsonb(create_table_max_players) END
  )) AS settings
  FROM user_settings
) changed
WHERE users.id = changed.user_id AND changed.settings <> '{}';
