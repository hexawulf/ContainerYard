# Commit & push ContainerYard changes

Repo: /home/zk/projects/ContainerYard
Branch intent: push to main (fallback: create PR if main is protected)

Steps:
1) cd /home/zk/projects/ContainerYard
2) Show status; if there are changes, stage & commit:
   /usr/bin/git status --porcelain
   /usr/bin/git add -A
   /usr/bin/git commit -m "hotfix: prevent crash (PerformanceObserver entryTypes); add CSRF wiring; keep CPU/Mem numeric"
3) Ensure main is up to date, then fast-forward merge current branch into main:
   CUR=$(/usr/bin/git rev-parse --abbrev-ref HEAD)
   /usr/bin/git fetch origin
   /usr/bin/git checkout main
   /usr/bin/git pull --ff-only
   /usr/bin/git merge --no-ff "$CUR" -m "merge $CUR into main"
4) Push:
   /usr/bin/git push origin main

If step 3/4 fails due to branch protection, do this instead:
   /usr/bin/git push -u origin "$CUR"
   /usr/bin/gh pr create --base main --head "$CUR" \
     --title "Merge $CUR → main" \
     --body "Includes CSRF fix + runtime crash guard; verified containers list + numeric CPU/Mem."

Finally, print:
   /usr/bin/git --no-pager log -n 3 --oneline
