/*
	Sent when the user modifies a setting

	"data" example:
	{
		name: 'sendTurnSound',
		value: 'false',
	}
*/

package main

import (
	"reflect"
	"strconv"

	"github.com/Zamiell/hanabi-live/src/models"
)

func commandSetting(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate the setting name
	if d.Name == "" {
		s.Warning("The settings name must not be blank.")
		return
	}
	settings := reflect.ValueOf(models.Settings{})
	var fieldType string
	valid := false
	for i := 0; i < settings.NumField(); i++ {
		field := settings.Type().Field(i)
		fieldTag := string(field.Tag)            // e.g. json:"sendTurnNotify"
		fieldTag = fieldTag[6 : len(fieldTag)-1] // e.g. sendTurnNotify
		if fieldTag == d.Name {
			fieldType = field.Type.String()
			valid = true
			break
		}
	}
	if !valid {
		s.Warning("The settings name of \"" + d.Name + "\" is invalid.")
		return
	}

	// Validate the setting value
	if fieldType == "bool" {
		// Bools are stored in the database as 0s and 1s
		if d.Value == "true" {
			d.Value = "1"
		} else if d.Value == "false" {
			d.Value = "0"
		} else {
			s.Warning("The setting of \"" + d.Name + "\" must have a value of \"true\" or \"false\".")
			return
		}
	} else if fieldType == "int" {
		if v, err := strconv.Atoi(d.Value); err != nil {
			s.Warning("The setting of \"" + d.Name + "\" must be an integer.")
			return
		} else if v <= 0 || v > 604800 { // 1 week in seconds
			s.Warning("The setting of \"" + d.Name + "\" is too large.")
			return
		}
	} else if fieldType == "float64" {
		if v, err := strconv.ParseFloat(d.Value, 64); err != nil {
			s.Warning("The setting of \"" + d.Name + "\" must be an float64.")
			return
		} else if v <= 0 || v > 86400 { // 1 day in seconds
			s.Warning("The setting of \"" + d.Name + "\" is too large.")
			return
		}
	}

	/*
		Set
	*/

	if err := db.UserSettings.Set(s.UserID(), toSnakeCase(d.Name), d.Value); err != nil {
		log.Error("Failed to set a setting for user \""+s.Username()+"\":", err)
		s.Error("")
		return
	}
}
