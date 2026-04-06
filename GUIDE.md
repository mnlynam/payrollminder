# PayrollMinder

PayrollMinder is an automation script that intelligently calculates payroll submission due dates and related details, and sends reminders about these facts to the **#accounting** channel in Slack.

---

## How It Works

There are no Slack user commands for this script because it works automatically behind the scenes. Every day, it checks whether any reminders need to go out. On the 1st of each month, it also posts a full calendar overview. Here's how it thinks:

**1. Build the banking calendar.** The script maps out the entire month and removes all weekends and official bank holidays. This creates a calendar of valid "banking days," which is the foundation for all other calculations.

**2. Adjust pay dates.** It looks at the three standard pay dates: the 10th, 15th, and 25th. If a pay date lands on a non-banking day (like a Saturday or a holiday), the script automatically shifts it to the closest previous banking day. For example, if the 15th of the month is a Saturday, it sets the actual pay date to Friday the 14th.

**3. Calculate the submission deadline.** With the correct pay date locked in, the script counts back **2 banking days**. This ensures there is enough processing time for direct deposits. For example, if the adjusted pay date is Friday the 14th, the submission deadline will be set for Wednesday the 12th.

**4. Send escalating reminders.** Starting 4 banking days before the pay date, the script sends a series of reminders that increase in urgency (see Reminder Schedule below).

**5. Post the monthly summary.** On the 1st of each month, the script posts a complete calendar to #accounting showing all upcoming pay runs, their reminder dates, submission deadlines, pay dates, and any holidays for the month.

---

## Pay Periods

Each pay run covers a specific date range. The reminders include these dates so everyone knows exactly what period they're submitting payroll for.

| Pay Run | Nominal Pay Date | Period Covered |
|---|---|---|
| Office Pay Run (1 of 2) | 10th | 16th – end of prior month |
| Faculty Pay Run | 15th | 1st – end of prior month |
| Office Pay Run (2 of 2) | 25th | 1st – 15th of current month |

---

## Reminder Schedule

Each pay run follows the same three-step escalating reminder sequence. All reminders are posted to **#accounting** and include the pay run description, pay period dates, any paid holidays in the period, the submission deadline, and the pay date.

| Banking Days Before Pay Date | Reminder Type | Purpose |
|---|---|---|
| 4 | **Heads Up** | Early notice that a pay run is approaching |
| 3 | **Reminder** | Follow-up to begin preparing the submission |
| 2 | **Submission Due** | Final reminder — payroll must be submitted today |

On the Submission Due date, the reminder will display "Due TODAY" next to the submission deadline. If the submission deadline is tomorrow, it will display "Due tomorrow."

### Edge Case: Too Few Banking Days

In rare situations (e.g., a month starting with multiple holidays), there may not be enough banking days before a pay date to send the full reminder sequence. If this happens, that pay run's reminders are skipped for the month. The monthly summary will flag this so it doesn't come as a surprise.

---

## Office Pay Runs

The office pay runs (10th and 25th) follow the standard reminder schedule described above. They do not include any special mentions, advance reminders, or check number requests.

---

## Faculty Pay Runs

The faculty pay run (15th) follows the same standard reminder schedule, plus two additional steps:

- **Advance worksheet reminder** — Sent **7 banking days** before the pay date, tagging the appropriate person with a reminder to generate the blank teacher payroll worksheets for the prior month.
- **Check numbers request** — Sent on the **Submission Due** date alongside the final reminder, tagging the appropriate recipients and prompting them to post the next available check numbers.

---

## Monthly Summary

On the **1st of each month**, the script posts a calendar overview to #accounting that includes:

- Total banking days available for the month
- All holidays occurring that month (with paid/unpaid and bank-closed status)
- A complete schedule for each pay run: reminder dates, submission deadline, and pay date

This gives everyone a single reference point for the month ahead.

---

## Holiday Schedule

The script recognizes the following holidays. **Bank holidays** affect date calculations — if a pay date or submission deadline falls on one, it will be moved to the nearest prior banking day. **Paid holidays** are company days off where employees are still paid; these are listed in the pay run reminders when they fall within a pay period.

| Holiday | Bank Holiday? | Paid Holiday? |
|---|---|---|
| New Year's Day | Yes | Yes |
| Martin Luther King Jr. Day | Yes | No |
| Presidents Day | Yes | No |
| Memorial Day | Yes | Yes |
| Juneteenth | Yes | No |
| Independence Day | Yes | Yes |
| Labor Day | Yes | Yes |
| Columbus Day | Yes | No |
| Veterans Day | Yes | No |
| Thanksgiving Day | Yes | Yes |
| Christmas Day | Yes | Yes |

> **Note:** Black Friday is tracked by the script for reference purposes but is not a bank holiday or a paid holiday, so it has no effect on pay dates or deadlines.

---

## Configuration

To keep sensitive information safe, PayrollMinder securely stores its configuration data separately from the code itself. This includes:

- **Slack Bot Token** — for posting messages as the app
- **Script admin contact info** — Slack ID and email for error alerts
- **Member IDs** — for specific individuals who are tagged in reminders

These values are stored in the Google Apps Script project settings and are never included in the codebase.

---

## Error Handling

The script uses a multi-step notification process to ensure failures don't go unnoticed:

1. **Log** — If sending a message fails for any reason, the error is logged for review.
2. **Direct Message** — The script then attempts to send a direct message to the script admin with the error details.
3. **Email Alert** — If the direct message also fails, the script sends an email to the script admin as a final alert.

---

## Need Help?

Slack **@mlynam** or email **mlynam@musicplace.com** for assistance.
