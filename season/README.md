# Seasonal backdrops for team-board.html

Dan asked on 27 October 2026 for the board to carry the season behind it: a
warm spooky backdrop through October, the Christmas fire after that, and so on
round the year.

Each file is **1920x1080, centre cropped from the original, stripped of its
EXIF and saved at quality 66 to 76** so the whole set is under 3MB and no one
picture is much over a quarter of a megabyte. The board shows **one at a
time**, cross fading between two layers and loading the next picture only when
it is about to be shown, so at most two frames are ever decoded. That is
deliberate: `warmVideo()` prefetching about 70MB of sketches is what filled the
LG wall display's memory and left the board dead on the wall ("Not enough
memory to open this webpage"). A backdrop must never be the next thing to do
that.

They are **drawn behind a heavy scrim**, so a bright picture cannot stop the
figures on the board reading from across the office. Judge a new one on how it
looks under that scrim, not on how it looks on its own.

## Where they come from, and the licence

Everything here is from Pexels or Unsplash. **Both licences allow commercial
use with no attribution required**, which is why a staff board in a public
repository can carry them. Attribution is recorded anyway, because the next
person should be able to check rather than take this file's word for it.

| File | Source | Licence |
|---|---|---|
| `pumpkins.jpg` | https://www.pexels.com/photo/5683333/ | Pexels |
| `lantern.jpg` | https://www.pexels.com/photo/18542863/ | Pexels |
| `misty-wood.jpg` | https://www.pexels.com/photo/34266953/ | Pexels |
| `golden-trees.jpg` | https://www.pexels.com/photo/904373/ | Pexels |
| `hearth.jpg` | https://unsplash.com/photos/photo-1543393470-b2c833b98dce | Unsplash |
| `logfire.jpg` | https://unsplash.com/photos/photo-1595770205769-84b55f75a053 | Unsplash |
| `tree-lights.jpg` | https://www.pexels.com/photo/6653557/ | Pexels |
| `pine-dusk.jpg` | https://www.pexels.com/photo/11178045/ | Pexels |
| `snow-trees.jpg` | https://www.pexels.com/photo/29841995/ | Pexels |
| `blossom-dusk.jpg` | https://www.pexels.com/photo/12069363/ | Pexels |
| `blossom-sky.jpg` | https://www.pexels.com/photo/31158811/ | Pexels |
| `hills-sunset.jpg` | https://www.pexels.com/photo/1107717/ | Pexels |
| `oak-sunset.jpg` | https://www.pexels.com/photo/17345550/ | Pexels |

Do not add a picture here without recording where it came from and that its
licence allows commercial use. This repository is public: anything dropped in
is published to anyone who fetches it.

## Which one shows when

The windows and the lists live in `SEASON_WHEN` and `SEASON_SETS` in
`team-board.html`. Add a picture by dropping the file here and adding its name
to a list: nothing else needs changing. A file the board cannot fetch is
ignored quietly and whatever is already up stays up.
