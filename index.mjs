'use strict';

// XXX clean up all this ES6 bullshit that makes me want to hurl myself into the FUCKING SUN
// JavaScript has gone OFF THE FUCKING RAILS SINCE I LAST WROTE IT SERIOUSLY
// WHAT THE FUCK IS THIS SHIT
// I can't mix and match CommonJS and ESMs?? ARE YOU KIDDING???????
// I seriously FUCKING HATE `(await import('foo')).some_prop` THAT IS THE WORST SHIT
// </rant>
var bolt = await import('@slack/bolt');
var App = bolt.default.App;
var subtype = bolt.subtype;
var Imgflip = (await import ('imgflip.com')).default.Imgflip;
import { ChatGPTAPI } from 'chatgpt';
var https = await import('https');

var imgflip = new Imgflip();
var memeList = imgflip.api.getMemes().then(l => l.data.memes);
var memeBullets = memeList.then(l => l.map(obj => '* ' + obj.name).join('\n'));

var chatGPT = new ChatGPTAPI({
  apiKey: process.env.OPENAI_API_KEY
});

async function getMemePrompt() {
  return `A Slack channel called #cherish-memes memes has the following description:

> Only memes allowed. Only emoji reactions allowed. Violators will be memed.

Create a JSON object representing a meme to respond to someone violating the rules. The JSON object should have a top_caption key with the caption at the top of the meme, a bottom_caption key with the caption at the bottom of the meme, and a meme_title key with which meme image the captions should go on. meme_title should be one of the following:

${await memeBullets}

Do not include any text except the JSON response, and do not format the JSON response as code.
`.trim();
}

var app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

app.message('', async ({ message, event, say }) => {
  if (event.channel_type !== 'im') return;

  await say("You think I'm going to give up my secrets just because you DM me?");

  // TODO license, sudo, master, etc.
});

app.message('', async ({ message, event, say }) => {
  if (event.channel_type !== 'channel') return;

  // If the user followed or mostly followed the rules, don't roast them
  if ((event.files || []).map(f => f.mimetype.startsWith('image/')).reduce((a, b) => a || b, false) || (URL.parse(event.text) && !event.text.includes(' '))) {
    if (event.text) {
      await app.client.reactions.add({
        channel: event.channel,
        timestamp: event.event_ts,
        name: 'eyes' // TODO make it different sometimes
      });
    }

    return;
  }

  // Let em have it
  var gptRes = await chatGPT.sendMessage(await getMemePrompt());
  // We just let this throw, and therefore abort the roast, if ChatGPT hallucinates invalid JSON
  // We do the same for the rest of this function because frankly, there is NO error here worth actually handling in a way other than "silently don't post a response message"
  // And GOD FORBID it crashes the process. KILL THAT SUCKER. I DON'T CARE. I'm talking *SIGKILL*.
  var res = JSON.parse(gptRes.text);

  var imgRes = await imgflip.api.captionImage({
    username: process.env.IMGFLIP_USERNAME,
    password: process.env.IMGFLIP_PASSWORD,
    // XXX do this at startup instead of every time LOL
    template_id: (await memeList).filter(o => o.name === res.meme_title)[0].id,
    text0: res.top_caption,
    text1: res.bottom_caption
  });

  // XXX throw if imgRes.success: false

  https.get(imgRes.data.url, (response) => {
    app.client.filesUploadV2({
      channel_id: event.channel,
      file: response,
      filename: 'image.png',
      thread_ts: event.event_ts
    });
  });
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log('⚡️ Bolt app is running!');
})();
