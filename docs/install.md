# Install the hub, step by step

This guide takes you from nothing to a working repair cafe website. You do not
need to know how to program. You will copy a few commands into a window on your
computer, and click through some Cloudflare pages.

**How long it takes:** about 45 minutes the first time. Most of that is waiting
for things to download.

**What it costs:** nothing. Everything runs on Cloudflare's free plan.

**What you need from anyone else:** only a free Cloudflare account. You do not
need a domain name. You do not change anything about your cafe's existing
website or email.

## What you will end up with

- Your cafe's own website, at a free address such as
  `https://repair-cafe-hub.yourcafe.workers.dev`, with a padlock (HTTPS).
- Visitors can check in their broken items by scanning a QR code with their
  phone.
- Volunteers have a repair queue, and admins have reports, a live board and a
  screen for the waiting area.
- Nothing to look after afterwards. There is no server, and nothing to switch
  on or keep running. Cloudflare runs it.

Later, if you want, you can give your hub your own address, such as
`https://repair.yourcafe.org`. You do not have to, and you do not need to
decide now. [Later: add your own web address](#later-add-your-own-web-address),
at the end of this guide, explains how.

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

You will install three free programs during the guide: Git, Node.js and pnpm.

## How to read this guide

Text in a grey box like this is a command:

```
node --version
```

You type it (or copy and paste it) into a **terminal**, then press Enter. A
terminal is a window where you type commands instead of clicking. Step 3 shows
you how to open one.

---

## Step 1. Create a Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up>.
2. Enter your email address and choose a password. Use a password you do not
   use anywhere else, and keep it somewhere safe: this account controls your
   cafe's website.
3. Cloudflare sends you an email. Open it and click the link to confirm your
   address.
4. If Cloudflare asks what you want to do first, or asks you to add a domain,
   you can skip it.

Your account is free. You do not need to choose a paid plan at any point.

**Tip:** in your Cloudflare profile, turn on two-factor authentication. It
stops someone who guesses your password from taking over your website.

## Step 2. Switch on photo storage

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

## Step 3. Open a terminal

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

## Step 4. Install Git and Node.js

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

## Step 5. Install pnpm

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

## Step 6. Download the hub

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

## Step 7. Install the hub's libraries

```
pnpm install
```

This downloads everything the hub is built from. It takes a minute or two and
prints a lot of text. It is finished when you can type again. Warnings are
fine. If the last lines say "ERR", see [If something goes wrong](#if-something-goes-wrong).

## Step 8. Connect to your Cloudflare account

```
pnpm --filter @circularity/cloudflare exec wrangler login
```

Your web browser opens a Cloudflare page. Sign in if it asks, then click
**Allow**. The terminal then says "Successfully logged in".

**If the computer has no web browser**, for example a server you reach over
SSH (a remote connection from another computer), this login cannot finish.
Use an API token (a kind of password for programs) instead. Follow
[Publishing without a browser](./running-your-hub.md#publishing-without-a-browser),
then come back and run the check below. The `export` lines only last until
you log out, so run them again each time you connect to publish.

To check which account you are connected to:

```
pnpm --filter @circularity/cloudflare exec wrangler whoami
```

## Step 9. Publish your hub

```
pnpm cf:deploy
```

This builds the website, creates a database and photo storage on your
account, and publishes everything. It takes two or three minutes.

It may ask you questions the first time:

- **"Would you like to register a workers.dev subdomain?"** Answer yes. Then
  type a short name for your cafe, such as `woodvillerepaircafe`. Use only
  lowercase letters, numbers and hyphens.

  **Choose this name with care.** It becomes part of your hub's address, and
  that address goes on every QR code poster you print. You can change it later
  in the dashboard, but if you do, every printed poster and every saved link
  stops working.

  If Cloudflare does not ask, your account already has a name, and the hub
  uses it.
- **Whether to create a new database or a new bucket.** Choose to create a
  new one.
- **Which account to use**, if your login can see more than one. Choose the
  one you created in Step 1.

When it finishes, it prints your hub's address, for example:

```
Deployed repair-cafe-hub triggers
  https://repair-cafe-hub.woodvillerepaircafe.workers.dev
```

Copy this address and keep it somewhere safe. It is your hub's address from
now on.

## Step 10. Set up your cafe

Open your hub's address in a web browser. A setup wizard starts. Choose
**Let's get started**. It asks for:

1. **Your admin account:** your name, email and a password. Whoever finishes
   the wizard becomes the main admin, so do this yourself, straight away.
2. **Your repair cafe:** its name and a short description.
3. **Your home venue:** where you hold your sessions.
4. **Your public URL:** your hub's web address. It is filled in for you with
   your `workers.dev` address. Keep it. The QR codes use it. If you add your
   own web address later, you change it then.
5. **Your branding:** your colours and logo. You can change these later.
6. **One last thing:** whether your hub may send a few counts (such as how
   many repairs you did) to help the project. You can say no.

The [getting started guide](./01-getting-started.md) explains each screen,
and what to set up next: your home page, the things you repair, your
volunteers and your first session.

**Moving from an old Docker hub?** On the first page of the wizard, choose
**Move from an existing hub** instead. See
[Backups and moving a hub](./backups-and-moving.md).

## Step 11. Check it works

Do these once, a few days before your first session:

- [ ] The front page shows your cafe's name, with a padlock in the address bar.
- [ ] You can sign out and sign in again.
- [ ] Create a session for today (**Dashboard**, then **Plan a session**),
      start it, and open its QR code poster.
- [ ] Scan the poster with your phone and check in a pretend item. It appears
      in the **Repair queue**.
- [ ] At your venue, connect your phone to the venue's Wi-Fi and open your
      hub. A few filtered networks, for example in some libraries and
      schools, block `workers.dev` addresses. If yours does, ask the venue to
      allow your hub's address, ask visitors to use mobile data, or
      [add your own web address](#later-add-your-own-web-address).
- [ ] Open **Live board** and choose **Show on a screen**. The address it
      gives opens the waiting-room screen on any computer or TV.
- [ ] Delete the pretend item and the test session afterwards.

## Step 12. Keep it safe

- **Take a backup** now, and after each session: **Settings**, **Backup &
  restore**, **Download backup zip**. Keep the file somewhere other than your
  computer, such as a shared drive. See
  [Backups and moving a hub](./backups-and-moving.md).
- **Give a second person access** to your Cloudflare account, so the hub is
  never stuck with one person who has moved on. In the Cloudflare dashboard,
  choose **Manage Account**, **Members**, then **Invite**, and give them the
  **Super Administrator** role. See
  [If nobody can get into the Cloudflare account](./running-your-hub.md#if-nobody-can-get-into-the-cloudflare-account).
- **Keep the folder** from Step 6 if you can. It makes updating quicker, but
  you do not need it: you can
  [update from any computer](./running-your-hub.md#updating-from-a-different-computer).
- **Update now and then.** The admin area tells you when a new version is out.
  The steps are in [Running your hub](./running-your-hub.md#updating).

That is it. Your hub is live.

---

## Later: add your own web address

This part is optional. Many cafes never need it. Your `workers.dev` address
keeps working for as long as you like, and every part of the hub works on it.
You can do this at any time: next week, next year, or never.

Reasons you might want your own address:

- It is shorter, and easier to say, type and remember. For example,
  `repair.yourcafe.org`.
- It matches your cafe's other website and email.
- Public pages load a little faster. Cloudflare can keep a copy of each public
  page for a minute, and it cannot do this on a `workers.dev` address.
- It works on filtered Wi-Fi that blocks `workers.dev` addresses.

If somebody else looks after your cafe's domain, such as a web company or
another volunteer, you can give them this section.

### Choose how

Cloudflare can only connect an address to your hub if Cloudflare looks after
that domain's **DNS**. DNS is the internet's address book. It tells computers
where to find your website and where to deliver your email. So there are two
ways to do this:

**A. Buy a new domain from Cloudflare.** This is the simplest way. Nothing
moves, because a domain bought there is already on Cloudflare. A domain costs
around £5 to £15 a year.

1. In the Cloudflare dashboard, choose **Domain Registration**, then
   **Register Domains**.
2. Search for a name, buy it, and wait until its status says **Active**.
3. Go to [Connect the address to your hub](#connect-the-address-to-your-hub).

**B. Use a domain your cafe already has.** For example, if you own
`yourcafe.org`, you can use `repair.yourcafe.org` and leave your existing
website at `yourcafe.org` alone. First, the domain's DNS has to move to
Cloudflare. Your domain stays with the company you bought it from, and you
keep paying them as before. Only the address book moves. Your website and
email keep working, as long as every record in it is copied across. The next
section shows you how to check this.

### Move your domain's DNS to Cloudflare

You only need this for option B.

**Before you start:**

- Make sure you can sign in to the company where you bought the domain (such
  as GoDaddy, 123 Reg, Namecheap or IONOS).
- At that company, find your domain's DNS records, and take a screenshot or
  write them all down. You will compare them with Cloudflare's list. The
  records called **MX** and **TXT** matter most, because they make your email
  work.
- If **DNSSEC** is switched on at that company, switch it off, then wait a day
  before you go on. DNSSEC is a security setting. If it is still on when you
  change your nameservers, your domain can stop working. You can switch it on
  again in Cloudflare afterwards.
- Pick a quiet time, not the day before a session.

**Steps:**

1. In the Cloudflare dashboard, choose **Add a domain** (it may say **Add a
   site**).
2. Type your domain without `www`, for example `yourcafe.org`, and continue.
3. Choose the **Free** plan.
4. Cloudflare looks for your existing records and shows them. Compare them
   with your screenshot. If one is missing, add it with **Add record**, using
   the same type, name and content. Then continue.
5. Cloudflare shows you **two nameservers**. They look like
   `ada.ns.cloudflare.com` and `bob.ns.cloudflare.com`. Keep this page open.
6. In another browser tab, sign in to the company where you bought the
   domain. Find the nameserver settings for your domain. They are often under
   "DNS" or "Nameservers".
7. Write down the nameservers that are there now, so you can put them back if
   you need to. Then replace them with the two from Cloudflare, and save.
8. Go back to Cloudflare and click **Check nameservers**.

Cloudflare emails you when your domain is active. This usually takes less than
an hour, but it can take up to a day. Your hub keeps working at its
`workers.dev` address the whole time.

**If your website or email stops working**, a record is missing. In the
Cloudflare dashboard, open your domain, then **DNS**, then **Records**, and add
it from your screenshot. **To undo the whole move**, put the old nameservers
back at the company where you bought the domain.

### Connect the address to your hub

When your domain's status in the Cloudflare dashboard says **Active**:

1. In the Cloudflare dashboard, open **Workers & Pages**, then
   **repair-cafe-hub**, then **Settings**.
2. Under **Domains & Routes**, choose **Add**, then **Custom domain**.
3. Type the address you want, such as `repair.yourcafe.org`, and choose **Add
   domain**.

Cloudflare creates the DNS record and the HTTPS certificate for you. A new
certificate can take up to 15 minutes to start working.

If you prefer the terminal, you can run this once in the hub's folder instead.
You do not need `--domain` again after this.

```
pnpm cf:deploy --domain repair.yourcafe.org
```

### Tell the hub about its new address

1. Open your new address and sign in. You need to sign in again, because a
   sign-in belongs to one address.
2. Go to **Settings**, **Cafe profile**. Change the **Public URL** to your new
   address, such as `https://repair.yourcafe.org`, and save.
3. For each upcoming session that already has a QR code, open the session and
   choose **Regenerate** under **QR code**. Print the new posters when you
   next need them. Sessions you plan from now on use the new address by
   themselves.
4. If you use Plausible or Quick Web Analytics, change the site's domain in
   **Settings**, **SEO & analytics**.
5. Tell your volunteers the new address, and that they need to sign in again.
   For the waiting-room screen, choose **Show on a screen** again and open the
   new link. Anyone who installed the hub as an app on their phone should
   install it again from the new address.

Your old `workers.dev` address keeps working too. Posters you have already
printed, saved links and the old screen link all still open your hub, so
nothing breaks while people catch up.

---

## If something goes wrong

| What you see | What to do |
| --- | --- |
| `'git' is not recognized` or `command not found: node` | Close the terminal and open a new one. If it still happens, install that program again (Step 4). |
| `pnpm` is not recognised, or PowerShell says "running scripts is disabled" | Use **Command Prompt**, not PowerShell. Open a new one after installing pnpm. |
| `EACCES` or "permission denied" when installing pnpm | Use `sudo npm install -g pnpm` (Mac or Linux). |
| `ERR_PNPM_UNSUPPORTED_ENGINE` or "Unsupported engine" | Your Node.js is too old. Install the LTS version from nodejs.org (Step 4). |
| "No such file or directory" or "Could not find package.json" | You are not in the hub's folder. Run `cd circularity-repair-cafe-hub` first. |
| "Please enable R2 through the Cloudflare Dashboard" | Do Step 2, wait a minute, then publish again. |
| "Authentication error" or "Not logged in" | Do Step 8 again. |
| The hub's page does not open on the venue's Wi-Fi, but works on mobile data | The network blocks `workers.dev` addresses. Ask the venue to allow your hub's address, or [add your own web address](#later-add-your-own-web-address). |
| "Could not find zone" or the domain is refused | The domain is not on this Cloudflare account yet, or is not active. See [Move your domain's DNS to Cloudflare](#move-your-domains-dns-to-cloudflare). Your hub still works at its `workers.dev` address meanwhile. |
| "A DNS record already exists" for your address | Something else already uses that address. Choose another one (for example `hub.yourcafe.org`), or delete the old record in the dashboard under **DNS**, **Records**, then try again. |
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
| `workers.dev` address | The free web address Cloudflare gives your hub, such as `repair-cafe-hub.yourcafe.workers.dev`. |
| Domain | A web address you own, such as `yourcafe.org`. |
| DNS | The internet's address book. It tells computers where a domain's website and email are. |
| Nameservers | The settings that tell the internet which company looks after a domain's DNS. |
| Cloudflare | The company whose free service runs your hub. |
| Worker | A program that runs on Cloudflare's computers. Your hub is one. |
| D1 | Cloudflare's database service. It holds your cafe's records. |
| R2 | Cloudflare's file storage. It holds your photos. |
| Publish (deploy) | Send the newest version of the hub to Cloudflare. |
