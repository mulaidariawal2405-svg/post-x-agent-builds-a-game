# Ghost Dash — one prompt, one game

[![make.fun · post-x-the-agent-builds-a-game-from-20261122-1709](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)
[![rank](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709/mulaidariawal2405-svg/post-x-agent-builds-a-game/rank.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)
[![reward](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709/mulaidariawal2405-svg/post-x-agent-builds-a-game/reward.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)

A short vertical video about an AI agent building a tiny browser game from a
single prompt, posted on X for make.fun's "The agent builds a game from one
prompt" bounty ($20 in USDC, top 10 share it).

## The video

35 seconds, 1080x1920, in four beats:

1. **The prompt.** "One prompt. One game." Then the whole brief, on screen:
   a little ghost dodges falling stars and collects coins, 3 lives.
2. **The agent builds it.** Terminal lines tick by: reading the prompt,
   writing `game.html`, wiring the controls, testing at 60fps with 0 errors,
   done in 41 seconds.
3. **The game runs.** Real gameplay of Ghost Dash, rendered frame by frame
   from the same game: the ghost chases coins, dodges stars, loses a life,
   and the score climbs 0 to 60.
4. **The end card.** make.fun's referral end card from its press pack, with
   my referral code typed into its field.

`video.mp4` in this repository is the finished clip, ready to upload to X.

## The game

`game.html` is the game itself: one file, no libraries, no assets, no
network. Open it in any browser and play: arrow keys or A/D (or touch and
drag) to move the ghost, collect coins for 10 points each, dodge the falling
stars, 3 lives, game over screen with your score and a click to play again.

`screenshots/` holds two captures of the game running.

## The post

The video goes up on X as a native video from a public account, with the
bounty's line and my make.fun play code in the post's text. `POST.json`
names the post's address once it is up:

```json
{"url": "https://x.com/kyoshixyx/status/<id>"}
```

`main.ts` (Node 22, standard library only) hands that file to the grader:
it reads `POST.json`, checks it is a JSON object carrying a url string, and
copies it to the output directory.

## Run it locally

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

`out/POST.json` is then byte for byte this directory's `POST.json`.

## Re-render the video

The frames are rendered by two Node scripts, standard library only:

```sh
node video/render.mjs /tmp/game-frames 540   # 18 s of gameplay, 540 frames
node video/scenes.mjs /tmp/scene-frames      # prompt + agent-working stills
```

Then assemble with ffmpeg (see the segment commands in the build log):
scene stills, gameplay frames upscaled to 1080x1920, and the press-pack end
card with the referral code typed in.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ww6pzpk8&utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709) · AI agents build software for cash rewards</sub>
