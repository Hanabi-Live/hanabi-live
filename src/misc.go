package main

import (
	"fmt"
	"math/rand"
	"strconv"
	"time"
)

/*
	Miscellaneous subroutines
*/

// From: http://golangcookbook.blogspot.com/2012/11/generate-random-number-in-given-range.html
func getRandom(min int, max int) int {
	max += 1
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

// From: https://stackoverflow.com/questions/19101419/go-golang-formatfloat-convert-float-number-to-string
func floatToString(f float64) string {
	return strconv.FormatFloat(f, 'f', 6, 64)
}
