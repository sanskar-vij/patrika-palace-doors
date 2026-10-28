# Website update

- Fixed the palace-door artwork path in the production build so the closed gate is visible before the car is tapped.

- Sentence case for page headings, labels and invitation wording. Event headings remain uppercase; proper names retain their capitalization.
- Countdown text reduced by 10% from the supplied design. The number and Days appear side by side in a tile matching the hours, minutes and seconds.
- The day label is Day whenever the displayed day count is 1; otherwise it is Days. Below 24 hours the tile reads 00 Days and the hours continue normally.
- Car scroll movement now uses time-based, critically damped smoothing. Its existing routes are preserved.
- The first-page car still enters in 2 seconds, then reaches its position over the following 4 seconds.
- Flower sway, drifting petals, movement within the scenic art, and interactive card movement are 10% stronger. Reduced-motion preferences still disable decorative animation.
- No visual editor or editing server is included.

## Where to make future changes

| Change | File or setting |
| --- | --- |
| Names, dates, labels, events | src/data/content.ts |
| Wording case | Write the desired case directly in content.ts |
| Countdown Day/Days labels | copy.countdownDay and copy.countdownDays |
| Countdown size and tile arrangement | src/styles/countdown.css |
| General fonts and spacing | src/styles/typography.css |
| First-page arrival time | car.arrivalEnterMs and car.arrivalDriveMs, in milliseconds |
| Scroll smoothing | car.smoothingMs |
| Decorative animation strength | botanicals.motionScale: 1 is original; 1.1 is 10% stronger |
| Door animation | src/styles/entrance.css |

After source changes, run npm run check, then npm run build. The dist folder is the ready-to-upload website.
