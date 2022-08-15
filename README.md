# outliers-donuts

Running 1:1s with the ⚡️🦎

Objective:
The Outliers Community bot should serve the same purpose as the Donut bot on Slack. At a high level, this bot should connect Outliers in the Discord with each other via a direct message at a given interval. The connected Outliers should then set up a time to have a 30 minute call to get to know each other! This promotes community and emotional bonds better than almost anything else we've tried in a virtual environment.

**Project Spec:**
Diving into the specifics, what are the inputs to the Outliers Community bot?

_Participants:_ The Particpants are the selected members in the Discord that should be connected via the bot. This could be specified via a set of Discord usernames, a Role, or even a combination of the two.

_GroupSize:_ The GroupSize should specify the number of Participants to connect in when performing the Match function.

_History:_ The History should track which members have been introduced to each other. This will be used by the Connect function to check that the same intros aren't being repeated.

_Interval:_ The interval should specify the timeframe on which the Outliers bot should run. If this isn't possible to automate, then clear instructions on how to manually run the bot should be written instead.

Using this information, the bot should run functions that match Participants of a selected GroupSize based on the History and connect them via a group DM on a certain Interval. For extra credit, add a tracker to History that checks in if the meeting actually happened :) Hope this is helpful to get started!

## Dev Contributor Guide

1. Follow this guide and set up Discord Bot: https://anidiots.guide/getting-started/getting-started-long-version/
2. Create a new discord server
3. Create a private channel which will be used for bot commands
4. Rename config_dummy.json to config.json and put in your bot token from step 1 and your channel id from step 2, and your server id from step 2
5. Install node modules: `yarn install`
6. Run bot: `yarn run start`
7. Get an overview of all available commands: type `\help` in the private channel from step 3.

## Type generation

1. Run `npx openapi-typescript https://<YOUR URL>.supabase.co/rest/v1/?apikey=<YOUR anon-key> --output generated-types.ts`
