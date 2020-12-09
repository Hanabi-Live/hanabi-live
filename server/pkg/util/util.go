package util

import (
	"fmt"
	"sort"
	"strings"
)

func PrintUser(userID int, username string) string {
	return fmt.Sprintf("user \"%v\" (%v)", username, userID)
}

func PrintUserCapitalized(userID int, username string) string {
	return fmt.Sprintf("User \"%v\" (%v)", username, userID)
}

// From: https://stackoverflow.com/questions/51997276/how-one-can-do-case-insensitive-sorting-using-sort-strings-in-golang
func SortStringsCaseInsensitive(slice []string) []string {
	sort.Slice(slice, func(i, j int) bool {
		return strings.ToLower(slice[i]) < strings.ToLower(slice[j])
	})
	return slice
}

func StringInSlice(a string, slice []string) bool {
	for _, b := range slice {
		if b == a {
			return true
		}
	}
	return false
}
