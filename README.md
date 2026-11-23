# Tech Fest QR Treasure Hunt

## Event plan
- 7 teams, 4 members each
- 7 checkpoint locations: Library, STEM Lab (Robotics Lab), Sports Ground, Physics Lab, Chemistry Lab, Art Room, Medical Room
- Each team visits 5 different checkpoints in its own route
- Common finish: Mandap area
- Volunteers sign in with individual accounts; each volunteer account is restricted to its assigned station

## One permanent QR per team
- Each team receives exactly one unique QR code.
- The same team QR is scanned at the start, all five checkpoints, and the Mandap finish.
- The first scan by the admin or a volunteer starts the server-side timer and reveals the first location riddle.
- At a checkpoint, the signed-in volunteer scans the team QR, enters the keyword, and submits. The backend derives the volunteer's station from their account and checks the expected route stop and keyword.
- At Mandap, the finish volunteer scans the same team QR. The backend records the finish only after all five stops are complete.
- No checkpoint QR codes or separate Mandap QR codes are needed.

## What's included
- Responsive website preview
- Supabase schema and server-side RPC functions in `supabase/schema.sql`
- Single-team-QR workflow (`volunteer_scan_team`)
- Browser camera QR scanner using the BarcodeDetector API, plus manual token entry fallback
- Server-side start and finish timestamps
- Hashed checkpoint keywords; plain answers are not returned to browser
- Order enforcement: wrong station, wrong keyword, duplicate progression and early finish are rejected
- Admin-only route setup, private team QR generation and leaderboard
- Audit log for starts, successful checkpoint checks and finishes

## Local preview
1. Install Node.js.
2. Extract this ZIP.
3. Open a terminal in the project folder.
4. Run `npm install` and then `npm run dev`.
5. Open the local URL shown in the terminal.

## Connect the backend
1. Create a Supabase project.
2. Open SQL Editor and run the complete `supabase/schema.sql` file once in the new project.
3. In Project Settings → API, copy the Project URL and anon/publishable key into `public/config.js`. Never use the service-role key in browser code.
4. In Authentication → Users, create one admin login, seven checkpoint volunteer logins, one start-desk volunteer login, and one Mandap finish volunteer login (the start desk can be combined with an existing volunteer if operationally appropriate).
5. Copy each user's UUID and insert a matching row into `public.profiles` using the examples at the bottom of `supabase/schema.sql`.
   - Admin: role `admin`, station_location `null`.
   - Checkpoint volunteer: role `volunteer`, station_location must exactly match their checkpoint name.
   - The admin can scan the first team QR at the starting line to start the timer.
   - Mandap volunteer: role `volunteer`, station_location `Mandap area`.
6. Sign in as admin, configure five route stops and keyword answers for every team, then open the event.
7. Use Admin → Load QR print data to generate the seven team QR codes. Print one for each team and keep them private.
8. Deploy the site to HTTPS hosting before volunteers use the camera scanner on phones. Camera scanning requires a supported Chromium browser and camera permission; manual token entry remains available as a fallback.

## Important testing notes
- This package has not been connected to or tested against the user's live Supabase project. Do not treat it as event-ready until the schema runs successfully and the full workflow is tested with dummy teams and volunteer accounts.
- Keep QR tokens private. Anyone with a team's QR token could impersonate that team at a volunteer station.
- Never put the Supabase service-role key in browser code or share it in chat.
- Test start, each correct checkpoint, wrong station, wrong keyword, repeated scan, premature Mandap scan, and successful finish on multiple phones.
- Prepare the paper/manual backup before event day.

## RPC contract
All operations require an authenticated Supabase user.

| RPC | Purpose |
|---|---|
| `admin_set_team_name(team_number, team_name)` | Rename a team |
| `admin_set_route(team_number, sequence, location_name, riddle, keyword)` | Save a stop; stores keyword as bcrypt hash |
| `admin_set_event_open(is_open)` | Opens only when every team has five stops |
| `admin_get_setup()` | Admin-only setup and private team QR tokens |
| `admin_leaderboard()` | Admin-only elapsed-time ranking |
| `volunteer_scan_team(team_token, keyword)` | Starts the timer, verifies a checkpoint based on volunteer account station, or finishes at Mandap using the same team QR |
