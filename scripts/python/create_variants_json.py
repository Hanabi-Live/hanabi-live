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

# Constants
SUIT_REVERSED_SUFFIX = " Reversed"


def main():
    global old_variants_array
    global old_variants_name_to_id_map
    global current_variant_id

    # Read the old "variants.json" file and the "suits.json" file
    dir_path = os.path.dirname(os.path.realpath(__file__))
    data_path = os.path.join(dir_path, "..", "..", "data")
    suits_path = os.path.join(data_path, "suits.json")
    variants_path = os.path.join(data_path, "variants.json")

    with open(variants_path, "r") as variants_file:
        variants_string = variants_file.read()
        old_variants_array = json.loads(variants_string)

    with open(suits_path, "r") as suits_file:
        suits_string = suits_file.read()
        suits_array = json.loads(suits_string)

    # Create some maps for the old variants
    old_variants_name_to_id_map = {}
    old_variants_id_to_name_map = {}
    for variant in old_variants_array:
        if "name" not in variant:
            print(
                'One of the variants in the "variants.json" file does not have a name.'
            )
            sys.exit(1)

        if "id" not in variant:
            print(
                'The variant of "' + variant["name"] + '" does not have an "id" field.'
            )
            sys.exit(1)

        if variant["name"] in old_variants_name_to_id_map:
            print(
                'The old "variants.json" file has a duplicate variant name of:',
                variant["name"],
            )
            sys.exit(1)
        old_variants_name_to_id_map[variant["name"]] = variant["id"]

        if variant["id"] in old_variants_id_to_name_map:
            print('The old "variants.json" file has a duplicate ID of:', variant["id"])
            sys.exit(1)
        old_variants_id_to_name_map[variant["id"]] = variant["name"]

    # Convert the suits array to a map and add default values
    suits = {}
    for suit in suits_array:
        suits[suit["name"]] = suit

        if "createVariants" not in suit:
            suit["createVariants"] = False
        if "oneOfEach" not in suit:
            suit["oneOfEach"] = False
        if "allClueColors" not in suit:
            suit["allClueColors"] = False
        if "allClueRanks" not in suit:
            suit["allClueRanks"] = False
        if "noClueColors" not in suit:
            suit["noClueColors"] = False
        if "noClueRanks" not in suit:
            suit["noClueRanks"] = False
        if "prism" not in suit:
            suit["prism"] = False

    # Start to build all of the variants
    variants = []
    current_variant_id = -1

    # First, start with the basic variants
    variant_suits = {}
    variant_suits[1] = ["Red"]
    variant_suits[2] = variant_suits[1].copy() + ["Blue"]
    variant_suits[3] = variant_suits[2].copy()
    # Green is inserted before Blue to keep the colors in "rainbow" order
    variant_suits[3].insert(1, "Green")
    variant_suits[4] = variant_suits[3].copy()
    # Yellow is inserted before Green to keep the colors in "rainbow" order
    variant_suits[4].insert(1, "Yellow")
    variant_suits[5] = variant_suits[4].copy() + ["Purple"]
    variant_suits[6] = variant_suits[5].copy() + ["Teal"]

    variants.append(
        {
            "name": "No Variant",
            "id": get_variant_id("No Variant"),
            "suits": variant_suits[5],
        }
    )
    variants.append(
        {
            "name": "6 Suits",
            "id": get_variant_id("6 Suits"),
            "suits": variant_suits[6],
        }
    )
    variants.append(
        {
            "name": "4 Suits",
            "id": get_variant_id("4 Suits"),
            "suits": variant_suits[4],
        }
    )
    variants.append(
        {
            "name": "3 Suits",
            "id": get_variant_id("3 Suits"),
            "suits": variant_suits[3],
        }
    )

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
            computed_variant_suits = variant_suits[suit_num - 1].copy() + [suit_name]
            variants.append(
                {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
                    "suits": computed_variant_suits,
                }
            )

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

            # Normal suit pairings with their own dark versions are illegal
            # (e.g. Rainbow + Dark Rainbow)
            if (
                suit["allClueColors"] == suit2["allClueColors"]
                and suit["allClueRanks"] == suit2["allClueRanks"]
                and suit["noClueColors"] == suit2["noClueColors"]
                and suit["noClueRanks"] == suit2["noClueRanks"]
                and suit["prism"] == suit2["prism"]
            ):
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
                variants.append(
                    {
                        "name": variant_name,
                        "id": get_variant_id(variant_name),
                        "suits": computed_variant_suits,
                    }
                )

    # Add variants for special ranks
    for special_rank in [1, 5]:
        if special_rank == 1:
            word = "Ones"
        elif special_rank == 5:
            word = "Fives"

        for [suit_name, suit] in suits.items():
            if not suit["createVariants"]:
                continue

            # There are no one-of-each special ranks (e.g. Black-Ones)
            if suit["oneOfEach"]:
                continue

            # There are no prism special ranks (e.g. Prism-Ones)
            if suit["prism"]:
                continue

            # First, create "Rainbow-Ones (6 Suits)", etc.
            for suit_num in [6, 5, 4, 3]:
                hyphenated_suit_name = suit_name.replace(" ", "-")
                variant_name = (
                    hyphenated_suit_name + "-" + word + " (" + str(suit_num) + " Suits)"
                )
                computed_variant_suits = variant_suits[suit_num].copy()
                variant = {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
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
                        variant[special_property_name] = True

                if suit["allClueRanks"] or suit["noClueRanks"]:
                    clue_ranks = [1, 2, 3, 4, 5]
                    clue_ranks.remove(special_rank)
                    variant["clueRanks"] = clue_ranks

                variants.append(variant)

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
                    computed_variant_suits = variant_suits[suit_num - 1].copy() + [
                        suit_name2
                    ]
                    variant = {
                        "name": variant_name,
                        "id": get_variant_id(variant_name),
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
                            variant[special_property_name] = True

                    if suit["allClueRanks"] or suit["noClueRanks"]:
                        clue_ranks = [1, 2, 3, 4, 5]
                        clue_ranks.remove(special_rank)
                        variant["clueRanks"] = clue_ranks

                    variants.append(variant)

        # Add variants for Deceptive-Ones and Deceptive-Fives
        special_name = "Deceptive-" + word

        # First, create "Deceptive-Ones (6 Suits)", etc.
        for suit_num in [6, 5, 4, 3]:
            variant_name = special_name + " (" + str(suit_num) + " Suits)"
            computed_variant_suits = variant_suits[suit_num].copy()
            variant = {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": computed_variant_suits,
                "specialRank": special_rank,
                "specialDeceptive": True,
            }

            clue_ranks = [1, 2, 3, 4, 5]
            clue_ranks.remove(special_rank)
            variant["clueRanks"] = clue_ranks

            variants.append(variant)

        # Second, create the special suit combinations, e.g. "Deceptive-Ones & Rainbow (6 Suits)"
        for [suit_name, suit] in suits.items():
            if not suit["createVariants"]:
                continue

            for suit_num in [6, 5, 4, 3]:
                # It would be too difficult to have a 4 suit variant or a 3 suits variant with a
                # one-of-each suit
                if (suit_num == 4 or suit_num == 3) and suit["oneOfEach"]:
                    continue

                variant_name = (
                    special_name + " & " + suit_name + " (" + str(suit_num) + " Suits)"
                )
                computed_variant_suits = variant_suits[suit_num - 1].copy() + [
                    suit_name
                ]
                variant = {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
                    "suits": computed_variant_suits,
                    "specialRank": special_rank,
                    "specialDeceptive": True,
                }

                clue_ranks = [1, 2, 3, 4, 5]
                clue_ranks.remove(special_rank)
                variant["clueRanks"] = clue_ranks

                variants.append(variant)

    # Add "Ambiguous" variants (where 2 suits share a color)
    suits_that_cause_duplicated_variants_with_ambiguous = [
        "Rainbow",
        "Prism",
        "Dark Prism",  # This is the same as Dark Rainbow
    ]
    red_ambiguous_suits = ["Tomato", "Mahogany"]
    green_ambiguous_suits = ["Lime", "Forest"]
    blue_ambiguous_suits = ["Sky", "Navy"]
    ambiguous_suits = {}
    ambiguous_suits[2] = red_ambiguous_suits.copy()
    ambiguous_suits[4] = red_ambiguous_suits.copy() + blue_ambiguous_suits.copy()
    ambiguous_suits[6] = (
        red_ambiguous_suits.copy()
        + green_ambiguous_suits.copy()
        + blue_ambiguous_suits.copy()
    )
    variants.append(
        {
            "name": "Ambiguous (6 Suits)",
            "id": get_variant_id("Ambiguous (6 Suits)"),
            "suits": ambiguous_suits[6],
            "showSuitNames": True,
        }
    )
    variants.append(
        {
            "name": "Ambiguous (4 Suits)",
            "id": get_variant_id("Ambiguous (4 Suits)"),
            "suits": ambiguous_suits[4],
            "showSuitNames": True,
        }
    )
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        for suit_num in [4, 2]:
            incremented_suit_num = suit_num + 1

            # It would be too difficult to have a 3 suits variant with a one-of-each suit
            if incremented_suit_num == 3 and suit["oneOfEach"]:
                continue

            # For some suits:
            # "Ambiguous & X (3 Suit)" is the same as "Very Ambiguous (3 Suit)"
            if (
                incremented_suit_num == 3
                and suit_name in suits_that_cause_duplicated_variants_with_ambiguous
            ):
                continue

            variant_name = (
                "Ambiguous & "
                + suit_name
                + " ("
                + str(incremented_suit_num)
                + " Suits)"
            )
            variants.append(
                {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
                    "suits": ambiguous_suits[suit_num].copy() + [suit_name],
                    "showSuitNames": True,
                }
            )

    # Add "Very Ambiguous" variants (where 3 suits share a color)
    red_very_ambiguous_suits = [
        "Tomato VA",
        "Ruby VA",
        "Mahogany VA",
    ]
    blue_very_ambiguous_suits = [
        "Sky VA",
        "Berry VA",
        "Navy VA",
    ]
    very_ambiguous_suits = {}
    # For "Very Ambiguous (3 Suits)", we use blue suits instead of red suits so that this will align
    # better with the Extremely Ambiguous variants (Extremely Ambiguous uses blue suits because it
    # is easier to come up with suit names for blue cards than it is for red cards)
    very_ambiguous_suits[3] = blue_very_ambiguous_suits.copy()
    very_ambiguous_suits[6] = (
        red_very_ambiguous_suits.copy() + blue_very_ambiguous_suits.copy()
    )
    variants.append(
        {
            "name": "Very Ambiguous (6 Suits)",
            "id": get_variant_id("Very Ambiguous (6 Suits)"),
            "suits": very_ambiguous_suits[6],
            "showSuitNames": True,
        }
    )
    variants.append(
        {
            "name": "Very Ambiguous (3 Suits)",
            "id": get_variant_id("Very Ambiguous (3 Suits)"),
            "suits": very_ambiguous_suits[3],
            "showSuitNames": True,
        }
    )
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        # It would be too difficult to have a 4 suit variant with a one-of-each suit
        if suit["oneOfEach"]:
            continue

        # For some suits:
        # "Very Ambiguous + X (4 Suit)" is the same as "Extremely Ambiguous (4 Suit)"
        if suit_name in suits_that_cause_duplicated_variants_with_ambiguous:
            continue

        variant_name = "Very Ambiguous & " + suit_name + " (4 Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": very_ambiguous_suits[3].copy() + [suit_name],
                "showSuitNames": True,
            }
        )

    # Add "Extremely Ambiguous" variants (where 4 or more suits share a color)
    extremely_ambiguous_suits = {}
    extremely_ambiguous_suits[4] = [
        "Ice EA",
        "Sapphire EA",
        "Sky EA",
        "Berry EA",
    ]
    extremely_ambiguous_suits[5] = extremely_ambiguous_suits[4].copy() + ["Navy EA"]
    extremely_ambiguous_suits[6] = extremely_ambiguous_suits[5].copy() + ["Ocean EA"]
    variants.append(
        {
            "name": "Extremely Ambiguous (6 Suits)",
            "id": get_variant_id("Extremely Ambiguous (6 Suits)"),
            "suits": extremely_ambiguous_suits[6],
            "showSuitNames": True,
        }
    )
    variants.append(
        {
            "name": "Extremely Ambiguous (5 Suits)",
            "id": get_variant_id("Extremely Ambiguous (5 Suits)"),
            "suits": extremely_ambiguous_suits[5],
            "showSuitNames": True,
        }
    )
    variants.append(
        {
            "name": "Extremely Ambiguous (4 Suits)",
            "id": get_variant_id("Extremely Ambiguous (4 Suits)"),
            "suits": extremely_ambiguous_suits[4],
            "showSuitNames": True,
        }
    )
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        for suit_num in [5, 4]:
            incremented_suit_num = suit_num + 1

            # It would be too difficult to have a 4 suit variant with a one-of-each suit
            if incremented_suit_num == 4 and suit["oneOfEach"]:
                continue

            # For some suits:
            # 1) "Extremely Ambiguous + X (6 Suit)" is the same as "Extremely Ambiguous (6 Suit)"
            # 2) "Extremely Ambiguous + X (5 Suit)" is the same as "Extremely Ambiguous (5 Suit)"
            if suit_name in suits_that_cause_duplicated_variants_with_ambiguous:
                continue

            variant_name = (
                "Extremely Ambiguous & "
                + suit_name
                + " ("
                + str(incremented_suit_num)
                + " Suits)"
            )
            variants.append(
                {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
                    "suits": extremely_ambiguous_suits[suit_num].copy() + [suit_name],
                    "showSuitNames": True,
                }
            )

    # Add "Dual-Color" variants
    dual_color_suits = {}
    dual_color_suits[3] = ["Orange D2", "Purple D", "Green D"]
    dual_color_suits[5] = ["Orange D2", "Lime D", "Teal D", "Indigo D", "Cardinal D"]
    dual_color_suits[6] = [
        "Orange D",
        "Purple D",
        "Mahogany D",
        "Green D",
        "Tan D",
        "Navy D",
    ]
    variants.append(
        {
            "name": "Dual-Color (6 Suits)",
            "id": get_variant_id("Dual-Color (6 Suits)"),
            "suits": dual_color_suits[6],
            "showSuitNames": True,
        }
    )
    variants.append(
        {
            "name": "Dual-Color (5 Suits)",
            "id": get_variant_id("Dual-Color (5 Suits)"),
            "suits": dual_color_suits[5],
            "showSuitNames": True,
        }
    )
    variants.append(
        {
            "name": "Dual-Color (3 Suits)",
            "id": get_variant_id("Dual-Color (3 Suits)"),
            "suits": dual_color_suits[3],
            "showSuitNames": True,
        }
    )
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        for suit_num in [5, 3]:
            incremented_suit_num = suit_num + 1

            # It would be too difficult to have a 4 suit variant with a one-of-each suit
            if incremented_suit_num == 4 and suit["oneOfEach"]:
                continue

            variant_name = (
                "Dual-Color & "
                + suit_name
                + " ("
                + str(incremented_suit_num)
                + " Suits)"
            )
            variants.append(
                {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
                    "suits": dual_color_suits[suit_num].copy() + [suit_name],
                    "showSuitNames": True,
                }
            )

    # Add "Special Mix (5 Suits)"
    variants.append(
        {
            "name": "Special Mix (5 Suits)",
            "id": get_variant_id("Special Mix (5 Suits)"),
            "suits": [
                "Black",
                "Rainbow",
                "Pink",
                "White",
                "Brown",
            ],
        }
    )

    # Add "Special Mix (6 Suits)"
    variants.append(
        {
            "name": "Special Mix (6 Suits)",
            "id": get_variant_id("Special Mix (6 Suits)"),
            "suits": [
                "Black",
                "Rainbow",
                "Pink",
                "White",
                "Brown",
                "Null",
            ],
        }
    )

    # Add "Ambiguous Mix"
    variants.append(
        {
            "name": "Ambiguous Mix",
            "id": get_variant_id("Ambiguous Mix"),
            "suits": [
                "Tomato",
                "Mahogany",
                "Sky",
                "Navy",
                "Black",
                "White",
            ],
            "showSuitNames": True,
        }
    )

    # Add "Dual-Color Mix"
    variants.append(
        {
            "name": "Dual-Color Mix",
            "id": get_variant_id("Dual-Color Mix"),
            "suits": [
                "Orange D2",
                "Purple D",
                "Green D",
                "Black",
                "Rainbow",
                "White",
            ],
        }
    )

    # Add "Ambiguous & Dual-Color"
    variants.append(
        {
            "name": "Ambiguous & Dual-Color",
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
    )

    # Add blind variants
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Color Blind (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
                "colorCluesTouchNothing": True,
            }
        )
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Number Blind (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
                "rankCluesTouchNothing": True,
            }
        )
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Totally Blind (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
                "colorCluesTouchNothing": True,
                "rankCluesTouchNothing": True,
            }
        )

    # Add mute variants
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Color Mute (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
                "clueColors": [],
            }
        )
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Number Mute (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
                "clueRanks": [],
            }
        )

    # Add "Alternating Clues" variants
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Alternating Clues (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
            }
        )
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        for suit_num in [6, 5, 4, 3]:
            # It would be too difficult to have a 4 suit variant or a 3 suits variant with a
            # one-of-each suit
            if (suit_num == 4 or suit_num == 3) and suit["oneOfEach"]:
                continue

            variant_name = (
                "Alternating Clues & " + suit_name + " (" + str(suit_num) + " Suits)"
            )
            variants.append(
                {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
                    "suits": variant_suits[suit_num - 1].copy() + [suit_name],
                }
            )

    # Add "Clue Starved" variants
    for suit_num in [6, 5]:  # 4 suits and 3 suits would be too difficult
        variant_name = "Clue Starved (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
            }
        )
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        if suit["oneOfEach"]:
            continue

        for suit_num in [6, 5]:  # 4 suits and 3 suits would be too difficult
            variant_name = (
                "Clue Starved & " + suit_name + " (" + str(suit_num) + " Suits)"
            )
            variants.append(
                {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
                    "suits": variant_suits[suit_num - 1].copy() + [suit_name],
                }
            )

    # Add "Cow & Pig" variants
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Cow & Pig (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
            }
        )

    # Add "Duck" variants
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Duck (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
            }
        )

    # Add "Throw It in a Hole" variants
    for suit_num in [6, 5, 4]:  # 3 suits would be too difficult
        variant_name = "Throw It in a Hole (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
            }
        )
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
            variants.append(
                {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
                    "suits": variant_suits[suit_num - 1].copy() + [suit_name],
                }
            )

    # Add "Reversed" variants (the "Teal" version without any special suits)
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Reversed (" + str(suit_num) + " Suits)"
        reversed_variant_suits = variant_suits[suit_num].copy()
        reversed_variant_suits[-1] += SUIT_REVERSED_SUFFIX
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": reversed_variant_suits,
            }
        )

    # Add "Reversed" variants for each special suit
    for [suit_name, suit] in suits.items():
        # We only want to create variants for certain suits
        # (e.g. "Red" does not get its own variants because it is a basic suit)
        if not suit["createVariants"]:
            continue

        # Reversed suits with rank attributes would be identical to the normal versions
        if suit["allClueRanks"] or suit["noClueRanks"]:
            continue

        suit_name = suit_name + SUIT_REVERSED_SUFFIX
        for suit_num in [6, 5, 4, 3]:
            # It would be too difficult to have a 4 suit variant or a 3 suits variant with a
            # one-of-each suit
            if (suit_num == 4 or suit_num == 3) and suit["oneOfEach"]:
                continue

            variant_name = suit_name + " (" + str(suit_num) + " Suits)"
            computed_variant_suits = variant_suits[suit_num - 1].copy() + [suit_name]
            variants.append(
                {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
                    "suits": computed_variant_suits,
                }
            )

    # Add "Up or Down" variants
    for suit_num in [6, 5]:  # 4 suits and 3 suits would be too difficult
        variant_name = "Up or Down (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
                "showSuitNames": True,
            }
        )
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        if suit["oneOfEach"]:
            # A one of each suit in combination with Up or Down would be too difficult
            continue

        for suit_num in [6, 5]:  # 4 suits and 3 suits would be too difficult
            variant_name = (
                "Up or Down & " + suit_name + " (" + str(suit_num) + " Suits)"
            )
            variants.append(
                {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
                    "suits": variant_suits[suit_num - 1].copy() + [suit_name],
                    "showSuitNames": True,
                }
            )

    # Add "Synesthesia" variants
    suits_that_cause_duplicated_variants_with_synesthesia = [
        "Prism", # Same as White
        "Muddy Rainbow", # Same as Rainbow
        "Light Pink", # Same as Rainbow
        "Pink", # Same as Rainbow
        "Omni", # Same as Rainbow
        "Dark Prism", # Same as White
        "Cocoa Rainbow", # Same as Dark Rainbow
        "Gray Pink", # Same as Dark Rainbow
        "Dark Pink", # Same as Dark Rainbow
        "Dark Omni", # Same as Dark Rainbow
    ]
    for suit_num in [6, 5, 4, 3]:
        variant_name = "Synesthesia (" + str(suit_num) + " Suits)"
        variants.append(
            {
                "name": variant_name,
                "id": get_variant_id(variant_name),
                "suits": variant_suits[suit_num],
                "clueRanks": [],
            }
        )
    for [suit_name, suit] in suits.items():
        if not suit["createVariants"]:
            continue

        if suit_name in suits_that_cause_duplicated_variants_with_synesthesia:
            continue

        for suit_num in [6, 5, 4, 3]:
            variant_name = (
                "Synesthesia & " + suit_name + " (" + str(suit_num) + " Suits)"
            )
            variants.append(
                {
                    "name": variant_name,
                    "id": get_variant_id(variant_name),
                    "suits": variant_suits[suit_num - 1].copy() + [suit_name],
                    "clueRanks": [],
                }
            )

    # Create a map for the new variants
    new_variants_map = {}
    for variant in variants:
        new_variants_map[variant["name"]] = True

    # Check for missing variants
    missing = False
    for variant in old_variants_array:
        if variant["name"] not in new_variants_map:
            missing = True
            print("Missing variant: " + variant["name"])
    if missing:
        sys.exit(1)

    # Write out the new "variant.json" file
    with open(variants_path, "w", newline="\n") as new_variants_file:
        json.dump(variants, new_variants_file, indent=2, separators=(",", ": "))
        new_variants_file.write("\n")

    print('Wrote a new variants.json" file.')

    # Additionally, create a "variants.txt" file with the names of all of the variants
    variants_txt_path = os.path.join(data_path, "variants.txt")
    contents = ""
    for variant in variants:
        contents += variant["name"] + " (#" + str(variant["id"]) + ")\n"
    with open(variants_txt_path, "w", newline="\n") as variants_txt_file:
        variants_txt_file.write(contents + "\n")


def get_variant_id(variant_name):
    global old_variants_array
    global old_variants_name_to_id_map
    global current_variant_id

    # First, prefer the old (existing) variant ID, if present
    if variant_name in old_variants_name_to_id_map:
        return old_variants_name_to_id_map[variant_name]

    # Otherwise, find the lowest unused variant ID
    while True:
        current_variant_id += 1
        found = False
        for variant in old_variants_array:
            if variant["id"] == current_variant_id:
                found = True
                break
        if not found:
            return current_variant_id


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
