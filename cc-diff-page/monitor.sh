#!/bin/bash

# Enhanced monitor script that uses Claude Code CLI or OpenCode to update visualization
# Usage: ./monitor.sh [options] [refresh_seconds]
# Options:
#   -d, --debug           Enable debug mode with verbose output
#   --dry-run             Show what would be sent to AI without executing
#   --log-file FILE       Save all output to a log file
#   --use-opencode        Use OpenCode instead of Claude
#   --model MODEL         Specify AI model (e.g., opencode/grok-code)

# Parse arguments
DEBUG=false
DRY_RUN=false
LOG_FILE=""
REFRESH_INTERVAL=3
USE_OPENCODE=false
AI_MODEL=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--debug)
            DEBUG=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --log-file)
            LOG_FILE="$2"
            shift 2
            ;;
        --use-opencode)
            USE_OPENCODE=true
            shift
            ;;
        --model)
            AI_MODEL="$2"
            shift 2
            ;;
        *)
            # Assume it's the refresh interval
            REFRESH_INTERVAL=$1
            shift
            ;;
    esac
done

VISUALIZATION_FILE="cc-diff-page/visualisation.html"

# Logging function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case $level in
        INFO)
            echo "[$timestamp] ℹ️  $message"
            ;;
        DEBUG)
            if [ "$DEBUG" = true ]; then
                echo "[$timestamp] 🔍 $message"
            fi
            ;;
        SUCCESS)
            echo "[$timestamp] ✅ $message"
            ;;
        WARNING)
            echo "[$timestamp] ⚠️  $message"
            ;;
        ERROR)
            echo "[$timestamp] ❌ $message"
            ;;
        *)
            echo "[$timestamp] $message"
            ;;
    esac

    # Also log to file if specified
    if [ ! -z "$LOG_FILE" ]; then
        echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    fi
}

# Start message
log INFO "🚀 Starting git diff monitor..."
if [ "$USE_OPENCODE" = true ]; then
    log INFO "🤖 AI Provider: OpenCode"
    [ ! -z "$AI_MODEL" ] && log INFO "🧠 Model: $AI_MODEL"
else
    log INFO "🤖 AI Provider: Claude"
fi
log INFO "📊 Visualization file: $VISUALIZATION_FILE"
log INFO "⏱️  Refresh interval: ${REFRESH_INTERVAL}s"
[ "$DEBUG" = true ] && log INFO "🐛 Debug mode enabled"
[ "$DRY_RUN" = true ] && log INFO "🏃 Dry-run mode enabled"
[ ! -z "$LOG_FILE" ] && log INFO "📝 Logging to file: $LOG_FILE"
log INFO "🛑 Press Ctrl+C to stop"
echo ""

while true; do
    # Get git diff for tracked files, excluding the visualization file itself
    log DEBUG "Checking for tracked file changes..."
    TRACKED_DIFF=$(git diff -- . ":!${VISUALIZATION_FILE}" 2>&1)
    GIT_DIFF_EXIT=$?

    if [ $GIT_DIFF_EXIT -ne 0 ]; then
        log ERROR "Git diff failed with exit code $GIT_DIFF_EXIT"
        log DEBUG "Git diff output: $TRACKED_DIFF"
    fi

    # Get list of modified tracked files
    TRACKED_MODIFIED=$(git diff --name-only -- . ":!${VISUALIZATION_FILE}" 2>/dev/null)

    # Get untracked files (excluding the visualization file)
    log DEBUG "Checking for untracked files..."
    UNTRACKED_FILES=$(git ls-files --others --exclude-standard 2>&1 | grep -v "^${VISUALIZATION_FILE}$")
    GIT_LS_EXIT=$?

    if [ $GIT_LS_EXIT -ne 0 ] && [ $GIT_LS_EXIT -ne 1 ]; then
        log ERROR "Git ls-files failed with exit code $GIT_LS_EXIT"
    fi

    # Log detected files in debug mode
    if [ "$DEBUG" = true ]; then
        if [ ! -z "$TRACKED_MODIFIED" ]; then
            log DEBUG "Tracked files with changes:"
            while IFS= read -r file; do
                log DEBUG "  📝 $file"
            done <<< "$TRACKED_MODIFIED"
        fi

        if [ ! -z "$UNTRACKED_FILES" ]; then
            log DEBUG "Untracked files:"
            while IFS= read -r file; do
                log DEBUG "  ➕ $file"
            done <<< "$UNTRACKED_FILES"
        fi
    fi

    # Combine both diffs - for untracked files, show them as new files
    DIFF=""
    if [ ! -z "$TRACKED_DIFF" ]; then
        DIFF="$TRACKED_DIFF"
        log DEBUG "Added $(echo "$TRACKED_DIFF" | wc -l) lines from tracked diff"
    fi

    if [ ! -z "$UNTRACKED_FILES" ]; then
        # Add untracked files to the diff output
        UNTRACKED_COUNT=0
        while IFS= read -r file; do
            if [ -z "$file" ]; then
                continue
            fi

            UNTRACKED_COUNT=$((UNTRACKED_COUNT + 1))
            log DEBUG "Processing untracked file: $file"

            if [ ! -z "$DIFF" ]; then
                DIFF="$DIFF
"
            fi
            DIFF="${DIFF}diff --git a/$file b/$file
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/$file"
            # Add file contents with + prefix
            if [ -f "$file" ]; then
                FILE_LINES=0
                while IFS= read -r line; do
                    DIFF="${DIFF}
+${line}"
                    FILE_LINES=$((FILE_LINES + 1))
                done < "$file"
                log DEBUG "  Added $FILE_LINES lines from $file"
            else
                log WARNING "  Could not read file: $file"
            fi
        done <<< "$UNTRACKED_FILES"
        log DEBUG "Processed $UNTRACKED_COUNT untracked files"
    fi

    if [ ! -z "$DIFF" ]; then
        log INFO "Changes detected, preparing visualization update..."

        # Count stats for both tracked and untracked files
        TRACKED_FILES=$(git diff --name-only -- . ":!${VISUALIZATION_FILE}" 2>/dev/null | wc -l | tr -d ' ')
        UNTRACKED_COUNT=$(echo "$UNTRACKED_FILES" | grep -c . 2>/dev/null || echo "0")
        FILES_CHANGED=$((TRACKED_FILES + UNTRACKED_COUNT))

        # Get additions/deletions from tracked files
        ADDITIONS=$(git diff --stat -- . ":!${VISUALIZATION_FILE}" 2>/dev/null | tail -n1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
        DELETIONS=$(git diff --stat -- . ":!${VISUALIZATION_FILE}" 2>/dev/null | tail -n1 | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")

        # Count lines in untracked files as additions
        if [ ! -z "$UNTRACKED_FILES" ]; then
            UNTRACKED_LINES=0
            while IFS= read -r file; do
                if [ -f "$file" ]; then
                    FILE_LINES=$(wc -l < "$file" | tr -d ' ')
                    UNTRACKED_LINES=$((UNTRACKED_LINES + FILE_LINES))
                fi
            done <<< "$UNTRACKED_FILES"
            ADDITIONS=$((ADDITIONS + UNTRACKED_LINES))
        fi

        log INFO "📁 Files: $FILES_CHANGED (${TRACKED_FILES} tracked, ${UNTRACKED_COUNT} untracked)"
        log INFO "➕ Additions: $ADDITIONS | ➖ Deletions: $DELETIONS"

        # Create the prompt for Claude
        PROMPT="You are updating an HTML visualization of git changes. Here is the current git diff:

\`\`\`diff
$DIFF
\`\`\`

Please update the file at $VISUALIZATION_FILE by:
1. Replacing the title placeholder with a meaningful description of these changes
2. Filling in the commit stats (files: $FILES_CHANGED, additions: +$ADDITIONS, deletions: -$DELETIONS)
3. Creating business value cards that explain what these changes accomplish
4. Organizing file changes into logical categories
5. Including the actual diff content in the code-diff sections
6. Making the visualization focus on business/user value, not just technical details

Keep the existing HTML structure and JavaScript intact. Only update the placeholder content and data."

        if [ "$DEBUG" = true ]; then
            log DEBUG "Prompt length: $(echo "$PROMPT" | wc -c) characters"
            log DEBUG "Diff preview (first 500 chars):"
            echo "$DIFF" | head -c 500
            echo ""
        fi

        if [ "$DRY_RUN" = true ]; then
            AI_NAME=$([ "$USE_OPENCODE" = true ] && echo "OpenCode" || echo "Claude")
            log INFO "🏃 Dry-run mode - would send the following prompt to $AI_NAME:"
            echo "----------------------------------------"
            echo "$PROMPT" | head -20
            echo "... (truncated for display)"
            echo "----------------------------------------"
        else
            # Call AI provider and capture output
            if [ "$USE_OPENCODE" = true ]; then
                log INFO "🤖 Calling OpenCode to update visualization..."

                # Create temp files for stdout and stderr
                AI_STDOUT=$(mktemp)
                AI_STDERR=$(mktemp)

                # Build OpenCode command
                OPENCODE_CMD="opencode run"
                if [ ! -z "$AI_MODEL" ]; then
                    OPENCODE_CMD="$OPENCODE_CMD --model $AI_MODEL"
                fi

                # Run OpenCode command
                $OPENCODE_CMD "$PROMPT" > "$AI_STDOUT" 2> "$AI_STDERR"
                AI_EXIT=$?

                AI_NAME="OpenCode"
            else
                log INFO "🤖 Calling Claude to update visualization..."

                # Create temp files for stdout and stderr
                AI_STDOUT=$(mktemp)
                AI_STDERR=$(mktemp)

                # Run Claude command
                claude --dangerously-skip-permissions -p "$PROMPT" > "$AI_STDOUT" 2> "$AI_STDERR"
                AI_EXIT=$?

                AI_NAME="Claude"
            fi

            # Read the outputs
            STDOUT_CONTENT=$(cat "$AI_STDOUT")
            STDERR_CONTENT=$(cat "$AI_STDERR")

            # Log results
            if [ $AI_EXIT -eq 0 ]; then
                log SUCCESS "$AI_NAME execution completed successfully!"
                if [ "$DEBUG" = true ] && [ ! -z "$STDOUT_CONTENT" ]; then
                    log DEBUG "$AI_NAME output:"
                    echo "$STDOUT_CONTENT" | head -20
                    if [ $(echo "$STDOUT_CONTENT" | wc -l) -gt 20 ]; then
                        echo "... (output truncated)"
                    fi
                fi
            else
                log ERROR "$AI_NAME command failed with exit code $AI_EXIT"
                if [ ! -z "$STDERR_CONTENT" ]; then
                    log ERROR "Error output: $STDERR_CONTENT"
                fi
            fi

            # Clean up temp files
            rm -f "$AI_STDOUT" "$AI_STDERR"
        fi
    else
        log INFO "⏳ No changes detected (tracked or untracked)"
    fi

    # Wait before next check
    log DEBUG "Sleeping for ${REFRESH_INTERVAL}s..."
    sleep $REFRESH_INTERVAL
done