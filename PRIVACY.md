# Privacy

PollEv Watcher does not include analytics, advertising, or tracking.

## Data stored locally

The following values are stored in Tampermonkey's per-script storage in the user's browser:

- Telegram Bot Token
- Telegram Chat ID
- Whether monitoring is enabled or paused
- Whether notifications are enabled or disabled
- Whether location testing is enabled
- The configured test coordinates, accuracy, and simulated error mode
- Any location names and coordinates the user chooses to save as favorites

These values are not included in the source repository.

## Data sent to Telegram

When the user runs the test command or an observed Poll Everywhere activity becomes active, the script sends a request directly from the browser to the official Telegram Bot API at `api.telegram.org`.

The request contains:

- Telegram Bot Token, as required by the Telegram Bot API endpoint
- Telegram Chat ID
- A short notification message
- The current Poll Everywhere page title and URL

The location-testing settings remain in Tampermonkey storage and are not added to Telegram notifications. No project-operated server receives or stores this data. Telegram processes notification requests under its own terms and privacy policy.

## Map and place search

The map loads tiles from `tile.openstreetmap.org`; tile requests reveal the map area being viewed and the browser's IP address to that service.

Only when the user presses Search or Enter, the script sends the entered place name or address to the public Photon service at `photon.komoot.io`. Do not enter confidential addresses or other sensitive information. The service also receives the browser's IP address. The search request does not include Telegram credentials, Poll Everywhere page data, saved favorites, the configured test coordinates, or the browser's actual geolocation. Requests do not include cookies.

Up to 20 queries and their results are cached only in page memory to avoid repeated requests. They are not stored in Tampermonkey storage and disappear on page reload. Selecting a search result updates only the settings form until the user saves it.

## Poll Everywhere access

The script reads visible text and interactive controls on matching Poll Everywhere participant pages only to distinguish waiting and active states. It does not submit answers, collect response contents, or transmit Poll Everywhere page data anywhere except for the page title and URL included in the user's Telegram notification.
