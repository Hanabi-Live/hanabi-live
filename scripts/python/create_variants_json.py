# This script generates a new "variants.json" file
# Note that we must preserve the variant IDs between versions of "variants.json" because it is used
# in the seed string (e.g. "p2v5s1")

import sys

if sys.version_info < (3, 0):
    print("This script requires Python 3.x.")
    sys.exit(1)

# Imports
import json
import os
import sys

# Variables
highest_variant_id = 0


def main():
    global old_variants
    global highest_variant_id

    # Read the old "variants.json" file and the "suits.json" file
    dir_path = os.path.dirname(os.path.realpath(__file__))
    data_path = os.path.join(dir_path, "..", "..", "public", "js", "src", "data")
    suits_path = os.path.join(data_path, "suits.json")
    variants_path = os.path.join(data_path, "variants.json")

    with open(variants_path, "r") as variants_file:
        variants_string = variants_file.read()
        old_variants = json.loads(variants_string)

    with open(suits_path, "r") as suits_file:
        suits_string = suits_file.read()
        suits = json.loads(suits_string)

    # Validate that the old variants file has unique ID numbers for every variant
    old_variant_id_map = {}
    highest_variant_id = 0
    for [variant_name, variant] in old_variants.items():
        if "id" not in variant:
            print('The variant of "' + variant_name + '" does not have an "id" field.')
            sys.exit(1)
        if variant["id"] in old_variant_id_map:
            print("There is a duplicate ID of:", variant["id"])
            sys.exit(1)

        # Track that we have "seen" this ID
        old_variant_id_map[variant["id"]] = True

        # Keep track of the highest variant ID
        if variant["id"] > highest_variant_id:
            highest_variant_id = variant["id"]

    # Add default values for each suit
    for suit in suits.values():
        if "createVariants" not in suit:
            suit["createVariants"] = False
        if "oneOfEach" not in suit:
            suit["oneOfEach"] = False
        if "reversed" not in suit:
            suit["reversed"] = False
        if "allClueColors" not in suit:
            suit["allClueColors"] = False
        if "allClueRanks" not in suit:
            suit["allClueRanks"] = False
        if "noClueColors" not in suit:
            suit["noClueColors"] = False
        if "noClueRanks" not in suit:
            suit["noClueRanks"] = False

    # Start to build all of the variants
    variants = {}

    # First, start with the basic variants
    variant_suits = {}
    variant_suits[1] = ["Red"]
    variant_suits[2] = variant_suits[1] + ["Blue"]
    variant_suits[3] = variant_suits[2].copy()
    # Green is inserted before Blue to keep the colors in "rainbow" order
    variant_suits[3].insert(1, "Green")
    variant_suits[4] = variant_suits[3].copy()
    # Yellow is inserted before Green to keep the colors in "rainbow" order
    variant_suits[4].insert(1, "Yellow")
    variant_suits[5] = variant_suits[4] + ["Purple"]
    variant_suits[6] = variant_suits[5] + ["Teal"]

    variants["No Variant"] = {
        "id": get_variant_id("No Variant"),
        "suits": variant_suits[5],
    }
    variants["6 Suits"] = {
        "id": get_variant_id("6 Suits"),
        "suits": variant_suits[6],
    }
    variants["4 Suits"] = {
        "id": old_variants["4 Suits"]["id"],
        "suits": variant_suits[4],
    }
    variants["3 Suits"] = {
        "id": old_variants["3 Suits"]["id"],
        "suits": variant_suits[3],
    }

    # Add variants for each suit
    for [suit_name, suit] in suits.items():
        # We only want to create variants for certain suits
        # (e.g. "Red" does not get its own variants because it is a basic suit)
        if not suit["createVariants"]:
            continue

        for suit_num in [6, 5, 4, 3]:
            # It would be too difficult to have a 4 suit variant or a 3 suits variant with a
            # one-of-each suit
            if (suit_num == 4 or suit_num == 3) and suit["oneOfEach"]:
                continue

            variant_name = suit_name + " (" + str(suit_num) + " Suits)"
            computed_variant_suits = variant_suits[suit_num - 1] + [suit_name]
            variants[variant_name] = {
                "id": old_variants[variant_name]["id"],
                "suits": computed_variant_suits,
            }

    # Add variants for each special suit combination
    # Use a map to avoid repeats
    combination_map = {}
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        for [suit_name2, suit2] in suits.items():
            if not suit2["createVariants"]:
                continue

            if suit_name == suit_name2:
                continue

            # e.g. Rainbow + Dark Rainbow is illegal
            if (
                suit["allClueColors"] == suit2["allClueColors"]
                and suit["allClueRanks"] == suit2["allClueRanks"]
                and suit["noClueColors"] == suit2["noClueColors"]
                and suit["noClueRanks"] == suit2["noClueRanks"]
            ):
                continue

            # It would be too difficult to have a variant with two reversed suits
            if suit["reversed"] and suit2["reversed"]:
                continue

            if (
                suit_name + suit_name2 in combination_map
                or suit_name2 + suit_name in combination_map
            ):
                continue
            combination_map[suit_name + suit_name2] = True

            for suit_num in [6, 5, 4, 3]:
                # It would be too difficult to have a 4 suit variant or a 3 suits variant with a
                # one-of-each suit
                if (suit_num == 4 or suit_num == 3) and (
                    suit["oneOfEach"] or suit2["oneOfEach"]
                ):
                    continue

                # It would be too difficult to have a 5 suit variant with two one-of-each suits
                if suit_num == 5 and suit["oneOfEach"] and suit2["oneOfEach"]:
                    continue

                variant_name = (
                    suit_name + " & " + suit_name2 + " (" + str(suit_num) + " Suits)"
                )
                computed_variant_suits = variant_suits[suit_num - 2].copy()
                computed_variant_suits.append(suit_name)
                computed_variant_suits.append(suit_name2)
                variants[variant_name] = {
                    "id": old_variants[variant_name]["id"],
                    "suits": computed_variant_suits,
                }

    # Add variants for special ranks
    for special_rank in [1, 5]:
        if special_rank == 1:
            word = "Ones"
        elif special_rank == 5:
            word = "Fives"

        for [suit_name, suit] in suits.items():
            if not suit["createVariants"]:
                continue

            # There are no e.g. Black-Ones
            if suit["oneOfEach"]:
                continue

            # First create "Rainbow-Ones (6 Suits)", etc.
            for suit_num in [6, 5, 4, 3]:
                hyphenated_suit_name = suit_name.replace(" ", "-")
                variant_name = (
                    hyphenated_suit_name + "-" + word + " (" + str(suit_num) + " Suits)"
                )
                computed_variant_suits = variant_suits[suit_num].copy()
                variants[variant_name] = {
                    "id": old_variants[variant_name]["id"],
                    "suits": computed_variant_suits,
                    "specialRank": special_rank,
                }

                for special_property in [
                    "allClueColors",
                    "allClueRanks",
                    "noClueColors",
                    "noClueRanks",
                ]:
                    if suit[special_property]:
                        special_property = upperfirst(special_property)
                        special_property_name = "special" + special_property
                        variants[variant_name][special_property_name] = True

                if suit["allClueRanks"] or suit["noClueRanks"]:
                    clue_ranks = [1, 2, 3, 4, 5]
                    clue_ranks.remove(special_rank)
                    variants[variant_name]["clueRanks"] = clue_ranks

            # Second, create the special suit combinations, e.g. "Rainbow-Ones & Rainbow (6 Suits)"
            for [suit_name2, suit2] in suits.items():
                if not suit2["createVariants"]:
                    continue

                for suit_num in [6, 5, 4, 3]:
                    # It would be too difficult to have a 4 suit variant or a 3 suits variant with a
                    # one-of-each suit
                    if (suit_num == 4 or suit_num == 3) and suit2["oneOfEach"]:
                        continue

                    hyphenated_suit_name = suit_name.replace(" ", "-")
                    variant_name = (
                        hyphenated_suit_name
                        + "-"
                        + word
                        + " & "
                        + suit_name2
                        + " ("
                        + str(suit_num)
                        + " Suits)"
                    )
                    computed_variant_suits = variant_suits[suit_num - 1] + [suit_name2]
                    variants[variant_name] = {
                        "id": old_variants[variant_name]["id"],
                        "suits": computed_variant_suits,
                        "specialRank": special_rank,
                    }

                    for special_property in [
                        "allClueColors",
                        "allClueRanks",
                        "noClueColors",
                        "noClueRanks",
                    ]:
                        if suit[special_property]:
                            special_property = upperfirst(special_property)
                            special_property_name = "special" + special_property
                            variants[variant_name][special_property_name] = True

                    if suit["allClueRanks"] or suit["noClueRanks"]:
                        clue_ranks = [1, 2, 3, 4, 5]
                        clue_ranks.remove(special_rank)
                        variants[variant_name]["clueRanks"] = clue_ranks

    # Add "Ambiguous" variants
    # TODO add all special suits
    variants["Ambiguous (6 Suits)"] = {
        "id": old_variants["Ambiguous (6 Suits)"]["id"],
        "suits": ["Tomato", "Mahogany", "Lime", "Forest", "Sky", "Navy",],
        "showSuitNames": True,
    }
    amibuous_suits = [
        "Tomato",
        "Mahogany",
        "Sky",
        "Navy",
    ]
    variants["Ambiguous (4 Suits)"] = {
        "id": old_variants["Ambiguous (4 Suits)"]["id"],
        "suits": amibuous_suits,
        "showSuitNames": True,
    }
    variants["Ambiguous & Rainbow (5 Suits)"] = {
        "id": old_variants["Ambiguous & Rainbow (5 Suits)"]["id"],
        "suits": amibuous_suits + ["Rainbow"],
        "showSuitNames": True,
    }
    variants["Ambiguous & White (5 Suits)"] = {
        "id": old_variants["Ambiguous & White (5 Suits)"]["id"],
        "suits": amibuous_suits + ["White"],
        "showSuitNames": True,
    }

    # Add "Very Ambiguous" variants
    variants["Very Ambiguous (6 Suits)"] = {
        "id": old_variants["Very Ambiguous (6 Suits)"]["id"],
        "suits": [
            "Tomato VA",
            "Ruby VA",
            "Mahogany VA",
            "Sky VA",
            "Berry VA",
            "Navy VA",
        ],
        "showSuitNames": True,
    }

    # Add "Extremely Ambiguous" variants
    extremely_ambiguous_suits = {}
    extremely_ambiguous_suits[3] = [
        "Sky VA",
        "Berry VA",
        "Navy VA",
    ]
    extremely_ambiguous_suits[4] = [
        "Ice EA",
        "Sapphire EA",
        "Sky EA",
        "Berry EA",
    ]
    extremely_ambiguous_suits[5] = extremely_ambiguous_suits[4] + ["Navy EA"]
    extremely_ambiguous_suits[6] = extremely_ambiguous_suits[5] + ["Ocean EA"]
    variants["Extremely Ambiguous (6 Suits)"] = {
        "id": old_variants["Extremely Ambiguous (6 Suits)"]["id"],
        "suits": extremely_ambiguous_suits[6],
        "showSuitNames": True,
    }
    variants["Extremely Ambiguous (5 Suits)"] = {
        "id": old_variants["Extremely Ambiguous (5 Suits)"]["id"],
        "suits": extremely_ambiguous_suits[5],
        "showSuitNames": True,
    }
    variants["Extremely Ambiguous (4 Suits)"] = {
        "id": old_variants["Extremely Ambiguous (4 Suits)"]["id"],
        "suits": extremely_ambiguous_suits[4],
        "showSuitNames": True,
    }
    variants["Extremely Ambiguous (3 Suits)"] = {
        "id": old_variants["Extremely Ambiguous (3 Suits)"]["id"],
        "suits": extremely_ambiguous_suits[3],
        "showSuitNames": True,
    }

    # Add "Dual-Color" variants
    variants["Dual-Color (6 Suits)"] = {
        "id": get_variant_id("Dual-Color (6 Suits)"),
        "suits": ["Orange D", "Purple D", "Mahogany D", "Green D", "Tan D", "Navy D",],
        "showSuitNames": True,
    }
    variants["Dual-Color (5 Suits)"] = {
        "id": get_variant_id("Dual-Color (5 Suits)"),
        "suits": ["Orange D2", "Lime D", "Teal D", "Indigo D", "Cardinal D",],
        "showSuitNames": True,
    }
    variants["Dual-Color (3 Suits)"] = {
        "id": get_variant_id("Dual-Color (3 Suits)"),
        "suits": ["Orange D2", "Purple D", "Green D",],
        "showSuitNames": True,
    }
    variants["Dual-Color & Rainbow (6 Suits)"] = {
        "id": get_variant_id("Dual-Color & Rainbow (6 Suits)"),
        "suits": [
            "Orange D2",
            "Lime D",
            "Teal D",
            "Indigo D",
            "Cardinal D",
            "Rainbow",
        ],
        "showSuitNames": True,
    }
    variants["Dual-Color & Rainbow (4 Suits)"] = {
        "id": get_variant_id("Dual-Color & Rainbow (4 Suits)"),
        "suits": ["Orange D2", "Purple D", "Green D", "Rainbow",],
        "showSuitNames": True,
    }

    # Add "Special Mix (5 Suits)"
    variants["Special Mix (5 Suits)"] = {
        "id": get_variant_id("Special Mix (5 Suits)"),
        "suits": ["Black", "Rainbow", "Pink", "White", "Brown",],
    }

    # Add "Special Mix (6 Suits)"
    variants["Special Mix (6 Suits)"] = {
        "id": get_variant_id("Special Mix (6 Suits)"),
        "suits": ["Black", "Rainbow", "Pink", "White", "Brown", "Null",],
    }

    # Add "Ambiguous Mix"
    variants["Ambiguous Mix"] = {
        "id": get_variant_id("Ambiguous Mix"),
        "suits": ["Tomato", "Mahogany", "Sky", "Navy", "Black", "White",],
        "showSuitNames": True,
    }

    # Add "Dual-Color Mix"
    variants["Dual-Color Mix"] = {
        "id": get_variant_id("Dual-Color Mix"),
        "suits": ["Orange D2", "Purple D", "Green D", "Black", "Rainbow", "White",],
    }

    # Add "Ambiguous & Dual-Color"
    variants["Ambiguous & Dual-Color"] = {
        "id": get_variant_id("Ambiguous & Dual-Color"),
        "suits": [
            "Tangelo AD",
            "Peach AD",
            "Orchid AD",
            "Violet AD",
            "Lime AD",
            "Forest AD",
        ],
        "showSuitNames": True,
    }

    # Add blind variants
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Color Blind (" + str(suit_num) + " Suits)"
        variants[variant_name] = {
            "id": get_variant_id(variant_name),
            "suits": variant_suits[suit_num],
            "colorCluesTouchNothing": True,
        }
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Number Blind (" + str(suit_num) + " Suits)"
        variants[variant_name] = {
            "id": get_variant_id(variant_name),
            "suits": variant_suits[suit_num],
            "rankCluesTouchNothing": True,
        }
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Totally Blind (" + str(suit_num) + " Suits)"
        variants[variant_name] = {
            "id": get_variant_id(variant_name),
            "suits": variant_suits[suit_num],
            "colorCluesTouchNothing": True,
            "rankCluesTouchNothing": True,
        }

    # Add mute variants
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Color Mute (" + str(suit_num) + " Suits)"
        variants[variant_name] = {
            "id": get_variant_id(variant_name),
            "suits": variant_suits[suit_num],
            "clueColors": [],
        }
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Number Mute (" + str(suit_num) + " Suits)"
        variants[variant_name] = {
            "id": get_variant_id(variant_name),
            "suits": variant_suits[suit_num],
            "clueRanks": [],
        }

    # Add "Alternating Clues" variants
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Alternating Clues (" + str(suit_num) + " Suits)"
        variants[variant_name] = {
            "id": get_variant_id(variant_name),
            "suits": variant_suits[suit_num],
        }
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        if suit_name != "Black" and suit["oneOfEach"]:
            # TODO remove this once the variant.jsons are synced
            continue

        for suit_num in [6, 5, 4, 3]:
            # It would be too difficult to have a 4 suit variant or a 3 suits variant with a
            # one-of-each suit
            if (suit_num == 4 or suit_num == 3) and suit["oneOfEach"]:
                continue

            variant_name = (
                "Alternating Clues & " + suit_name + " (" + str(suit_num) + " Suits)"
            )
            variants[variant_name] = {
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num - 1] + [suit_name],
            }

    # Add "Clue Starved" variants
    for suit_num in [6, 5]:  # 4 suits and 3 suits would be too difficult
        variant_name = "Clue Starved (" + str(suit_num) + " Suits)"
        variants[variant_name] = {
            "id": get_variant_id(variant_name),
            "suits": variant_suits[suit_num],
        }
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        if suit["oneOfEach"]:
            continue

        for suit_num in [6, 5]:  # 4 suits and 3 suits would be too difficult
            variant_name = (
                "Clue Starved & " + suit_name + " (" + str(suit_num) + " Suits)"
            )
            variants[variant_name] = {
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num - 1] + [suit_name],
            }

    # Add "Cow & Pig" variants
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Cow & Pig (" + str(suit_num) + " Suits)"
        variants[variant_name] = {
            "id": get_variant_id(variant_name),
            "suits": variant_suits[suit_num],
        }

    # Add "Duck" variants
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Duck (" + str(suit_num) + " Suits)"
        variants[variant_name] = {
            "id": get_variant_id(variant_name),
            "suits": variant_suits[suit_num],
        }

    # Add "Throw It in a Hole" variants
    for suit_num in [6, 5, 4]:  # 3 suits would be too difficult
        variant_name = "Throw It in a Hole (" + str(suit_num) + " Suits)"
        variants[variant_name] = {
            "id": get_variant_id(variant_name),
            "suits": variant_suits[suit_num],
        }
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        if suit["oneOfEach"]:
            # "Throw It in a Hole & Black (6 Suits)" is 1.88 required efficiency in 5-player
            continue

        for suit_num in [6, 5, 4]:  # 3 suits would be too difficult
            variant_name = (
                "Throw It in a Hole & " + suit_name + " (" + str(suit_num) + " Suits)"
            )
            variants[variant_name] = {
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num - 1] + [suit_name],
            }

    # Add "Up or Down" variants
    for suit_num in [6, 5]:  # 4 suits and 3 suits would be too difficult
        variant_name = "Up or Down (" + str(suit_num) + " Suits)"
        variants[variant_name] = {
            "id": get_variant_id(variant_name),
            "suits": variant_suits[suit_num],
            "showSuitNames": True,
        }
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        if suit["reversed"]:  # Reversed doesn't work with Up or Down
            continue

        if suit["oneOfEach"]:
            # TODO remove this once the variant.jsons are synced
            continue

        for suit_num in [6, 5]:  # 4 suits and 3 suits would be too difficult
            variant_name = (
                "Up or Down & " + suit_name + " (" + str(suit_num) + " Suits)"
            )
            variants[variant_name] = {
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num - 1] + [suit_name],
                "showSuitNames": True,
            }

    # Check for missing variants
    missing = False
    for key in old_variants.keys():
        if key not in variants:
            missing = True
            print("Missing variant: " + key)
    if missing:
        sys.exit(1)

    # Additionally, create a "variants.txt" file with the names of all of the variants
    variants_txt_path = os.path.join(data_path, "variants.txt")
    contents = ""
    for variant_name in variants.keys():
        contents += variant_name + "\n"
    with open(variants_txt_path, "w", newline="\n") as variants_file:
        variants_file.write(contents)


def get_variant_id(variant_name):
    global old_variants
    global highest_variant_id

    if variant_name in old_variants:
        return old_variants[variant_name]["id"]

    highest_variant_id += 1
    return highest_variant_id


# From: https://stackoverflow.com/questions/12410242/python-capitalize-first-letter-only
def upperfirst(x):
    i = sliceindex(x)
    return x[:i].upper() + x[i:]


def sliceindex(x):
    i = 0
    for c in x:
        if c.isalpha():
            i = i + 1
            return i
        i = i + 1


if __name__ == "__main__":
    main()
