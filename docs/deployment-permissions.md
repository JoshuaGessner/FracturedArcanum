# Deployment Permissions

`scripts/update.sh` restarts the app through systemd. When it runs as a
non-root user, every `systemctl` call goes through polkit, which puts an
interactive password prompt in the middle of the deploy. That prompt is the
cause of a confusing failure mode, and this document is how to remove it.

## The failure it causes

```
[20:53:34] + systemctl restart fractured-arcanum
==== AUTHENTICATING FOR org.freedesktop.systemd1.manage-units ====
Password:
==== AUTHENTICATION COMPLETE ====
D-Bus connection terminated while waiting for jobs.
Failed to wait for response: Connection reset by peer
[20:53:59] WARN: Update failed.
```

`systemctl restart` enqueues the job and then blocks on a D-Bus method call
waiting for the result. libdbus gives that call a **25 second default timeout**.
While polkit is waiting on a human to type a password, that clock is running.
Take longer than 25s — or simply not notice the prompt under a wall of Docker
build output — and the client gives up.

systemd does not. It runs the job as soon as authorization arrives. In the run
above, `journalctl` showed the unit reaching `Starting` at `20:53:59`, the same
second the client died, exactly 25s after the command was issued. **The deploy
worked; only the client lost track of it.**

`restart_systemd_unit` in `scripts/update.sh` now tolerates this — it polls the
unit rather than trusting the client's exit code, and lets the `/api/health`
probe decide whether the deploy succeeded. That makes the symptom non-fatal.
The rest of this document removes the cause.

## Option A — polkit rule (preferred)

Lets the deploy user manage this one unit without a password. Nothing
human-paced ends up inside the D-Bus call, so the timeout is never approached.

Check which polkit you have first, because the file format differs:

```bash
pkaction --version
```

### polkit 0.106 or newer (JS rules)

Create `/etc/polkit-1/rules.d/49-fractured-arcanum.rules`:

```javascript
polkit.addRule(function (action, subject) {
  if (action.id === "org.freedesktop.systemd1.manage-units" &&
      action.lookup("unit") === "fractured-arcanum.service" &&
      subject.user === "josh") {
    return polkit.Result.YES;
  }
});
```

```bash
sudo systemctl restart polkit
```

### polkit 0.105 (Ubuntu 22.04 and earlier — .pkla)

0.105 cannot scope a rule to a single unit; it grants the action for all units,
so prefer Option B if that is too broad. Create
`/etc/polkit-1/localauthority/50-local.d/49-fractured-arcanum.pkla`:

```ini
[Manage fractured-arcanum service]
Identity=unix-user:josh
Action=org.freedesktop.systemd1.manage-units
ResultActive=yes
```

## Option B — sudoers (works on every polkit version)

Scopes cleanly to the exact commands and avoids polkit entirely. Create the
drop-in with `visudo` so a syntax error cannot lock you out:

```bash
sudo visudo -f /etc/sudoers.d/fractured-arcanum
```

```
josh ALL=(root) NOPASSWD: /usr/bin/systemctl start fractured-arcanum, \
                          /usr/bin/systemctl stop fractured-arcanum, \
                          /usr/bin/systemctl restart fractured-arcanum, \
                          /usr/bin/systemctl is-active fractured-arcanum, \
                          /usr/bin/systemctl status fractured-arcanum
```

Then run the updater with `sudo -E` **only** if you want the whole script
elevated — usually you do not, because the git and Docker build steps would
then produce root-owned files in the checkout. Prefer Option A, or invoke the
script normally and let the individual `systemctl` calls pick up the sudoers
grant if you wrap them.

## Verifying

The prompt is gone when this returns without asking for a password:

```bash
systemctl restart fractured-arcanum && echo "no prompt"
```

## Do not run the whole updater as root

`sudo bash scripts/update.sh` removes the prompt but leaves root-owned files in
the repository checkout and in `backups/`, which breaks the next non-root run
and the `git pull --ff-only` step. Grant the narrow systemd permission instead.
