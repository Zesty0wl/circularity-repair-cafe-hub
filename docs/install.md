# Install the hub, step by step

This guide takes you from nothing to a working repair cafe website. You do not
need to know how to program. You will copy a few commands into a window on your
computer, and click through some Cloudflare pages.

**How long it takes:** about an hour the first time. Most of that is waiting
for things to download, or for your domain to move to Cloudflare.

**What it costs:** nothing. Everything runs on Cloudflare's free plan. A domain
name costs money (usually £5 to £15 a year), but you can try the hub without
one.

## What you will end up with

- Your cafe's own website, for example `https://repair.yourcafe.org`, with a
  padlock (HTTPS).
- Visitors can check in their broken items by scanning a QR code with their
  phone.
- Volunteers have a repair queue, and admins have reports, a live board and a
  screen for the waiting area.
- Nothing to look after afterwards. There is no server, and nothing to switch
  on or keep running. Cloudflare runs it.

## What you need

Tick these off before you start.

- [ ] **A computer** running Windows 10 or 11, macOS, or Linux. You need it to
      set up the hub and, now and then, to update it. The hub does not run on
      it.
- [ ] **An email address**, for your Cloudflare account.
- [ ] **A payment card.** Cloudflare asks for one before it switches on photo
      storage. You will not be charged: a repair cafe uses far less than the
      free allowance. If you cannot add a card, ask someone in your group who
      can.
- [ ] **A domain name**, such as `yourcafe.org`. This is optional. You can
      start without one, and add it later. If you already have one for your
      cafe, you can use a part of it, such as `repair.yourcafe.org`, and leave
      your existing website alone.

You will install three free programs during the guide: Git, Node.js and pnpm.

## How to read this guide

Text in a grey box like this is a command:

```
node --version
```

You type it (or copy and paste it) into a **terminal**, then press Enter. A
terminal is a window where you type commands instead of clicking. Step 4 shows
you how to open one.

Wherever you see `repair.example.org`, put your own web address instead.

---

## Step 1. Create a Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up>.
2. Enter your email address and choose a password. Use a password you do not
   use anywhere else, and keep it somewhere safe: this account controls your
   cafe's website.
3. Cloudflare sends you an email. Open it and click the link to confirm your
   address.
4. If Cloudflare asks what you want to do first, you can skip it.

Your account is free. You do not need to choose a paid plan at any point.

**Tip:** in your Cloudflare profile, turn on two-factor authentication. It
stops someone who guesses your password from taking over your website.

## Step 2. Put your domain on Cloudflare (optional)

Skip this step if you do not have a domain yet. Your hub will get a free
address ending in `workers.dev`, and you can come back to this step later.

Cloudflare can only give your hub a web address on a domain that it looks
after. So your domain has to be added to your Cloudflare account. This is the
step people get wrong most often, so take it slowly.

**If you do not have a domain yet** and want one, you can buy it from
Cloudflare: in the dashboard, choose **Domain Registration**, then **Register
Domains**. A domain bought there is already on Cloudflare, so skip to Step 3.

**If you already have a domain** with another company (such as GoDaddy, 123
Reg, Namecheap or IONOS):

1. In the Cloudflare dashboard, choose **Add a domain** (it may say **Add a
   site**).
2. Type your domain without `www`, for example `yourcafe.org`, and continue.
3. Choose the **Free** plan.
4. Cloudflare looks for your existing settings and shows them. Check that your
   current website and email are in the list, then continue. This keeps them
   working.
5. Cloudflare shows you **two nameservers**. They look like
   `ada.ns.cloudflare.com` and `bob.ns.cloudflare.com`. Keep this page open.
6. In another browser tab, sign in to the company where you bought the
   domain. Find the nameserver settings for your domain. They are often under
   "DNS" or "Nameservers".
7. Replace the nameservers there with the two from Cloudflare. Save.
8. Go back to Cloudflare and click **Check nameservers**.

Cloudflare emails you when your domain is active. This usually takes less than
an hour, but it can take up to a day. You can carry on with Steps 3 to 8 while
you wait. You only need the domain to be active in Step 9.

## Step 3. Switch on photo storage

The hub keeps photos in a Cloudflare service called **R2**. It has to be
switched on once.

1. In the Cloudflare dashboard, find **R2 Object Storage** in the menu on the
   left. It may be inside a group called **Storage & databases**.
2. Click the button to get started or to add R2 to your account.
3. Cloudflare asks for a payment card and shows the free allowance (10 GB of
   storage each month, which is tens of thousands of photos). Add the card and
   confirm.

You do not need to create anything inside R2. The hub creates what it needs in
Step 9.

## Step 4. Open a terminal

You will use the terminal for the rest of the guide.

**Windows:** press the Windows key, type `cmd`, and open **Command Prompt**.
Please use Command Prompt rather than PowerShell for this guide. PowerShell
sometimes refuses to run the tools it needs.

**Mac:** press Cmd and Space together, type `terminal`, and press Enter.

**Linux:** open your terminal program. On many systems, Ctrl, Alt and T
together opens it.

Leave the terminal open. When a step says "close the terminal and open a new
one", do that, because a new terminal is the only one that knows about newly
installed programs.

## Step 5. Install Git and Node.js

**Git** downloads the hub's code. **Node.js** runs the tools that build and
publish it.

### Windows

1. Go to <https://git-scm.com/downloads/win> and download Git for Windows. Run
   the installer. The default choice on every screen is fine, so keep clicking
   **Next**, then **Install**.
2. Go to <https://nodejs.org> and download the version marked **LTS**. It must
   be version 22 or newer. Run the installer, and keep the default choices.
3. Close the terminal and open a new Command Prompt.

### Mac

1. In the terminal, type this and press Enter:

   ```
   xcode-select --install
   ```

   A window opens and offers to install the "command line developer tools".
   Click **Install**. This gives you Git. It takes a few minutes. If the
   terminal says they are already installed, that is fine.
2. Go to <https://nodejs.org> and download the version marked **LTS**. It must
   be version 22 or newer. Open the file you downloaded and follow the
   installer.
3. Close the terminal and open a new one.

### Linux

Install Git with your system's package manager. On Ubuntu or Debian:

```
sudo apt update
sudo apt install -y git
```

Then install Node.js 22 or newer. Your system's own package is often too old,
so follow the instructions for your system at
<https://nodejs.org/en/download>. Then close the terminal and open a new one.

### Check they work

Type each of these and press Enter:

```
git --version
node --version
```

The first shows something like `git version 2.47.0`. The second shows
something like `v22.12.0`. The number after the `v` must be 22 or more. If
either says "not recognised" or "command not found", close the terminal, open
a new one and try again. If it still fails, install that program again.

## Step 6. Install pnpm

**pnpm** downloads the libraries the hub is built from. Type:

```
npm install -g pnpm
```

On a Mac or Linux, if you see `EACCES` or "permission denied", type this
instead, and enter your computer's password when it asks. Nothing appears as
you type the password. That is normal.

```
sudo npm install -g pnpm
```

Check it worked:

```
pnpm --version
```

It shows a number such as `11.3.0`.

## Step 7. Download the hub

Choose where to keep the hub's files. Your home folder is fine. Type:

```
git clone https://github.com/Zesty0wl/circularity-repair-cafe-hub.git
cd circularity-repair-cafe-hub
```

The first line downloads the code into a new folder called
`circularity-repair-cafe-hub`. The second moves the terminal into that folder.
All the commands from now on must be run inside it.

**If you come back later** in a new terminal, move into the folder again
first:

```
cd circularity-repair-cafe-hub
```

## Step 8. Install the hub's libraries

```
pnpm install
```

This downloads everything the hub is built from. It takes a minute or two and
prints a lot of text. It is finished when you can type again. Warnings are
fine. If the last lines say "ERR", see [If something goes wrong](#if-something-goes-wrong).

## Step 9. Connect to your Cloudflare account

```
pnpm --filter @circularity/cloudflare exec wrangler login
```

Your web browser opens a Cloudflare page. Sign in if it asks, then click
**Allow**. The terminal then says "Successfully logged in".

To check which account you are connected to:

```
pnpm --filter @circularity/cloudflare exec wrangler whoami
```

## Step 10. Publish your hub

**With your own domain** (its status in the Cloudflare dashboard must say
**Active**). Put your own address in place of `repair.example.org`:

```
pnpm cf:deploy --domain repair.example.org
```

**Without a domain**, for now:

```
pnpm cf:deploy
```

This builds the website, creates a database and photo storage on your
account, and publishes everything. It takes two or three minutes.

It may ask you questions the first time:

- **"Would you like to register a workers.dev subdomain?"** Answer yes. Then
  type a short name, such as your cafe's name. Your hub gets a free address
  ending in `.workers.dev` with that name in it.
- **Whether to create a new database or a new bucket.** Choose to create a
  new one.
- **Which account to use**, if your login can see more than one. Choose the
  one you created in Step 1.

When it finishes, it prints your hub's addresses, for example:

```
Deployed repair-cafe-hub triggers
  https://repair-cafe-hub.yourname.workers.dev
  repair.example.org (custom domain)
```

You only need `--domain` the first time. Cloudflare remembers it, and creates
the HTTPS certificate for you. A new certificate can take a few minutes to
start working.

**To add a domain later**, finish Step 2, then run the command with
`--domain` once.

## Step 11. Set up your cafe

Open your hub's address in a web browser. A setup wizard starts. Choose
**Let's get started**. It asks for:

1. **Your admin account:** your name, email and a password. Whoever finishes
   the wizard becomes the main admin, so do this yourself, straight away.
2. **Your repair cafe:** its name and a short description.
3. **Your home venue:** where you hold your sessions.
4. **Your public URL:** your hub's web address. It is filled in for you.
   Check it is the address you will use from now on, because the QR codes use
   it.
5. **Your branding:** your colours and logo. You can change these later.
6. **One last thing:** whether your hub may send a few counts (such as how
   many repairs you did) to help the project. You can say no.

The [getting started guide](./01-getting-started.md) explains each screen,
and what to set up next: your home page, the things you repair, your
volunteers and your first session.

**Moving from an old Docker hub?** On the first page of the wizard, choose
**Move from an existing hub** instead. See
[Backups and moving a hub](./backups-and-moving.md).

## Step 12. Check it works

Do these once, a few days before your first session:

- [ ] The front page shows your cafe's name, with a padlock in the address bar.
- [ ] You can sign out and sign in again.
- [ ] Create a session for today (**Dashboard**, then **Plan a session**),
      start it, and open its QR code poster.
- [ ] Scan the poster with your phone and check in a pretend item. It appears
      in the **Repair queue**.
- [ ] Open **Live board** and choose **Show on a screen**. The address it
      gives opens the waiting-room screen on any computer or TV.
- [ ] Delete the pretend item and the test session afterwards.

## Step 13. Keep it safe

- **Take a backup** now, and after each session: **Settings**, **Backup &
  restore**, **Download backup zip**. Keep the file somewhere other than your
  computer, such as a shared drive. See
  [Backups and moving a hub](./backups-and-moving.md).
- **Keep the folder** from Step 7. You need it to update the hub.
- **Update now and then.** The admin area tells you when a new version is out.
  The steps are in [Running your hub](./running-your-hub.md#updating).

That is it. Your hub is live.

---

## If something goes wrong

| What you see | What to do |
| --- | --- |
| `'git' is not recognized` or `command not found: node` | Close the terminal and open a new one. If it still happens, install that program again (Step 5). |
| `pnpm` is not recognised, or PowerShell says "running scripts is disabled" | Use **Command Prompt**, not PowerShell. Open a new one after installing pnpm. |
| `EACCES` or "permission denied" when installing pnpm | Use `sudo npm install -g pnpm` (Mac or Linux). |
| `ERR_PNPM_UNSUPPORTED_ENGINE` or "Unsupported engine" | Your Node.js is too old. Install the LTS version from nodejs.org (Step 5). |
| "No such file or directory" or "Could not find package.json" | You are not in the hub's folder. Run `cd circularity-repair-cafe-hub` first. |
| "Please enable R2 through the Cloudflare Dashboard" | Do Step 3, wait a minute, then publish again. |
| "Authentication error" or "Not logged in" | Do Step 9 again. |
| "Could not find zone" or the domain is refused | The domain is not on this Cloudflare account yet, or is not active. Check Step 2, or publish without `--domain` for now. |
| "A DNS record already exists" for your address | Something else already uses that address. Choose another one (for example `hub.yourcafe.org`), or delete the old record in the dashboard under **DNS**, **Records**, then publish again. |
| The address shows a certificate warning | A new certificate can take up to 15 minutes. Wait, then try again. |
| "This account has reached the limit" for Workers or cron triggers | Another project on the same account uses them up. The hub itself needs no cron triggers. Ask for help. |

**Still stuck?** Ask on the
[issue tracker](https://github.com/Zesty0wl/circularity-repair-cafe-hub/issues).
Say which step you are on, what you typed, and copy the last 20 lines the
terminal printed. Do not paste passwords.

## Words used in this guide

| Word | What it means |
| --- | --- |
| Terminal | A window where you type commands. Called Command Prompt on Windows. |
| Command | A line of text you type into the terminal, then press Enter. |
| Domain | A web address you own, such as `yourcafe.org`. |
| Nameservers | The settings that tell the internet which company looks after a domain. |
| Cloudflare | The company whose free service runs your hub. |
| Worker | A program that runs on Cloudflare's computers. Your hub is one. |
| D1 | Cloudflare's database service. It holds your cafe's records. |
| R2 | Cloudflare's file storage. It holds your photos. |
| Publish (deploy) | Send the newest version of the hub to Cloudflare. |
