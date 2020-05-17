import json
import os

dir_path = os.path.dirname(os.path.realpath(__file__))
variants_json_path = os.path.join(dir_path, '..', '..', 'public', 'js', 'src',
                                  'data', 'variants.json')

with open(variants_json_path, 'r') as variants_file:
    variants_string = variants_file.read()
    variants = json.loads(variants_string)

for key in variants.keys():
    if '-Ones' in key:
        variants[key]['specialRank'] = 1
    if '-Fives' in key:
        variants[key]['specialRank'] = 5

with open(variants_json_path, 'w') as variants_file:
    json.dump(variants, variants_file)
print('Completed.')
