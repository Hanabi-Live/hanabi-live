# Frequently Asked Questions

## Q: Can you add a new option to the website for the thing that I want?

A: No.

Adding a new option to the website for you (and the people who share your use-case) is not free. We have to evaluate the benefits of adding the feature versus the costs.

1. Every option added to the website has to be stored in the database. For every user. For perpetuity. You're not paying for this, I am.

2. Every option added to the website makes it more complicated and harder to understand for the end-user. Adding more optional features obfuscates existing features. More does not equal better. There's a reason why the Apple design philosophy [is considered to be among the best in the industry](https://medium.com/macoclock/what-makes-apple-design-so-good-d430ef97c6d2).

3. Every option added to the website increases the code surface, which produces more bugs and makes the website harder to maintain. It's a non-zero amount of work to maintain code, as it will eventually have to be updated, refactored, and rewritten. You're not going to be around when the code needs to be refactored, but I will.

4. Every option added to the website increases [feature bloat](https://www.productplan.com/blog/feature-bloat/). The best software products are minimal and deliver on their core mission without a lot of extra bells and whistles. That means routinely saying "no" to small groups of users who want specific things.

Often times, the usability of the site for basic users and the long term health of the website is going to be more important than your feature request. Thanks for understanding.

## Q: Can you add automated turn tracking to notes?

A: No.

Over 50% of the time, this is not desired, because players write the note on a future turn or past turn from when the contextual information was actually inferred. For example, if Alice performs a clue, Bob blind plays, and Cathy discards, then Donald needs to write a note about the blind-play, but it is now on the N+1 turn. If automated notes were the default, then Donald would either 1) have to explicitly enter a replay just in order to make the note correct, or 2) explicitly decrement the turn after the automated system entered the wrong note. The same example can also happen in reverse, when Donald goes back into the in-game replay to write notes about the present, but then is forced to manually change the automated notes from a past turn to a present turn.
