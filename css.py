#!/usr/bin/env python

# Imports
import os
import platform
import subprocess
import sys

# Get the directory of the script
# https://stackoverflow.com/questions/4934806/how-can-i-find-scripts-directory-with-python
DIR = os.path.dirname(os.path.realpath(__file__))

# We have to specify "shell=True" for compatability with Git Bash on Windows
shell = platform.system() == 'Windows'

# Combine all of the CSS into one file
# (these must be in a specific order)
CSS_FILES = [
    'fontawesome.min.css', # Font Awesome
    'solid.min.css', # Font Awesome
    'tooltipster.bundle.min.css', # Tooltipster
    'tooltipster-sideTip-shadow.min.css', # Tooltipster
    'alpha.css', # HTML5 Up Alpha Template
    'hanabi.css', # Site-specific CSS
]
CSS_DIR = os.path.join(DIR, 'public', 'css')
if not os.path.isdir(CSS_DIR):
    print('Error: Failed to find the CSS directory at "' + CSS_DIR + '".')
    sys.exit(1)

css = ''
for file_name in CSS_FILES:
    file_path = os.path.join(CSS_DIR, file_name)
    if not os.path.isfile(file_path):
        print('Error: Failed to find file "' + file_path + '".')
        sys.exit(1)
    if sys.version_info >= (3, 0):
        with open(file_path, 'r', encoding='utf8') as f:
            css += f.read()
    else:
        with open(file_path, 'r') as f:
            css += f.read()

# Write it out to a temporary file
CSS_CONCATENATED = os.path.join(CSS_DIR, 'main.css')
if sys.version_info >= (3, 0):
    with open(CSS_CONCATENATED, 'w', encoding='utf8') as f:
        f.write(css)
else:
    with open(CSS_CONCATENATED, 'w') as f:
        f.write(css)

# Optimize and minify CSS with CSSO
# (which is installed in the JavaScript directory)
JS_DIR = os.path.join(DIR, 'public', 'js')
if not os.path.isdir(JS_DIR):
    print('Error: Failed to find the JavaScript directory at "' + JS_DIR + '".')
    sys.exit(1)
CSS_MINIFIED = os.path.join(CSS_DIR, 'main.min.css')

try:
    output = subprocess.check_output([
        'npx',
        'csso',
        '--input',
        CSS_CONCATENATED,
        '--output',
        CSS_MINIFIED,
    ], cwd=JS_DIR, shell=shell)
    if sys.version_info >= (3, 0):
        output = output.decode('utf-8') 
    output = output.strip()
    if output != '':
        print(output)
except subprocess.CalledProcessError as e:
    print('Error: Failed to minify the CSS.')
    sys.exit(1)
