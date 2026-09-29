# PollEv Watcher

PollEv Watcher is a small Tampermonkey userscript that watches a Poll Everywhere participant page. After it observes the waiting screen, it sends a Telegram message when the activity becomes active.

It also shows a local desktop notification, plays a short sound when the browser permits it, and flashes the tab title.

PollEv Watcher is an independent project and is not affiliated with or endorsed by Poll Everywhere.

## One-click install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. [Install PollEv Watcher](https://raw.githubusercontent.com/KKazuhaK/pollev-watcher/main/src/pollev-watcher.user.js).
3. Open a supported Poll Everywhere participant page and configure Telegram from the Tampermonkey menu.

When installed from GitHub, Tampermonkey uses the metadata in the script to check this repository for newer versions.

## Compatibility

| Poll Everywhere version | Participant URL | Support |
| --- | --- | --- |
| 1.0 | `pollev.com/<join-code>` | Verified |
| 2.0 | `pe.app/<join-code>` | Experimental; needs validation with a live 2.0 session |

The watcher deliberately uses visible page state instead of private Poll Everywhere APIs. It recognizes several waiting messages and then watches for the waiting view to disappear, making it tolerant of many layout changes between 1.0 and 2.0.

## Requirements

- Chrome or another Chromium-based browser
- [Tampermonkey](https://www.tampermonkey.net/)
- A Telegram bot created through [@BotFather](https://t.me/BotFather)

## Install

1. Install Tampermonkey.
2. Open Tampermonkey's dashboard and create a new script.
3. Replace the editor contents with [`src/pollev-watcher.user.js`](src/pollev-watcher.user.js).
4. Save the script.
5. Open the Poll Everywhere participant page and keep the tab open.

## Configure Telegram

1. Create a bot with `@BotFather` and copy its Bot Token.
2. Open your new bot and send it `/start`.
3. On the Poll Everywhere page, open Tampermonkey's extension menu.
4. Choose **Configure Telegram** and enter the Bot Token.
5. The script reads the bot's recent updates and suggests the Chat ID from your `/start` message. Confirm it when prompted.
6. Choose **Send Telegram test notification** to verify the setup.

The Bot Token and Chat ID are stored in Tampermonkey's script storage. They are not part of this repository. Do not add either value to source files, screenshots, issues, or commits. See [PRIVACY.md](PRIVACY.md) for the complete data-handling summary.

## How detection works

The script first waits until it sees Poll Everywhere's waiting message. It then watches page changes with a `MutationObserver`. When the waiting screen disappears for long enough, the script treats the activity as active and sends one notification. If the page returns to waiting, the notification latch resets so the next activation sends another notification.

This transition requirement prevents a notification merely because an unrelated Poll Everywhere page was opened.

## Limitations

- The Poll Everywhere tab must remain open.
- The computer must remain awake and connected to the internet.
- Browser power-saving features may delay page updates in a background tab.
- Poll Everywhere can change its page text or structure. The matching rules may need an update if that happens.
- Sound playback normally requires clicking the page at least once because browsers restrict autoplay.

## Development

Run the JavaScript syntax check:

```sh
npm run check
```

## License

MIT
