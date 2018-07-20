package main

import (
	"fmt"
	"math/rand"
	"time"
)

/*
	Miscellaneous subroutines
*/

// From: http://golangcookbook.blogspot.com/2012/11/generate-random-number-in-given-range.html
func getRandom(min int, max int) int {
	max++
	if max-min <= 0 {
		log.Error("getRandom was given invalid arguments.")
		return 0
	}
	rand.Seed(time.Now().UnixNano())
	return rand.Intn(max-min) + min
}

func stringInSlice(a string, slice []string) bool {
	for _, b := range slice {
		if b == a {
			return true
		}
	}
	return false
}

// From: https://stackoverflow.com/questions/47341278/how-to-format-a-duration-in-golang
func durationToString(d time.Duration) string {
	m := d / time.Minute
	d -= m * time.Minute
	s := d / time.Second
	return fmt.Sprintf("%02d:%02d", m, s)
}
