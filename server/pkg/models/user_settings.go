package models

import (
	"context"
	"errors"

	"github.com/Zamiell/hanabi-live/server/pkg/settings"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
	"github.com/jackc/pgx/v4"
)

type UserSettings struct {
	m *Models // Reverse reference
}

func (us *UserSettings) Get(ctx context.Context, userID int) (*settings.Settings, error) {
	// The database schema must also be configured with any default settings
	defaultSettings := settings.Settings{ // nolint: exhaustivestruct
		SoundMove:                     true,
		SoundTimer:                    true,
		Volume:                        50, // nolint: gomnd
		CreateTableVariant:            variants.DefaultVariantName,
		CreateTableTimeBaseMinutes:    2,  // nolint: gomnd
		CreateTableTimePerTurnSeconds: 20, // nolint: gomnd
	}

	SQLString := `
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
			create_table_one_extra_card,
			create_table_one_less_card,
			create_table_all_or_nothing,
			create_table_detrimental_characters
		FROM user_settings
		WHERE user_id = $1
	`

	settings := settings.Settings{}
	if err := us.m.db.QueryRow(ctx, SQLString, userID).Scan(
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
		&settings.CreateTableOneExtraCard,
		&settings.CreateTableOneLessCard,
		&settings.CreateTableAllOrNothing,
		&settings.CreateTableDetrimentalCharacters,
	); errors.Is(err, pgx.ErrNoRows) {
		return &defaultSettings, nil
	} else if err != nil {
		return nil, err
	}

	return &settings, nil
}

func (us *UserSettings) Set(ctx context.Context, userID int, name string, value string) error {
	// First, find out if they have customized any settings yet
	SQLString1 := `
		SELECT COUNT(user_id)
		FROM user_settings
		WHERE user_id = $1
	`

	var count int
	if err := us.m.db.QueryRow(ctx, SQLString1, userID).Scan(&count); err != nil {
		return err
	}

	if count == 0 {
		// They have not customized any settings yet, so insert a row for them with default settings
		SQLString2 := `
			INSERT INTO user_settings (user_id)
			VALUES ($1)
		`
		if _, err := us.m.db.Exec(ctx, SQLString2, userID); err != nil {
			return err
		}
	}

	SQLString3 := `
		UPDATE user_settings
		SET ` + name + ` = $1
		WHERE user_id = $2
	`

	_, err := us.m.db.Exec(ctx, SQLString3, value, userID)
	return err
}

func (us *UserSettings) IsHyphenated(ctx context.Context, userID int) (bool, error) {
	SQLString := `
		SELECT hyphenated_conventions
		FROM user_settings
		WHERE user_id = $1
	`

	var hyphenated bool
	if err := us.m.db.QueryRow(
		ctx,
		SQLString,
		userID,
	).Scan(&hyphenated); errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, err
	}

	return hyphenated, nil
}
