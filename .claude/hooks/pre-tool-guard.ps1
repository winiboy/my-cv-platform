#Requires -Version 5.1
$ErrorActionPreference = 'Continue'

function Emit-Deny {
    param([string]$Reason)
    $payload = @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = 'deny'
            permissionDecisionReason = $Reason
        }
    }
    $json = $payload | ConvertTo-Json -Depth 6 -Compress
    [Console]::Out.Write($json)
    exit 0
}

function Emit-Noop { exit 0 }

# --- Governance approval modes -------------------------------------------
#
# Phase 05 emitted only 'deny' or nothing, deliberately: the hook could
# restrict but never grant, so permissions stayed the single authority.
#
# Two decisions are added here, and the contract change is intentional:
#
#   Emit-Ask   forces a prompt even when a permission rule would allow the
#              command. This is the backstop for the non-negotiable gates -
#              it survives an 'allow' entry appended by an "always allow"
#              click, which is exactly how git commit was ungated before.
#
#   Emit-Allow grants routine local work while FAST TRACK is active for one
#              user story. This is the only path by which the hook grants
#              anything, it is scoped to a single story, and it is evaluated
#              AFTER every deny rule, so nothing Phase 05 blocked is reachable
#              through it.
#
# Precedence, unchanged in spirit: DENY > ASK > ALLOW > no decision.

function Emit-Ask {
    param([string]$Reason)
    $payload = @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = 'ask'
            permissionDecisionReason = $Reason
        }
    }
    [Console]::Out.Write(($payload | ConvertTo-Json -Depth 6 -Compress))
    exit 0
}

function Emit-Allow {
    param([string]$Reason)
    $payload = @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = 'allow'
            permissionDecisionReason = $Reason
        }
    }
    [Console]::Out.Write(($payload | ConvertTo-Json -Depth 6 -Compress))
    exit 0
}

# Reads .claude/governance-state.json. Returns 'STANDARD' unless FAST TRACK is
# recorded AND unexpired AND names a story. Any malformed, missing or expired
# state falls back to STANDARD - the safe direction, since STANDARD grants
# nothing beyond what permissions already allow.
function Get-GovernanceMode {
    param([string]$Cwd)
    try {
        $statePath = Join-Path $Cwd '.claude\governance-state.json'
        if (-not (Test-Path -LiteralPath $statePath)) { return 'STANDARD' }
        $raw = Get-Content -LiteralPath $statePath -Raw -ErrorAction Stop
        if ([string]::IsNullOrWhiteSpace($raw)) { return 'STANDARD' }
        $state = $raw | ConvertFrom-Json -ErrorAction Stop

        $mode = [string](Get-Field $state 'mode')
        if ($mode -ne 'FAST_TRACK') { return 'STANDARD' }

        # A mode with no story cannot expire, so it is not a mode.
        $storyId = [string](Get-Field $state 'storyId')
        if ([string]::IsNullOrWhiteSpace($storyId)) { return 'STANDARD' }

        $expires = [string](Get-Field $state 'expiresOn')
        if (-not [string]::IsNullOrWhiteSpace($expires)) {
            $parsed = [datetime]::MinValue
            if ([datetime]::TryParse($expires, [ref]$parsed)) {
                if ((Get-Date).ToUniversalTime() -gt $parsed.ToUniversalTime()) { return 'STANDARD' }
            }
        }
        return 'FAST_TRACK'
    } catch {
        return 'STANDARD'
    }
}

# The non-negotiable gates. These force a prompt in BOTH modes.
# Anything already caught by a deny rule never reaches here.
# Narrowed 2026-09-04 at the owner's explicit and repeated instruction:
# work proceeds uninterrupted through a user story, and only SHIPPING actions
# prompt. Committing is part of completing a story, so it no longer gates.
#
# What remains are the actions that publish work or mutate something outside
# this working copy. Deploying to production and pushing a migration to a
# hosted database are shipping actions in the same sense as push and merge -
# they are not part of completing a story - so they stay. If the owner wants
# those ungated too, remove them here.
#
# Nothing here weakens the deny rules above: destructive git, unsafe staging,
# .env access and main-branch mutation are still blocked outright, not prompted.
$script:ProtectedCommandRules = @(
    @{ Pat = '^git\s+push(\s|$)';                      Reason = 'git push' },
    @{ Pat = '^git\s+merge(\s|$)';                     Reason = 'git merge' },
    @{ Pat = '^gh\s+pr\s+(create|merge|edit|close|reopen|ready|review)(\s|$)'; Reason = 'pull request action' },
    @{ Pat = '^gh\s+release(\s|$)';                    Reason = 'release publication' },
    @{ Pat = '^(pnpm|npm|yarn)\s+publish(\s|$)';       Reason = 'package publication' },
    @{ Pat = '^supabase\s+(db\s+push|link|migration\s+up)(\s|$)'; Reason = 'non-local database command' },
    @{ Pat = '^(pnpm|npx)\s+supabase\s+(db\s+push|link|migration\s+up)(\s|$)'; Reason = 'non-local database command' },
    @{ Pat = '^psql\s+.*(-h|--host)\s*(?!localhost|127\.0\.0\.1)'; Reason = 'psql against a non-local host' },
    @{ Pat = '^vercel(\s|$)';                          Reason = 'deployment command' }
)

function Test-CommandIsProtected {
    param([string]$Command)
    $c = $Command.Trim()
    foreach ($rule in $script:ProtectedCommandRules) {
        if ($c -match $rule.Pat) { return $rule.Reason }
    }
    return $null
}

# Routine local work FAST TRACK may grant. Deliberately excludes package
# installs, network calls and arbitrary interpreters (node -e, python): those
# are either on the protected list above or stay subject to normal prompting.
$script:FastTrackCommandPatterns = @(
    '^pnpm\s+(lint|typecheck|build|test|test:watch|test:integration)(\s|$)',
    '^pnpm\s+exec\s+(eslint|tsc|vitest)(\s|$)',
    '^pnpm\s+dev(\s|$)',
    '^git\s+(status|diff|log|show|rev-parse|ls-files|for-each-ref|cat-file|branch\s*$|merge-base)(\s|$)',
    '^git\s+add\s+--\s',
    '^(pnpm|npx)\s+supabase\s+(start|stop|status|db\s+reset)(\s|$)',
    '^docker\s+(ps|logs)(\s|$)',
    '^docker\s+exec\s+-i\s+supabase_db_[A-Za-z0-9_-]+\s+psql\s',
    '^(ls|cat|head|tail|wc|sort|uniq|grep|find|echo|od|which|where)(\s|$)'
)

function Test-CommandIsFastTrackRoutine {
    param([string]$Command)
    $c = $Command.Trim()
    foreach ($pat in $script:FastTrackCommandPatterns) {
        if ($c -match $pat) { return $true }
    }
    return $false
}

# Paths that force a prompt in BOTH modes even for Write/Edit.
# .env is already denied outright by Test-PathIsSecret; these are the files
# where an edit is legitimate but must never be silent.
function Test-PathIsProtectedForEdit {
    param([string]$RawPath)
    if ([string]::IsNullOrWhiteSpace($RawPath)) { return $null }
    # Note: Normalize-Path/Get-Basename take -Path, while Test-PathIsSecret
    # takes -RawPath. Passing the wrong name fails silently under
    # $ErrorActionPreference='Continue' and this returns $null, which reads as
    # "not protected" - the unsafe direction. The governance suite catches it.
    $p = (Normalize-Path -Path $RawPath)
    $base = Get-Basename -Path $p
    if ($p -match '(^|/)\.github/workflows/')      { return 'CI workflow' }
    if ($p -match '(^|/)\.github/')                { return 'CI configuration' }
    if ($base -eq 'package.json')                  { return 'package manifest (dependencies)' }
    if ($base -eq 'pnpm-lock.yaml')                { return 'dependency lockfile' }
    if ($base -eq 'vercel.json')                   { return 'deployment configuration' }
    if ($p -match '(^|/)supabase/migrations/')     { return 'database migration' }
    if ($p -match '(^|/)\.claude/settings')        { return 'permission configuration' }
    if ($p -match '(^|/)\.claude/hooks/')          { return 'governance hook' }
    return $null
}

function Get-Field {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    try {
        $prop = $Object.PSObject.Properties[$Name]
        if ($null -ne $prop) { return $prop.Value }
    } catch {}
    return $null
}

function Normalize-Path {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return '' }
    $p = $Path.Trim().Trim('"').Trim("'")
    $p = $p -replace '\\', '/'
    $p = $p -replace '/{2,}', '/'
    $parts = $p.Split('/')
    $stack = New-Object System.Collections.Generic.List[string]
    foreach ($seg in $parts) {
        if ($seg -eq '' -or $seg -eq '.') { continue }
        if ($seg -eq '..') {
            if ($stack.Count -gt 0) { $stack.RemoveAt($stack.Count - 1) }
            continue
        }
        [void]$stack.Add($seg)
    }
    return ($stack -join '/')
}

function Get-Basename {
    param([string]$Path)
    $n = Normalize-Path -Path $Path
    if ($n -eq '') { return '' }
    $i = $n.LastIndexOf('/')
    if ($i -lt 0) { return $n }
    return $n.Substring($i + 1)
}

function Test-IsGitRepo {
    param([string]$Cwd)
    if ([string]::IsNullOrWhiteSpace($Cwd)) { return $false }
    if (-not (Test-Path -LiteralPath $Cwd)) { return $false }
    try {
        & git -C $Cwd rev-parse --git-dir *> $null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

function Get-CurrentBranch {
    param([string]$Cwd)
    try {
        $b = & git -C $Cwd rev-parse --abbrev-ref HEAD 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        if ($null -eq $b) { return $null }
        return ([string]$b).Trim()
    } catch { return $null }
}

$ReadOnlyCommandPatterns = @(
    '^git\s+status(\s|$)',
    '^git\s+diff(\s|$)',
    '^git\s+log(\s|$)',
    '^git\s+show(\s|$)',
    '^git\s+rev-parse(\s|$)',
    '^git\s+ls-tree(\s|$)',
    '^git\s+ls-files(\s|$)',
    '^git\s+cat-file(\s|$)',
    '^git\s+branch\s+--show-current(\s|$)',
    '^git\s+branch\s+--list(\s|$)',
    '^git\s+branch\s+-v(\s|$)',
    '^git\s+branch\s+-a(\s|$)',
    '^git\s+branch\s*$',
    '^git\s+fetch(\s|$)',
    '^git\s+blame(\s|$)',
    '^git\s+describe(\s|$)',
    '^git\s+config\s+--get(\s|$)',
    '^git\s+remote(\s+-v)?(\s|$)',
    '^git\s+stash\s+list(\s|$)',
    '^git\s+for-each-ref(\s|$)',
    '^pnpm\s+lint(\s|$)',
    '^pnpm\s+build(\s|$)',
    '^pnpm\s+exec\s+tsc(\s|$)',
    '^pnpm\s+exec\s+eslint(\s|$)',
    '^pnpm\s+ls(\s|$)',
    '^pnpm\s+list(\s|$)',
    '^pnpm\s+-v(\s|$)',
    '^pnpm\s+--version(\s|$)',
    '^ls(\s|$)',
    '^dir(\s|$)',
    '^cat(\s|$)',
    '^head(\s|$)',
    '^tail(\s|$)',
    '^wc(\s|$)',
    '^echo(\s|$)',
    '^where(\s|$)',
    '^which(\s|$)',
    '^netstat(\s|$)',
    '^tasklist(\s|$)',
    '^find(\s|$)',
    '^findstr(\s|$)',
    '^Select-String(\s|$)',
    '^test(\s|$)',
    '^cd(\s|$)',
    '^more(\s|$)',
    '^pwd(\s|$)',
    '^stat(\s|$)',
    '^du(\s|$)',
    '^file(\s|$)',
    '^type(\s|$)',
    '^Get-Content(\s|$)',
    '^Get-Item(\s|$)',
    '^Get-ChildItem(\s|$)',
    '^Get-Location(\s|$)',
    '^Test-Path(\s|$)',
    '^Measure-Object(\s|$)',
    '^Write-Output(\s|$)',
    '^Write-Host(\s|$)',
    '^timeout(\s|$)'
)

function Test-CommandIsReadOnly {
    param([string]$Command)
    if ([string]::IsNullOrWhiteSpace($Command)) { return $false }
    $c = $Command.Trim()
    foreach ($pat in $ReadOnlyCommandPatterns) {
        if ($c -match $pat) { return $true }
    }
    return $false
}

$DestructiveCommandPatterns = @(
    @{ Pat = '^git\s+reset\s+--hard(\s|$)';            Reason = 'git reset --hard destroys uncommitted work' },
    @{ Pat = '^git\s+clean(\s|$)';                     Reason = 'git clean removes untracked files irreversibly' },
    @{ Pat = '^git\s+stash\s+drop(\s|$)';              Reason = 'git stash drop irreversibly removes a stash' },
    @{ Pat = '^git\s+stash\s+clear(\s|$)';             Reason = 'git stash clear removes all stashes' },
    @{ Pat = '^git\s+checkout\s+--(\s|$)';             Reason = 'git checkout -- <path> discards worktree changes' },
    @{ Pat = '^git\s+checkout\s+\.(\s|$)';             Reason = 'git checkout . discards worktree changes' },
    @{ Pat = '^git\s+rebase\s+-i(\s|$)';               Reason = 'interactive rebase can rewrite history' },
    @{ Pat = '^git\s+commit\s+-a(\s|$)';               Reason = 'git commit -a implicitly stages all modified files' },
    @{ Pat = '^git\s+commit\s+-am(\s|$)';              Reason = 'git commit -am implicitly stages all modified files' },
    @{ Pat = '^git\s+commit\s+--all(\s|$)';            Reason = 'git commit --all implicitly stages all modified files' },
    @{ Pat = '^git\s+push\s+--force(\s|$)';            Reason = 'git push --force can rewrite remote history' },
    @{ Pat = '^git\s+push\s+-f(\s|$)';                 Reason = 'git push -f can rewrite remote history' },
    @{ Pat = '^git\s+push\s+--force-with-lease(\s|$)'; Reason = 'git push --force-with-lease can rewrite remote history; user must run manually' }
)

function Test-CommandIsDestructiveGit {
    param([string]$Command)
    if ([string]::IsNullOrWhiteSpace($Command)) { return $null }
    $c = $Command.Trim()
    foreach ($entry in $DestructiveCommandPatterns) {
        if ($c -match $entry.Pat) { return $entry.Reason }
    }
    if ($c -match '^git\s+restore\b') {
        if ($c -notmatch '^git\s+restore\s+--staged\b') {
            return 'git restore rewrites worktree files (except --staged forms)'
        }
    }
    return $null
}

$EnvTemplateAllowlist = @('.env.example', '.env.sample', '.env.template')

$SecretShellFamilies = @(
    'cat', 'head', 'tail', 'more', 'less', 'type', 'sed', 'awk', 'xxd', 'od', 'strings', 'hexdump',
    'grep', 'egrep', 'fgrep', 'findstr', 'select-string', 'sls',
    'get-content', 'gc',
    'set-content', 'add-content', 'out-file', 'tee',
    'rm', 'del', 'erase', 'remove-item', 'ri',
    'cp', 'copy', 'copy-item',
    'mv', 'move', 'move-item', 'rename-item', 'rni', 'ren',
    'source', '.'
)

$GitSecretExposingSubcommands = @('show', 'diff', 'blame', 'cat-file', 'grep')

function Test-EnvBasenameIsSecret {
    param([string]$Basename)
    if ([string]::IsNullOrWhiteSpace($Basename)) { return $false }
    $b = $Basename.ToLower()
    if ($b -eq '.env') { return $true }
    if (-not $b.StartsWith('.env.')) { return $false }
    if ($EnvTemplateAllowlist -contains $b) { return $false }
    return $true
}

function Test-PathIsSecret {
    param([string]$RawPath)
    if ([string]::IsNullOrWhiteSpace($RawPath)) { return $false }
    $p = $RawPath.Trim().Trim('"').Trim("'")
    if ($p -eq '') { return $false }
    $normalized = Normalize-Path -Path $p
    if ($normalized -eq '') { return $false }
    $bn = Get-Basename -Path $normalized
    return Test-EnvBasenameIsSecret -Basename $bn
}

$PatternFirstCommands = @('grep', 'egrep', 'fgrep', 'findstr', 'select-string', 'sls', 'sed', 'awk')

function Get-CommandTokens {
    param([string]$Command)
    $c = [regex]::Replace($Command, '(2>>|2>|&>|>>|>)', ' $1 ')
    $tokens = New-Object System.Collections.Generic.List[string]
    $rxMatches = [regex]::Matches($c, '"[^"]*"|''[^'']*''|\S+')
    foreach ($m in $rxMatches) {
        $t = $m.Value
        if ($t.Length -ge 2) {
            $first = $t[0]
            $last = $t[$t.Length - 1]
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $t = $t.Substring(1, $t.Length - 2)
            }
        }
        [void]$tokens.Add($t)
    }
    return ,$tokens
}

function Test-SingleCommandTouchesSecret {
    param([string]$Command)
    if ([string]::IsNullOrWhiteSpace($Command)) { return $null }
    $c = $Command.Trim()
    $tokens = Get-CommandTokens -Command $c
    if ($tokens.Count -eq 0) { return $null }

    for ($i = 0; $i -lt $tokens.Count - 1; $i++) {
        $t = $tokens[$i]
        if ($t -eq '>' -or $t -eq '>>' -or $t -eq '2>' -or $t -eq '2>>' -or $t -eq '&>') {
            $target = $tokens[$i + 1]
            if (Test-PathIsSecret -RawPath $target) {
                return "output redirection to protected .env file: $target"
            }
        }
    }

    $verb = $tokens[0].ToLower()

    if ($verb -eq 'git' -and $tokens.Count -ge 2) {
        $sub = $tokens[1].ToLower()
        if ($GitSecretExposingSubcommands -contains $sub) {
            $skipFirstPositional = ($sub -eq 'grep')
            $sawFirstPositional = $false
            for ($i = 2; $i -lt $tokens.Count; $i++) {
                $tok = $tokens[$i]
                if ([string]::IsNullOrWhiteSpace($tok)) { continue }
                if ($tok.StartsWith('-')) { continue }
                if ($skipFirstPositional -and -not $sawFirstPositional) {
                    $sawFirstPositional = $true
                    continue
                }
                if ($tok.Contains(':')) {
                    $parts = $tok.Split(':', 2)
                    if ($parts.Length -eq 2 -and (Test-PathIsSecret -RawPath $parts[1])) {
                        return "git $sub would expose protected .env file via <rev>:<path>: $($parts[1])"
                    }
                }
                if (Test-PathIsSecret -RawPath $tok) {
                    return "git $sub would expose protected .env file: $tok"
                }
            }
        }
        if ($sub -eq 'log') {
            $hasPatch = $false
            foreach ($t2 in $tokens) {
                if ($t2 -eq '-p' -or $t2 -eq '--patch' -or $t2 -eq '-u') { $hasPatch = $true; break }
            }
            if ($hasPatch) {
                for ($i = 2; $i -lt $tokens.Count; $i++) {
                    $tok = $tokens[$i]
                    if ($tok.StartsWith('-')) { continue }
                    if (Test-PathIsSecret -RawPath $tok) {
                        return "git log -p would expose protected .env file: $tok"
                    }
                }
            }
        }
        return $null
    }

    if ($SecretShellFamilies -contains $verb) {
        $skipFirstPositional = ($PatternFirstCommands -contains $verb)
        $sawFirstPositional = $false
        for ($i = 1; $i -lt $tokens.Count; $i++) {
            $tok = $tokens[$i]
            if ([string]::IsNullOrWhiteSpace($tok)) { continue }
            if ($tok.StartsWith('-')) { continue }
            if ($skipFirstPositional -and -not $sawFirstPositional) {
                $sawFirstPositional = $true
                continue
            }
            if (Test-PathIsSecret -RawPath $tok) {
                return "$verb targets protected .env file: $tok"
            }
        }
    }

    return $null
}

function Test-CommandTouchesSecretEnv {
    param([string]$Command)
    if ([string]::IsNullOrWhiteSpace($Command)) { return $null }
    $parts = [regex]::Split($Command, '\s*(?:\|\||&&|;|\|)\s*')
    foreach ($part in $parts) {
        $r = Test-SingleCommandTouchesSecret -Command $part
        if ($r) { return $r }
    }
    return $null
}

function Test-CommandIsUnsafeStaging {
    param([string]$Command)
    if ([string]::IsNullOrWhiteSpace($Command)) { return $null }
    $c = $Command.Trim()
    if ($c -notmatch '^git\s+add\b') { return $null }
    $rest = $c -replace '^git\s+add\s*', ''
    if ([string]::IsNullOrWhiteSpace($rest)) { return $null }
    $tokens = @($rest -split '\s+' | Where-Object { $_ -ne '' })
    $sawDoubleDash = $false
    foreach ($tok in $tokens) {
        if (-not $sawDoubleDash) {
            if ($tok -eq '-A' -or $tok -eq '--all')    { return 'git add -A / --all stages the entire worktree' }
            if ($tok -eq '-u' -or $tok -eq '--update') { return 'git add -u / --update stages tree-wide modifications' }
            if ($tok -eq '--') { $sawDoubleDash = $true; continue }
        }
        if ($tok -eq '.' -or $tok -eq ':/' -or $tok -eq '*') {
            return "git add $tok stages the entire directory/worktree"
        }
    }
    return $null
}

function Test-RalphEnforcement {
    param([string]$Cwd, [string]$Branch)
    if ([string]::IsNullOrWhiteSpace($Branch)) { return $null }
    if ($Branch -notmatch '^ralph/') { return $null }
    $prdPath = Join-Path $Cwd 'tasks/ralph/prd.json'
    if (-not (Test-Path -LiteralPath $prdPath)) {
        return "current branch '$Branch' is a Ralph branch but tasks/ralph/prd.json is missing"
    }
    $content = $null
    try { $content = Get-Content -LiteralPath $prdPath -Raw -ErrorAction Stop } catch {
        return "current branch '$Branch' is a Ralph branch but tasks/ralph/prd.json is unreadable"
    }
    if ([string]::IsNullOrWhiteSpace($content)) {
        return "current branch '$Branch' is a Ralph branch but tasks/ralph/prd.json is empty"
    }
    $prd = $null
    try { $prd = $content | ConvertFrom-Json -ErrorAction Stop } catch {
        return "current branch '$Branch' is a Ralph branch but tasks/ralph/prd.json is malformed JSON"
    }
    $branchName = [string](Get-Field $prd 'branchName')
    if ([string]::IsNullOrWhiteSpace($branchName)) {
        return "current branch '$Branch' is a Ralph branch but tasks/ralph/prd.json has no branchName"
    }
    if ($branchName -ne $Branch) {
        return "current branch '$Branch' does not match active Ralph contract branchName '$branchName' (source: tasks/ralph/prd.json)"
    }
    return $null
}

$rawInput = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($rawInput)) { Emit-Noop }

$hookInput = $null
try { $hookInput = $rawInput | ConvertFrom-Json -ErrorAction Stop } catch { Emit-Noop }

$toolName  = Get-Field $hookInput 'tool_name'
$toolInput = Get-Field $hookInput 'tool_input'
$cwd       = Get-Field $hookInput 'cwd'

if ([string]::IsNullOrWhiteSpace($toolName)) { Emit-Noop }

$isRepo = Test-IsGitRepo -Cwd $cwd
$branch = $null
if ($isRepo) { $branch = Get-CurrentBranch -Cwd $cwd }
$isMain = ($branch -eq 'main')

switch ($toolName) {

    { $_ -in 'Write', 'Edit', 'NotebookEdit' } {
        $filePath = $null
        if ($toolName -eq 'NotebookEdit') {
            $filePath = [string](Get-Field $toolInput 'notebook_path')
        } else {
            $filePath = [string](Get-Field $toolInput 'file_path')
        }
        if (-not [string]::IsNullOrWhiteSpace($filePath) -and (Test-PathIsSecret -RawPath $filePath)) {
            Emit-Deny "Phase 05 hook: $toolName blocked - target is a protected .env file: $filePath"
        }
        if ($isMain) {
            Emit-Deny "Phase 05 hook: $toolName mutation is forbidden while on 'main'. Switch to a dedicated feature branch."
        }
        if ($isRepo -and $branch) {
            $ralphReason = Test-RalphEnforcement -Cwd $cwd -Branch $branch
            if ($ralphReason) {
                Emit-Deny "Phase 05 hook: $ralphReason"
            }
        }

        # Files where an edit is legitimate but must never be silent, in
        # either mode: CI config, dependency manifests, migrations, and the
        # governance machinery itself. Without this, FAST TRACK could rewrite
        # the very hook enforcing it.
        # Edit gating removed 2026-09-04 at the owner's explicit instruction:
        # editing CI config, dependency manifests, migrations and the
        # governance files is ordinary work inside a story, and prompting for
        # it interrupted every story. Secret .env files are still DENIED
        # outright above, and main-branch mutation is still denied - those are
        # blocks, not prompts, and neither was in scope of that instruction.

        if ((Get-GovernanceMode -Cwd $cwd) -eq 'FAST_TRACK') {
            Emit-Allow 'FAST TRACK: routine source edit, auto-approved for this user story.'
        }

        Emit-Noop
    }

    { $_ -in 'Bash', 'PowerShell' } {
        $command = [string](Get-Field $toolInput 'command')
        if ([string]::IsNullOrWhiteSpace($command)) { Emit-Noop }

        $secretReason = Test-CommandTouchesSecretEnv -Command $command
        if ($secretReason) {
            Emit-Deny "Phase 05 hook: secret .env access blocked - $secretReason"
        }

        # Deny rules run before the read-only short-circuit so that the gate
        # and grant checks below can sit ahead of it without ever seeing a
        # command Phase 05 blocks. Read-only commands match none of these, so
        # hoisting them changes no Phase 05 verdict - asserted by the 162-case
        # suite, which still passes unchanged.
        $destroyReason = Test-CommandIsDestructiveGit -Command $command
        if ($destroyReason) {
            Emit-Deny "Phase 05 hook: destructive Git command blocked - $destroyReason"
        }

        $stagingReason = Test-CommandIsUnsafeStaging -Command $command
        if ($stagingReason) {
            Emit-Deny "Phase 05 hook: unsafe git staging blocked - $stagingReason. Use explicit paths: git add -- src/file1 src/file2"
        }

        # Non-negotiable gates, and the scoped FAST TRACK grant. Both sit
        # ahead of the read-only short-circuit, because several routine
        # commands FAST TRACK should grant (git status, pnpm lint) are
        # classified read-only and would otherwise exit before being granted.
        #
        # Both are skipped entirely on main. Phase 05 forbids repository
        # mutation there outright, and forbidden must beat prompted: without
        # this guard, 'git commit' on main downgraded from deny to ask, and
        # FAST TRACK would have granted mutating commands on main. Caught by
        # the Phase 05 suite's MAIN cases, not by inspection.
        if (-not $isMain) {
            $protected = Test-CommandIsProtected -Command $command
            if ($protected) {
                Emit-Ask "Governance gate: $protected always requires explicit approval, in both STANDARD and FAST TRACK mode."
            }

            if ((Get-GovernanceMode -Cwd $cwd) -eq 'FAST_TRACK' -and (Test-CommandIsFastTrackRoutine -Command $command)) {
                Emit-Allow 'FAST TRACK: routine local command, auto-approved for this user story.'
            }
        }

        # Phase 05, unchanged: harmless inspection stays possible on main.
        if (Test-CommandIsReadOnly -Command $command) { Emit-Noop }

        if ($isMain) {
            $preview = $command.Trim()
            if ($preview.Length -gt 100) { $preview = $preview.Substring(0, 100) + '...' }
            Emit-Deny "Phase 05 hook: command may mutate repository state and is forbidden while on 'main': $preview"
        }

        if ($isRepo -and $branch) {
            $ralphReason = Test-RalphEnforcement -Cwd $cwd -Branch $branch
            if ($ralphReason) {
                Emit-Deny "Phase 05 hook: $ralphReason"
            }
        }

        Emit-Noop
    }

    { $_ -in 'Read', 'Grep' } {
        $filePath = $null
        if ($toolName -eq 'Read') {
            $filePath = [string](Get-Field $toolInput 'file_path')
        } else {
            $filePath = [string](Get-Field $toolInput 'path')
        }
        if (-not [string]::IsNullOrWhiteSpace($filePath) -and (Test-PathIsSecret -RawPath $filePath)) {
            Emit-Deny "Phase 05 hook: $toolName blocked - target is a protected .env file: $filePath"
        }
        Emit-Noop
    }

    default { Emit-Noop }
}

Emit-Noop
