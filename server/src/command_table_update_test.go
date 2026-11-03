package main

import "testing"

func TestTimerProposalChange(t *testing.T) {
	for _, tc := range []struct {
		name    string
		current Options
		proposed Options
		want    string
	}{
		{
			name: "disabled timer unchanged",
			want: "",
		},
		{
			name:     "enable timer",
			proposed: Options{Timed: true, TimeBase: 120, TimePerTurn: 20},
			want:     "<span class=\"cp\">Timed: <b>120 / 20</b></span>",
		},
		{
			name:     "disable timer",
			current:  Options{Timed: true, TimeBase: 120, TimePerTurn: 20},
			want:     "<span class=\"cp\">Timed: <b>No</b></span>",
		},
		{
			name:     "timer unchanged when other options change",
			current:  Options{Timed: true, TimeBase: 120, TimePerTurn: 20},
			proposed: Options{Timed: true, TimeBase: 120, TimePerTurn: 20, CardCycle: true},
			want:     "",
		},
		{
			name:     "update time per turn",
			current:  Options{Timed: true, TimeBase: 120, TimePerTurn: 20},
			proposed: Options{Timed: true, TimeBase: 120, TimePerTurn: 30},
			want:     "<span class=\"cp\">Timed: <b>120 / 30</b></span>",
		},
		{
			name:     "update base time",
			current:  Options{Timed: true, TimeBase: 120, TimePerTurn: 20},
			proposed: Options{Timed: true, TimeBase: 180, TimePerTurn: 20},
			want:     "<span class=\"cp\">Timed: <b>180 / 20</b></span>",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := timerProposalChange(&tc.proposed, &tc.current)
			if got != tc.want {
				t.Errorf("timerProposalChange() = %q, want %q", got, tc.want)
			}
		})
	}
}
