#!/usr/env python

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
    with open(file_path, 'r') as f:
        css += f.read()

# Write it out to a temporary file
output_path = os.path.join(CSS_DIR, 'main.css')
with open(output_path, 'w') as f:
    f.write(css)

# Optimize and minify CSS with CSSO
output_path2 = os.path.join(CSS_DIR, 'main.min.css')
os.system('csso --input "' + output_path + '" --output "' + output_path2 + '"')
