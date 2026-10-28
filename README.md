# Patrika Main Website

This package contains the invitation website, its source and a ready-to-upload build. No visual editing dashboard is included.

## Run locally
Install Node.js 22.22 or newer. Open a terminal in this folder (where package.json is), then run:

    npm install
    npm start

Open http://localhost:4174/ on your computer. For your phone, use the Network address printed in the terminal while both devices are on the same Wi-Fi. Keep the computer and server running.

## Upload
The dist folder contains the finished static website. Upload its contents to your static hosting web root. If the platform builds the source, use npm run build and set the output folder to dist.

## Rebuild after code changes
    npm run build

Names, dates and event details are in src/data/content.ts. Font and layout styles are in src/styles/. Music is in public/assets/wedding-song.mp3.
