package commands

import (
	"context"
	"reflect"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/settings"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

// commandSetting is sent when the user modifies a setting
//
// 	Example data:
// {
//   name: 'soundMove',
//   setting: 'false', // All setting values must be strings
// }
func commandSetting(ctx context.Context, s *Session, d *CommandData) {
	// Validate the setting name
	if d.Name == "" {
		s.Warning("The settings name cannot be blank.")
		return
	}
	settings := reflect.ValueOf(settings.Settings{})
	var fieldType string
	valid := false
	for i := 0; i < settings.NumField(); i++ {
		field := settings.Type().Field(i)
		fieldTag := string(field.Tag)            // e.g. json:"desktopNotification"
		fieldTag = fieldTag[6 : len(fieldTag)-1] // e.g. desktopNotification
		if fieldTag == d.Name {
			fieldType = field.Type.String()
			valid = true
			break
		}
	}
	if !valid {
		s.Warningf("The settings name of \"%v\" is invalid.", d.Name)
		return
	}

	// Validate the setting value
	if fieldType == "bool" {
		// Booleans are stored in the database as 0s and 1s
		if d.Setting == "true" {
			d.Setting = "1"
		} else if d.Setting == "false" {
			d.Setting = "0"
		} else {
			s.Warningf(
				"The setting of \"%v\" must have a value of \"true\" or \"false\".",
				d.Name,
			)
			return
		}
	} else if fieldType == "int" {
		if v, err := strconv.Atoi(d.Setting); err != nil {
			s.Warningf("The setting of \"%v\" must be an integer.", d.Name)
			return
		} else if v < 0 || v > 604800 { // 1 week in seconds
			s.Warningf("The setting of \"%v\" is too large.", d.Name)
			return
		} else if d.Name == "volume" && v > 100 {
			s.Warning("The setting of \"volume\" must be between 0 and 100.")
			return
		}
	} else if fieldType == "float64" {
		if v, err := strconv.ParseFloat(d.Setting, 64); err != nil {
			s.Warningf("The setting of \"%v\" must be an float64.", d.Name)
			return
		} else if v <= 0 || v > 86400 { // 1 day in seconds
			s.Warningf("The setting of \"%v\" is too large.", d.Name)
			return
		}
	}

	setting(s, d)
}

func setting(s *Session, d *CommandData) {
	if err := models.UserSettings.Set(s.UserID, toSnakeCase(d.Name), d.Setting); err != nil {
		hLog.Errorf(
			"Failed to set a setting for %v: %v",
			util.PrintUser(s.UserID, s.Username),
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	}

	// We also store whether or not they are a Hyphen-ated member on the session itself
	if d.Name == "hyphenatedConventions" {
		if d.Setting == "1" {
			s.SetHyphenated(true)
		} else if d.Setting == "0" {
			s.SetHyphenated(false)
		}
	}
}
