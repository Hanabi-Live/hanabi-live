# Imports
import os
import re
import requests
import sys

# Configuration
emotes_file = 'twitch.txt' # Copy-pasted from the source code of: https://twitchemotes.com
directory = 'twitch'

if not os.path.exists(directory):
    os.makedirs(directory)

with open(emotes_file, 'r') as f:
    lines = f.readlines()

for line in lines:
    # Parse the line
    # e.g. <div class="col-md-2"><center><a href="/emotes/354" class="emote-name"><img src="https://static-cdn.jtvnw.net/emoticons/v1/354/1.0" data-tooltip="<strong>4Head</strong>" data-regex="4Head" data-toggle="popover" data-image-id="354" class="emote expandable-emote" /><br /></a>4Head</center><br /></div>
    line = line.strip()
    if line == '' or line == '<div class="row">' or line == '</div>':
        continue
    match = re.search(r'<img src="(.+?)" data-tooltip="<strong>(.+?)</strong>"', line)
    if not match:
        print('Failed to parse line: ' + line)
        sys.exit(1)
    url = match.group(1)
    name = match.group(2)

    # Download the emote
    r = requests.get(url, allow_redirects=True)
    path = os.path.join(directory, name + '.png')
    open(path, 'wb').write(r.content)
