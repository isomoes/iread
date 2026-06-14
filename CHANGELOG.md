# Changelog

All notable changes to this project are recorded here.

Format per entry: `<type>: <commit message> (@who) <hash>`
Entries are grouped by version, newest first.

## 0.2.1

- fix(web): move focus to list on sidebar click so j/k selects items (@isomoes) ed54d60
- feat(web): style reader article content (tables, lists, code, headings) (@isomoes) 4b59f11
- feat(web): open in-article links by number with #N (@isomoes) 4093852
- feat(web): full date in reader, compact YYMMDD in article list (@isomoes) 856b359
- feat(server): auto-save subscriptions to feeds.opml on disk (@isomoes) 96aa35a

## 0.1.0

- fix(web): mark reshuffle-selected item read on first switch away (@isomoes) 78d9ea9
- feat(web): mark items read on leave instead of on arrival (@isomoes) 493daf7
- feat: package as npx-runnable npm cli with xdg data path (@isomoes) 2bb7b2c
- chore: remove data folder from tracking (@isomoes) eae5222
- chore: move .env.example and sample-feeds.opml to config/ (@isomoes) 5ed32f4
- docs: add CLAUDE.md with codebase guidance for Claude Code (@isomoes) b61449b
- feat(web): keep read rows visible and auto-mark read on desktop nav (@isomoes) 7a3729f
- feat(web): make Unread the default and first smart view (@isomoes) 3ba2718
- feat: pane-contextual keyboard nav with eased reader scrolling (@isomoes) 7471829
- feat: show item dates as YYYYMMDD instead of relative time (@isomoes) 5f74d07
- chore: add Claude Code tooling config (@isomoes) 8934bb9
- feat: show iread name and version in the topbar (@isomoes) bcd252a
- fix: define .app-shell grid so panes don't collapse to one column (@isomoes) e4d4432
- feat: iread, a local full-stack TypeScript RSS reader (@isomoes) 3ea1998
