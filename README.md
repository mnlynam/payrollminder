# PayrollMinder

A Google Apps Script–based Slack bot that sends escalating payroll submission reminders and monthly calendar summaries to a Slack channel.

## What It Does

- Calculates valid banking days (excluding weekends and federal bank holidays)
- Adjusts pay dates that fall on non-banking days to the nearest prior banking day
- Sends escalating reminders: **Heads Up** → **Reminder** → **Submission Due**
- Posts a full monthly payroll calendar on the 1st of each month
- Handles special one-off reminders (e.g., worksheet generation for faculty payroll)
- Falls back to admin DM → email if Slack delivery fails

## Pay Schedule

| Pay Run | Nominal Day | Pay Period Covered |
|---|---|---|
| Office Pay Run (1 of 2) | 10th | 16th–end of prior month |
| Faculty Pay Run | 15th | 1st–end of prior month |
| Office Pay Run (2 of 2) | 25th | 1st–15th of current month |

## Setup

### Prerequisites

- A Google account with access to [Google Apps Script](https://script.google.com)
- A Slack workspace with a bot app configured (needs `chat:write` scope)
- [Node.js](https://nodejs.org/) (v18+) installed locally
- [clasp](https://github.com/google/clasp) installed globally: `npm install -g @google/clasp`

### Script Properties

Set these in the Apps Script editor under **Project Settings → Script Properties**:

| Key | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Your Slack bot's `xoxb-` token |
| `SLACK_CHANNEL` | The Slack channel for reminders (e.g., `#accounting`) |
| `SLACK_ADMIN_USER_ID` | Slack member ID of the script admin |
| `ADMIN_EMAIL` | Email for critical error notifications |
| `SLACK_ID_USER_A` | Slack member ID: tagged for worksheet reminders and check number requests |
| `SLACK_ID_USER_B` | Slack member ID: tagged for check number requests |
| `WORKSHEET_REMINDER_MSG` | Template for the worksheet reminder (use `{priorMonthName}` as placeholder) |
| `CHECK_NUMBERS_MSG` | Message text for the check number request |
| `GUIDE_DOC_URL` | *(Optional)* URL to the PayrollMinder guide doc |

### Trigger

In the Apps Script editor, add a **time-driven trigger** for `sendPayrollReminders`:

- **Function:** `sendPayrollReminders`
- **Type:** Time-driven → Day timer
- **Time:** 7:00–8:00 AM (or your preferred morning window)

## Development with clasp

This project uses [clasp](https://github.com/google/clasp) to sync between this repo and Google Apps Script.

```bash
# First time: log in to your Google account
clasp login

# Pull latest from Apps Script → local
clasp pull

# Push local changes → Apps Script
clasp push

# Open the Apps Script editor in your browser
clasp open
```

See [SETUP.md](SETUP.md) for first-time setup instructions.

## File Structure

```
├── .claspignore         # files clasp should NOT push to Apps Script
├── appsscript.json      # Apps Script manifest (runtime version, timezone, etc.)
├── PayrollMinder.js     # the script
├── GUIDE.md             # public-facing user guide (also published via GitHub Pages)
├── README.md
└── SETUP.md             # first-time setup walkthrough
```

## License

Proprietary
