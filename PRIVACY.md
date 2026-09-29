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

## Poll Everywhere access

The script reads visible text and interactive controls on matching Poll Everywhere participant pages only to distinguish waiting and active states. It does not submit answers, collect response contents, or transmit Poll Everywhere page data anywhere except for the page title and URL included in the user's Telegram notification.
