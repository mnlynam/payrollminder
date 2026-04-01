/** 
 * PayrollMinder
 * 
 * @version 4.0
 * @author Matthew Lynam
 * @modified 2026-04-01
 * 
 * @description
 * A Google Apps Script–based Slack App that calculates valid banking days,
 * adjusts pay dates around weekends and holidays, determines pay periods, and
 * sends escalating payroll-submission reminders via Slack. Additionally sends a
 * monthly calendar summary on the 1st of each month.
 * 
 * @requires Google Apps Script
 * @requires Slack API
 * 
 * @see {@link https://api.slack.com/} Slack API Documentation
 * 
 * @config The 'Script Properties' in the Apps Script editor must contain:
 * @property {string} SLACK_BOT_TOKEN       - The 'xoxb-' token for the Slack App.
 * @property {string} SLACK_ADMIN_USER_ID   - Slack member ID of the script admin.
 * @property {string} ADMIN_EMAIL           - Email address for critical error notifications.
 * @property {string} SLACK_ID_MIKE         - Slack member ID for Mike.
 * @property {string} SLACK_ID_JANICE       - Slack member ID for Janice.
 * @property {string} GUIDE_DOC_URL         - URL to the public-facing guide document.
 * 
 * @copyright 2025 The Music Place
 * @license Proprietary
 */

// =========================================================================
// CONFIGURATION
// =========================================================================
const TIME_ZONE = "America/Los_Angeles";
const SLACK_CHANNEL = "#accounting";

/**
 * Reminder schedule — listed in chronological order (earliest first).
 *
 * Each entry fires the main payroll reminder on that many banking days before
 * the pay date. The entry marked `isSubmissionDay: true` is the actual
 * submission deadline and controls the "Submission Due" line in every reminder.
 *
 * To add, remove, or reorder reminders, just edit this array.
 */
const REMINDER_SCHEDULE = [
  { label: "Heads Up",       bankingDaysBeforePay: 4, emoji: "📋" },
  { label: "Reminder",       bankingDaysBeforePay: 3, emoji: "📢" },
  { label: "Submission Due", bankingDaysBeforePay: 2, emoji: "🚨", isSubmissionDay: true },
];

// Derived: the submission deadline (banking days before pay date)
const SUBMISSION_LEAD_DAYS = REMINDER_SCHEDULE.find(r => r.isSubmissionDay).bankingDaysBeforePay;

// Derived: minimum banking days required before a pay date for reminders to work
const MIN_BANKING_DAYS_REQUIRED = Math.max(...REMINDER_SCHEDULE.map(r => r.bankingDaysBeforePay));

/**
 * Pay-period definitions.
 *
 * Each entry's `day` is the nominal calendar day of the month the pay run
 * targets. If that day falls on a weekend or bank holiday, it rolls back to
 * the nearest prior banking day.
 */
const PAY_PERIOD_CONFIG = [
  {
    day: 10,
    description: "Office Pay Run (1 of 2)"
  },
  {
    day: 15,
    description: "Faculty Pay Run",
    requiresMgmtCheckNumbers: true,
    specialReminders: [
      {
        leadDays: 7,
        propertyForMention: 'SLACK_ID_MIKE',
        message: `REMINDER: Please generate the blank teacher payroll worksheets for *{priorMonthName}*.`
      }
    ]
  },
  {
    day: 25,
    description: "Office Pay Run (2 of 2)"
  }
];

// In-memory holiday cache (per script execution)
const holidayCache = {};


// =========================================================================
// LOGGING
// =========================================================================
function logEvent(message) {
  Logger.log(message);
}


// =========================================================================
// CONFIGURATION & PROPERTIES LOADER
// =========================================================================
function getScriptConfiguration() {
  const properties = PropertiesService.getScriptProperties();

  const required = ['SLACK_BOT_TOKEN', 'SLACK_ADMIN_USER_ID', 'ADMIN_EMAIL', 'SLACK_ID_MIKE', 'SLACK_ID_JANICE'];
  const missing = required.filter(key => !properties.getProperty(key));
  if (missing.length) {
    throw new Error(`CRITICAL: Missing required script properties: ${missing.join(', ')}`);
  }

  const config = {
    slackBotToken:  properties.getProperty('SLACK_BOT_TOKEN'),
    adminUserId:    properties.getProperty('SLACK_ADMIN_USER_ID'),
    adminEmail:     properties.getProperty('ADMIN_EMAIL'),
    guideDocUrl:    properties.getProperty('GUIDE_DOC_URL'),
    userMentions: {
      SLACK_ID_MIKE:   `<@${properties.getProperty('SLACK_ID_MIKE')}>`,
      SLACK_ID_JANICE: `<@${properties.getProperty('SLACK_ID_JANICE')}>`
    },
    rawUserIds: {
      SLACK_ADMIN_USER_ID: properties.getProperty('SLACK_ADMIN_USER_ID')
    }
  };

  if (!config.guideDocUrl) {
    logEvent("Warning: 'GUIDE_DOC_URL' is not set. Messages will not include a link to the guide.");
  }

  config.mgmtMentions = `${config.userMentions.SLACK_ID_MIKE} ${config.userMentions.SLACK_ID_JANICE}`;
  return config;
}


// =========================================================================
// MAIN ENTRY POINT
// =========================================================================
function sendPayrollReminders() {
  let config;
  try {
    config = getScriptConfiguration();
  } catch (e) {
    logEvent(e.message);
    if (e.message.startsWith("CRITICAL:")) {
      const adminEmail = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
      if (adminEmail) {
        MailApp.sendEmail(adminEmail, "Critical PayrollMinder Script Failure",
          `The script failed to start due to a configuration error:\n\n${e.message}`);
      }
    }
    return;
  }

  const today = getToday();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  // --- Monthly summary (1st of the month) ---
  if (today.getDate() === 1) {
    sendMonthlyPayrollSummary(config, today);
  }

  // --- Daily reminders ---
  const bankHolidaysThisMonth = getHolidays(currentYear)
    .filter(h => h.isBankHoliday && h.date.getMonth() === currentMonth);
  const bankingDays = getValidBankingDays(currentYear, currentMonth, bankHolidaysThisMonth);

  if (bankingDays.length === 0) {
    const monthLabel = new Date(currentYear, currentMonth)
      .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: TIME_ZONE });
    const errorMessage = `ERROR: No valid banking days found for ${monthLabel}. Reminders cannot be processed.`;
    logEvent(errorMessage);
    sendSlackMessage(config.slackBotToken,
      { channel: config.rawUserIds.SLACK_ADMIN_USER_ID, text: errorMessage },
      "No Banking Days Error", config);
    return;
  }

  const guideFooter = config.guideDocUrl
    ? `\n\n<${config.guideDocUrl}|PayrollMinder Guide> for more info.`
    : "";

  const adjustedPayDates = getAdjustedPayDates(bankingDays, PAY_PERIOD_CONFIG.map(p => p.day));

  PAY_PERIOD_CONFIG.forEach(payRun => {
    processPayRun(payRun, adjustedPayDates, bankingDays, today, config, guideFooter);
  });
}


// =========================================================================
// PAY-RUN PROCESSING
// =========================================================================

/**
 * Processes a single pay run: fires special reminders and the main
 * escalating reminder if today matches any scheduled date.
 */
function processPayRun(payRun, adjustedPayDates, bankingDays, today, config, guideFooter) {
  const adjustedPayDate = adjustedPayDates[payRun.day];

  if (!adjustedPayDate) {
    logEvent(`CRITICAL: No valid banking day could be determined for nominal pay day ${payRun.day}.`);
    return;
  }

  const payDateIndex = bankingDays.findIndex(d => areSameDay(d, adjustedPayDate));

  if (payDateIndex < MIN_BANKING_DAYS_REQUIRED) {
    logEvent(`Skipping ${payRun.description} — pay date ${adjustedPayDate.toDateString()} ` +
             `has only ${payDateIndex} prior banking days (need ${MIN_BANKING_DAYS_REQUIRED}).`);
    return;
  }

  // --- Special reminders (e.g., worksheet generation for Mike) ---
  fireSpecialReminders(payRun, payDateIndex, bankingDays, adjustedPayDate, today, config);

  // --- Main escalating reminders ---
  const submissionDate = bankingDays[payDateIndex - SUBMISSION_LEAD_DAYS];
  const { periodStart, periodEnd } = getPayPeriod(payRun.day, adjustedPayDate);

  // Find which reminder tier matches today (if any)
  const matchedTier = REMINDER_SCHEDULE.find(tier => {
    const idx = payDateIndex - tier.bankingDaysBeforePay;
    return idx >= 0 && areSameDay(bankingDays[idx], today);
  });

  if (!matchedTier) return;

  // Build and send the main reminder
  const message = buildMainReminder(payRun, matchedTier, periodStart, periodEnd, submissionDate, adjustedPayDate, today);
  sendSlackMessage(config.slackBotToken,
    { channel: SLACK_CHANNEL, text: message + guideFooter },
    `${matchedTier.label} for ${payRun.description}`, config);

  // On submission day, prompt management for check numbers if required
  if (payRun.requiresMgmtCheckNumbers && matchedTier.isSubmissionDay) {
    const checkNumMessage = `${config.mgmtMentions} Please post the next check numbers.`;
    sendSlackMessage(config.slackBotToken,
      { channel: SLACK_CHANNEL, text: checkNumMessage },
      "Check Number Request", config);
  }
}

/**
 * Fires any special one-off reminders defined on a pay run
 * (e.g., the worksheet-generation reminder for faculty payroll).
 */
function fireSpecialReminders(payRun, payDateIndex, bankingDays, adjustedPayDate, today, config) {
  if (!payRun.specialReminders) return;

  payRun.specialReminders.forEach(reminder => {
    if (payDateIndex < reminder.leadDays) return;

    const reminderDate = bankingDays[payDateIndex - reminder.leadDays];
    if (!areSameDay(reminderDate, today)) return;

    const priorMonth = new Date(adjustedPayDate);
    priorMonth.setMonth(priorMonth.getMonth() - 1);
    const priorMonthName = priorMonth.toLocaleString('en-US', { month: 'long', timeZone: TIME_ZONE });

    const mention = config.userMentions[reminder.propertyForMention] || '';
    const text = `${mention} ${reminder.message.replace('{priorMonthName}', priorMonthName)}`;

    sendSlackMessage(config.slackBotToken,
      { channel: SLACK_CHANNEL, text },
      `Special Reminder for ${payRun.description}`, config);
  });
}

/**
 * Builds the main payroll-submission reminder message.
 * The header reflects the current reminder tier so recipients feel the
 * escalation (Heads Up → Reminder → Submission Due).
 */
function buildMainReminder(payRun, tier, periodStart, periodEnd, submissionDate, adjustedPayDate, today) {
  const submissionDueLine = buildSubmissionDueLine(submissionDate, today);

  const allPayPeriodHolidays = getHolidaysInRange(periodStart, periodEnd);
  const paidHolidays   = allPayPeriodHolidays.filter(h => h.isPaidHoliday);
  const unpaidHolidays = allPayPeriodHolidays.filter(h => !h.isPaidHoliday);

  const paidHolidayList = paidHolidays.length
    ? paidHolidays.map(h => `${formatDate(h.date, false)} (${h.name})`).join(", ")
    : "None";

  const parts = [
    `${tier.emoji} *PAYROLL ${tier.label.toUpperCase()}*`,
    "",
    `•  *Description*: ${payRun.description}`,
    `•  *Pay Period*: ${formatDate(periodStart, false)} – ${formatDate(periodEnd, false)}`,
    `•  *Paid Holidays*: ${paidHolidayList}`
  ];

  if (unpaidHolidays.length) {
    const unpaidList = unpaidHolidays.map(h => `${formatDate(h.date, false)} (${h.name})`).join(", ");
    parts.push(`•  *Unpaid Holidays*: ${unpaidList}`);
  }

  parts.push(
    `•  *Submission Due*: ${submissionDueLine}`,
    `•  *Pay Date*: ${formatDate(adjustedPayDate, true)}`
  );

  return parts.join("\n");
}


// =========================================================================
// MONTHLY SUMMARY
// =========================================================================

/**
 * Generates and sends a monthly payroll calendar on the 1st of each month.
 */
function sendMonthlyPayrollSummary(config, today) {
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const monthName = today.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: TIME_ZONE });

  logEvent(`Generating monthly summary for ${monthName}`);

  const allHolidaysThisYear = getHolidays(currentYear);
  const bankHolidaysThisMonth = allHolidaysThisYear.filter(h => h.isBankHoliday && h.date.getMonth() === currentMonth);
  const allHolidaysThisMonth = allHolidaysThisYear.filter(h => h.date.getMonth() === currentMonth);

  const bankingDays = getValidBankingDays(currentYear, currentMonth, bankHolidaysThisMonth);

  if (bankingDays.length === 0) {
    const errorMessage = `ERROR: No valid banking days found for ${monthName}. Cannot generate monthly summary.`;
    logEvent(errorMessage);
    sendSlackMessage(config.slackBotToken,
      { channel: config.rawUserIds.SLACK_ADMIN_USER_ID, text: errorMessage },
      "Monthly Summary Error", config);
    return;
  }

  const adjustedPayDates = getAdjustedPayDates(bankingDays, PAY_PERIOD_CONFIG.map(p => p.day));

  // --- Header ---
  let summaryParts = [
    `📅 *MONTHLY PAYROLL CALENDAR — ${monthName.toUpperCase()}*`,
    "",
    `*Banking Days:* ${bankingDays.length}`,
    ""
  ];

  // --- Holidays ---
  if (allHolidaysThisMonth.length > 0) {
    summaryParts.push(`*Holidays This Month:*`);
    allHolidaysThisMonth.forEach(holiday => {
      const holidayType = holiday.isPaidHoliday ? "Paid" : "Unpaid";
      const bankStatus  = holiday.isBankHoliday ? " · Bank Closed" : "";
      summaryParts.push(`  • ${formatDate(holiday.date, true)} — ${holiday.name} (${holidayType}${bankStatus})`);
    });
    summaryParts.push("");
  }

  // --- Payroll schedule ---
  summaryParts.push(`*Payroll Schedule:*`);
  summaryParts.push("");

  const scheduleItems = [];

  PAY_PERIOD_CONFIG.forEach((payRun, index) => {
    const adjustedPayDate = adjustedPayDates[payRun.day];

    if (!adjustedPayDate) {
      scheduleItems.push({
        sortDate: new Date(currentYear, currentMonth, payRun.day),
        content: [`⚠️ *${payRun.description}*`, `  • ERROR: Could not determine valid pay date`]
      });
      return;
    }

    const payDateIndex = bankingDays.findIndex(d => areSameDay(d, adjustedPayDate));

    if (payDateIndex < MIN_BANKING_DAYS_REQUIRED) {
      scheduleItems.push({
        sortDate: adjustedPayDate,
        content: [`❌ *${payRun.description}*`, `  • SKIPPED: Too few banking days before pay date`]
      });
      return;
    }

    const { periodStart, periodEnd } = getPayPeriod(payRun.day, adjustedPayDate);
    const itemParts = [`*${index + 1}. ${payRun.description}*`];
    itemParts.push(`  • Pay Period: ${formatDate(periodStart, false)} – ${formatDate(periodEnd, false)}`);

    // List each reminder tier with its date
    REMINDER_SCHEDULE.forEach(tier => {
      const idx = payDateIndex - tier.bankingDaysBeforePay;
      if (idx >= 0) {
        itemParts.push(`  • ${tier.emoji} ${tier.label}: ${formatDate(bankingDays[idx], true)}`);
      }
    });

    itemParts.push(`  • Pay Date: ${formatDate(adjustedPayDate, true)}`);

    // Special reminders
    if (payRun.specialReminders) {
      payRun.specialReminders.forEach(reminder => {
        if (payDateIndex >= reminder.leadDays) {
          const reminderDate = bankingDays[payDateIndex - reminder.leadDays];
          itemParts.push(`  • Special Reminder: ${formatDate(reminderDate, true)}`);
        }
      });
    }

    if (payRun.requiresMgmtCheckNumbers) {
      itemParts.push(`  • _Check numbers required on submission day_`);
    }

    scheduleItems.push({ sortDate: adjustedPayDate, content: itemParts });
  });

  // Sort chronologically and append
  scheduleItems.sort((a, b) => a.sortDate - b.sortDate);
  scheduleItems.forEach(item => {
    summaryParts = summaryParts.concat(item.content);
    summaryParts.push("");
  });

  if (config.guideDocUrl) {
    summaryParts.push(`📖 <${config.guideDocUrl}|View PayrollMinder Guide>`);
  }

  sendSlackMessage(config.slackBotToken,
    { channel: SLACK_CHANNEL, text: summaryParts.join("\n") },
    "Monthly Summary", config);

  logEvent(`Monthly summary for ${monthName} sent successfully.`);
}


// =========================================================================
// SLACK MESSAGING
// =========================================================================

/**
 * Posts a message to Slack. On failure, attempts a DM to the admin.
 * If that also fails, sends an email as a last resort.
 */
function sendSlackMessage(botToken, payload, logContext, config) {
  try {
    const options = {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + botToken },
      payload: JSON.stringify(payload)
    };
    UrlFetchApp.fetch("https://slack.com/api/chat.postMessage", options);
    logEvent(`Slack message for '${logContext}' sent successfully.`);
  } catch (error) {
    const errorMessage = `ERROR: Failed to send Slack message for '${logContext}': ${error.message}`;
    logEvent(errorMessage);

    // Fallback 1: DM the admin
    try {
      if (config.rawUserIds && config.rawUserIds.SLACK_ADMIN_USER_ID) {
        const errorPayload = {
          channel: config.rawUserIds.SLACK_ADMIN_USER_ID,
          text: `*SCRIPT FAILURE* | ${errorMessage}\n\n*Original Payload:*\n\`\`\`${payload.text || 'N/A'}\`\`\``
        };
        const errorOptions = {
          method: "post",
          contentType: "application/json",
          headers: { Authorization: "Bearer " + botToken },
          payload: JSON.stringify(errorPayload)
        };
        UrlFetchApp.fetch("https://slack.com/api/chat.postMessage", errorOptions);
      }
    } catch (slackFail) {
      // Fallback 2: email
      logEvent(`CRITICAL FAILURE: Could not send direct Slack error notification: ${slackFail.message}`);
      try {
        MailApp.sendEmail(
          config.adminEmail,
          `Critical PayrollMinder Failure: ${logContext}`,
          `The script failed to send a Slack notification and the fallback DM also failed.\n\n` +
          `Error: ${error.message}\n` +
          `Context: ${logContext}\n` +
          `Timestamp: ${new Date().toLocaleString("en-US", { timeZone: TIME_ZONE })}`
        );
        logEvent(`Sent critical failure email to ${config.adminEmail}.`);
      } catch (emailFail) {
        logEvent(`ULTIMATE FAILURE: All notification channels failed. Email error: ${emailFail.message}`);
      }
    }
  }
}


// =========================================================================
// DATE & FORMATTING HELPERS
// =========================================================================

/** Returns today's date at midnight in the configured time zone. */
function getToday() {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: TIME_ZONE }));
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Builds the "Submission Due" line with urgency cues when the deadline
 * is today or tomorrow.
 */
function buildSubmissionDueLine(submissionDate, today) {
  const daysUntil = dayDifference(submissionDate, today);
  const formatted = formatDate(submissionDate, true);

  if (daysUntil === 0) return `${formatted} (*Due TODAY* :warning:)`;
  if (daysUntil === 1) return `${formatted} (_Due tomorrow_ :date:)`;
  return formatted;
}

function formatDate(date, includeWeekday) {
  const options = includeWeekday
    ? { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: TIME_ZONE }
    : { month: "short", day: "numeric", year: "numeric", timeZone: TIME_ZONE };
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

function areSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth()    === d2.getMonth() &&
         d1.getDate()     === d2.getDate();
}

function dayDifference(d1, d2) {
  const msPerDay = 86400000;
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((utc1 - utc2) / msPerDay);
}


// =========================================================================
// HOLIDAY COMPUTATION
// =========================================================================

function getHolidays(year) {
  if (holidayCache[year]) return holidayCache[year];

  const getMemorialDay = (y) => {
    const lastMonday = new Date(y, 4, 31);
    lastMonday.setDate(lastMonday.getDate() - ((lastMonday.getDay() + 6) % 7));
    return lastMonday;
  };

  const getBlackFriday = (y) => {
    const thanksgiving = getNthWeekday(y, 10, 4, 4);
    return new Date(y, 10, thanksgiving.getDate() + 1);
  };

  const holidayDefinitions = [
    { name: "New Year's Day",                         isPaid: true,  isBank: true,  isFederal: true,  getDate: (y) => getAdjustedDateForWeekend(new Date(y, 0, 1)) },
    { name: "Martin Luther King Jr. Day",             isPaid: false, isBank: true,  isFederal: true,  getDate: (y) => getNthWeekday(y, 0, 1, 3) },
    { name: "Presidents Day",                         isPaid: false, isBank: true,  isFederal: true,  getDate: (y) => getNthWeekday(y, 1, 1, 3) },
    { name: "Memorial Day",                           isPaid: true,  isBank: true,  isFederal: true,  getDate: getMemorialDay },
    { name: "Juneteenth",                             isPaid: false, isBank: true,  isFederal: true,  getDate: (y) => getAdjustedDateForWeekend(new Date(y, 5, 19)) },
    { name: "Independence Day",                       isPaid: true,  isBank: true,  isFederal: true,  getDate: (y) => getAdjustedDateForWeekend(new Date(y, 6, 4)) },
    { name: "Labor Day",                              isPaid: true,  isBank: true,  isFederal: true,  getDate: (y) => getNthWeekday(y, 8, 1, 1) },
    { name: "Indigenous Peoples' Day / Columbus Day", isPaid: false, isBank: true,  isFederal: true,  getDate: (y) => getNthWeekday(y, 9, 1, 2) },
    { name: "Veterans Day",                           isPaid: false, isBank: true,  isFederal: true,  getDate: (y) => getAdjustedDateForWeekend(new Date(y, 10, 11)) },
    { name: "Thanksgiving Day",                       isPaid: true,  isBank: true,  isFederal: true,  getDate: (y) => getNthWeekday(y, 10, 4, 4) },
    { name: "Black Friday",                           isPaid: false, isBank: false, isFederal: false, getDate: getBlackFriday },
    { name: "Christmas Day",                          isPaid: true,  isBank: true,  isFederal: true,  getDate: (y) => getAdjustedDateForWeekend(new Date(y, 11, 25)) },
  ];

  const holidays = holidayDefinitions.map(def => ({
    name:            def.name,
    date:            def.getDate(year),
    isPaidHoliday:   def.isPaid,
    isBankHoliday:   def.isBank,
    isFederalHoliday: def.isFederal
  }));

  holidays.sort((a, b) => a.date - b.date);
  holidayCache[year] = holidays;
  return holidays;
}

function getNthWeekday(year, month, dayOfWeek, nth) {
  const first = new Date(year, month, 1);
  const offset = (dayOfWeek - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + 7 * (nth - 1));
}

function getHolidaysInRange(periodStart, periodEnd) {
  const startYear = periodStart.getFullYear();
  const endYear = periodEnd.getFullYear();
  let holidays = [];
  for (let year = startYear; year <= endYear; year++) {
    holidays = holidays.concat(
      getHolidays(year).filter(h => h.date >= periodStart && h.date <= periodEnd)
    );
  }
  holidays.sort((a, b) => a.date - b.date);
  return holidays;
}

function getAdjustedDateForWeekend(originalDate) {
  const date = new Date(originalDate.getTime());
  const day = date.getDay();
  if (day === 6) date.setDate(date.getDate() - 1);      // Saturday → Friday
  else if (day === 0) date.setDate(date.getDate() + 1);  // Sunday → Monday
  return date;
}


// =========================================================================
// BANKING DAY & PAY-DATE LOGIC
// =========================================================================

function getValidBankingDays(year, month, holidays) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const validDays = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6 && !holidays.some(h => areSameDay(h.date, date))) {
      validDays.push(date);
    }
  }
  return validDays;
}

/**
 * For each nominal pay day, finds the matching banking day or the closest
 * prior banking day if the nominal day is a weekend/holiday.
 */
function getAdjustedPayDates(bankingDays, payDates) {
  const adjusted = {};
  payDates.forEach(pd => {
    const exact = bankingDays.find(d => d.getDate() === pd);
    if (exact) {
      adjusted[pd] = exact;
    } else {
      const earlier = bankingDays.filter(d => d.getDate() < pd);
      adjusted[pd] = earlier.length ? earlier[earlier.length - 1] : null;
    }
  });
  return adjusted;
}

/**
 * Determines the pay period (start and end dates) based on the nominal
 * pay-day number and the final adjusted pay date.
 *
 *   Day 10 → covers the 16th through end of the prior month
 *   Day 15 → covers the 1st through end of the prior month (faculty)
 *   Day 25 → covers the 1st through the 15th of the current month
 */
function getPayPeriod(originalPayDateNum, finalPayDate) {
  const year = finalPayDate.getFullYear();
  const month = finalPayDate.getMonth();
  const prevMonthDate = new Date(year, month - 1, 1);
  const prevMonth = prevMonthDate.getMonth();
  const prevYear = prevMonthDate.getFullYear();

  switch (originalPayDateNum) {
    case 10:
      return {
        periodStart: new Date(prevYear, prevMonth, 16),
        periodEnd:   new Date(prevYear, prevMonth + 1, 0)   // last day of prev month
      };
    case 15:
      return {
        periodStart: new Date(prevYear, prevMonth, 1),
        periodEnd:   new Date(prevYear, prevMonth + 1, 0)
      };
    case 25:
      return {
        periodStart: new Date(year, month, 1),
        periodEnd:   new Date(year, month, 15)
      };
    default:
      return {
        periodStart: new Date(year, month, 1),
        periodEnd:   new Date(year, month + 1, 0)
      };
  }
}
