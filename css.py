#!/usr/bin/env python

# Imports
import os

# Get the directory of the script
# https://stackoverflow.com/questions/4934806/how-can-i-find-scripts-directory-with-python
DIR = os.path.dirname(os.path.realpath(__file__))

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

css = ''
for file_name in CSS_FILES:
    file_path = os.path.join(CSS_DIR, file_name)
    with open(file_path, 'r', encoding='utf8') as f:
        css += f.read()

# Write it out to a temporary file
CSS_CONCATENATED = os.path.join(CSS_DIR, 'main.css')
with open(CSS_CONCATENATED, 'w', encoding='utf8') as f:
    f.write(css)

# Optimize and minify CSS with CSSO
# (which is installed in the JavaScript directory)
JS_DIR = os.path.join(DIR, 'public', 'js')
os.chdir(JS_DIR)
CSS_MINIFIED = os.path.join(CSS_DIR, 'main.min.css')
os.system('npx csso --input "' + CSS_CONCATENATED + '" --output "' + CSS_MINIFIED + '"')
