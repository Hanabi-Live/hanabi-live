package main

import (
	"context"

	"github.com/jackc/pgx/v4"
)

type UserSettings struct{}

type Settings struct {
	DesktopNotification             bool    `json:"desktopNotification"`
	SoundMove                       bool    `json:"soundMove"`
	SoundTimer                      bool    `json:"soundTimer"`
	KeldonMode                      bool    `json:"keldonMode"`
	ColorblindMode                  bool    `json:"colorblindMode"`
	RealLifeMode                    bool    `json:"realLifeMode"`
	ReverseHands                    bool    `json:"reverseHands"`
	StyleNumbers                    bool    `json:"styleNumbers"`
	ShowTimerInUntimed              bool    `json:"showTimerInUntimed"`
	Volume                          int     `json:"volume"`
	SpeedrunPreplay                 bool    `json:"speedrunPreplay"`
	SpeedrunMode                    bool    `json:"speedrunMode"`
	HyphenatedConventions           bool    `json:"hyphenatedConventions"`
	CreateTableVariant              string  `json:"createTableVariant"`
	CreateTableTimed                bool    `json:"createTableTimed"`
	CreateTableTimeBaseMinutes      float64 `json:"createTableTimeBaseMinutes"`
	CreateTableTimePerTurnSeconds   int     `json:"createTableTimePerTurnSeconds"`
	CreateTableSpeedrun             bool    `json:"createTableSpeedrun"`
	CreateTableCardCycle            bool    `json:"createTableCardCycle"`
	CreateTableDeckPlays            bool    `json:"createTableDeckPlays"`
	CreateTableEmptyClues           bool    `json:"createTableEmptyClues"`
	CreateTableCharacterAssignments bool    `json:"createTableCharacterAssignments"`
	CreateTableAlertWaiters         bool    `json:"createTableAlertWaiters"`
}

var (
	// The database schema must also be configured with any default settings
	defaultSettings = Settings{
		SoundMove:                     true,
		SoundTimer:                    true,
		Volume:                        50,
		CreateTableVariant:            "No Variant",
		CreateTableTimeBaseMinutes:    2,
		CreateTableTimePerTurnSeconds: 20,
	}
)

func (*UserSettings) Get(userID int) (Settings, error) {
	settings := Settings{}

	if err := db.QueryRow(context.Background(), `
		SELECT
			desktop_notification,
			sound_move,
			sound_timer,
			keldon_mode,
			colorblind_mode,
			real_life_mode,
			reverse_hands,
			style_numbers,
			show_timer_in_untimed,
			volume,
			speedrun_preplay,
			speedrun_mode,
			hyphenated_conventions,
			create_table_variant,
			create_table_timed,
			create_table_time_base_minutes,
			create_table_time_per_turn_seconds,
			create_table_speedrun,
			create_table_card_cycle,
			create_table_deck_plays,
			create_table_empty_clues,
			create_table_character_assignments,
			create_table_alert_waiters
		FROM user_settings
		WHERE user_id = $1
	`, userID).Scan(
		&settings.DesktopNotification,
		&settings.SoundMove,
		&settings.SoundTimer,
		&settings.KeldonMode,
		&settings.ColorblindMode,
		&settings.RealLifeMode,
		&settings.ReverseHands,
		&settings.StyleNumbers,
		&settings.ShowTimerInUntimed,
		&settings.Volume,
		&settings.SpeedrunPreplay,
		&settings.SpeedrunMode,
		&settings.HyphenatedConventions,
		&settings.CreateTableVariant,
		&settings.CreateTableTimed,
		&settings.CreateTableTimeBaseMinutes,
		&settings.CreateTableTimePerTurnSeconds,
		&settings.CreateTableSpeedrun,
		&settings.CreateTableCardCycle,
		&settings.CreateTableDeckPlays,
		&settings.CreateTableEmptyClues,
		&settings.CreateTableCharacterAssignments,
		&settings.CreateTableAlertWaiters,
	); err == pgx.ErrNoRows {
		return defaultSettings, nil
	} else if err != nil {
		return defaultSettings, err
	}

	return settings, nil
}

func (*UserSettings) Set(userID int, name string, value string) error {
	// First, find out if they have customized any settings yet
	var count int
	if err := db.QueryRow(context.Background(), `
		SELECT COUNT(user_id)
		FROM user_settings
		WHERE user_id = $1
	`, userID).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		// They have not customized any settings yet, so insert a row for them with default settings
		if _, err := db.Exec(context.Background(), `
			INSERT INTO user_settings (user_id) VALUES ($1)
		`, userID); err != nil {
			return err
		}
	}

	// Disable the gosec linter for this next code block
	// We cannot use "$1" to put a variable for the column name,
	// so we must build the query string dynamically
	// Validation has already occurred in the "commandSetting()" function,
	// so this should be safe
	// https://www.reddit.com/r/golang/comments/5l5k4e/
	// nolint: gosec
	_, err := db.Exec(context.Background(), `
		UPDATE user_settings
		SET `+name+` = $1
		WHERE user_id = $2
	`, value, userID)
	return err
}
