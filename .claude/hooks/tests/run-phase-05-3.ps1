#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$hook = Join-Path (Get-Location).Path '.claude/hooks/pre-tool-guard.ps1'
$featCwd = (Get-Location).Path

# Ephemeral test repos rooted in TEMP
$root = Join-Path $env:TEMP 'phase-05-3-fixtures'
if (Test-Path $root) { Remove-Item -Recurse -Force $root }
New-Item -ItemType Directory -Path $root | Out-Null

function New-Repo {
    param([string]$Name, [string]$Branch)
    $path = Join-Path $root $Name
    New-Item -ItemType Directory -Path $path | Out-Null
    Push-Location $path
    & git init -b $Branch --quiet
    & git -c user.email=x@x -c user.name=x commit --allow-empty -m init --quiet
    Pop-Location
    return $path
}

function Set-PrdJson {
    param([string]$RepoPath, [string]$Content)
    $prd = Join-Path $RepoPath 'tasks/ralph'
    New-Item -ItemType Directory -Path $prd -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $prd 'prd.json') -Value $Content -Encoding UTF8 -NoNewline
}

# Build the various Ralph test repos
$repoMain          = New-Repo 'r-main' 'main'
$repoChore         = New-Repo 'r-chore' 'chore/x'
$repoRalphMatch    = New-Repo 'r-ralph-match' 'ralph/foo'
$repoRalphMismatch = New-Repo 'r-ralph-mismatch' 'ralph/wrong'
$repoRalphNoPrd    = New-Repo 'r-ralph-noprd' 'ralph/foo'
$repoRalphBad      = New-Repo 'r-ralph-bad' 'ralph/foo'
$repoRalphNoBn     = New-Repo 'r-ralph-nobn' 'ralph/foo'
$repoRalphEmptyBn  = New-Repo 'r-ralph-emptybn' 'ralph/foo'
$repoChoreWithPrd  = New-Repo 'r-chore-with-prd' 'chore/x'

Set-PrdJson $repoRalphMatch    '{"project":"p","branchName":"ralph/foo"}'
Set-PrdJson $repoRalphMismatch '{"project":"p","branchName":"ralph/foo"}'
Set-PrdJson $repoRalphBad      'not valid json {'
Set-PrdJson $repoRalphNoBn     '{"project":"p"}'
Set-PrdJson $repoRalphEmptyBn  '{"project":"p","branchName":""}'
Set-PrdJson $repoChoreWithPrd  '{"project":"p","branchName":"ralph/foo"}'

$results = New-Object System.Collections.Generic.List[object]

function Invoke-Fixture {
    param([string]$Name, [hashtable]$InputData, [string]$Expected)
    $json = $InputData | ConvertTo-Json -Compress -Depth 6
    $out = $json | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $hook
    $decision = 'no-decision'
    if ($out) {
        try {
            $parsed = $out | ConvertFrom-Json -ErrorAction Stop
            $decision = $parsed.hookSpecificOutput.permissionDecision
        } catch { $decision = 'parse-error' }
    }
    $status = if ($decision -eq $Expected) { 'PASS' } else { 'FAIL' }
    $script:results.Add([pscustomobject]@{
        Name     = $Name
        Decision = $decision
        Expected = $Expected
        Status   = $status
    })
}

$fixtures = @(
    # --- Ralph applicability & branch invariant ---
    @{ Name='RALPH: chore/x, no prd, Write';         Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoChore}          ; Exp='no-decision' },
    @{ Name='RALPH: chore/x, prd present, Write';    Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoChoreWithPrd}   ; Exp='no-decision' },
    @{ Name='RALPH: ralph/foo == branchName, Write'; Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphMatch}     ; Exp='no-decision' },
    @{ Name='RALPH: ralph/wrong != branchName, Write'; Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphMismatch}; Exp='deny' },
    @{ Name='RALPH: ralph/foo, no prd.json, Write';  Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphNoPrd}     ; Exp='deny' },
    @{ Name='RALPH: ralph/foo, malformed prd, Write';Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphBad}       ; Exp='deny' },
    @{ Name='RALPH: ralph/foo, branchName missing, Write';Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphNoBn} ; Exp='deny' },
    @{ Name='RALPH: ralph/foo, branchName empty, Write'; Data=@{tool_name='Write'; tool_input=@{file_path='x'}; cwd=$repoRalphEmptyBn}; Exp='deny' },
    @{ Name='RALPH: ralph mismatch, Read allowed';   Data=@{tool_name='Read';  tool_input=@{file_path='x'}; cwd=$repoRalphMismatch}  ; Exp='no-decision' },
    @{ Name='RALPH: ralph match, Bash git status';   Data=@{tool_name='Bash';  tool_input=@{command='git status'}; cwd=$repoRalphMatch}; Exp='no-decision' },
    @{ Name='RALPH: ralph mismatch, Bash git add';   Data=@{tool_name='Bash';  tool_input=@{command='git add src/x'}; cwd=$repoRalphMismatch}; Exp='deny' },

    # --- Safe staging classifier ---
    @{ Name='STAGE: git add explicit file';          Data=@{tool_name='Bash'; tool_input=@{command='git add src/a.ts'};       cwd=$featCwd}; Exp='no-decision' },
    @{ Name='STAGE: git add -- explicit file';       Data=@{tool_name='Bash'; tool_input=@{command='git add -- src/a.ts'};    cwd=$featCwd}; Exp='no-decision' },
    @{ Name='STAGE: git add two explicit files';     Data=@{tool_name='Bash'; tool_input=@{command='git add src/a.ts src/b.ts'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='STAGE: git add src/ directory';         Data=@{tool_name='Bash'; tool_input=@{command='git add src/'};           cwd=$featCwd}; Exp='no-decision' },
    @{ Name='STAGE: git add .';                      Data=@{tool_name='Bash'; tool_input=@{command='git add .'};              cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add -- .';                   Data=@{tool_name='Bash'; tool_input=@{command='git add -- .'};           cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add -A';                     Data=@{tool_name='Bash'; tool_input=@{command='git add -A'};             cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add --all';                  Data=@{tool_name='Bash'; tool_input=@{command='git add --all'};          cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add --all .';                Data=@{tool_name='Bash'; tool_input=@{command='git add --all .'};        cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add :/';                     Data=@{tool_name='Bash'; tool_input=@{command='git add :/'};             cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add -u';                     Data=@{tool_name='Bash'; tool_input=@{command='git add -u'};             cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add --update';               Data=@{tool_name='Bash'; tool_input=@{command='git add --update'};       cwd=$featCwd}; Exp='deny' },
    @{ Name='STAGE: git add *';                      Data=@{tool_name='Bash'; tool_input=@{command='git add *'};              cwd=$featCwd}; Exp='deny' },

    # --- Destructive Git ---
    @{ Name='DESTROY: git reset --hard';             Data=@{tool_name='Bash'; tool_input=@{command='git reset --hard'};       cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git reset --hard HEAD';        Data=@{tool_name='Bash'; tool_input=@{command='git reset --hard HEAD'};  cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git clean';                    Data=@{tool_name='Bash'; tool_input=@{command='git clean'};              cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git clean -f';                 Data=@{tool_name='Bash'; tool_input=@{command='git clean -f'};           cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git clean -fd';                Data=@{tool_name='Bash'; tool_input=@{command='git clean -fd'};          cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git clean -fdx';               Data=@{tool_name='Bash'; tool_input=@{command='git clean -fdx'};         cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git stash drop';               Data=@{tool_name='Bash'; tool_input=@{command='git stash drop'};         cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git stash clear';              Data=@{tool_name='Bash'; tool_input=@{command='git stash clear'};        cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git push --force';             Data=@{tool_name='Bash'; tool_input=@{command='git push --force'};       cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git push -f';                  Data=@{tool_name='Bash'; tool_input=@{command='git push -f'};            cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git push --force-with-lease';  Data=@{tool_name='Bash'; tool_input=@{command='git push --force-with-lease origin x'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git checkout -- file';         Data=@{tool_name='Bash'; tool_input=@{command='git checkout -- src/a.ts'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git checkout .';               Data=@{tool_name='Bash'; tool_input=@{command='git checkout .'};         cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git restore file';             Data=@{tool_name='Bash'; tool_input=@{command='git restore src/a.ts'};   cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git restore .';                Data=@{tool_name='Bash'; tool_input=@{command='git restore .'};          cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git rebase -i main';           Data=@{tool_name='Bash'; tool_input=@{command='git rebase -i main'};     cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git commit -a';                Data=@{tool_name='Bash'; tool_input=@{command='git commit -a'};          cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git commit -am "x"';           Data=@{tool_name='Bash'; tool_input=@{command='git commit -am "x"'};     cwd=$featCwd}; Exp='deny' },
    @{ Name='DESTROY: git commit --all';             Data=@{tool_name='Bash'; tool_input=@{command='git commit --all'};       cwd=$featCwd}; Exp='deny' },

    # --- Safe / user-controlled (NO DECISION expected) ---
    @{ Name='SAFE: git restore --staged file';       Data=@{tool_name='Bash'; tool_input=@{command='git restore --staged src/a.ts'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='GATED: git branch -D foo';               Data=@{tool_name='Bash'; tool_input=@{command='git branch -D foo'};      cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: git branch -d foo';               Data=@{tool_name='Bash'; tool_input=@{command='git branch -d foo'};      cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: git tag -d tag';                  Data=@{tool_name='Bash'; tool_input=@{command='git tag -d v1'};          cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: git merge feature';               Data=@{tool_name='Bash'; tool_input=@{command='git merge feature'};      cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: git rebase main';                 Data=@{tool_name='Bash'; tool_input=@{command='git rebase main'};        cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: git commit -m';                   Data=@{tool_name='Bash'; tool_input=@{command='git commit -m "hi"'};     cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: git push';                        Data=@{tool_name='Bash'; tool_input=@{command='git push'};               cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: git push origin main';            Data=@{tool_name='Bash'; tool_input=@{command='git push origin main'};   cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: gh pr create';                    Data=@{tool_name='Bash'; tool_input=@{command='gh pr create'};           cwd=$featCwd}; Exp='ask' },
    @{ Name='GATED: gh pr merge 123';                 Data=@{tool_name='Bash'; tool_input=@{command='gh pr merge 123'};        cwd=$featCwd}; Exp='ask' },
    @{ Name='SAFE: git status';                      Data=@{tool_name='Bash'; tool_input=@{command='git status'};             cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git diff';                        Data=@{tool_name='Bash'; tool_input=@{command='git diff'};               cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git diff --cached';               Data=@{tool_name='Bash'; tool_input=@{command='git diff --cached'};      cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git log';                         Data=@{tool_name='Bash'; tool_input=@{command='git log'};                cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git show';                        Data=@{tool_name='Bash'; tool_input=@{command='git show'};               cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git rev-parse HEAD';              Data=@{tool_name='Bash'; tool_input=@{command='git rev-parse HEAD'};     cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git branch --show-current';       Data=@{tool_name='Bash'; tool_input=@{command='git branch --show-current'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: git fetch origin';                Data=@{tool_name='Bash'; tool_input=@{command='git fetch origin'};       cwd=$featCwd}; Exp='no-decision' },
    @{ Name='SAFE: pnpm lint';                       Data=@{tool_name='Bash'; tool_input=@{command='pnpm lint'};              cwd=$featCwd}; Exp='no-decision' },

    # --- MAIN branch regression ---
    @{ Name='MAIN: Write on main';                   Data=@{tool_name='Write'; tool_input=@{file_path='x'};                   cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: Edit on main';                    Data=@{tool_name='Edit';  tool_input=@{file_path='x'};                   cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: NotebookEdit on main';            Data=@{tool_name='NotebookEdit'; tool_input=@{notebook_path='x.ipynb'};  cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: Read on main';                    Data=@{tool_name='Read';  tool_input=@{file_path='x'};                   cwd=$repoMain}; Exp='no-decision' },
    @{ Name='MAIN: Bash git status on main';         Data=@{tool_name='Bash';  tool_input=@{command='git status'};            cwd=$repoMain}; Exp='no-decision' },
    @{ Name='MAIN: Bash pnpm lint on main';          Data=@{tool_name='Bash';  tool_input=@{command='pnpm lint'};             cwd=$repoMain}; Exp='no-decision' },
    @{ Name='MAIN: Bash pnpm add on main';           Data=@{tool_name='Bash';  tool_input=@{command='pnpm add foo'};          cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: Bash git commit on main';         Data=@{tool_name='Bash';  tool_input=@{command='git commit -m x'};       cwd=$repoMain}; Exp='deny' },
    @{ Name='MAIN: Bash git add file on main';       Data=@{tool_name='Bash';  tool_input=@{command='git add src/x'};         cwd=$repoMain}; Exp='deny' },

    # ==================================================================
    # Phase 05.4 - Semantic .env* policy (adversarial DENY + ALLOW)
    # ==================================================================

    # --- File tool DENY: exact protected basenames ---
    @{ Name='ENV: Read .env';                        Data=@{tool_name='Read';  tool_input=@{file_path='.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.local';                  Data=@{tool_name='Read';  tool_input=@{file_path='.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.production';             Data=@{tool_name='Read';  tool_input=@{file_path='.env.production'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.production.local';       Data=@{tool_name='Read';  tool_input=@{file_path='.env.production.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.development';            Data=@{tool_name='Read';  tool_input=@{file_path='.env.development'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.test';                   Data=@{tool_name='Read';  tool_input=@{file_path='.env.test'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.sentry-build-plugin';    Data=@{tool_name='Read';  tool_input=@{file_path='.env.sentry-build-plugin'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read nested/.env.local';           Data=@{tool_name='Read';  tool_input=@{file_path='nested/dir/.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read ./.env';                      Data=@{tool_name='Read';  tool_input=@{file_path='./.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read Windows .\\.env.local';       Data=@{tool_name='Read';  tool_input=@{file_path='.\.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read case .ENV.LOCAL';             Data=@{tool_name='Read';  tool_input=@{file_path='.ENV.LOCAL'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Write .env.local';                 Data=@{tool_name='Write'; tool_input=@{file_path='.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Edit .env.local';                  Data=@{tool_name='Edit';  tool_input=@{file_path='.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: NotebookEdit .env';                Data=@{tool_name='NotebookEdit'; tool_input=@{notebook_path='.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Grep on .env.local (path field)';  Data=@{tool_name='Grep';  tool_input=@{pattern='KEY'; path='.env.local'}; cwd=$featCwd}; Exp='deny' },

    # --- File tool DENY: unknown .env.* variants (fail-safe) ---
    @{ Name='ENV: Read .env.staging';                Data=@{tool_name='Read';  tool_input=@{file_path='.env.staging'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Read .env.mycustom';               Data=@{tool_name='Read';  tool_input=@{file_path='.env.mycustom'}; cwd=$featCwd}; Exp='deny' },

    # --- File tool ALLOW: safe templates ---
    @{ Name='ENV: Read .env.example';                Data=@{tool_name='Read';  tool_input=@{file_path='.env.example'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read .env.sample';                 Data=@{tool_name='Read';  tool_input=@{file_path='.env.sample'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read .env.template';               Data=@{tool_name='Read';  tool_input=@{file_path='.env.template'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Write .env.example';               Data=@{tool_name='Write'; tool_input=@{file_path='.env.example'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Edit .env.template';               Data=@{tool_name='Edit';  tool_input=@{file_path='.env.template'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read nested/.env.example';         Data=@{tool_name='Read';  tool_input=@{file_path='nested/dir/.env.example'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read case-mix .env.EXAMPLE';       Data=@{tool_name='Read';  tool_input=@{file_path='.env.EXAMPLE'}; cwd=$featCwd}; Exp='no-decision' },

    # --- File tool ALLOW: unrelated names ---
    @{ Name='ENV: Read .envrc';                      Data=@{tool_name='Read';  tool_input=@{file_path='.envrc'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read .environment';                Data=@{tool_name='Read';  tool_input=@{file_path='.environment'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read foo.env';                     Data=@{tool_name='Read';  tool_input=@{file_path='foo.env'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read dotenv.config.ts';            Data=@{tool_name='Read';  tool_input=@{file_path='dotenv.config.ts'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Read src/lib/foo.ts';              Data=@{tool_name='Read';  tool_input=@{file_path='src/lib/foo.ts'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV: Grep on src/';                     Data=@{tool_name='Grep';  tool_input=@{pattern='KEY'; path='src/'}; cwd=$featCwd}; Exp='no-decision' },

    # --- Bash direct file readers targeting secrets: DENY ---
    @{ Name='ENV: Bash cat .env';                    Data=@{tool_name='Bash'; tool_input=@{command='cat .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash cat .env.local';              Data=@{tool_name='Bash'; tool_input=@{command='cat .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash head .env';                   Data=@{tool_name='Bash'; tool_input=@{command='head .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash tail .env.production';        Data=@{tool_name='Bash'; tool_input=@{command='tail .env.production'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash more .env.local';             Data=@{tool_name='Bash'; tool_input=@{command='more .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash less .env';                   Data=@{tool_name='Bash'; tool_input=@{command='less .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash type .env';                   Data=@{tool_name='Bash'; tool_input=@{command='type .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash cat ./.env';                  Data=@{tool_name='Bash'; tool_input=@{command='cat ./.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash cat quoted "".env""';         Data=@{tool_name='Bash'; tool_input=@{command='cat ".env"'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash cat single-quoted';           Data=@{tool_name='Bash'; tool_input=@{command="cat '.env'"}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash grep KEY .env.local';         Data=@{tool_name='Bash'; tool_input=@{command='grep KEY .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash findstr KEY .env';            Data=@{tool_name='Bash'; tool_input=@{command='findstr KEY .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash sed 1p .env';                 Data=@{tool_name='Bash'; tool_input=@{command='sed 1p .env'}; cwd=$featCwd}; Exp='deny' },

    # --- Bash source / dot-source: DENY ---
    @{ Name='ENV: Bash source .env';                 Data=@{tool_name='Bash'; tool_input=@{command='source .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash . .env.local';                Data=@{tool_name='Bash'; tool_input=@{command='. .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash . ./.env';                    Data=@{tool_name='Bash'; tool_input=@{command='. ./.env'}; cwd=$featCwd}; Exp='deny' },

    # --- Bash copy / move / delete: DENY ---
    @{ Name='ENV: Bash cp .env /tmp/x';              Data=@{tool_name='Bash'; tool_input=@{command='cp .env /tmp/x'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash cp x .env';                   Data=@{tool_name='Bash'; tool_input=@{command='cp foo.txt .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash mv .env x';                   Data=@{tool_name='Bash'; tool_input=@{command='mv .env new.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash rm .env';                     Data=@{tool_name='Bash'; tool_input=@{command='rm .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash del .env.local';              Data=@{tool_name='Bash'; tool_input=@{command='del .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash copy .env x';                 Data=@{tool_name='Bash'; tool_input=@{command='copy .env foo.txt'}; cwd=$featCwd}; Exp='deny' },

    # --- Bash output redirection: DENY ---
    @{ Name='ENV: Bash echo > .env';                 Data=@{tool_name='Bash'; tool_input=@{command='echo foo > .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash echo >> .env.local';          Data=@{tool_name='Bash'; tool_input=@{command='echo bar >> .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash date > .env.production';      Data=@{tool_name='Bash'; tool_input=@{command='date > .env.production'}; cwd=$featCwd}; Exp='deny' },

    # --- Bash git content-exposing subcommands: DENY ---
    @{ Name='ENV: Bash git show HEAD:.env';          Data=@{tool_name='Bash'; tool_input=@{command='git show HEAD:.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git show HEAD:.env.local';    Data=@{tool_name='Bash'; tool_input=@{command='git show HEAD:.env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git diff -- .env';            Data=@{tool_name='Bash'; tool_input=@{command='git diff -- .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git diff .env.local';         Data=@{tool_name='Bash'; tool_input=@{command='git diff .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git blame .env';              Data=@{tool_name='Bash'; tool_input=@{command='git blame .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git cat-file blob HEAD:.env'; Data=@{tool_name='Bash'; tool_input=@{command='git cat-file blob HEAD:.env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git log -p .env.local';       Data=@{tool_name='Bash'; tool_input=@{command='git log -p .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash git grep KEY .env.local';     Data=@{tool_name='Bash'; tool_input=@{command='git grep KEY .env.local'}; cwd=$featCwd}; Exp='deny' },

    # --- PowerShell command form: DENY ---
    @{ Name='ENV: PS Get-Content .env';              Data=@{tool_name='PowerShell'; tool_input=@{command='Get-Content .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: PS Get-Content .env.local';        Data=@{tool_name='PowerShell'; tool_input=@{command='Get-Content .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: PS gc .env';                       Data=@{tool_name='PowerShell'; tool_input=@{command='gc .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: PS Set-Content .env foo';          Data=@{tool_name='PowerShell'; tool_input=@{command='Set-Content .env foo'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: PS Copy-Item .env x';              Data=@{tool_name='PowerShell'; tool_input=@{command='Copy-Item .env foo.txt'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: PS Remove-Item .env.local';        Data=@{tool_name='PowerShell'; tool_input=@{command='Remove-Item .env.local'}; cwd=$featCwd}; Exp='deny' },

    # --- Compound commands: DENY (pipe / && / ;) ---
    @{ Name='ENV: Bash cat .env | grep K';           Data=@{tool_name='Bash'; tool_input=@{command='cat .env | grep KEY'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash echo x && cat .env';          Data=@{tool_name='Bash'; tool_input=@{command='echo x && cat .env'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash echo x; cat .env.local';      Data=@{tool_name='Bash'; tool_input=@{command='echo x; cat .env.local'}; cwd=$featCwd}; Exp='deny' },
    @{ Name='ENV: Bash false || cat .env';           Data=@{tool_name='Bash'; tool_input=@{command='false || cat .env'}; cwd=$featCwd}; Exp='deny' },

    # --- Bash / PS false-positive resistance (NO DECISION) ---
    @{ Name='ENV-OK: echo ".env" literal';           Data=@{tool_name='Bash'; tool_input=@{command='echo ".env"'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: echo about .env in text';       Data=@{tool_name='Bash'; tool_input=@{command='echo "The .env file is..."'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat .env.example';              Data=@{tool_name='Bash'; tool_input=@{command='cat .env.example'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat foo.env';                   Data=@{tool_name='Bash'; tool_input=@{command='cat foo.env'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat .envrc';                    Data=@{tool_name='Bash'; tool_input=@{command='cat .envrc'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat .environment';              Data=@{tool_name='Bash'; tool_input=@{command='cat .environment'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat dotenv.config.ts';          Data=@{tool_name='Bash'; tool_input=@{command='cat dotenv.config.ts'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: grep .env README.md';           Data=@{tool_name='Bash'; tool_input=@{command='grep .env README.md'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cat README.md';                 Data=@{tool_name='Bash'; tool_input=@{command='cat README.md'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: ls .env (metadata only)';       Data=@{tool_name='Bash'; tool_input=@{command='ls .env'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: git log .env (no -p)';          Data=@{tool_name='Bash'; tool_input=@{command='git log .env'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: git log --stat .env';           Data=@{tool_name='Bash'; tool_input=@{command='git log --stat .env'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: git status';                    Data=@{tool_name='Bash'; tool_input=@{command='git status'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: PS Get-Content README.md';      Data=@{tool_name='PowerShell'; tool_input=@{command='Get-Content README.md'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: cp .env.example .env.new';      Data=@{tool_name='Bash'; tool_input=@{command='cp .env.example configured.env.example'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: git grep .env README.md';       Data=@{tool_name='Bash'; tool_input=@{command='git grep .env README.md'}; cwd=$featCwd}; Exp='no-decision' },
    @{ Name='ENV-OK: sed 1p README.md';              Data=@{tool_name='Bash'; tool_input=@{command='sed 1p README.md'}; cwd=$featCwd}; Exp='no-decision' }
)

foreach ($f in $fixtures) {
    Invoke-Fixture -Name $f.Name -InputData $f.Data -Expected $f.Exp
}

# Print results
$pass = ($results | Where-Object { $_.Status -eq 'PASS' }).Count
$fail = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
foreach ($r in $results) {
    "{0,-55} decision={1,-12} expected={2,-12} {3}" -f $r.Name, $r.Decision, $r.Expected, $r.Status
}
""
"TOTAL: $($results.Count)  PASS: $pass  FAIL: $fail"

# Cleanup ephemeral repos
Remove-Item -Recurse -Force $root
"Cleanup: removed $root"
