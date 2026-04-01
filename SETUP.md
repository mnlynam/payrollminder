# First-Time Setup

This walks you through connecting your existing Google Apps Script project to GitHub using clasp.

---

## Step 1 — Install clasp

```bash
npm install -g @google/clasp
```

Verify it installed:

```bash
clasp --version
```

## Step 2 — Enable the Apps Script API

1. Go to https://script.google.com/home/usersettings
2. Toggle **Google Apps Script API** to **ON**

This allows clasp to talk to your Apps Script projects.

## Step 3 — Log in

```bash
clasp login
```

This opens a browser window. Sign in with the Google account that owns your PayrollMinder script, and grant the permissions it asks for.

## Step 4 — Get your Script ID

1. Open your PayrollMinder project at https://script.google.com
2. Click the **gear icon** (Project Settings) in the left sidebar
3. Copy the **Script ID** — it looks like a long string: `1aBcDeFgHiJkLmNoPqRsTuVwXyZ_0123456789abcdef`

## Step 5 — Clone the project locally

Pick a folder on your machine where you want the project to live, then:

```bash
mkdir payrollminder
cd payrollminder
clasp clone <YOUR_SCRIPT_ID>
```

This pulls down all the files from your Apps Script project, plus creates a `.clasp.json` file that links this folder to that specific project.

You should now see:

```
payrollminder/
├── .clasp.json            ← created by clasp (links to your project)
├── appsscript.json        ← Apps Script manifest
└── PayrollMinder.js       ← your code (filename may vary)
```

## Step 6 — Replace PayrollMinder.js with the new version

Copy the polished v4.0 of `PayrollMinder.js` into this folder, replacing whatever clasp pulled down.

## Step 7 — Add the repo scaffolding

Copy these files into the same folder:

- `README.md`
- `SETUP.md` (this file)
- `.gitignore`
- `.claspignore`

## Step 8 — Push the updated code to Apps Script

```bash
clasp push
```

This uploads your local files to Google Apps Script. Open the editor to verify:

```bash
clasp open
```

## Step 9 — Test it

In the Apps Script editor:

1. Select `sendPayrollReminders` from the function dropdown
2. Click **Run**
3. Check your Slack channel and the **Execution log** for output

## Step 10 — Set up the GitHub repo

```bash
git init
git add .
git commit -m "Initial commit: PayrollMinder v4.0"
```

Then create a repo on GitHub (via github.com or the `gh` CLI) and push:

```bash
# Using GitHub CLI:
gh repo create payrollminder --private --source=. --push

# Or manually:
git remote add origin git@github.com:YOUR_USERNAME/payrollminder.git
git branch -M main
git push -u origin main
```

---

## Day-to-Day Workflow

After initial setup, the cycle is:

```
Edit locally  →  clasp push  →  test in Apps Script  →  git commit + push
```

If you ever edit directly in the Apps Script editor (quick fixes, debugging), pull those changes back:

```bash
clasp pull
git add .
git commit -m "Pull changes from Apps Script editor"
git push
```

### Useful commands

| Command | What it does |
|---------|-------------|
| `clasp push` | Upload local files → Apps Script |
| `clasp pull` | Download from Apps Script → local |
| `clasp open` | Open the Apps Script editor in your browser |
| `clasp logs` | Tail the Apps Script execution logs |
| `clasp status` | Show which files will be pushed |

---

## Gotchas

- **Don't commit `.clasp.json` to a public repo** — it contains your Script ID. It's fine in a private repo, but if you go public, add it to `.gitignore`.
- **clasp push overwrites everything** in Apps Script with your local files. Always `clasp pull` first if you've been editing in the browser.
- **Script Properties are NOT synced by clasp.** Your tokens and user IDs stay safely in the Apps Script project settings and never touch your repo.
