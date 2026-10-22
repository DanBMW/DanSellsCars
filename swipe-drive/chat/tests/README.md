# Swipe Drive chat tests

* `node model-mapping.test.js`: checks every BMW model input maps to the right model (digits must match exactly).
* `python3 e2e_chat.py BASE_URL [N] [--slow] [--onlyK]`: headless Chrome end to end suite at phone sizes (iPhone Safari UA, Android Chrome UA, small phone). Runs N seeded random full conversations (default 54) covering typos, slang, emoji, numbers in words, smalltalk, bad answers, reloads, start again, skips, sliders at their edges, cash and finance paths, no current car, spec deck by drag, buttons, swipe up and double tap, plus the quick lane on every device. `--slow` throttles every fifth run to a slow 3G style network.

Example: `python3 e2e_chat.py https://dan-sells.co.uk/swipe-drive/chat/ 54 --slow`
