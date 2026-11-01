# PayrollMinder

PayrollMinder is an automation script that intelligently calculates payroll submission due dates and related details, and sends reminders about these facts to the **#accounting** channel in Slack.

---

## How It Works

There are no Slack user commands for this script because it works automatically behind the scenes. Every day, it checks whether any reminders need to go out. On the 1st of each month, it also posts a full calendar overview. Here's how it thinks:

**1. Build the banking calendar.** The script maps out the entire month and removes all weekends and days the banks are closed. This creates a calendar of valid "banking days," which is the foundation for all other calculations.

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

In rare situations (e.g., a month starting with multiple holidays), there may not be enough banking days before a pay date to send the full reminder sequence. If this happens, that pay run's reminders are skipped for the month, and the monthly summary marks it as skipped.

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
- All holidays occurring that month, with whether we're closed or open and whether the banks are closed
- A complete schedule for each pay run: pay period, reminder dates, submission deadline, pay date, and (for the faculty pay run) the worksheet reminder date

---

## Holiday Schedule

Holidays affect PayrollMinder in two separate ways, and a holiday can do one without the other. **Bank closures** affect date calculations: if a pay date or submission deadline falls on a day the banks are closed, it moves to the nearest prior banking day. **Paid holidays** are company days off where employees are still paid; these are listed in the pay run reminders when they fall within a pay period.

| Holiday | Date | Status | Banks |
|---|---|---|---|
| New Year's Day | January 1 | Closed · Paid | Closed |
| Martin Luther King Jr. Day | 3rd Monday in January | Open as normal | Closed |
| Presidents Day | 3rd Monday in February | Open as normal | Closed |
| Memorial Day | Last Monday in May | Closed · Paid | Closed |
| Juneteenth | June 19 | Open as normal | Closed |
| Independence Day | July 4 | Closed · Paid | Closed |
| Labor Day | 1st Monday in September | Open as normal | Closed |
| Indigenous Peoples' Day / Columbus Day | 2nd Monday in October | Open as normal | Closed |
| Veterans Day | November 11 | Open as normal | Closed |
| Thanksgiving Day | 4th Thursday in November | Closed · Paid | Closed |
| Black Friday | Day after Thanksgiving | Closed · Paid | Open |
| Christmas Day | December 25 | Closed · Paid | Closed |
| Winter Closure | December 24 – January 1 | Closed · Paid | Open, except December 25 and January 1 |

- **Weekend holidays.** We close on a holiday's actual date, even when it falls on a weekend. The banks follow the Federal Reserve's schedule instead: a holiday on a Sunday closes them the following Monday, and a holiday on a Saturday doesn't close them on any weekday.
- **Winter Closure** appears in reminders as one date range, so Christmas Day and New Year's Day aren't listed separately on top of it.
- **Open holidays** are normal workdays, so they're left out of pay run reminders. They still appear in the monthly summary because their bank closure can move a pay date or deadline.

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
