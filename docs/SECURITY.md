# Security at Hanabi Live

Many tech comapanies have security blogs that explain how they use your data, how they protect your data, and provide a little transparency. This blog is a short attempt to provide something similar.

<br />

### Owner

The site is owned by me (Zamiel), a Hanabi enthusiast from America. It is paid for out of pocket. The site does not run any ads and is not monetized in any way.

<br />

### Code

Hanabi Live is [open-source](https://en.wikipedia.org/wiki/Open_source), meaning that [all of the code](https://github.com/Zamiell/hanabi-live) is publicly available to review on [GitHub](https://github.com/). Note that open-source software is [not necessarily more secure](https://rubygarage.org/blog/open-source-software-security) than closed-source software.

<br />

### Staff

I am the only administrator for the website. This means that only I have the ability to mute users, ban users, and so forth.

In the [Hanabi Discord server](https://discord.gg/FADvkJp), any user with a "1+ Years Experience" role is considered a Discord administrator, and has the ability to delete messages, ban users, and so forth (in the Discord).

<br />

### Encryption

Hanabi Live uses HTTPS, which means that all traffic to and from the web server is encrypted. The certificates for this are provided by [Let's Encrypt](https://letsencrypt.org/).

<br />

### Password Hasing

On the server, passwords are salted and hashed using the [Argon2 algorithm](https://en.wikipedia.org/wiki/Argon2) before being stored in the database. As of 2020, this is considered to be [best practice](https://medium.com/analytics-vidhya/password-hashing-pbkdf2-scrypt-bcrypt-and-argon2-e25aaf41598e). This means that if an attacker was able to access the Hanabi Live database, they would not be able to derive your password (since a hash is just a random sequence of bytes).

<br />

### Data

The database stores usernames, salted password hashes, the last IP that you logged on with, chat messages, and (obviously) Hanabi-related game history. The full schema for the database can be found [here](https://github.com/Zamiell/hanabi-live/blob/master/install/database_schema.sql). Furthermore, similar to other web servers on the internet, the web logs contain the IP address of every connection.

Notably, there is no [personally identifiable information](https://en.wikipedia.org/wiki/Personal_data) in the database (e.g. email addresses), which makes Hanabi Live a pretty low-priority target for an attacker looking to breach the website and harvest all of the data.

<br />

### Cookies

Upon logging in for the first time, the site will store a [cookie](https://en.wikipedia.org/wiki/HTTP_cookie) so that on subsequent visits, you won't have to reauthenticate. This kind of thing is pretty standard. Cookies are encrypted and hardened according to [best practice](https://odino.org/security-hardening-http-cookies/).

Furthermore, the site stores your username in a local cookie. This is so that when your cookie expires, the username field will automatically be filled out.

The password chosen for a password-protected table is also stored in a local cookie. While this is normally considered insecure, it is necessary so that users can see what their table password is in the "Create Game" tooltip. (They need to see what the password is in order to distribute it to the other people joining the table.)

<br />

### Google Analytics

The website reports anonymous usage data to [Google Analytics](https://marketingplatform.google.com/about/analytics/). This allows me to easily see what the peak hours of the website are and what countries most people are from. This kind of thing is pretty standard.

<br />

### Sentry

Client errors are automatically reported to [Sentry](https://sentry.io/welcome/), a cloud-based service that aggregates errors. The username and IP address are uploaded alongside an error report. This kind of thing is pretty standard.

<br />

### Server

The virtual server runs on the latest version of [Ubuntu Server](https://ubuntu.com/download/server). It is protected by a host-based firewall. I make a best-effort to keep the machine up-to-date in terms of operating system packages, Go versions, and NPM packages.

<br />
