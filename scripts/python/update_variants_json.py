import json
import os

dir_path = os.path.dirname(os.path.realpath(__file__))
variants_json_path = os.path.join(dir_path, '..', '..', 'public', 'js', 'src',
                                  'data', 'variants.json')

with open(variants_json_path, 'r') as variants_file:
    variants_string = variants_file.read()
    variants = json.loads(variants_string)

for key in variants.keys():
    special_variant = False
    if '-Ones' in key:
        special_variant = True
        variants[key]['specialRank'] = 1
    if '-Fives' in key:
        special_variant = True
        variants[key]['specialRank'] = 5
    if not special_variant:
        continue

    if 'Muddy-Rainbow-' in key:
        variants[key]['specialAllClueColors'] = True
        variants[key]['specialNoClueRanks'] = True
    elif 'Light-Pink-' in key:
        variants[key]['specialAllClueRanks'] = True
        variants[key]['specialNoClueColors'] = True
    elif 'Rainbow-' in key:
        variants[key]['specialAllClueColors'] = True
    elif 'Pink-' in key:
        variants[key]['specialAllClueRanks'] = True
    elif 'White-' in key:
        variants[key]['specialNoClueColors'] = True
    elif 'Brown-' in key:
        variants[key]['specialNoClueRanks'] = True
    elif 'Omni-' in key:
        variants[key]['specialAllClueColors'] = True
        variants[key]['specialAllClueRanks'] = True
    elif 'Null-' in key:
        variants[key]['specialNoClueColors'] = True
        variants[key]['specialNoClueRanks'] = True

with open(variants_json_path, 'w') as variants_file:
    json.dump(variants, variants_file)
print('Completed.')
