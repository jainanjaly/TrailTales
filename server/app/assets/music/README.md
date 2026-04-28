# Reel background music

Drop royalty-free audio files in this directory and they'll automatically
appear in the music picker when creating a reel.

## Filename rules

- Supported extensions: `.mp3`, `.m4a`, `.aac`, `.wav`, `.ogg`
- The track **id** is the filename without extension (lowercase, no spaces).
- The display **name** is derived from the id by replacing `-`/`_` with spaces
  and title-casing it.

Examples:

| Filename            | Track id        | Display name      |
| ------------------- | --------------- | ----------------- |
| `summer-breeze.mp3` | `summer-breeze` | Summer Breeze     |
| `wanderlust.m4a`    | `wanderlust`    | Wanderlust        |
| `road_trip.mp3`     | `road_trip`     | Road Trip         |

## Where to find royalty-free music

Any of these are safe for personal/dev use — pick something with a permissive
license (CC0, CC-BY) and credit the artist if required:

- [Pixabay Music](https://pixabay.com/music/) — CC0
- [Free Music Archive](https://freemusicarchive.org/) — varied CC licenses
- [Incompetech](https://incompetech.com/music/royalty-free/) — CC-BY (credit required)
- [YouTube Audio Library](https://studio.youtube.com/) (sign-in required)

Aim for tracks 30–90 seconds long (reels are short). Files larger than ~5 MB
will bloat the repo — keep them small. These files are **not committed** by
default; check `.gitignore` if you want to track them.
