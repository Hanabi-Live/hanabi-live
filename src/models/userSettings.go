package models

import (
	"database/sql"
)

type UserSettings struct{}

type Settings struct {
	SendTurnNotify                  bool    `json:"sendTurnNotify"`
	SendTurnSound                   bool    `json:"sendTurnSound"`
	SendTimerSound                  bool    `json:"sendTimerSound"`
	ShowKeldonUI                    bool    `json:"showKeldonUI"`
	ShowColorblindUI                bool    `json:"showColorblindUI"`
	ShowTimerInUntimed              bool    `json:"showTimerInUntimed"`
	ReverseHands                    bool    `json:"reverseHands"`
	RealLifeMode                    bool    `json:"realLifeMode"`
	SpeedrunPreplay                 bool    `json:"speedrunPreplay"`
	CreateTableVariant              string  `json:"createTableVariant"`
	CreateTableTimed                bool    `json:"createTableTimed"`
	CreateTableBaseTimeMinutes      float64 `json:"createTableBaseTimeMinutes"`
	CreateTableTimePerTurnSeconds   int     `json:"createTableTimePerTurnSeconds"`
	CreateTableSpeedrun             bool    `json:"createTableSpeedrun"`
	CreateTableDeckPlays            bool    `json:"createTableDeckPlays"`
	CreateTableEmptyClues           bool    `json:"createTableEmptyClues"`
	CreateTableCharacterAssignments bool    `json:"createTableCharacterAssignments"`
	CreateTableCorrespondence       bool    `json:"createTableCorrespondence"`
	CreateTableAlertWaiters         bool    `json:"createTableAlertWaiters"`
}

var (
	// The database schema must also be configured with any default settings
	defaultSettings = Settings{
		SendTurnSound:                 true,
		SendTimerSound:                true,
		CreateTableVariant:            "No Variant",
		CreateTableBaseTimeMinutes:    2,
		CreateTableTimePerTurnSeconds: 20,
	}
)

func (*UserSettings) Get(userID int) (Settings, error) {
	settings := Settings{}

	if err := db.QueryRow(`
		SELECT
			send_turn_notify,
			send_turn_sound,
			send_timer_sound,
			show_keldon_UI,
			show_colorblind_UI,
			show_timer_in_untimed,
			reverse_hands,
			real_life_mode,
			speedrun_preplay,
			create_table_variant,
			create_table_timed,
			create_table_base_time_minutes,
			create_table_time_per_turn_seconds,
			create_table_speedrun,
			create_table_deck_plays,
			create_table_empty_clues,
			create_table_character_assignments,
			create_table_correspondence,
			create_table_alert_waiters
		FROM user_settings
		WHERE user_id = ?
	`, userID).Scan(
		&settings.SendTurnNotify,
		&settings.SendTurnSound,
		&settings.SendTimerSound,
		&settings.ShowKeldonUI,
		&settings.ShowColorblindUI,
		&settings.ShowTimerInUntimed,
		&settings.ReverseHands,
		&settings.RealLifeMode,
		&settings.SpeedrunPreplay,
		&settings.CreateTableVariant,
		&settings.CreateTableTimed,
		&settings.CreateTableBaseTimeMinutes,
		&settings.CreateTableTimePerTurnSeconds,
		&settings.CreateTableSpeedrun,
		&settings.CreateTableDeckPlays,
		&settings.CreateTableEmptyClues,
		&settings.CreateTableCharacterAssignments,
		&settings.CreateTableCorrespondence,
		&settings.CreateTableAlertWaiters,
	); err == sql.ErrNoRows {
		return defaultSettings, nil
	} else if err != nil {
		return defaultSettings, err
	}

	return settings, nil
}

func (*UserSettings) Set(userID int, name string, value string) error {
	// First, find out if they have customized any settings yet
	var count int
	if err := db.QueryRow(`
		SELECT COUNT(id)
		FROM user_settings
		WHERE user_id = ?
	`, userID).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		// They have not customized any settings yet, so insert a row for them with default settings
		var stmt *sql.Stmt
		if v, err := db.Prepare(`
			INSERT INTO user_settings (user_id) VALUES (?)
		`); err != nil {
			return err
		} else {
			stmt = v
		}
		defer stmt.Close()

		if _, err := stmt.Exec(userID); err != nil {
			return err
		}
	}

	var stmt *sql.Stmt
	/*
		#nosec - Disable the nosec linter warning
		We cannot use "?" to put variables for column names, so we must build the query string dynamically
		Validation has already occurred in the "commandSetting()" function, so this should be safe
		https://www.reddit.com/r/golang/comments/5l5k4e/gosql_does_not_replace_placeholders_in_my_sql/
	*/
	if v, err := db.Prepare(`
		UPDATE user_settings
		SET ` + name + ` = ?
		WHERE user_id = ?
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec(value, userID)
	return err
}
