# Character art: provenance and prompts

The lobby's detective and thief portraits (`public/art/detectives/{red,yellow,green,blue,purple,white,thief}.webp`)
are original illustrations. They were generated with OpenAI's `gpt-image-2.5-flare` model through the `image-gen`
tooling, as transparent PNGs, then resized to 640×960 and saved as WebP (quality 88).

They are meant to be the same kind of art as the rest of the project: original characters, not based on any existing
game's artwork. **Check the image provider's current terms before any commercial use or redistribution.**

## Style

Three styles were compared before this one was chosen (vinyl toy figures, Saturday-morning cartoon, retro
storybook). The shipped set is **retro storybook**:

> mid-century modern children's storybook illustration, gouache with visible paper grain, limited warm palette,
> simplified geometric shapes, slightly off-register print texture, no outlines.

## Prompt shape

Every portrait uses the same frame, so the cast stays consistent:

> Full-body character design for a board-game character-select screen: *{character}*. Standing full body head to
> toe, slight three-quarter view facing right, centered with margin around. Isolated subject on fully transparent
> background, no ground shadow, no text, no frame. Whimsical, cozy, sly toy-museum caper mood. STYLE: *{style}*

with `--transparent --aspect-ratio 2:3 --resolution 1k --quality medium`.

## Characters

| File | Prompt description |
|---|---|
| `red` | "Captain Cinnabar", elderly sea captain, big white mutton-chop beard, red peaked captain's cap with a brass anchor badge, red double-breasted peacoat with brass buttons, holding a brass telescope |
| `yellow` | "Dot Marigold", teenage gadgeteer, messy short hair, yellow-lensed brass goggles pushed up on her forehead, yellow raincoat, tool belt of gizmos, holding a small glowing gadget |
| `green` | "Professor Sage", calm middle-aged botanist, green deerstalker with the ear flaps tied up, green tweed coat with a leafy sprig, holding a big round magnifying glass |
| `blue` | "Constable Cobalt", by-the-book constable, tall blue custodian helmet with a silver badge, blue tunic, neat moustache, notebook and whistle on a chain |
| `purple` | "Vi Nightingale", night-shift museum guard, purple peaked guard cap, purple uniform jacket, ring of keys, big flashlight casting a beam, hair in a ponytail |
| `white` | "Dr. Ivory Quill", forensic chemist, round wire-rimmed spectacles, long off-white lab coat over a cream waistcoat, rubber gloves, dusting brush and a jar of fingerprint powder |
| `thief` | "The Magpie", a mysterious cat burglar whose gender and identity are unknowable: wide-brimmed charcoal slouch hat pulled low and a high turned-up collar and scarf, so the face is entirely in deep shadow with only a faint glint of gold from a domino mask edge; long charcoal coat; loose, baggy, androgynous clothing; mid-tiptoe; a lumpy burlap sack of loot with a gold picture-frame corner and a gold coin peeking out |

## Regenerating

Keep the frame and style text above, change only the character description, and run the `image-gen` skill's
`generate.py` with `--transparent --aspect-ratio 2:3 --resolution 1k`. Resize to 640×960 and save as WebP so the
portraits stay about 60 to 120 KB each. The lobby preloads all seven, so the set costs under 650 KB.
